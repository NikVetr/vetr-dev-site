# Lingering organization additions: audit and recovery

## Decision

The handoff `tmp/rp_lingering_org_additions.zip` is useful as a research lead package, but it is **not safe to merge wholesale** into the benchmark or application. Its tables are mechanically consistent, yet its purported raw-source layer contains research summaries rather than the original documents, several entity and period fields are wrong, and none of its 34 candidates supplies a defensible new default CEO salary observation.

The review therefore keeps the app's peer cohort unchanged. It adds a reproducible audit, locally recovers seven source-native IRS filings, and preserves every officer row from those filings in a separate raw research layer. The only clean current non-CEO records newly recovered are Lead Exposure Elimination Project's COO and two co-executive directors. They are not silently promoted into the CEO sample.

Bundle reviewed:

- SHA-256: `959b1c1c59613880b7565503770a75a3b45a3d2a254d67162383b7b9e7d12f89`
- 91 ZIP members
- 34 candidates
- 47 entity-resolution rows
- 72 compensation rows
- 29 reported-position rows
- 46 scale rows
- 79 source-manifest rows
- 28 manual-save requests

## What validated successfully

- The ZIP is structurally intact.
- Every packaged manifest path exists, and every recorded byte length and SHA-256 matches its packaged artifact.
- Populated Part VII cash and total arithmetic reconciles.
- Populated disclosed-band lower and upper limits are ordered correctly.
- The package's candidate-level outcome accounting is internally coherent: no current positive point observation, one explicit-zero candidate result, six band-only results, two aggregate-only results, four transition-only results, three not-yet-filed results, four documented negative results, eleven unresolved-entity results, and three manual-save results.

Those checks establish internal consistency; they do not establish source validity.

## Why the package is not merge-ready

### Source layer

All 79 artifacts under `sources/raw/` are short `.txt` research summaries. None is the original XML, PDF, HTML, or signed account. Nevertheless, 70 manifest rows label these summaries `source_native=yes`, and all 79 omit `original_byte_length`. Twenty-eight original artifacts remain on the manual-save queue, while 19 cited links are navigation or search pages rather than direct documents.

Evidence locators are generally broad section names rather than exact XML paths or PDF page/table/row references. Several numeric claims are not present even in the associated text summary. ProPublica, registry landing pages, and search results are useful discovery aids, but are not substitutes for an available filing or signed account.

### Schema and classification layer

- The package returns `candidate_summary.csv`, not a controlled `candidate_dispositions.csv`; its dispositions are free prose.
- Its compensation table omits required entity, source, scale, and split Schedule J fields.
- EA relationship, topic, remote status, and structure are mostly free text and cannot safely populate the app's controlled filters or weights.
- None of the 34 candidates is already represented as an incumbent observation in the current app dataset. Adding them is a new peer-selection exercise, not a missing-value patch.

### Confirmed entity errors

- `E035` assigns Epoch's EIN `99-4050541` to former sponsor Rethink Priorities. RP's EIN is `84-3896318`.
- `E036` assigns GovAI's U.S. EIN to its U.K. subsidiary; the two entities must remain separate.
- `E038` assigns Global Change Data Lab's charity/company identifiers to the University of Oxford.
- `E042` assigns Players Philanthropy Fund's identifier to Fortification Foundation.
- `E045` duplicates Healthier Hens as a historical legal entity instead of recording a historical relationship.
- The GovAI U.S./U.K. boundary and two shared fiscal-sponsor relationships still lack stable entity keys.

### Confirmed scale errors

