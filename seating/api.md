# Table Seating API

Table Seating seats guests at tables to maximize a score that combines how alike each table's guests are, pair scores (guests who should or should not share a table), must-sit-together and must-sit-apart constraints, and an optional geography term that pushes chosen guests to far-apart tables. It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page, `window.Seating` and the command line all call this same function, and the same request (seed included) always gives the same result.

It is a port of Nik Vetr's R table-seating optimizer (`seat_tables()`, 2023, with its geography bookkeeping fixed). It uses R's random number generator and R's arithmetic, including the long-double sums that settle ties between table scores, so a request gives the same chain as the R version: the same accepted moves, best seating, scores and trace, to the last bit (checked on 16 runs of 9 instances). The one known source of difference is the spiral layout beyond 23 tables, where V8's `sin` and glibc's differ by one unit in the last place; that can change a run only through an exact tie.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node seating/cli.mjs request.json                 # result JSON on stdout
node seating/cli.mjs < request.json               # or read the request from stdin ("-" also works)
node seating/cli.mjs request.json --svg out/      # also write out/seating.svg (the best seating) and out/trace.svg
```

The command line also reads a request in the R version's spelling (the JSON `seat.R` takes, with options such as `logit_scale`), as the page does when one is pasted or opened. The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request or invalid JSON, or 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers:

```js
import { submit, fromRRequest, renderSeatingSvg, renderTraceSvg } from './seating/core/index.js';
const result = submit(request, { onProgress: (p) => console.log(p.iteration, p.best, p.move) });
const svg = renderSeatingSvg(result, request, { width: 720, theme: 'light', arrangement: 'room' });
const r = submit(fromRRequest(requestForR)); // R's spelling, renamed
```

`submit` takes an optional second argument, `{ onProgress }`. It is called after every accepted move, with `{ iteration, iterations, accepted, score, best, move }`, where `move` is that move as `trajectory.moves` records it, and every 1% of the iterations with `move: null`. It is not part of the JSON request, so the command line has no equivalent. `fromRRequest(request)` renames R's option fields (and turns jsonlite's `"options": []` into `{}`).

**In the page** (https://vetr.dev/seating/). The page runs `submit` in a Web Worker, so `submit` returns a promise:

| Member | Does |
| --- | --- |
| `submit(request)` | Runs the request, loads it into the page's inputs, shows the result at its best seating and resolves with it. An invalid request rejects with a `SeatingError` and leaves the page showing what it showed. |
| `getRequest()` | Returns the request the page's inputs currently describe. |
| `getResult()` | Returns the result on display, or `null`. |
| `exportSvgText()` | Returns the best seating's chart as SVG text, in the page's theme. |
| `exportSeatingCsv()` | Returns the best seating as CSV: `table,seat,guest,category`, one row per seat (an empty seat has no guest). |
| `replay()` | Returns where the replay is: `{ move, moves, iteration, best, playing }`, `best` being whether the best seating is on view as the result. |
| `pause()`, `stop()` | Pause the replay; stop a running search (the pending `submit` rejects with an `Error`). |

## Request

| Field | Required | Meaning |
| --- | --- | --- |
| `guests` | yes | Array of at least 2 `{id, category}`. `id`: a unique non-empty string. `category`: a finite number, treated as ordinal (differences matter); needed unless `options.tableObjective` is `"none"` and `geography.cost` is not `"category"`. The first seating fills the tables in guest order. |
| `tables` | yes | Either `{seats, layout}`, the original rule: ⌊guests / seats⌋ tables (at least 2) of `seats` seats, with the guests left over added one per table from the first; `layout` is `"spiral"` (default) or `"grid"`. Or an array of at least 2 `{id, capacity, x, y}`: `id` a unique non-empty string, `capacity` a whole number ≥ 1, together at least as many seats as guests; unused seats stay empty. Give `x` and `y` for every table or for none; without them the tables go on the spiral (at most 297 tables). |
| `pairs` | no | Array of `{a, b, score}`: `score` (finite) is added when guests `a` and `b` share a table; negative to keep them apart. A pair may be listed once. |
| `together` | no | Array of guest-id arrays, each of 2 or more distinct guests: every pair in a group must share a table. A group larger than every table is rejected. |
| `apart` | no | Array of guest-id arrays: no pair in a group may share a table. A pair both together and apart is rejected. |
| `geography` | no | `{cost, tablemates}`. `cost` is `"category"` (every pair costs number of categories − \|category difference\|, the original script's example, which pushes alike guests apart) or an array of `{a, b, cost}`. Each guest pays cost × closeness towards every other guest, closeness being (1 − distance / largest distance)² between their tables, so a positive cost pushes two guests far apart. `tablemates` (default `true`) counts tablemates at closeness 1; `false` skips them, as the original did. |
| `options` | no | See below. |

`together` and `apart` are kept by a large penalty, not as hard rules, and the result lists any pair still broken. Unknown fields are rejected at every level; a field in R's spelling is rejected with a hint naming this one.

| Option | Default | Meaning |
| --- | --- | --- |
| `tableObjective` | `"sqrt_distance"` | Per-table term on categories: `"sqrt_distance"` (−Σ √\|difference\| over the table's pairs; favours alike tables), `"geometric"` (−Σ over the table's categories of 1 − 2<sup>−count</sup>; favours few categories), `"variance"` (the categories' variance; favours mixed tables) or `"none"`. |
| `weights` | `{table: 1, pairs: 1, geography: 1}` | Multipliers for those terms; any finite numbers. |
| `constraintPenalty` | `1000` | Score lost per broken `together` or `apart` pair; positive. |
| `iterations` | 50 × guests | Proposals; a whole number ≥ 0. |
| `logitScale` | `1` | Inverse temperature of the acceptance rule; positive. |
| `seed` | `1` | Seed of R's random number generator, 0 to 2,147,483,647. |
| `tracePoints` | `1000` | About this many evenly spaced trace rows; ≥ 1. |
| `record` | `"none"` | `"moves"`: record every accepted move; `"states"`: record the whole seating every `recordEvery` iterations. The page always records moves. |
| `recordEvery` | `1` | Thinning for `record: "states"`; ≥ 1. |

R's spelling of the options is `table_objective`, `constraint_penalty`, `logit_scale`, `trace_points` and `record_every`; the rest are the same.

## Result

| Field | Meaning |
| --- | --- |
| `score`, `terms` | The score of the best seating found and its terms `table`, `pairs`, `constraints`, `geography` (weighted; they sum to `score`). `constraints` is −`constraintPenalty` per broken pair. |
| `tables[]` | `{id, capacity, x, y, seats, score, terms}` for the best seating: `seats` lists guest ids in seat order, `null` for an empty seat; `x`, `y` are the table's position (given, or the spiral's or grid's); `score` and `terms` are the table's `table`, `pairs` and `geography` terms and their sum. |
| `violations` | `{together, apart}`: arrays of the guest-id pairs that break a constraint. |
| `search` | `{iterations, accepted, bestIteration}`: proposals made, moves accepted, and the iteration at which the best seating was found (0 for the first seating). |
| `settings` | The options used, defaults filled in, and `geography: {enabled, tablemates}`. |
| `trace` | Columns `iteration`, `score`, `best`, `table`, `pairs`, `constraints`, `geography`: the current state at iteration 0, then iterations 1, 1 + k, 1 + 2k, … and the last, k = max(1, ⌊iterations / tracePoints⌋). |
| `trajectory` | `null`, or the recorded moves or states (below). |

**Trajectory.** With `record: "moves"` it is `{record: "moves", initial, moves}`. `initial` is `{tables, score, terms}`, `tables` listing each table's seats in order (as `tables[].seats`, in the order of `tables`). Each move is `{iteration, tables, swaps, positions, score, terms, best}`: `tables` are the two tables' ids; guest `swaps[k][0]`, at seat `positions[k][0]` (0-based) of `tables[0]`, and guest `swaps[k][1]`, at seat `positions[k][1]` of `tables[1]`, exchange seats (`null` is an empty seat); `score`, `terms` and `best` (the best score so far) are the values after the move. Replaying the moves from `initial` gives every seating the search accepted; the best seating is the one after the move whose `iteration` is `search.bestIteration`. The search keeps going after it, so the last move is usually not the best. With `record: "states"` it is `{record: "states", every, states}`, each state `{iteration, tables, score, terms, best}` at iterations 0, `every`, 2 × `every`, ….

## Method

The search is the original script's swap chain. Each iteration:

1. Picks two tables without replacement with probabilities ∝ exp((best table score − table score) / range), so the worst table is at most e times as likely as the best. A table's score here is its table, pairs and constraint terms and its geography.
2. Picks k from 1 to (the smaller table's seats − 1), at least 1, with weight e<sup>−0.4k</sup>.
3. Picks k seats at random at each table and swaps their occupants. Table sizes never change; swaps with empty seats move guests between tables.
4. Accepts with Barker's probability 1 / (1 + e<sup>−Δ × logitScale</sup>), Δ being the change in score, at a fixed temperature. The best seating visited is the result.

Scores are kept incrementally (each proposal rescores its two tables, and the geography term through per-seat costs towards each table), and the best seating is rescored from scratch at the end: a mismatch is an `internal_error`. On the brute-forced 12-guest party of the R version's `validation/`, the default budget of 50 iterations per guest reaches the exact optimum in 10 of 20 seeds, the same seeds as R. With many constraints the default budget is often not enough; more iterations help.

## Errors

A request that cannot be run throws a `SeatingError` (in the CLI, JSON on stderr) with a `code`, a `message` and a list of `issues`, each `{code, path, message}`, `path` being 0-based. As in the R version, the request is checked in stages (its fields; the guests; the options and tables; the pairs, groups and geography), and a stage with problems ends the check, listing every problem found in it. The worked example's request with `"together": [["Ada", "Zed"]]` and `"pairs": [{"a": "Ada", "b": "Ada", "score": 1}]` gives:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request: pairs[0]: a and b are the same guest (and 1 more issue)",
    "issues": [
      { "code": "self_pair", "path": "pairs[0]", "message": "a and b are the same guest" },
      { "code": "unknown_guest", "path": "together[0][1]", "message": "not a guest id" }
    ]
  }
}
```

