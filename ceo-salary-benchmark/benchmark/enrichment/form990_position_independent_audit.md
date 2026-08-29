# Independent final audit of the Form 990 position layer

Audit date: 2026-08-28 (America/Los_Angeles)

## Verdict

**PASS, with one non-blocking manifest-status caveat.** The regenerated position observations, grouped taxonomy, sample boundaries, compensation arithmetic, and 16 externally supported classifications reconcile. No previously identified classification or inclusion blocker remains in the public position layer.

This was an independent, read-only audit of the generated artifacts. The extractor, application builder, and generated data were not changed as part of this review.

## Scope

The audit covered:

- `benchmark/enrichment/form990_position_observations.csv`
- `benchmark/enrichment/form990_position_taxonomy.csv`
- `benchmark/enrichment/form990_position_supporting_sources.csv`
- the 136 source Form 990 XML files referenced by the observation rows
- the 16 hash-pinned classification sources referenced by the supporting-source manifest

The existing validated CEO dataset remains a separate authoritative layer and was checked only at the boundary: CEO and CEO-like rows must not enter the non-CEO catalog.

## Cardinality and reconciliation

| Check | Expected | Observed | Result |
|---|---:|---:|---|
| Stable observations | 2,785 | 2,785 unique observation IDs | Pass |
| Taxonomy groups | 885 | 885 unique taxonomy IDs | Pass |
| Catalog-eligible observations | 986 | 986 | Pass |
| Role-eligible observations | 769 | 769 | Pass |
| Default-included peer observations | 748 | 748 | Pass |
| Supporting-source records | 16 | 16 unique source IDs and observation IDs | Pass |
| Source Form 990 filings | 136 | 136 unique, well-formed, hash-matching XML files | Pass |

All 885 taxonomy groups reconcile exactly to their underlying observations: record count, compensated-record count, organization count, normalized title, record type, primary family, secondary tags, seniority, scope, incumbency, rule, and confidence all agree. The position-family totals in the methodology table also reproduce exactly from the observation CSV.

## Eligibility and default-sample boundary

The 769 role-eligible observations decompose into **764 peers plus five RP display references**. The 764 peer observations decompose into **748 default observations plus 16 sensitivity-only observations**:

- nine rows below the 30-hour default threshold, including the five Center for Public Integrity 0.5-hour source-anomaly rows;
- six Center for Responsible Lending rows reporting zero filing-organization hours and 40 related-organization hours without an identified related employer; and
- one Institute for Security and Technology row whose source title explicitly says `FRACTIONAL SVP`.

Every default row is a non-CEO public-family observation with positive Part VII reportable cash, a reviewed role-eligible classification, at least 30 combined filing-plus-related weekly hours, no sensitivity-only flag, and `is_rp_reference = no`. No RP marker, low-hours row, source-labeled fractional row, governance row, program/affiliate row, uncertain row, or nonpositive-compensation row enters the default sample.

## Taxonomy review status

| Review status | Groups | Public-boundary result |
|---|---:|---|
| `rule_assigned` | 565 | Eligible only when all row-level conditions pass |
| `rule_assigned_multi_role` | 75 | Secondary functions retained explicitly |
| `reviewed_observation_override` | 120 | Review rule retained in each affected observation |
| `manual_review_required` | 125 | All are non-catalog and non-role-eligible |

The 125 manual-review groups consist of 106 unmapped-position groups and 19 generic CEO-like groups. None is exposed in the public Position catalog. No low-confidence observation is catalog-eligible, and no role-eligible row has low classification confidence.

## External classification provenance

Each of the 16 supporting-source rows has:

- a unique source ID and unique target observation;
- an existing local source whose SHA-256 equals the manifest hash;
- an official canonical URL and an allowed validation status;
- exact source ID, URL, local path, and hash fields on the target observation; and
- a taxonomy group marked `reviewed_observation_override` with the source and claim in its notes.

The 14 HTML snapshots contain the cited person, title, and duty evidence. Text extracted from both PDFs contains the cited title/function evidence. The official URLs were independently checked as retrievable during the source audit; no user-saved replacement is presently required.

| Observation | Primary family | Secondary tags | Independent result |
|---|---|---|---|
| John Pope, Bulletin of the Atomic Scientists | Communications | — | Annual report expands `Chief Aud. Officer` to Chief Audience Officer | Pass |
| Kimberly Serrano, American Immigration Council | Programs | Communications; Research | Center role is outward-facing program, messaging, and research work | Pass |
| Sage Sharp, Software Freedom Conservancy | Programs | People | Outreachy program role is primary; People is a title-derived secondary, not an internal-HR finding | Pass |
| Verena Radulovic, C2ES | Programs | Policy | Business-climate council and policy portfolio | Pass |
| Caroline Bushnell, Good Food Institute | Programs | — | Corporate-engagement program with companies and investors | Pass |
| Elizabeth Vish, Institute for Security and Technology | Policy | Programs | Cyber foreign-policy and capacity-building portfolio | Pass |
| Claire Leibowicz, Partnership on AI | Programs | Policy; Research | AI and Media Integrity framework and multistakeholder program | Pass |
| Olivier Defawe, VillageReach | Programs | — | Outsourced-drone program and technical-assistance role | Pass |
| Karen Nilsen, The Humane League | Communications | Programs; Strategy | PR, studios, organizing, and digital-engagement remit | Pass |
| Erica Goldman, Federation of American Scientists | Policy | Research | Science-policy leadership | Pass |
| Dina Smeltz, Chicago Council on Global Affairs | Research | Policy | Public-opinion survey research and foreign-policy remit | Pass |
| Rachel Jean-Baptiste, Environmental Law Institute | Communications | Programs | Publications primary; Education retained from the native title | Pass |
| Grace Hollister, Evidence Action | Communications | Development | Global communications, fundraising, and donor relations | Pass |
| Eddie Martin Jr., CLASP | People | Strategy; Policy | Organization-wide racial-equity strategy, planning, and policy | Pass |
| Erik Cothron, Nuclear Innovation Alliance | Research | Strategy | Official profile resolves the filing typo and confirms research/analysis work | Pass |
| Matt Scott, Project Drawdown | Communications | Programs | Official profile expands `ENGAGEMENT D` to Director of Storytelling and Engagement | Pass |

