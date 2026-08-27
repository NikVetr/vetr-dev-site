# CEO salary benchmark

This directory contains a validated public-record CEO compensation benchmark for Rethink Priorities and a standalone vanilla HTML/CSS/JavaScript explorer intended for `https://vetr.dev/ceo-salary-benchmark/`. The route is deliberately absent from the vetr.dev homepage project list.

## Web application

`index.html`, `style.css`, `app.js`, and generated `app-data.js` form the static GitHub Pages application. The desktop layout uses a settings column, a central weighted histogram and quantile view, and a sortable/filterable evidence table. Narrow layouts stack these regions.

The app keeps incumbent Form 990 evidence separate from recruitment postings. Incumbent users can switch among validated Schedule J base compensation, Part VII cash/W-2 proxy, and filing-total proxy. The default is the empirical, equally weighted distribution; lognormal and gamma fits are explicit sensitivity modes. Users can apply structural presets, comparability or expense-similarity weighting, organization-specific multipliers, and row inclusion toggles. Each histogram block maps to one organization and focuses the corresponding table row. Quantile cells project their value onto the chart on hover or keyboard focus.

Source previews display the exact evidence fields used for the selected measure. Third-party links open the public host, while `evidence/original/` contains compactly published copies of the original XML, HTML, or PDF artifacts referenced by app observations. `scripts/build_app_data.py` rebuilds both the app dataset and this publishable source subset from the validated benchmark deliverables.

## Analytical package

`benchmark/` contains the protocol chain, frozen peer universes, original analysis, independent validation, source manifests, and acquisition utilities. Stable source IDs connect analytical rows to source-native files and retrieval metadata. All 349 required source records are locally preserved: 135 IRS XML returns, 32 job-ad records, 174 supporting web sources, seven frozen inputs, and one documented search record.

Independent parsing found that the original analysis omitted Schedule J base compensation and misstated the Center for AI Safety Part VII amounts. The app therefore uses `validated_form990_compensation.csv` and `validated_job_ad_compensation.csv`, not the uncorrected original evidence columns. All 15 primary quantitative job-ad ranges now verify locally. The Marine Science Institute exclusion remains unchanged, but its recovered source corrects the role title to Executive Director.

The strict `source_complete` packager remains fail-closed because it requires the original expected fields to agree with every source as well as requiring all files to exist. Its remaining failures are extraction/data-contract findings, not remote-retrieval gaps.

## Reproduction and testing

- `python3 scripts/build_app_data.py` rebuilds the static app data and publishable evidence files.
- `npm run serve` serves the route locally on port 4173.
- `npm test` runs focused Playwright checks for chart rendering, empirical/model switching, source previews, H-CAP and Center for AI Safety corrections, evidence-stream switching, and responsive layout.
- The benchmark's independent audits and source validators remain under `benchmark/scripts/`.

The app is decision support for board deliberation, not a population salary estimator or a substitute for a formal compensation-reasonableness process.
