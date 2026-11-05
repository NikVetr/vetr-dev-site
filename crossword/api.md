# Crossword Generator API

The Crossword Generator lays out crosswords from answers and clues, optionally shaped like a target picture: a greedy layout, then Markov chain Monte Carlo (MCMC) refinement. It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page, `window.Crossword` and the command line all call this same function, and the same request (seed included) always gives the same result.

It is a port of Nik Vetr's R crossword generator. Every penalty term is computed as the R code computes it, and matches it to floating-point precision on the same layout. Only the random-number generator differs, so a given seed gives different crosswords in R and here.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node crossword/cli.mjs request.json                 # result JSON on stdout
node crossword/cli.mjs < request.json               # or read the request from stdin ("-" also works)
node crossword/cli.mjs request.json --svg out/      # also write each crossword as SVG, filled and blank
```

On the command line only, the target picture can be a PNG file: `"target": {"png": "heart.png"}`, read relative to the request file (or to the current directory when the request comes from stdin). It is decoded and passed on as `target.rgba`. `--svg dir` writes `crossword-<i>-orig.svg`, `crossword-<i>-refined.svg` and their `-blank.svg` versions.

The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request, invalid JSON or a search that could not place every word, or 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers:

```js
import { submit, renderSvg, parseEntries } from './crossword/core/index.js';
const result = submit({ entriesText: 'Frozen rain : Hail\nLight rain : Drizzle\nGentle wind : Breeze\n' },
  { onProgress: (p) => console.log(p.crossword, p.iteration, p.score) });
const svg = renderSvg(result.crosswords[0].refined, { style: 'blank', cellSize: 40 });
```

`submit` takes an optional second argument, `{ onProgress }`. It is called once a crossword is laid out (`iteration` 0) and after every MCMC iteration, with `{ crossword, iteration, nIter, score, grid }`: the 0-based crossword index, the iteration, the iteration count, the current score and the current grid (as in [Result](#result)). It is not part of the JSON request, so the command line has no equivalent.

**In the page** (https://vetr.dev/crossword/). The page runs `submit` in a Web Worker, so these calls return promises:

| Member | Does |
| --- | --- |
| `submit(request)` | Runs the request, loads it into the page's inputs, shows the result and resolves with it. An invalid request rejects with a `CrosswordError` and leaves the page showing what it showed. |
| `getRequest()` | Returns the request the page's inputs currently describe. |
| `getResult()` | Returns the result on display, or `null`. |
| `exportSvgText(pick)` | Returns a crossword as SVG text. `pick` is optional: `{ crossword, stage, style }`, a 0-based index, `"refined"` or `"orig"`, and `"filled"` or `"blank"`; each defaults to what the page shows, filled. |
| `exportPngBlob(pick)` | Returns a Promise of the same drawing as a PNG `Blob`, at twice the SVG's size. |
| `stop()` | Stops a running search; the pending `submit` rejects with an `Error`. |

## Request

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `entries` | array | (required, or `entriesText`) | One `{answer, clue}` object per entry. `clue` is optional (default `""`). |
| `entriesText` | string | (required, or `entries`) | The same entries as `clue : answer` lines, the R generator's file format. |
| `target` | object | none | A picture for the crossword to fill: `mask` or `rgba` (see below). |
| `objective` | object | see below | Penalty weights, desired ratios, picture distance. |
| `search` | object | see below | Seed, number of crosswords, iterations and placement attempts. |
| `init` | object | none | A crossword from an earlier result to refine instead of generating new ones. |

Give exactly one of `entries` and `entriesText`. Unknown fields are rejected at every level.

**Entries.** Each answer's grid word is the answer in lower case with its spaces removed; every other character, such as the hyphen in `Жар-птица`, takes a cell. Answers are split into graphemes (user-perceived characters), so any script works, and a letter with a combining accent takes one cell. Each grid word needs at least two cells, no grid word may appear twice, and there must be 2 to 300 entries. In `entriesText`, each non-blank line must have exactly one `:`, with the clue before it and a non-empty answer after it. Both are trimmed, and blank lines are skipped.

**Target.** Give one of these:

- `mask`: an array of strings, one per pixel row, all the same length, `#` for a pixel to fill and `.` for one to leave empty.
- `rgba`: `{width, height, data}`, where `data` is base64 of `width × height × 4` bytes, RGBA, row by row. The region to fill is the opaque pixels (alpha above 0.01) when between 5% and 95% of the picture is opaque (alpha above 0.5); otherwise it is the pixels whose R + G + B, each from 0 to 1, is at most `darkThreshold`. `darkThreshold` is a number from 0 to 3, default 2.75, and is allowed only with `rgba`.

