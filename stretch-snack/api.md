# Complimentary Stretch Snack planner

The page, `window.StretchSnack.submit(request)`, and the Node CLI use the same synchronous planner. To import it directly, use `submit` from `core/plan.js`. The catalog, movement descriptions, sources, supported option IDs and labels are named exports in `core/catalog.js`. All calculation is local and deterministic.

```sh
node stretch-snack/cli.mjs request.json
# or
echo '{"location":"plane-seat","seconds":30,"targets":["calves"]}' | node stretch-snack/cli.mjs
```

The example selects `seated-heel-lift` for 30 seconds. Its result also includes compatible swaps and any unmet requests.

A 90-second request for hips, knees and lower back fits the default airplane seat with no equipment. It gives knee squeezes, seated pelvic tilts and buttock squeezes 30 seconds each.

```sh
echo '{"seconds":90,"targets":["hips","knees","lower-back"]}' | node stretch-snack/cli.mjs
```

For a two-place example, this request includes a supported weight shift in the lavatory and neck work in the seat. The 125-second budget includes the 60-second estimate to change places.

```sh
echo '{"location":"plane-seat","availableLocations":["plane-lavatory"],"equipmentByLocation":{"plane-lavatory":["support"]},"seconds":125,"targets":["neck","hips"],"favoriteIds":["standing-weight-shift"]}' | node stretch-snack/cli.mjs
```

## Request

All fields are optional. Unknown fields and invalid IDs produce errors.

| Field | Accepted values or units |
| --- | --- |
| `location` | `plane-seat` (default), `train-seat`, `roomy-seat`, `plane-lavatory`, `stall`, `open-area`. The `roomy-seat` and `open-area` presets assume a stationary surface. |
| `seconds` | Integer 15–900, default 120, including planned travel and changes of posture. |
| `targets` | List drawn from `neck`, `shoulders`, `upper-back`, `chest`, `hands` (and forearms), `hips`, `knees` (and thighs), `calves` (and feet), `lower-back`. Empty requests a mixed routine. |
| `discretion` | `quiet` (default), `moderate`, `any`. A ceiling on how conspicuous a movement may be. |
| `equipment` | List drawn from `band`, `towel`, `ball`, `roller`, `support`, `firm-back`, `step`, `mat`. Portable items travel with you. A fixed handhold, firm seat back or low fixed step listed here applies at the current place. |
| `equipmentByLocation` | Optional map from selected place IDs to fixed equipment available there, for example `{"plane-lavatory":["support"]}`. Standing toe lifts can fit a moving-vehicle location with a confirmed fixed handhold. The usual balance, grip and mobility checks apply. |
| `allowFloor` | Boolean, default false. Floor routines need an open, stationary space and explicit opt-in. A mat is optional. |
| `limitations` | List drawn from `stay-seated`, `stay-standing`, `back-support`, `poor-balance`, `no-floor`, `no-leg-movement`, `no-arm-movement`, `no-twisting`, `no-overhead`, `limited-grip`. The balance and supported-back settings select seated movements compatible with those preferences. |
| `heightCm`, `armspanCm` | Optional measurements in cm, 50–280 and 40–300, both default 170. Used to scale estimated movement clearance. |
| `forwardCm`, `sideCm` | Optional measurements in cm, 0–1,000. Free space in front of the knees and on each side beyond the shoulder. Overrides the preset at the current location. Use the smaller of unequal clearances. |
| `availableLocations` | Locations the traveler considers reachable **now**. The planner checks compatible locations on that route, e.g. a lavatory from an airplane seat. Empty by default. |
| `avoidIds`, `favoriteIds` | Movement ID lists. An avoided movement is ineligible. Favorites take priority among eligible movements. |
| `feedback` | Map of movement ID to `helped`, `poor-fit`, or `uncomfortable`. The first two influence ranking. Uncomfortable excludes the movement until the feedback is changed. |
| `steps` | Optional ordered list of `{id, location?, seconds, reps?}`. An omitted location resolves to the easiest selected place where that movement fits. Step times are integers 5–180, including any transfer, with at least five seconds left to move. Optional target repetitions are integers 1–100. Keep each location’s steps together in effort order. Repeated movements are allowed. An empty list empties the routine. |

## Result

