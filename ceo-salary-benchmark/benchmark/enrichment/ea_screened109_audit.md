# EA screened-109 / combined-186 audit

## Decision

The screened-109 package is useful as a peer-discovery and screening artifact, but `combined_reference_set_186_screened.csv` is not a 186-observation compensation dataset and must not replace the current app data. Only source-validated, entity-deduplicated compensation extensions are added, initially to the sensitivity sample.

## Living-review amendment (2026-08-30)

The phrase “initially to the sensitivity sample” is material: this audit preserved a cautious first integration, not a permanent boundary. `living_peer_universe_review.csv` subsequently applies the same pay-blind source/entity/period/role rule to historical and post-freeze observations. GiveWell now enters the living default at Tier B and Copenhagen Consensus Center at Tier C. GiveWell's grantmaking model and $183.707 million filing-expense scale, and Copenhagen's founder status and one-employee scale, remain visible to the optional structure, tier, expense, and staff weights. Project Healthy Children remains a single refreshed default entity. The package's other five apparent additions still lack a usable current positive named-executive point and therefore remain research inventory rather than salary observations.

## Internal validation

- Reviewed ZIP: `tmp/rp_ceo_ea_roster_screened109.zip`; SHA-256 `14881770c99974fe48d24145d2c3b4776ca310382d421713332600253697770c`.
- Standalone combined CSV and ZIP deliverable are byte-identical; SHA-256 `057702a37dc81f66dc3dee8360a0df0509f62d0b5a313f8e9c6354329bdfff8d`.
- The package reproduces 109 screening dispositions: 8 quantitative candidates (2 A, 4 B, 2 C), 35 structural/context, 65 excluded, and 1 RP target.
- Its combined bridge has 186 organization-name rows, but only 120 positive cash/total observations and 66 rows without compensation.
- The source ledger has 225 rows but only 123 unique URLs. The package archives no source bytes under `sources/raw/`; hashes prove package consistency, not the underlying web claims.

## Reconciliation to the current app

- The current app has 149 incumbent rows, 125 positive salary observations, and 116 default-included observations before this extension.
- Every current app organization appears in the combined bridge by exact name. The bridge has 37 additional names: 29 previously unsupported addendum candidates and the eight screened rows.
- `Sanku - Project Healthy Children` is the same EIN/entity as existing `Project Healthy Children` (83-0396815). Entity-cleaning reduces the eight apparent additions to seven and the 186-name bridge to at most 185 entities. The roster review did, however, surface a newer official filing, so the existing row is refreshed rather than duplicated.
- The bridge is stale: it omits five subsequently validated positive app rows and contains outdated compensation for Center for AI Safety. Ten revenue, ten expense, and 77 staff fields also differ across exact-name overlaps. It is therefore retained for audit only, not ingested wholesale.

## Compensation recovery

Two genuinely new positive observations are source-complete enough to add as sensitivity records:

1. **GiveWell / The Clear Fund.** The official 2024 Form 990 reports Elie Hassenfeld, Chief Executive Officer, 40 hours; Part VII organization compensation $424,805, related compensation $0, and other compensation $38,590. Schedule J reports $423,600 base, $1,205 other reportable compensation, $38,590 nontaxable benefits, and $463,395 total. The filing reports $269,542,773 revenue, $183,707,000 total expenses, and 96 employees. The screening package's $21,361,760 operating-expense concept is not silently substituted for the filing-comparable total-expense field used elsewhere in the app.
2. **Copenhagen Consensus Center USA.** The 2024 Form 990 reports Dr. Bjorn Lomborg, President & Founder, 40 hours; Part VII cash $497,770 with no related or other compensation. Schedule J reports $435,166 base plus a $62,604 bonus, totaling $497,770. The filing reports $920,765 revenue, $1,187,335 expenses, and one employee.

At initial integration, both were excluded from the then-validated default sample. GiveWell's grantmaking/donor-service model and very large filing expense base differ materially from RP, while Copenhagen Consensus is founder-led and far below RP scale. The living-review amendment above retains those facts as Tier/structure/scale metadata and admits both clean full-time organization-wide observations.

The official current Project Healthy Children / Sanku filing also corrects the existing row's stale-source note. It reports Felix Brooks-Church, CEO, 40 hours; Part VII organization compensation $97,072 and other compensation $116,768; Schedule J base $97,072, deferred compensation $3,168, nontaxable benefits $113,600, and total $213,840. The filing reports $6,702,737 revenue, $5,867,621 expenses, and three employees. This supersedes the app's older 2022 compensation observation but does not increase the entity or observation count.

The other five genuinely new candidates have no comparable current named-executive amount: Epoch reports zero officer pay in its first public return; GovAI's available U.S. filing reports a partial-year officer rather than its current organization-wide director; AIM's latest accounts predate its current CEO; Dansk Vegetarisk Forening discloses aggregate payroll only; and Sinergia Animal reports no individual pay. Sanku is deduplicated rather than added.

Machine-readable dispositions are in `benchmark/enrichment/ea_screened109_candidate_review.csv`.

## Source locators

- GiveWell: official PDF, Form 990 Part I lines 5/12/18; Part VII Section A Elie Hassenfeld row; Schedule J Part II Elie Hassenfeld row.
- Copenhagen Consensus Center: cached scanned PDF pages 1 (Form 990 Part I), 7 (Part VII), and 36 (Schedule J Part II).
- Project Healthy Children / Sanku: official PDF pages 1 (Form 990 Part I), 7 (Part VII), and 39–40 (Schedule J Part II and the housing-allowance note).

## Count interpretation

After the two initial sensitivity additions, the app contained 151 incumbent organization rows and 127 positive incumbent salary observations, while the then-default sample remained 116. Subsequent source-validated additions and the living review now produce 153 incumbent rows across 152 organizations and a 122-row default cash sample. The package's `186` number should always be labeled a provisional organization-name screening bridge, never a salary-observation count.
