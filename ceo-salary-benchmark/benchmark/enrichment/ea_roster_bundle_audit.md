# EA roster bundle audit

## Reviewed payload

- Payload: `tmp/rp_ceo_definitive_ea_roster_bundle.zip`
- SHA-256: `483dd2fd32e3ed0ad805b2c02f1ab63c2c4377a3f8dd6f6f37dfce76f7c02010`
- Review date: 2026-08-28
- App decision: do not treat the bundle as a validated or definitive peer expansion. Preserve its discovery work, repair source coverage, and integrate only compensation observations independently checked against a filing.

## Release and reproducibility failures

The payload records 16 passing checks and one failing check. The failed check is `No newly found entity silently assigned a score`. Nineteen of the 109 rows in `newly_identified_screening_queue.csv` carry a comparability score despite being labeled newly identified and unscored. The build script raises on that failure, leaving `analysis/build_summary.json` empty and producing no complete artifact manifest or root hash.

The build script also depends on hard-coded `/mnt/data/...` inputs that are absent from the ZIP. The 66 Giving What We Can rows, 190 EA Forum rows, and all 34 provisional scored additions are copied from those omitted inputs rather than reproducibly derived from the included source artifacts.

The screening queue is not entity-clean. It includes at least these aliases of already scored rows:

- `CEEALAR` / `Centre for Enabling EA Learning & Research`
- `Effective Altruism and Consulting Network` / `Consultants for Impact`
- `Our World in Data` / `Global Change Data Lab / Our World in Data`

It separately retains two spellings of the Johns Hopkins Center for Health Security, contains Rethink Priorities itself, and contains companies, public bodies, funds, programs, and historical entities. Its reported counts of 209 canonical entities and 109 new entities are therefore overstated and should not be used as peer counts.

## Roster-source validation

All 15 programmatic web acquisitions in the supplied package failed. The three supplied print PDFs are preserved locally, but the Giving What We Can print is visibly clipped on its right edge and cannot independently support every copied row.

Fresh source captures establish the following:

- The live Giving What We Can page contains the package's 66 captured names.
- The live Wikipedia category contains the package's 28 captured names.
- The live EA Forum page contains the package's 190 organization names.
- The live GiveWell page corroborates the four package fallback names.
- The Animal Charity Evaluators URL in the package is obsolete. The current recommended-charities page lists Animal Welfare Observatory, Aquatic Life Institute, Çiftlik Hayvanlarını Koruma Derneği, Dansk Vegetarisk Forening, Good Food Fund, Shrimp Welfare Project, Sinergia Animal, Sociedade Vegetariana Brasileira, The Humane League, and Wild Animal Initiative. The package incorrectly retains Faunalytics, Fish Welfare Initiative, Good Food Institute, and New Roots Institute and omits four current replacements.
- The package records zero Giving Green rows despite calling the source included. The current page lists Clean Air Task Force, Future Cleantech Architects, Good Food Institute, Opportunity Green, and Project InnerSpace.
- The Effective Ventures `/our-projects` URL is obsolete. Its current organizations page lists Centre for Effective Altruism and Effective Altruism Funds; the package fallback also includes 80,000 Hours and Giving What We Can, which are no longer on that page.
- The package's AIM domain does not resolve. The working Charity Entrepreneurship portfolio is preserved from `https://www.charityentrepreneurship.com/our-charities`. It currently exposes 55 charity-detail routes across current and track-record sections; those links require section- and entity-aware review rather than automatic treatment as 55 comparable employers.

The corrected live HTML captures, the three supplied PDFs, and the filing evidence are indexed with hashes in `benchmark/enrichment/ea_roster_source_manifest.csv`. The native source directory is intentionally local and gitignored; filing pages used by the app are additionally copied into `evidence/original/` by the data build.

## Review of the 34 provisional peer additions