- `SC043` cites Social Change Lab source `S037` for Swift Centre; the intended Swift source is `S039`.
- `SC013/SC042`, `SC015/SC043`, and `SC023/SC045` are duplicates; `SC009/SC039` repeats Forethought's roster under different framing.
- Apollo's Form 990-EZ does not disclose Form 990 Part I line 5 employees. Staff must be null, not zero.
- CEEALAR omits £284,498 income, uses a non-ISO reporting period, and turns volunteer/non-high-pay language into zero employees. Staff remains null absent an express filing measure.
- Action for Happiness's 500 volunteers are not a filing-comparable staff count.
- Unlimit Health's reporting period is 2024-04-01 through 2025-03-31, not 2024-10-01 through 2025-09-30.
- High Impact Professionals' 1.6 FTE disclosure is supported by `S072`, not fiscal-sponsor source `S071`.
- Rounded grant/pass-through amounts must not be presented as exact operating expenses without the original accounts.

### Confirmed compensation errors

- `C009-C011` and `C013-C015` use compensation year 2024 for fiscal periods whose Part VII amounts are calendar-year 2023 compensation.
- `C039` treats analyst arithmetic from a salary model as a disclosed €8,146.25 band endpoint.
- `C047/C049` call Simon Institute remuneration an aggregate observation without preserving a numeric amount.
- `C037` has no amount, and `C038` is workforce payroll rather than individual compensation.
- The 29-row `all_reported_positions.csv` omits current and historical officer rows visible in the cited U.S. filings; it is not a complete basis for position benchmarking.

## Source-native U.S. recovery

Seven original IRS XML returns were recovered locally and independently checked for well-formedness, hash, EIN, reporting period, scale fields, officer components, and arithmetic. The IRS bulk archive/index is the canonical source; six XMLs were downloaded from the GivingTuesday 990 Data Lake mirror after their IRS object and archive identity were cross-checked against the official IRS index. The newer LEEP filing came directly from the official IRS bulk archive.

| Candidate | IRS object | Return | Period | Local result |
|---|---|---|---|---|
| Epoch | `202513219349201141` | 990-EZ | 2024-01-01–2024-12-31 | Four setup-year officer zeros; no current salary point |
| GovAI | `202543179349304359` | 990 | 2024-01-01–2024-12-31 | Five June-start rows; all transition/partial-year |
| Lead Exposure Elimination Project | `202631969349301838` | 990 | 2024-09-01–2025-08-31 | COO and two co-ED exact positive rows; three board zeros |
| Animal Advocacy Africa | `202522199349301567` | 990 | 2023-10-01–2024-09-30 | Three low-hour officer zeros; no paid top executive identified |
| Apollo Academic Surveys | `202620539349200207` | 990-EZ | 2025-01-01–2025-12-31 | Three officer zeros; staff remains null |
| Healthier Hens | `202511359349208821` | 990-EZ | 2024-01-01–2024-12-31 | Two small historical positive officer rows and one zero from the terminated entity |
| Probably Good | `202503089349302335` | 990 | 2024-01-01–2024-12-31 | Four pre-operations zeros; zero expenses and employees |

The extracted research layer contains 28 officer rows: five exact positives, eighteen explicit zeros, and five transition-only rows. Of the five positives, two are historical Healthier Hens officer amounts and three are current LEEP records. None is a new default CEO observation.

The LEEP filing corrects the stale handoff:

- Tomos Davies, COO: Part VII cash and total proxy `$109,850`.
- Clare Donaldson, Co-Executive Director: `$74,420`.
- Lucia Coulter, Co-Executive Director: `$66,200`.
- Form 990 Part I: one employee, `$3,643,151` revenue, and `$3,442,819` expenses.
- Compensation calendar year: 2024.

The co-leaders remain separate source rows. Their amounts are never summed, averaged, or annualized. Tomos is an observed-only COO record, not a CEO observation.

Machine-readable outputs:

- `benchmark/enrichment/lingering_org_recovered_us_positions.csv`
- `benchmark/enrichment/lingering_org_recovered_us_sources.csv`
- `scripts/audit_lingering_org_additions.py`

The locally cached XML files remain under `benchmark/sources/native/form990/` and are intentionally ignored by Git alongside the rest of the source archive. The tracked source manifest records their exact paths and hashes.

## Candidate treatment