- `steps` includes the location for each movement. The planner groups movements in the easiest suitable space, prioritizing requested areas and named favorites. `totalSeconds` includes all planned transfers. Automatic steps contain up to 45 seconds of exercise. A routine can be shorter than the time available.
- `places` gives the selected reachable places in effort order as `{location, rank, visitSeconds}`. The starting place costs zero. Moving to another seat is estimated at 30 seconds, a lavatory or stall at 60, and an open space at 90. Getting to another place and setting up there can take longer in practice.
- `segments` groups the route as `{location, steps}`, where `steps` lists zero-based indices into the plan. Use it in place of the former `alternatives` field.
- `transitionSeconds[i]` gives the part of step `i` reserved for travel or changing posture. Subtract it from `steps[i].seconds` to get exercise time. It includes travel when the first movement is elsewhere. A posture change within the same place takes 15 seconds. A trip into or out of a floor exercise includes floor-transfer time. When `returnToLocation` names the starting seat, the return trip follows the timed routine and is outside its duration.
- `eligibleIds` lists eligible movements across the selected places, including choices outside requested target areas for manual swaps. `eligibleLocations[id]` lists the places that accommodate that movement, easiest first.
- `unmetTargets` and `unmetFavorites` identify requests the routine could not include.
- Invalid requests throw `invalid_request` with `issues: [{code, path, message}]`. The CLI prints JSON errors to stderr and exits 1 for invalid requests and 2 for usage or I/O errors.

## During a session

When a movement is in another place, the player shows the destination and the time reserved to get there. **Ready to start** begins the full movement early once you are in position. Pause if you need longer. Spoken guidance includes destinations offline. **Previous** and **Next** revisit or skip movements. Skipping to another exercise at the same destination while traveling carries the remaining travel allowance forward.

Use **−10 s** or **+10 s** under the clock to adjust the current movement for this session. Both clocks update immediately. The player preserves at least five seconds of movement time after a transfer. The feedback screen lists movements whose active timer ran for at least one second.

## Saved routines

In **Your routine → Saved routines**, save an ordered sequence with its locations, step times and repetition targets on this device. Reopen it to check each movement against its saved place, your current mobility settings, confirmed equipment and available time. A routine saved before per-step places were introduced uses the easiest currently available fit for each movement. You can choose a compatible substitute, omit a step, or edit its time before selecting **Use routine**. Substituting clears that step’s original repetition target. To keep the adaptation permanently, save it under a new name or explicitly replace the saved copy. Profile defaults and session check-ins are stored separately.

To inspect a proposed sequence programmatically, pass the planner request including `steps` to `window.StretchSnack.reviewRoutine(request)`, the named export from `core/plan.js`, or the CLI:

```sh
echo '{"location":"plane-seat","seconds":30,"limitations":["no-leg-movement"],"steps":[{"id":"seated-heel-lift","seconds":40}]}' | node stretch-snack/cli.mjs --review
```

The report includes `fits`, `totalSeconds`, `overBudgetSeconds`, `places`, `eligibleIds` and `eligibleLocations`. Each entry in `rows` gives the resolved location, `issues`, `transitionSeconds` and `needsTransferTime`. Retired movement IDs are reported as unavailable. Malformed inputs still produce structured request errors. Use the standard planner to validate a revised sequence before starting it.

## Interpretation and sources

Each of the 191 posture and equipment variants carries its own instruction, precaution, source and evidence note. The app's sequences, time budgets and clearance multipliers are design estimates. They target a comfortable, gentle break during travel. Named sources describe how the movements are performed. They have not reviewed this app or established comparative benefits among these variants.

A small crossover trial found less immediate discomfort when seated office workers interrupted four hours of sitting with hourly standing or pedaling. The study did not test individual in-seat stretches or these short routines. Feedback records personal preference and experience. [Benzo et al., 2018](https://pubmed.ncbi.nlm.nih.gov/29608539/)

Instructions are written for this catalog. The original clinical guidance and movement demonstrations are linked in the movement details. [NHS sitting exercises](https://www.nhs.uk/live-well/exercise/sitting-exercises/) · [Newcastle Hospitals' workplace mobility guidance](https://www.newcastle-hospitals.nhs.uk/services/newcastle-occupational-health-service/information-for-staff/physiotherapy/self-help-leaflets/1-minute-body-check/) · [NHS inform back exercises](https://www.nhsinform.scot/illnesses-and-conditions/muscle-bone-and-joints/neck-and-back-problems-and-conditions/exercises-for-back-pain)
