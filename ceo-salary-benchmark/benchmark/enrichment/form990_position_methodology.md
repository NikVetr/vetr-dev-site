# Form 990 all-position extraction and taxonomy

## Release boundary

This layer extracts Form 990 Part VII, Section A people and compensation for non-CEO position analysis. The existing hand-validated CEO table remains authoritative: canonical and other CEO-like rows are retained here for provenance but are never catalog-eligible.

## Source and arithmetic validation

- Official Form 990 XML filings parsed: **136** (135 peer filings plus RP).
- Every file hash, EIN, tax-period boundary, and return type matches the acquisition manifest.
- Raw Part VII rows: **2,786**; stable observations after collapsing one reviewed exact unpaid-board duplicate: **2,785**.
- Schedule J rows: **814**; all match exactly one Part VII person by case-insensitive exact name, with no fuzzy, duplicate, or unmatched matches. Three names differ only in letter case.
- Schedule J rows with positive filing-plus-related base compensation: **813**.
- Every Schedule J filing-organization and related-organization total exactly equals base + bonus + other reportable + deferred + nontaxable components.
- Part VII reportable cash equals Schedule J base + bonus + other reportable compensation in 811 of 814 Schedule J rows. Three source-internal differences are retained exactly: $10 (C2ES/Bradley Townsend), $1 (CEPR/Alexander Main), and $602 (FAR AI/Conor McGurk).
- Part VII, Section B contractor rows observed and deliberately excluded: **310**. These are vendor/contractor payments and service descriptions, not employee salaries.

## Public non-CEO catalog

`Catalog rows` retain all rows assigned to a public family, including display-only RP references. `Role-eligible` additionally requires positive Part VII cash and functional scope (not governance, program/affiliate, or uncertain). It normally requires either no source-indicated transition during the compensation calendar year or a separately verified full-year role, but 19 explicitly reviewed source-anomaly, fractional, or entity-boundary peer rows remain role-eligible only so the app can expose them as sensitivity observations. `Default included` is stricter: it requires one of those eligible compensation-year statuses, at least 30 combined filing-organization plus related-organization hours per week, no explicit sensitivity-only flag, and a selected peer rather than RP. `No transition indicated` is an absence-of-transition screen, not independently verified tenure.

| Position family | Catalog rows | Role-eligible | Organizations | With Schedule J base | Default included |
|---|---:|---:|---:|---:|---:|
| Operations | 66 | 54 | 51 | 48 | 53 |
| Finance | 87 | 59 | 53 | 50 | 58 |
| Chief Of Staff | 18 | 17 | 16 | 15 | 16 |
| Research | 115 | 109 | 55 | 84 | 103 |
| Programs | 147 | 134 | 59 | 110 | 132 |
| Development | 65 | 60 | 51 | 41 | 60 |
| Policy | 78 | 76 | 45 | 66 | 74 |
| Communications | 79 | 73 | 56 | 48 | 69 |
| Legal | 29 | 29 | 23 | 21 | 27 |
| People | 29 | 26 | 24 | 19 | 26 |
| Technology | 48 | 47 | 23 | 36 | 46 |
| Strategy | 20 | 18 | 16 | 16 | 17 |
| General Leadership | 208 | 76 | 44 | 64 | 74 |

- Catalog-eligible non-CEO observations: **989** (**979** peers plus **10** RP display references).
- Role-eligible paid observations: **778** (**774** peers plus **4** RP display references).
- Default-included peer observations: **755**.
- Role-eligible peer observations retained only for sensitivity analysis: **19** (9 below-30-hour/source-anomaly rows, 7 rows with 40 related-organization hours but no identified related employer, 1 source-labeled fractional role, and 2 Creative Commons related-employer boundary rows).
- Taxonomy groups: **884**: **555** rule-assigned single-family groups, **70** rule-assigned multi-role groups, **137** reviewed observation-override groups, and **122** groups not published without further review.

## Standardized position benchmarks

