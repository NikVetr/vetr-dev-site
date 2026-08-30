# Lingering organization additions: audit and recovery

## Decision

The handoff `tmp/rp_lingering_org_additions.zip` is useful as a research lead package, but it is **not safe to merge wholesale** into the benchmark or application. Its tables are mechanically consistent, yet its purported raw-source layer contains research summaries rather than the original documents, several entity and period fields are wrong, and none of its 34 candidates supplies a defensible new default CEO salary observation.

The replacement bundle is a genuine second pass, not a duplicate of the earlier handoff. It adds entity and scale corrections plus historical Apollo and Empower Learning Africa USA filing leads. Those additions do not repair the evidence layer: every packaged artifact remains a researcher-written text summary, and the revised tables retain material entity, period, scale, citation, and completeness errors.

The review therefore keeps the app's peer cohort unchanged. It adds a reproducible audit, locally recovers ten source-native IRS filings, and preserves every officer row from those filings in a separate raw research layer. The only clean current non-CEO records newly recovered are Lead Exposure Elimination Project's COO and two co-executive directors. They are not silently promoted into the CEO sample.

Bundle reviewed:

- SHA-256: `413e38c1ae305bc784a329b6c37a9c2675b377bd8ac4d2cb5c9c3bf37ede2844`
- 184 ZIP members: 121 files and 63 directory entries
- 34 candidates
- 49 entity-resolution rows
- 84 compensation rows
- 39 reported-position rows
- 50 scale rows
- 109 source-manifest rows, representing 89 distinct URLs
- 33 manual-save requests

Relative to the prior reviewed package, 80 files are byte-identical, 11 changed, 30 source-summary files were added, and no file was removed.

## What validated successfully

- The ZIP is structurally intact.
- Every packaged manifest path exists, and every recorded byte length and SHA-256 matches its packaged artifact.
- Populated Part VII cash and total arithmetic reconciles.
- Populated disclosed-band lower and upper limits are ordered correctly.
- The package's candidate-level outcome accounting is internally coherent: no current positive point observation, one explicit-zero candidate result, six band-only results, two aggregate-only results, four transition-only results, three not-yet-filed results, four documented negative results, ten unresolved-entity results, and four manual-save results.

Those checks establish internal consistency; they do not establish source validity.

## Useful second-pass changes

- Apollo's staff field is now null rather than incorrectly treating Form 990-EZ non-disclosure as zero, and its historical 2023 president amount is surfaced separately from the current zero.
- SoGive's company number is corrected to `09966206`; Sinergia Animal's Austrian association boundary and Swift Centre's two-company boundary are described more accurately.
- CEEALAR's candidate summary now carries the £284,498 income and 2024-10-31 year end; Simon's CHF 246,415.40 key-management amount and Unlimit Health's £604,485 aggregate are preserved as aggregates rather than individual pay.
- Empower Learning Africa USA is recognized as a separate affiliate rather than using its officer compensation as TaRL Africa executive pay.

These are useful entity-resolution and research-queue improvements. They are not compensation observations ready for the app, because the original evidence is not packaged and several corrections were not propagated consistently across tables.

## Why the package is not merge-ready

### Source layer

All 109 manifest-referenced source artifacts under `sources/raw/` are short `.txt` research summaries. None is the original XML, PDF, HTML, or signed account. Nevertheless, 90 manifest rows label these summaries `source_native=yes`, and all 109 omit `original_byte_length`. Thirty-three original artifacts remain on the manual-save queue. The 109 manifest rows collapse to 89 distinct URLs, and several multi-year filing claims are consolidated behind organization navigation pages rather than one object and artifact per return.

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
- CEEALAR's corrected £284,498 income and 2024-10-31 period end appear only in the candidate summary, not its scale table; ALTER's corrected ILS 474,078 turnover has the same propagation failure.

### Confirmed compensation errors

