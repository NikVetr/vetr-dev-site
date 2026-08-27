# CEO salary benchmark

This directory contains a validated public-record CEO compensation benchmark for Rethink Priorities and a standalone vanilla HTML/CSS/JavaScript explorer intended for `https://vetr.dev/ceo-salary-benchmark/`. The route is deliberately absent from the vetr.dev homepage project list.

## Web application

`index.html`, `style.css`, `app.js`, and generated `app-data.js` form the static GitHub Pages application. The desktop layout uses a settings column, a central weighted histogram and quantile view, and a sortable/filterable evidence table. Narrow layouts stack these regions.

The app keeps incumbent Form 990 evidence separate from recruitment postings. Incumbent users can switch among validated Schedule J base compensation, Part VII cash/W-2 proxy, and filing-total proxy. The default is an equally weighted lognormal summary with its density overlaid on the histogram; empirical and gamma summaries are explicit alternatives. The initial 2–200 bin control is calibrated to make organization blocks approximately square at the current viewport. The histogram always shows exact-observation rug marks, reserves headroom above the tallest mark, and labels both axes. Users can apply structural presets, comparability or expense-similarity weighting, organization-specific multipliers, and row inclusion toggles. Rows without the active compensation measure are hidden by default and can be exposed for auditing, with unavailable inclusion controls disabled. Each histogram block maps to one organization and focuses the corresponding table row.

Organization and normalized job-title fields are separate. Equivalent titles such as `Chief Executive Officer` and `CEO` share a consolidated title while the original source wording remains in the evidence record. Title, tier, topic, location, work model, EA relationship, and organizational-structure columns use exact-value checkbox menus that support multi-selection. Two-ended salary and log-scale expense controls provide numeric filtering. Categorical filters, numeric filters, and free-text search all update the table, histogram, fitted curve, statistics, and quantiles from the same observation subset.

The table also exposes staff count and evidence year. Preserved Form 990 website declarations supply organization-homepage links for 121 incumbent peers. Organization hover/focus cards combine local benchmark context with an optional live, explicitly unverified Wikipedia search preview; the benchmark never stores that preview as analytical data. Quantiles can be shown as quintiles, deciles, all percentiles, or user-entered percentile levels, and the panel identifies whether they come from empirical weighted ranks or a fitted distribution. Hovering or focusing a quantile projects it onto the chart. The interface uses the Rethink Priorities blue palette and the local Aspekta variable font. Help tooltips use collision-aware fixed positioning so they remain inside the viewport.

Source previews display the exact evidence fields used for the selected measure. Third-party links open the public host, while `evidence/original/` contains compactly published copies of the original XML, HTML, or PDF artifacts referenced by app observations. `scripts/build_app_data.py` rebuilds both the app dataset and this publishable source subset from the validated benchmark deliverables.

## Analytical package

`benchmark/` contains the protocol chain, frozen peer universes, original analysis, independent validation, source manifests, and acquisition utilities. Stable source IDs connect analytical rows to source-native files and retrieval metadata. All 349 required source records are locally preserved: 135 IRS XML returns, 32 job-ad records, 174 supporting web sources, seven frozen inputs, and one documented search record.

Independent parsing found that the original analysis omitted Schedule J base compensation and misstated the Center for AI Safety Part VII amounts. The app therefore uses `validated_form990_compensation.csv` and `validated_job_ad_compensation.csv`, not the uncorrected original evidence columns. All 15 primary quantitative job-ad ranges now verify locally. The Marine Science Institute exclusion remains unchanged, but its recovered source corrects the role title to Executive Director.

The strict `source_complete` packager remains fail-closed because it requires the original expected fields to agree with every source as well as requiring all files to exist. Its remaining failures are extraction/data-contract findings, not remote-retrieval gaps.

## Reproduction and testing

- `python3 scripts/build_app_data.py` rebuilds the static app data and publishable evidence files.
- `npm run serve` serves the route locally on port 4173.
- `npm test` starts a local server and runs focused Playwright checks for chart and density rendering, distribution switching, y-axis headroom, row inclusion, unavailable observations, filter-to-chart synchronization, two-ended numeric filters, select-all checkbox state, percentile provenance, source and organization previews, H-CAP and Center for AI Safety corrections, viewport-safe tooltips, evidence-stream switching, and responsive layout.
- The benchmark's independent audits and source validators remain under `benchmark/scripts/`.

The app is decision support for board deliberation, not a population salary estimator or a substitute for a formal compensation-reasonableness process.