The Position control uses an exclusive standardized-title layer, not the broad functional family. C-suite aliases such as COO/Chief Operating Officer are consolidated, while levels remain separate (for example Vice President, Senior Vice President, and Executive Vice President). 15 default executive rows with genuinely combined or ambiguous titles are retained in the extraction but excluded from strict named-position samples so they cannot enter two benchmarks at once.

A position is `Primary` with at least 15 default rows across at least 12 organizations, `Exploratory` with at least 8 organizations, and hidden below 8 organizations. Only Primary positions are exposed in the public Position control. Sparse titles remain classified in `form990_benchmark_position_catalog.csv` for audit and future expansion rather than being pooled into misleading umbrella positions.

| Standardized position | Support | Default rows | Organizations | With Schedule J base |
|---|---|---:|---:|---:|
| Vice President | Primary | 101 | 40 | 95 |
| Program Director | Primary | 35 | 17 | 29 |
| Managing Director | Primary | 36 | 20 | 31 |
| COO | Primary | 28 | 28 | 25 |
| Senior Vice President | Primary | 28 | 17 | 28 |
| Development / Fundraising Director | Primary | 26 | 26 | 14 |
| Policy / Advocacy Director | Primary | 25 | 20 | 19 |
| Communications / Public Affairs Director | Primary | 24 | 23 | 13 |
| Senior Researcher / Fellow / Analyst | Primary | 22 | 15 | 18 |
| CFO | Primary | 22 | 22 | 20 |
| General Counsel / CLO | Primary | 17 | 17 | 12 |
| Chief of Staff | Primary | 15 | 15 | 13 |
| Research Director | Primary | 15 | 13 | 9 |
| Finance Director | Primary | 15 | 15 | 14 |
| Executive Vice President | Exploratory | 12 | 10 | 11 |
| Chief Development Officer | Exploratory | 9 | 9 | 5 |
| Chief People Officer | Exploratory | 8 | 8 | 8 |

## Retained non-public records

- `canonical_ceo`: **131** observations.
- `generic_ceo_like`: **24** observations.
- `governance`: **1,471** observations.
- `unmapped_position`: **170** observations.

Most frequent role-eligibility exclusions (reasons can overlap):

- no positive Part VII reportable compensation: **153**.
- source indicates or cannot rule out a transition during the compensation calendar year: **108**.
- program or affiliate scope: **9**.
- RP reference observation, never part of fitted peer distribution: **6**.
- role not held during compensation calendar year: **3**.

## Compensation semantics

- Part VII organization and related-organization amounts are reportable W-2/1099 compensation. Their sum is a cash/reportable-compensation proxy, not exact salary. Part VII other compensation is retained separately.
- Schedule J base is the only exact base-compensation field. A missing Schedule J row remains null; it is never converted to zero or inferred from Part VII.
- Schedule J is threshold-selected. Under the IRS instructions, it generally covers listed people whose Part VII reportable plus other compensation exceeds $150,000, as well as specified former people and other required cases. Part VII non-officer coverage is itself selective (key employees and generally the five highest-paid employees over $100,000). Non-CEO results therefore describe 990-reported people, not a complete employee salary census.
- Compensation is for the calendar year ending with or within the tax year. Nominal fields are preserved; July 2026 values use the same CPI-U convention as the CEO benchmark.
- Filing-organization and related-organization fields stay separate and are also provided as explicit totals.