The 34 names do not overlap the existing 144-reference set by exact organization name. The bundle nevertheless labels all 34 provisional and not yet added to the quantitative benchmark. Five now have a positive compensation observation independently validated against a preserved filing: the four observations discovered in the bundle plus a subsequently retrieved Magnify Mentoring Form 990-EZ. The other 29 supply no usable positive compensation observation and no row-level source artifact for their scale figures, tier, comparability score, structure, title, or EA classification. Non-US figures also generally omit a currency/year basis. They are retained in `ea_roster_candidate_review.csv` for future screening but are not added to salary calculations.

The five filing observations were independently checked against preserved ProPublica-rendered Forms 990 or Form 990-EZ:

| Organization | Filing compensation | Corrected filing scale | Integration |
| --- | ---: | --- | --- |
| Center for Election Science | Nina Taylor, CEO: $198,590 Schedule J base and Part VII cash | $631,856 revenue; $1,190,636 expenses; **7 staff** (bundle omitted staff) | Sensitivity only |
| Foresight Institute | Allison Duettmann, CEO: $276,150 base/cash plus $8,285 other/deferred compensation | $9,356,634 revenue; $3,749,519 expenses; 6 staff | Sensitivity only |
| Leverage Research | Geoffrey Taylor Anders II, CEO/Chair/Treasurer: $21,533 Part VII cash; no Schedule J; **40 reported weekly hours** | $392,590 revenue; $430,580 expenses; **3 staff** (bundle omitted staff) | Observed only: the filing does not support a limited-hours explanation, but the compensation is unusually low, the organization is well below RP's scale, and the combined CEO/chair/treasurer structure is not cleanly comparable |
| Qualia Research Institute | Andres Gomez Emilsson, President/Executive Director: $64,164 Part VII cash; no Schedule J; **15 reported weekly hours** | $140,681 revenue; $291,314 expenses; 4 staff | Observed only: part-time and structurally unclean; another officer was paid more |
| Magnify Mentoring | Kathryn Mecrow-Flynn, CEO/Executive Director: $98,349 Form 990-EZ officer compensation; **40 reported weekly hours** | $186,110 revenue; $164,940 expenses; staff count not reported comparably | Sensitivity only: current full-time executive evidence, but the organization is very small and Form 990-EZ does not provide the Schedule J measure used for the default incumbent stream |

The four 2024 compensation observations use the same verified annual-average CPI-U factor as the existing app (`1.0644880037701905`) for July 2026 dollars. Magnify Mentoring uses the corresponding 2025 factor (`1.0371960253833754`). `scripts/validate_ea_roster_additions.py` fails if any preserved filing value, arithmetic identity, staff count, or CPI factor diverges from `ea_roster_validated_compensation.csv`.

Two other EINs identify the named organizations but do not yield a positive executive-compensation observation. Animal Advocacy Africa's latest filing reports $173,506 of expenses rather than the bundle's unsupported $227,000 claim and reports $0 compensation for every named officer. Probably Good's first available FY2024 Form 990 reports $1,000,000 revenue, $0 expenses, zero employees, and $0 officer compensation; it states that operations would not begin until January 2025, while the bundle leaves its finance fields blank. Both records remain screening-only. Magnify Mentoring no longer belongs in this unsupported group: its separately retrieved filing supersedes the bundle's undocumented scale figure and supports the sensitivity-only observation above.

Other spot checks confirm that the remaining numeric fields cannot be pooled as written. Action for Happiness's 426,265 revenue and 551,274 expenses are GBP FY2025; Humane Slaughter Association's 495,156 and 452,518 are stale GBP FY2023 figures; Global Change Data Lab, CEEALAR, and Unlimit Health also appear to use unlabeled GBP source values; High Impact Professionals reports 1.6 FTE rather than a filing-comparable employee count; and LEEP's scale figures come from an explicitly unaudited 2025 review. The review file therefore marks every non-filing numeric claim unsupported by this bundle rather than attempting silent currency conversion or imputation.

## Source limitation

The bundle's four `apps.irs.gov/..._public.xml` links return 404 at review time, and ProPublica's XML-download endpoint challenges programmatic access. The locally preserved rendered filing pages expose the source-native field locators and values used for validation. Original XML remains preferable if acquired interactively; the app links to the corresponding live full-filing pages rather than to the broken IRS URLs.
