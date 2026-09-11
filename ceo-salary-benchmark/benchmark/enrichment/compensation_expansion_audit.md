# Cumulative compensation expansion: independent integration audit

Reviewed 10 September 2026. Source package: `tmp/rp-compensation-round12-2026-09-10.zip`. All 1,858 manifest entries match their SHA-256 checksums. Checksums establish package integrity, not source authenticity.

## Assessment

**The expansion is useful, but it is a research inventory rather than a fully validated import.** It substantially broadens functions and includes source links, legal-employer identifiers, explicit pay components, reporting periods, title classifications, exclusions and negative research findings. Its separation of advertised ranges from incumbent compensation, handling of quarantined returns, and disclosure of missing originals are strengths.

The cumulative package contains 3,384 person-level filing rows, 470 organization/candidate entries, 226 filing-context records and 118 advertised-range rows. These are not independent employee observations or comparable employers: the person table includes unpaid governance, transitions, role ambiguities and inherited records; the organization table includes unresolved discovery leads; advertisements include campaign variants. Round twelve itself adds nine advertisements and no incumbent compensation. Its 33 saved artifacts are factual transcriptions, not original source files.

The reference set remains purposive and disproportionately covers senior/high-paid employees required to appear in public disclosures. Large institutions such as Urban, Pew and Aspen can inform functional comparisons but are not automatically close RP peers. A title alone does not establish the employee's budget, reporting line, hiring market, managerial authority or current role. No generic President benchmark is warranted: chief executives, affiliate presidents, board presidents and combined President/COO jobs differ materially.

## Integrated records

**294 additional records are published:** 237 non-CEO incumbent disclosures, 32 CEO disclosures and 25 advertised cases. There are 22 new role pages, bringing the catalog to CEO plus 36 other positions. The added records span 116 named organizations; many organizations already appeared elsewhere in the app. This is not a claim of 116 newly discovered employers.

New role groups include People/HR Director and Executive, functional research/development/communications executives, Executive Vice President, Chief Economist, Controller, Legal Director, Operations Director and Manager, research and program managers, and research/program individual contributors. Existing COO, CFO, research-director and other pages receive supported additions. New role groups retain their narrower reviewed definitions instead of splitting hybrid jobs among functions.

**46 existing executives are also cross-listed in their reviewed functional groups**, retaining the same canonical observation ID, original values and conservative default eligibility. This includes Operations Executive, whose six observations already appeared under general executive titles. A person is never counted twice within a role, and self-matches are excluded from salary ratios. The canonical title view's highest-other-pay predictor is omitted in a cross-listed view because its employee exclusion rule differs.

Communications Executive (21 default records / 20 employers), Development Executive (19 / 18), and Research Executive (18 / 12) meet the original Primary support threshold of 15 default records from 12 employers. The other 19 new role groups are **explicitly exploratory**. Counts describe selected disclosed records and policy ranges, not estimated occupational populations. Routes open with their reviewed default subset. Historical/undated cases without a reviewed inflation conversion are available by choosing nominal dollars and All observed records.

The 32 additional CEO disclosures are available in the sensitivity/observed views. They do not enter the default CEO cohort or its frozen predictive fits. Every pre-existing observation, RP reference and predictive-model object is preserved. Modeling, fitting, validation metrics and RP model inputs are outside this update.

## Independent source checks

Three focused GPT-5.6 subagents reviewed incumbent numbers, advertised sources, and role/employer scope. The importer independently reconciles admitted XML records against exact Part VII and Schedule J locators, person names, titles, EINs, fiscal/compensation periods, reported hours, compensation components and organization financial fields. A matching number elsewhere in a document does not satisfy this XML gate.

The integrated source manifest contains 141 hash-pinned files: 76 XML returns, 33 PDF returns, 31 saved advertisement/filing-render HTML files and one publication-metadata JSON response. Existing cached originals are reused when byte-identical. Cross-listings additionally require exact agreement with the existing observation's source bytes, compensation year, base and cash amounts. ProPublica filing renderings are labeled as HTML evidence, not native XML. Separately needed Schedule J evidence is pinned and exposed through the source dialog's additional-source links.

Recovered PDFs receive named-person, page-specific checks of Part VII cash and Schedule J base/total. Five representative filings also received rendered-page column checks: Woodwell, Urban, Center for Effective Philanthropy, Pew and Candid. Their financial contexts were checked visually as well. PDF records from other recovered filings omit financial predictors unless separately verified. Source-number checks do not establish a verified full employment year or contractual FTE.