Official interpretation references: [2024 Form 990 instructions](https://www.irs.gov/pub/irs-prior/i990--2024.pdf) and [Schedule J instructions](https://www.irs.gov/pub/irs-pdf/i990sj.pdf).

## Taxonomy and review model

The source-native Part VII person and title fields are never overwritten. Each observation receives a stable source+person ID, a reviewed effective person/title where an explicit source-internal spillover, Schedule J expansion, or organization-specific acronym has been validated, a primary public family when supported, secondary functional tags for combined roles, a title-level/seniority group, scope, filing-time incumbency, compensation-year role status, a transparent rule, and a confidence label. Effective-title source and rule fields remain alongside the raw fields. The taxonomy artifact groups identical classification outcomes so ambiguous and multi-function titles can be reviewed without losing row-level provenance.

All role-eligible and default-candidate rows were systematically audited after initial extraction, not only low-confidence or previously unmapped groups. This does not mean every row has an external biographical source: ordinary `rule_assigned` groups are classified from the source-native XML title, while `reviewed_observation_override` marks a documented row-level judgment. Combined functions normally use the first substantive function in the source title as primary, with the others retained as secondary tags. Narrow phrase rules and explicit observation-level reviews handle misleading abbreviations, truncated titles, organization-specific program names, and terms such as software development that would otherwise resemble fundraising. Generic vice-president, deputy, managing-director, director, president, and manager titles remain in General Leadership only when the source does not identify a supported function.

Official organization pages or publications are used for **26** non-obvious title expansions or organization-specific classifications. These include the Bulletin of the Atomic Scientists' expansion of John Pope's `Chief Aud. Officer` to `Chief Audience Officer`, plus reviewed program-versus-internal-function distinctions. Every supporting file is cached under `benchmark/sources/native/supporting/`, hash-pinned, and recorded in `benchmark/enrichment/form990_position_supporting_sources.csv`; the canonical third-party URL remains alongside the local copy.
Each externally supported observation exposes `classification_source_id`, `classification_source_url`, `classification_source_local_path`, and `classification_source_sha256` as machine-readable provenance; ordinary XML-only classifications leave these fields blank. The extractor fails if a supporting file is absent, its hash differs, or its manifest row does not resolve to exactly the intended observation. Andrea De Forest's source-native title is reviewed as Programs with Communications secondary, but no external page is attached because the available organization pages name Jennifer/Jen de Forest and identity is not reconciled.

Reviewed inclusion exceptions are also explicit. Both validated CEPR co-executives resolve to the authoritative CEO layer despite the filing's `Applebaum`/validated `Appelbaum` spelling difference. Third Way's `BOARD TREASURER` is governance because the filing reports 2 filing-organization hours, 38 related-organization hours, and compensation entirely from the related organization. Later departures do not erase a complete earlier compensation year, while roles beginning only after that year remain ineligible. Seven Center for Responsible Lending rows with 0 filing-organization and 40 related-organization hours but no identified related employer, IST's source-labeled `FRACTIONAL SVP`, and two Creative Commons related-employer rows are sensitivity-only rather than default comparators.

CEO-like titles that do not match the validated organization-wide CEO are excluded rather than guessed. This prevents program and affiliate executives—such as project CEOs or program Executive Directors—from silently entering the CEO or general-leadership distributions. Former, interim, partial-year, governance, unpaid, program/affiliate, and uncertain rows remain in the observation file with explicit exclusion reasons.

## Recommended app contract

- Join organization metadata once by `source_id`/EIN, but treat `observation_id` as the compensation-row key.
- Default Position to CEO using the existing validated CEO dataset; expose the **14** primary standardized non-CEO titles from `form990_benchmark_position_catalog.csv`, not the broader functional families. The catalog also retains **3** exploratory titles for audit and future sample growth.
- Keep Part VII cash, Part VII total, Schedule J base, and Schedule J total as separate compensation measures.
- When several people from one organization share a family, use organization-balanced weights (each organization's rows sum to one) as the default or expose person-balanced weighting as an explicit sensitivity. Do not silently let larger organizations dominate.
- RP rows are comparison markers only. Several RP families have more than one reported person, so display all applicable RP references or require a reviewed single-role choice; never include them in fit or quantile estimation.
- Label distributions as `Form 990-reported compensation` because reporting thresholds create material left truncation, especially outside officer roles.

## Artifacts

- `benchmark/enrichment/form990_benchmark_position_catalog.csv`: exclusive standardized-title catalog, support thresholds, and sample counts used by the Position control.
- `benchmark/enrichment/form990_position_observations.csv`: row-level, source-linked observations and all compensation fields.
- `benchmark/enrichment/form990_position_taxonomy.csv`: grouped title/classification review surface.
- `benchmark/enrichment/form990_position_supporting_sources.csv`: hashed provenance manifest for non-XML classification evidence.
- `scripts/extract_form990_positions.py`: deterministic extractor and validation gate.