Sides are 1 to 4,096 pixels and at least one pixel must be filled. Only the region's shape matters: it is cropped to its bounding box and compared with the crossword's silhouette at the crossword's size.

**Objective.**

| Field | Default | Meaning |
| --- | --- | --- |
| `weights` | all `1` | Any of `area`, `areaRatio`, `hvRatio`, `nConnections`, `nCycles`, `picSimilarity`, `circularity`, each a finite number multiplying that term (see [Method](#method)). Omitted terms keep weight 1. |
| `desiredAreaRatio` | `1` | Desired width / height of the crossword, a positive number. |
| `desiredHvRatio` | `1` | Desired number of across words / down words, a positive number. |
| `pictureDistance` | `"scan"` | `"scan"` measures distances to the picture as the R code does; `"exact"` uses true nearest distances (see [Method](#method)). |

**Search.**

| Field | Range | Default | Meaning |
| --- | --- | --- | --- |
| `seed` | 0 to 4,294,967,295 | `1` | Seed for every random choice. |
| `nXwords` | 1 to 100 | `1` | Number of independent crosswords. |
| `nIter` | 0 to 100,000 | `50` | MCMC iterations per crossword. |
| `maxAttemptsWord` | 1 to 10,000 | `20` | Failed placements allowed while laying out a crossword, in total, before that layout is abandoned. |
| `maxAttemptsXword` | 1 to 1,000 | `5` | Layouts tried per crossword before giving up (error `unplaceable`). |

Each refinement move re-places the words it took out with up to 20 failed placements in total, whatever `maxAttemptsWord` is, as in the R code; if that runs out, the move leaves the crossword as it was.

**init.** A crossword (`orig` or `refined`) from an earlier result for the same entries: its `entries`' `answer`, `row`, `col` and `dir` are used and its other fields are ignored. It must place every entry exactly once, with no clashing letters. Each of the `nXwords` crosswords is then an independent refinement of it, and its `orig` is the layout given. It is centred on a canvas of the size a new crossword would get, so refinement can grow it in any direction.

## Result

| Field | Meaning |
| --- | --- |
| `settings` | `objective` and `search` as used, with defaults filled in, and `target`: `{width, height, cells}` (pixels, and pixels to fill), or `null`. |
| `crosswords[]` | One `{orig, refined}` per crossword: the greedy layout (or `init`) and the layout after `nIter` MCMC iterations. |

Each crossword (`orig` or `refined`) has these fields:

| Field | Meaning |
| --- | --- |
| `rows`, `cols` | Size of the grid, trimmed to the letters. |
| `grid` | `rows` arrays of `cols` strings: the cell's letter (lower case), or `""` for an empty cell. |
| `entries[]` | `{number, dir, row, col, length, answer, clue}` for every entry: clue number, `"across"` or `"down"`, the 0-based row and column of its first cell, its number of cells, and the answer and clue as given. Across entries come first, then down, each in number order. |
| `terms` | The seven weighted penalty terms, named as in `objective.weights`. |
| `score` | Their sum. Lower is better. |

Clues are numbered in reading order: start cells sorted by row, then column, numbered from 1; an across and a down entry starting in the same cell share a number.

## Method

**Greedy layout.** A random answer goes across the middle row of an empty square canvas, of side ⌈max(√(10 × total cells), longest answer)⌉. Then a random unplaced answer is tried through every cell holding one of its letters: across if it fits across there, otherwise down. Placements that would leave the canvas, contradict a letter or create a stray word (any run of two or more cells that is not an answer) are dropped. The rest are scored, and one is drawn with probability ∝ exp(−(score − best score)). A failed try counts against `maxAttemptsWord`; when the count runs out, the layout starts over, up to `maxAttemptsXword` times.

**Refinement.** Each MCMC iteration takes out m answers, m from 1 to n (the number of entries) with weight exp((n − m + 1) / 5), so small m is most likely. They are removed one at a time, each chosen uniformly from the answers whose removal would not split the crossword (those that are not articulation points of the crossing graph), and then re-placed greedily. The new layout is accepted with probability 1 / (1 + e^(new score − old score)). There is no temperature or Hastings correction, so this is a stochastic local search; the result is the last layout, not the best one seen.

**Score.** With r the trimmed grid's rows and c its columns, the terms before weighting are:

| Term | Value |
| --- | --- |
| `area` | √(r × c). |
| `areaRatio` | max(q, 1/q)², with q = `desiredAreaRatio` / (c / r). |
| `hvRatio` | max(q, 1/q)³, with q = `desiredHvRatio` / (across / down); 0 if either direction has no words. |
| `nConnections` | −Σ d², d being the number of other answers each answer crosses; 0 with four or fewer answers placed. |
| `nCycles` | −(number of chordless 4-cycles + chordless 6-cycles) in the crossing graph; 0 with four or fewer answers placed. |
| `picSimilarity` | Σ distance⁴ (see below); 0 without a target. |
| `circularity` | The variance of the distances from the concave hull's vertices to their centroid, squared. The hull is that of the letter cells with concavity 1, computed by the same concaveman code R uses. |

A layout with a single answer placed scores 0 on every term.

**Picture term.** The crossword's silhouette is its letter cells plus every empty cell with at least two letters among its four neighbours. The silhouette and the target region are each centred in a square, and the larger is scaled down to the smaller's side, rounding coordinates up. Then, for every silhouette cell off the target and every target cell off the silhouette, the distance d to the other shape is taken, and the term is Σ d⁴. With `"scan"`, as in R, d is found by scanning discs of growing integer radius: at the first radius with any cell of the other shape, the first such cell in scan order (row offset, then column offset, ascending) is taken. That can exceed the true nearest distance by up to one cell. With `"exact"`, d is the true nearest distance. On R-generated layouts the exact term is 53% to 95% of the scanned one (median 79%), and the two rank layouts almost identically.

## Errors

A request that cannot be run throws a `CrosswordError` (in the CLI, JSON on stderr) with a `code`, a `message` and a list of `issues`. An invalid request reports every problem at once:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request: entries[1].answer: answer \"hail\" is the same grid word, \"hail\", as the one at entries[0].answer",
    "issues": [
      { "code": "duplicate_answer", "path": "entries[1].answer", "message": "answer \"hail\" is the same grid word, \"hail\", as the one at entries[0].answer" }
    ]
  }
}
```

The top-level codes are:

- `invalid_request`: the request breaks the rules above.
- `unplaceable`: no layout placed every answer within `maxAttemptsXword` attempts. Its issues, code `hard_to_cross`, point at the three answers likely hardest to cross: those with the least letter overlap with the others, Σ_j overlap(i, j) / (length_i × length_j), where overlap(i, j) sums count_i(x) × count_j(x) over the letters x the two share.
- In the CLI, also `invalid_json`, `usage` and `unreadable_input`, which have no issues.

The issue codes of an invalid request are:

- `unknown_field`
- `missing_field`
- `conflicting_fields` (both `entries` and `entriesText`, both `mask` and `rgba`, or `darkThreshold` with `mask`)
- `wrong_type`
- `out_of_range`
- `bad_entry_line` (a line of `entriesText` without exactly one `:`, or with no answer)
- `duplicate_answer`
- `bad_target` (a malformed mask or pixel buffer, or nothing to fill)
- `bad_init` (an `init` that does not place every entry once, or whose letters clash)

The `path` takes one of these forms:

- `entries[i].answer` or `entries[i].clue`, where i is the 0-based index into `entries`.
- `entriesText`, for problems in the text. These issues also carry `line`, the 1-based line number.
- A dotted name such as `search.nIter`, `objective.weights.area`, `target.mask[3]` or `init.entries[2].answer`.
- `""` for the request as a whole.

## Worked example

`request.json`:

```json
{
  "entries": [
    { "clue": "Frozen pellets that fall in a storm", "answer": "Hail" },
    { "clue": "Light, fine rain", "answer": "Drizzle" },
    { "clue": "Snowstorm driven by strong winds", "answer": "Blizzard" },
    { "clue": "Gentle wind", "answer": "Breeze" },
    { "clue": "Visible mass of water droplets in the sky", "answer": "Cloud" },
    { "clue": "Rumble that follows lightning", "answer": "Thunder" }
  ],
  "search": { "seed": 4, "nIter": 20 }
}
```

`node crossword/cli.mjs request.json` prints the following (shown indented here; the CLI prints it on one line):

```json
{
  "settings": {
    "objective": { "weights": { "area": 1, "areaRatio": 1, "hvRatio": 1, "nConnections": 1, "nCycles": 1, "picSimilarity": 1, "circularity": 1 }, "desiredAreaRatio": 1, "desiredHvRatio": 1, "pictureDistance": "scan" },
    "search": { "seed": 4, "nXwords": 1, "nIter": 20, "maxAttemptsWord": 20, "maxAttemptsXword": 5 },
    "target": null
  },
  "crosswords": [
    {
      "orig": {
        "rows": 12, "cols": 8,
        "grid": [
          ["","","","","b","","",""],
          ["","","","c","l","o","u","d"],
          ["","","","","i","","",""],
          ["d","r","i","z","z","l","e",""],
          ["","","","","z","","",""],
          ["","","","","a","","",""],
          ["","","","","r","","b",""],
          ["t","h","u","n","d","e","r",""],
          ["","a","","","","","e",""],
          ["","i","","","","","e",""],
          ["","l","","","","","z",""],
          ["","","","","","","e",""]
        ],
        "entries": [
          { "number": 2, "dir": "across", "row": 1, "col": 3, "length": 5, "answer": "Cloud", "clue": "Visible mass of water droplets in the sky" },
          { "number": 3, "dir": "across", "row": 3, "col": 0, "length": 7, "answer": "Drizzle", "clue": "Light, fine rain" },
          { "number": 5, "dir": "across", "row": 7, "col": 0, "length": 7, "answer": "Thunder", "clue": "Rumble that follows lightning" },
          { "number": 1, "dir": "down", "row": 0, "col": 4, "length": 8, "answer": "Blizzard", "clue": "Snowstorm driven by strong winds" },
          { "number": 4, "dir": "down", "row": 6, "col": 6, "length": 6, "answer": "Breeze", "clue": "Gentle wind" },
          { "number": 6, "dir": "down", "row": 7, "col": 1, "length": 4, "answer": "Hail", "clue": "Frozen pellets that fall in a storm" }
        ],
        "terms": { "area": 9.797958971132712, "areaRatio": 2.25, "hvRatio": 1, "nConnections": -22, "nCycles": 0, "picSimilarity": 0, "circularity": 4.221282591815225 },
        "score": -4.730758437052064
      },
      "refined": {
        "rows": 9, "cols": 8,
        "grid": [
          ["t","h","u","n","d","e","r",""],
          ["","a","","","r","","",""],
          ["","i","","","i","","",""],
          ["b","l","i","z","z","a","r","d"],
          ["r","","","","z","","",""],
          ["e","","","c","l","o","u","d"],
          ["e","","","","e","","",""],
          ["z","","","","","","",""],
          ["e","","","","","","",""]
        ],
        "entries": [
          { "number": 1, "dir": "across", "row": 0, "col": 0, "length": 7, "answer": "Thunder", "clue": "Rumble that follows lightning" },
          { "number": 4, "dir": "across", "row": 3, "col": 0, "length": 8, "answer": "Blizzard", "clue": "Snowstorm driven by strong winds" },
          { "number": 5, "dir": "across", "row": 5, "col": 3, "length": 5, "answer": "Cloud", "clue": "Visible mass of water droplets in the sky" },
          { "number": 2, "dir": "down", "row": 0, "col": 1, "length": 4, "answer": "Hail", "clue": "Frozen pellets that fall in a storm" },
          { "number": 3, "dir": "down", "row": 0, "col": 4, "length": 7, "answer": "Drizzle", "clue": "Light, fine rain" },
          { "number": 4, "dir": "down", "row": 3, "col": 0, "length": 6, "answer": "Breeze", "clue": "Gentle wind" }
        ],
        "terms": { "area": 8.48528137423857, "areaRatio": 1.265625, "hvRatio": 1, "nConnections": -28, "nCycles": -1, "picSimilarity": 0, "circularity": 1.1228712159141359 },
        "score": -17.126222409847298
      }
    }
  ]
}
```

The greedy layout is 12 × 8 with no cycle. Twenty iterations later the crossword is 9 × 8: Thunder and Blizzard cross both Hail and Drizzle, which makes one 4-cycle, and the score has dropped from −4.73 to −17.13. With a target, add for example `"target": {"mask": [".#.#.", "#####", ".###.", "..#.."]}`, or a PNG on the command line. The page's example, `examples/weather.txt` with the heart in `examples/heart.txt` (the implicit curve (x² + y² − 1)³ − x²y³ ≤ 0, made by `examples/make-heart.mjs`), shows the picture term at work.