The recovery follow-up checked all 120 remaining filing candidates across 28 source URLs. Ordered component checks, filing identity, compensation year and reported hours reconciled; representative recovered PDF pages were visually inspected. Native Candid-hosted XML resolved the previously inaccessible Brookings and Cato filings, while alternate Candid PDF copies resolved other publisher failures. Five candidates duplicate existing observations and one Independent Institute CEO disclosure reports zero compensation, leaving **114 further incumbent records**. Source verification alone does not promote a record into the default cohort.

Brookings's recovered Schedule J also supplied six previously unextracted bases. For example, Cecilia Rouse's $1,327,657 reportable cash decomposes into **$977,657 base and $350,000 bonus**, with $1,370,231 total compensation. The importer checks the exact named XML row, filer/related columns, and cash/total reconciliation before filling a missing base. The original missing value and locator remain in each row's `baseRecovery` metadata. Fourteen other recovered base-missing cases were checked again; their named Schedule J rows were absent, so base remains missing. Pay verification does not imply financial/staff-context verification.

Examples, nominal USD for compensation calendar year 2024:

| Employer / person | Reviewed role | Base | Reportable cash | Total |
|---|---|---:|---:|---:|
| Woodwell / Corrie Martin | COO | $299,903 | $320,816 | $354,212 |
| Urban / Yasmin Kazzaz | COO | $361,576 | $377,915 | $443,937 |
| Wikimedia / Jaime Villagomez | CFO; sensitivity | $408,761 | $416,641 | $456,256 |
| Center for Effective Philanthropy / Phillip Buchanan | CEO (native President) | $505,286 | $608,322 | $683,749 |
| Pew / Michael Dimock | CEO (native President) | $480,966 | $510,158 | $586,974 |