| Candidate | Treatment after review |
|---|---|
| Epoch | Keep setup-year zeros as raw history; no current point |
| GovAI | Hold until U.S./U.K. employer and full-year director pay are resolved |
| Global Change Data Lab / Our World in Data | Preserve verified metadata and unnamed band only as censored context |
| Lead Exposure Elimination Project | Use the newer filing; retain COO/co-ED rows as observed-only |
| AIM / Charity Entrepreneurship | Preserve scale and transition context; no incumbent point |
| Sinergia Animal | Hold; payroll entity and named individual amount unresolved |
| Dansk Vegetarisk Forening | Preserve aggregate payroll/scale only |
| Albert Schweitzer Foundation | Salary policy is policy evidence, not realized individual pay |
| Forethought | Recruitment evidence only; monitor first accounts |
| Fortify Health | Hold unresolved entity and payroll boundaries |
| Future Cleantech Architects | Hold pending original German accounts |
| Opportunity Green | Preserve scale and unnamed band as censored context |
| Simon Institute | Hold compensation claim pending original report and numeric verification |
| Social Change Lab | Metadata/documented negative only after accounts are archived |
| Swift Centre | Metadata/documented negative after source correction |
| Teaching at the Right Level Africa | Hold pending Kenyan entity, accounts, and employer resolution |
| Unlimit Health | Preserve corrected scale and unnamed band; separate pass-through grants |
| Action for Happiness | Preserve scale/band; do not treat volunteers as staff |
| Animal Advocacy Africa | Preserve historical officer zeros; no current ED point |
| Animal Empathy Philippines | Hold pending SEC records |
| Animal Welfare Observatory | Identity and negative-search metadata only |
| Apollo Academic Surveys | Preserve explicit current zeros; staff null; no positive salary point |
| ALTER | Hold pending Israeli reports and employer resolution |
| Center for Reducing Suffering | Hold unresolved entity and payroll boundary |
| Center for Space Governance | Hold unresolved legal entity and employer |
| CEEALAR | Preserve corrected scale/negative metadata; staff null |
| Consultants for Impact | Hold unresolved fiscal-host payroll attribution |
| Effective Altruism Coaching | Hold unresolved current entity/status |
| Healthier Hens | Preserve terminated-entity officer payments as non-usable raw history |
| High Impact Professionals | Preserve 1.6 FTE as narrative project scale only |
| Humane Slaughter Association | Preserve scale and unnamed band as censored context |
| OPIS | Hold pending entity, accounts, role, and employer resolution |
| Probably Good | Preserve pre-operations zeros as raw history |
| SoGive | Hold until operating entity is reconciled with dormant accounts |

## Non-CEO position coverage

The existing position extraction was also re-audited. It is broad at the source level—2,785 Part VII rows and 814 Schedule J rows across 136 cached peer filings—but the app intentionally exposes only distinct, reviewed position titles. The apparent COO/CFO scarcity is principally a disclosure limitation: Form 990 is not an employee census, and Schedule J is not an independent roster. Among the 135 peer filings, 85 have no default Operations-family row and 84 have no default Finance-family row.

Missing positions remain null. They must never be inferred from payroll, another officer, a title-free Schedule J amount, or a non-disclosing filing.

A focused follow-up review identified safe classification recoveries where the filing itself contains a fuller title in Schedule J or spills title text into the person-name field. Those changes are handled in the main Form 990 position pipeline with regression tests. Multi-function titles such as `COO & Managing Director`, `COO, Chief of Staff & Secretary`, and `Chief Operating Officer, Chief Legal Officer` remain distinct from the strict COO default rather than being silently relabeled.

## Reproducibility

Run:

```sh
python3 scripts/audit_lingering_org_additions.py
```

The script fails if the handoff ZIP changes, any packaged or recovered source hash changes, any expected table count changes, a recovered EIN differs, or compensation arithmetic does not reconcile. Reproduction requires the retained local handoff ZIP plus the locally archived XML and metadata files listed in the tracked source manifest; those source archives are intentionally outside Git.