- `C009-C011` and `C013-C015` use compensation year 2024 for fiscal periods whose Part VII amounts are calendar-year 2023 compensation.
- `C039` treats analyst arithmetic from a salary model as a disclosed €8,146.25 band endpoint.
- `C047/C049` call Simon Institute remuneration an aggregate observation without preserving a numeric amount.
- The second pass adds Simon's CHF 246,415.40 aggregate, which must remain unsplit, but assigns the wrong 2025 leadership periods to Maxime Stauffer and Konrad Seifert.
- `C037` has no amount, and `C038` is workforce payroll rather than individual compensation.
- Forethought's recruitment ranges cite its `/about` page rather than the actual job posting and remain unsupported until that posting is archived.
- AIM's reported £507,617 aggregate key-management employee-benefits amount is omitted from the compensation table and must not be imputed to Samantha Kagel.
- The 39-row `all_reported_positions.csv` omits current and historical officer rows visible in the cited U.S. filings; it is not a complete basis for position benchmarking.
- The validation narrative misspells Moritz Stumpe, and source `S110` misidentifies Probably Good's Itamar Shatz. These researcher-summary errors reinforce that the bundle is a lead layer, not auditable source evidence.

The negative-search log is also uneven. Several entries say only that unspecified jurisdictional searches or accounts were checked, and one says accounts were inspected while the corresponding source record says no accounts were found. Such rows do not prove a negative conclusion to the required registry/page/year standard.

## Source-native U.S. recovery

Ten original IRS XML returns were recovered locally and independently checked for well-formedness, hash, EIN, reporting period, scale fields, officer components, and arithmetic. The IRS bulk archive/index is the canonical source. Seven were recovered in the first pass; the second pass adds Apollo's 2023 return and Empower Learning Africa USA's 2023 and 2024 returns directly from the official bulk archives.

| Candidate | IRS object | Return | Period | Local result |
|---|---|---|---|---|
| Epoch | `202513219349201141` | 990-EZ | 2024-01-01–2024-12-31 | Four setup-year officer zeros; no current salary point |
| GovAI | `202543179349304359` | 990 | 2024-01-01–2024-12-31 | Five June-start rows; all transition/partial-year |
| Lead Exposure Elimination Project | `202631969349301838` | 990 | 2024-09-01–2025-08-31 | COO and two co-ED exact positive rows; three board zeros |
| Animal Advocacy Africa | `202522199349301567` | 990 | 2023-10-01–2024-09-30 | Three low-hour officer zeros; no paid top executive identified |
| Apollo Academic Surveys | `202620539349200207` | 990-EZ | 2025-01-01–2025-12-31 | Three officer zeros; staff remains null |
| Apollo Academic Surveys | `202430789349200603` | 990-EZ | 2023-01-01–2023-12-31 | Historical president amount $2,554 and two officer zeros; not current |
| Empower Learning Africa USA | `202501199349301740` | 990 | 2024-01-01–2024-12-31 | Affiliate president $46,035 and two officer zeros; not TaRL Africa executive pay |
| Empower Learning Africa USA | `202410939349200436` | 990-EZ | 2023-01-01–2023-12-31 | Three setup-year officer zeros; not TaRL Africa executive pay |
| Healthier Hens | `202511359349208821` | 990-EZ | 2024-01-01–2024-12-31 | Two small historical positive officer rows and one zero from the terminated entity |
| Probably Good | `202503089349302335` | 990 | 2024-01-01–2024-12-31 | Four pre-operations zeros; zero expenses and employees |

ProPublica's filing navigator independently displays Empower Learning Africa USA's 2025 David Sears amount of $46,427, but the corresponding original XML was not present in the currently published IRS bulk archive identified by the index. It remains a documented retrieval gap and, in any event, is affiliate-officer evidence rather than compensation for Titus Syengo or TaRL Africa's organization-wide executive.

The extracted research layer contains 37 officer rows: seven exact positives, 25 explicit zeros, and five transition-only rows. The additional positives are Apollo's historical $2,554 president amount and Empower Learning Africa USA president David Sears's $46,035 affiliate amount. Neither is a current candidate-executive observation. None of the 37 rows is a new default CEO or non-CEO app observation.

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
| Simon Institute | Preserve CHF 246,415.40 only as unsplit aggregate remuneration; correct leadership periods and archive the original report before use |
| Social Change Lab | Metadata/documented negative only after accounts are archived |
| Swift Centre | Metadata/documented negative after source correction |
| Teaching at the Right Level Africa | Preserve the U.S.-affiliate filings only for entity-boundary audit; hold pending Kenyan entity, accounts, and employer resolution |
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

The script fails if the handoff ZIP changes, any packaged or recovered source hash changes, any expected table count changes, a recovered EIN differs, or compensation arithmetic does not reconcile. It also reports that the 109 package manifest rows represent only 89 URLs and zero source-native artifacts. Reproduction requires the retained local handoff ZIP plus the locally archived XML and metadata files listed in the tracked source manifest; those source archives are intentionally outside Git.