Issue codes: `unknown_field`, `missing_field`, `wrong_type`, `out_of_range`, `duplicate_id`, `unknown_guest`, `self_pair`, `duplicate_pair`, `duplicate_guest`, `infeasible_group`, `conflicting_constraints`, `insufficient_capacity`, `too_many_tables`. The top-level codes are `invalid_request` and `internal_error`, and in the CLI also `invalid_json`, `usage` and `unreadable_input`, which have no issues.

## Worked example

Seven guests at two tables of four, one pair score, one couple and one pair to keep apart; `request.json`:

```json
{
  "guests": [
    { "id": "Ada", "category": 1 }, { "id": "Bo", "category": 1 }, { "id": "Cy", "category": 2 },
    { "id": "Di", "category": 2 }, { "id": "Ed", "category": 3 }, { "id": "Flo", "category": 3 },
    { "id": "Gus", "category": 1 }
  ],
  "tables": [{ "id": "North", "capacity": 4 }, { "id": "South", "capacity": 4 }],
  "pairs": [{ "a": "Ada", "b": "Cy", "score": 3 }],
  "together": [["Ed", "Flo"]],
  "apart": [["Ada", "Bo"]],
  "options": { "seed": 4, "iterations": 300, "tracePoints": 3 }
}
```

`node seating/cli.mjs request.json` prints (reformatted here):