Andrea De Forest remains Programs with Communications secondary based on the source-native title. No external source is attached, correctly preserving the unresolved boundary: the available CEP pages name Jennifer/Jen de Forest rather than Andrea De Forest.

## Regression checks for earlier blockers

| Earlier issue | Regenerated result | Status |
|---|---|---|
| A misspelled MuckRock `Cheif Executive Officer` could leak into a functional family | Classified `generic_ceo_like`; non-catalog and non-eligible | Pass |
| CEO and project/affiliate executive titles could contaminate non-CEO distributions | Canonical and generic CEO-like rows remain outside the catalog; scoped program/affiliate executives remain excluded | Pass |
| Third Way's paid `BOARD TREASURER` could be mistaken for Finance | Governance; 2 filing hours + 38 related hours; all cash from related organization; excluded | Pass |
| Hours threshold could ignore related-organization hours | Default threshold uses the combined filing-plus-related total | Pass |
| CRL related-organization rows could enter the default sample | Six rows retained only for explicit sensitivity analysis | Pass |
| IST's fractional executive could enter the default sample | Role eligible for sensitivity, explicitly fractional, default excluded | Pass |
| Truncated or misleading titles could fall into the wrong family | Reviewed corrections for audience, engagement, software development, energy finance, people operations, general counsel, strategy/impact, and named program roles are present | Pass |
| Generic leadership could absorb functionally identifiable rows | Reviewed functional rows are reassigned while genuinely generic titles remain General Leadership | Pass |
| External classifications could lack reproducible provenance | Sixteen official sources are cached, hash-pinned, joined, and described | Pass |

Spot checks of previously problematic semantics also reproduce as intended:

- `DIRECTOR OF PEOPLE OPERATIONS` → People, with Operations secondary;
- `GEN. COUNSEL, SECRETARY, TREASURER` → Legal, with Finance secondary;
- `HEAD OF SOFTWARE DEVELOPMENT` → Technology;
- energy-finance analyst/advisor titles → Research, retaining Finance and Strategy where applicable; and
- `CHIEF STRATEGY AND IMPACT OFFICER` → Strategy, with Programs secondary.

## Compensation and native-source integrity

- All 136 referenced XML files are well-formed and their SHA-256 values match both the observation rows and acquisition-manifest hashes.
- EIN, IRS object ID, and tax-period boundaries agree with the acquisition manifest for all 136 sources.
- There are 814 exact Schedule J matches and 813 rows with positive Schedule J base compensation.
- Filing-organization and related-organization Schedule J totals equal the sum of base, bonus, other reportable, deferred, and nontaxable components in every matched row.
- Part VII cash equals Schedule J base plus bonus plus other reportable compensation in 811 of 814 rows. The only differences are source-native and disclosed: Schedule J reportable compensation exceeds Part VII cash by $10 for Bradley Townsend, $1 for Alexander Main, and $602 for Conor McGurk.

## Residual limitations and caveat

These are not audit failures, but they remain important for interpretation:

- Form 990 Part VII is a threshold-selected list, not an employee census. Part VII cash is reportable W-2/1099 compensation, not exact base salary; Schedule J base is exact but selectively reported.
- Multiple observations from one organization are not independent. The application should retain organization-balanced weighting as its default.
- Several official role pages are later than the filing period. They support role interpretation, not a claim that the later title was contemporaneous in every detail.
- The Sage Sharp People secondary tag is defensible as a secondary title function, but must not be described as evidence that the role was primarily internal HR; the source supports Programs primary.
- In `benchmark/deliverables/source_acquisition_manifest.csv`, 121 of the 136 position-source rows currently carry `current_status = validation_failed` even though their local hashes, metadata, and XML validity independently pass. That status field is therefore not a reliable source-availability signal for this position layer and should be reconciled before it is used in UI or release-status claims. It does not indicate missing or corrupt position XML in the audited artifacts.

## Conclusion

The regenerated position layer is suitable for application integration under the documented Form 990 limitations. The expected **769 role-eligible**, **748 default-included**, and **16 supporting-source** boundaries all pass, all previously identified inclusion and classification blockers are closed, and the unresolved Andrea/Jennifer De Forest identity is correctly left unlinked rather than guessed.