The full original [Woodwell return](https://www.woodwellclimate.org/wp-content/uploads/2026/07/WCRC-FY25-990-Public-Disclosure-Copy.pdf), [Urban return](https://www.urban.org/sites/default/files/files-wysiwyg-2026-01/Urban_Institute_Form_990_2024.pdf), [Wikimedia return](https://upload.wikimedia.org/wikipedia/foundation/3/39/Wikimedia_Foundation_2024_Form_990.pdf), [CEP return](https://cep.org/wp-content/uploads/2025/08/CEP-2024-990-Full-Return_onlinefile.pdf) and [Pew return](https://www.pewresearch.org/wp-content/uploads/sites/20/2026/04/FY25-990-PRC.pdf) are retained locally. Woodwell and Pew fiscal returns end in June 2025 but report calendar-2024 compensation.

Ad checks recovered primary employer pages/PDFs and attributed partner-board pages. Admitted examples include SEEC Operations Manager ($55,000–$75,000), West Virginia Rivers operations staff ($45,000–$55,000), SFP research-program management ($80,000–$90,000), and historical ISRG Finance Manager ($50,000–$70,000). WV Rivers explicitly supervises nobody; SFP supplies no evidence of employee line management. Neither is relabeled a research/operations team manager solely because “Manager” occurs in the title. The [WV Rivers first-party publication metadata](https://wvrivers.org/wp-json/wp/v2/pages/19270) supplies its previously unresolved 2026 date and is saved separately.

## Corrections and exclusions

- **GiveWell Senior Researcher:** a [May 11, 2026 archived employer page](https://web.archive.org/web/20260511112328id_/https://job-boards.greenhouse.io/givewell/jobs/4253692008) resolves the mismatch and verifies $205,600 other-US / $226,800 NYC-SF. This corroborates the existing app campaign and is linked in its source dialog; neither geography becomes a duplicate observation. The current $280,000/$308,000 version remains separate conflict evidence. For newly admitted cases, capture dates alone do not establish posting/pay years, so archive-only cases remain nominal-only sensitivity evidence.
- **Assistant Managing Directors:** three ideas42 rows classified by the package as Managing Directors are held out of that benchmark. Assistant, associate and deputy titles cannot enter the ordinary Managing Director group.
- **Combined research functions:** Urban's research-and-programs executive and Environmental Law Institute/Roosevelt research-and-policy executives are sensitivity-only pending scope review. A title specifying research programs alone remains eligible as research leadership. Cross-listed rows retain their own functional classification evidence and sensitivity reason in the view.
- **MIRI:** source-integrity quarantine is preserved. A native filing with inconsistent cross-section component classification is not repaired by relabeling cash as base or by finding a nearby matching number.
- **ILGA / Third Way:** currency, payer, source and/or date uncertainties remain unresolved; these are not admitted.
- **Advertisement recovery:** all 36 previously unresolved ad variants received a disposition. The source review verified 23; final integration adds 16 campaign observations and corroborating archive links for four existing campaigns. Existing geographic representatives are preserved, and a one-sided Founders Pledge salary ceiling is excluded. The other 16 variants include geographic/seniority duplicates, non-USD ranges, unresolved payroll/FTE scope and two unrecovered originals. A salary ceiling is not an exact salary or closed interval. The decision table records the specific reason, even when a source was successfully recovered.
- **Duplicate records:** existing observation IDs, original-file/person identity and EIN/person/compensation-year identity prevent repeated imports. Ad URLs are compared after unwrapping archive URLs and removing tracking parameters while preserving job-identifying query fields. Four recovered archived campaigns already exist under legacy IDs; their original observations remain intact and receive corroborating source links. One reviewed geographic variant represents each newly imported ad campaign. Other variants remain in the research inventory; endpoints are not separate employees.

## Pay, uncertainty and comparability

Base is disclosed Schedule J base; cash is Part VII reportable compensation; total follows its documented Part VII or Schedule J basis. Cash never fills missing base. Advertisements have null incumbent cash/total and a separately labeled range/midpoint. Reported annual compensation remains distinct from the conditional 40-hour sensitivity supplied by the package. Missing contractual FTE remains missing.

The importer uses the app's frozen CPI conversion for complete historical years. Current 2026 advertised USD rates use the app's target-year approximation (factor 1), stated in their CPI-period field; this is not an estimate of a completed 2026 annual CPI. Unknown-year and 2021 ad records without a frozen annual conversion remain nominal-only. No nominal amount is substituted into a missing adjusted field.

Organization fiscal-year dates and the calendar-year employee-count definition are retained in each record's review metadata. Missing organization size remains missing. EA affiliation can be explicitly Not assessed; it is not inferred from the absence of an EA label. Original institution-wide categories are reused only for the same employer. New role pay ratios require a unique record in the same source and compensation year.

## Files and reproduction

- `compensation_expansion_review.json`: source-pinned independent decisions, role mapping, package-table hashes and baseline fingerprint.
- `compensation_expansion.json`: validated app rows, shared-observation role memberships, new public catalog entries and original-source manifest.
- `compensation_expansion_decisions.json`: disposition for every cumulative person/ad record.
- `compensation_recovery.json`: all 120 filing and 36 advertisement recovery outcomes, source checks, corrections and final ad-integration decisions.
- `scripts/import_compensation_expansion.py`: explicit import/reconciliation stage; requires the extracted package, review file and reviewed pre-expansion JSON snapshot through `--review` and `--baseline`.
- `scripts/compensation_expansion.py`: build-time validation and empirical append, applied after the existing model-provenance check.
- `benchmark/sources/native/compensation_expansion/`: ignored, hash-pinned native originals. Referenced sources are published or reused under `evidence/original/`; existing cached originals are reused when their bytes match.

The input ZIP, extracted package, working audits, raw recovery attempts, PDF renders and baseline snapshot remain under ignored `tmp/round12-review/`. The independent audit reports and machine-readable findings there preserve recovery failures and validation limits. The historical extract/taxonomy and model artifacts are unchanged. `npm run build` consumes the reviewed overlay without rerunning research or requiring the original ZIP.

Validation: the app build and complete data-audit command pass, including 36 Python tests. Seven focused browser tests cover all 22 new role selectors, semantic routes, nominal-only evidence, shared functional views, CEO ratios, existing position interactions, weighting and robustness. The rendered People/HR Director page was inspected. A separate baseline comparison verifies all 662 original observations, RP references and the complete predictive artifact remain unchanged; all 956 canonical observation IDs are unique.

Follow-up priorities are resolving the remaining ad payroll/FTE/source questions, obtaining role-specific RP scope and hiring-market evidence, validating historical full-year/FTE status, and reviewing the expanded CEO peer set before changing its default membership. Further modeling should follow those separate data decisions.