```json
{
  "score": -3.82842712474619,
  "terms": { "table": -6.82842712474619, "pairs": 3, "constraints": 0, "geography": 0 },
  "tables": [
    { "id": "North", "capacity": 4, "x": 0.5, "y": 0, "seats": ["Gus", "Ada", "Cy", "Di"],
      "score": -1, "terms": { "table": -4, "pairs": 3, "geography": 0 } },
    { "id": "South", "capacity": 4, "x": -0.3338874459495537, "y": 0.769477234366973, "seats": ["Ed", "Flo", null, "Bo"],
      "score": -2.8284271247461903, "terms": { "table": -2.8284271247461903, "pairs": 0, "geography": 0 } }
  ],
  "violations": { "together": [], "apart": [] },
  "search": { "iterations": 300, "accepted": 12, "bestIteration": 28 },
  "settings": {
    "tableObjective": "sqrt_distance", "weights": { "table": 1, "pairs": 1, "geography": 1 },
    "constraintPenalty": 1000, "iterations": 300, "logitScale": 1, "seed": 4, "tracePoints": 3,
    "record": "none", "recordEvery": 1, "geography": { "enabled": false, "tablemates": true }
  },
  "trace": {
    "iteration": [0, 1, 101, 201, 300],
    "score": [-1003.8284271247462, -1003.8284271247462, -3.828427124746213, -4.828427124746213, -3.828427124746213],
    "best": [-1003.8284271247462, -1003.8284271247462, -3.828427124746213, -3.828427124746213, -3.828427124746213],
    "table": [-6.82842712474619, -6.82842712474619, -6.82842712474619, -7.82842712474619, -6.82842712474619],
    "pairs": [3, 3, 3, 3, 3],
    "constraints": [-1000, -1000, 0, 0, 0],
    "geography": [0, 0, 0, 0, 0]
  },
  "trajectory": null
}
```

The first seating (guests in order) seated Ada with Bo, against `apart`; the best seating, found at iteration 28, keeps every constraint and seats Ada with Cy. `Rscript seat.R` on the same request in R's spelling (`"trace_points": 3`) gives the same seating, iteration and scores. With `"record": "moves"` the result's `trajectory` begins:

```json
{
  "record": "moves",
  "initial": {
    "tables": [["Ada", "Bo", "Cy", "Di"], ["Ed", "Flo", "Gus", null]],
    "score": -1003.8284271247462,
    "terms": { "table": -6.82842712474619, "pairs": 3, "constraints": -1000, "geography": 0 }
  },
  "moves": [
    { "iteration": 13, "tables": ["North", "South"], "swaps": [["Ada", null]], "positions": [[0, 3]],
      "score": -7.656854249492426, "terms": { "table": -7.656854249492381, "pairs": 0, "constraints": 0, "geography": 0 },
      "best": -7.656854249492426 },
    …
  ]
}
```

At iteration 13, Ada (seat 0 of North) moved to the empty seat 3 of South, which separated her from Bo and cost the pair score with Cy; 12 moves were accepted in all.
