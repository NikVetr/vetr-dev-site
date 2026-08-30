# Independent final audit of the Form 990 position layer

Audit date: 2026-08-29 (America/Los_Angeles)

## Verdict

**PASS, with documented sensitivity boundaries.** The generated position observations, grouped taxonomy, compensation-year eligibility, strict standardized-title membership, compensation arithmetic, and supporting-source provenance reconcile. The remaining related-employer ambiguity at Creative Commons is excluded from the default sample and retained for sensitivity analysis.

The audit is independently reproducible with:

```sh
python3 scripts/audit_form990_position_outputs.py
```

The validator reads generated artifacts and preserved sources but does not import or invoke the extractor.

## Scope and cardinality

| Check | Observed | Result |
|---|---:|---|
| Stable observations | 2,785 unique observation IDs | Pass |
| Taxonomy groups | 884 unique taxonomy IDs | Pass |
| Catalog-eligible observations | 989 | Pass |
| Role-eligible observations | 778 | Pass |
| Default-included peer observations | 755 | Pass |
| Supporting classification sources | 26 unique source and observation IDs | Pass |
| Source Form 990 filings | 136 unique, well-formed, hash-matching XML files | Pass |
| Public primary positions | 14 non-CEO titles | Pass |

The 778 role-eligible observations comprise 774 peer rows and four display-only RP references. The peer rows comprise 755 default observations and 19 sensitivity-only observations:

- nine rows below the 30-hour default threshold, including five 0.5-hour source-anomaly rows;
- seven Center for Responsible Lending rows with 40 related-organization hours but no identified related employer;
- one source-labeled fractional Institute for Security and Technology role; and
- two Creative Commons rows paid entirely through a controlled related entity whose employer/scale boundary is not reconciled to the filing organization.

Every default row is a positive, paid, role-matched observation with either no source-indicated transition during the compensation calendar year or separately verified full-year coverage, at least 30 combined filing-plus-related weekly hours, reviewed functional scope, no sensitivity-only flag, and `is_rp_reference = no`. The ordinary `no_transition_indicated` status is an absence-of-transition screen, not independent proof of full-year tenure.

## Compensation-year versus filing-time status

Part VII compensation is calendar-year compensation, while a filing title can mention a later promotion or departure in the following fiscal period. The extraction now preserves both:

- `incumbency_status`, which describes the filing-time title/status text; and
- `compensation_year_role_status`, which determines whether the named role covered the compensation calendar year.

Five later departures that previously erased complete earlier-year observations are now correctly retained: Manizha Nabieva, William Lutz, Janay Richmond, James Phelan, and Claudia Shilumani. Andrea Joy Kroboth and Celeste Brubaker are likewise retained for complete 2024 role years despite departing in 2025. Roles beginning only after the compensation year—Kena Mayberry, Immanuel Wolff, and Winnie Auma's COO appointment—remain ineligible for that position-year.

Month-only December endings remain conservatively excluded unless exact source evidence establishes complete calendar-year coverage.

## Corrected strict-position semantics

The independent review added fail-closed regression checks for the following boundaries:

- RP's Carolyn Footitt record remains filing-current but is a 2024 compensation-year transition/uncertainty record, not a clean COO reference. The reported extraction remains exact: $79,898 Part VII cash and $56,248 estimated other compensation, with no Schedule J row. RP's official 2025 report places the permanent COO appointment in 2025.
- Clean Air Task Force's Schedule J title `TREAS/COO(THRU SEPT)` is recognized as partial and excluded.
- Andrea Joy Kroboth's truncated `CHIEF OPERATING OFF (THRU 2/7/25)` is expanded to Chief Operating Officer and included for the complete 2024 compensation year.
- Deputy Vice Presidents are not pooled with ordinary Vice Presidents. Only bare organization-wide Deputy Director titles enter the strict Deputy Director benchmark; functional deputies remain in their functional family or unstandardized.
- Policy Director / General Counsel hybrids do not enter either strict single-title benchmark.
- `Chief Technical Officer` is not treated as Chief Technology Officer. Last Mile Health's official profile places Divya Nair in health-systems strengthening and monitoring/evaluation/research/learning.
- Results for America's `CIO` is source-verified as Chief Impact Officer, not Chief Information Officer.
- A board `Director` token is not combined with Bradley Kuhn's compensated staff title; his effective staff title is Policy Fellow.
- General Counsel, VP/SVP/EVP, Managing Director, Program Director, and reviewed truncation aliases receive consistent title-level metadata.
- Reviewed person/title spillovers now correctly reconstruct Adam Shifriss, Simone Frank, James Parsons, and Vina Morris while retaining the raw Part VII fields.

Selected strict default counts after correction include COO 28 rows/28 organizations, Vice President 101/40, Policy Director 25/20, Deputy Director 6/6, and Program Director 35/17. Hidden sparse titles remain auditable but are not exposed in the public selector.

## Taxonomy and provenance

| Review status | Groups |
|---|---:|
| `rule_assigned` | 555 |
| `rule_assigned_multi_role` | 70 |
| `reviewed_observation_override` | 137 |
| `manual_review_required` | 122 |

All 884 taxonomy groups reconcile to their underlying observations for record counts, primary family, secondary tags, title/seniority level, scope, incumbency, classification rule, benchmark position, hybrid status, and confidence. No low-confidence row is role-eligible.

Each of the 26 supporting-source records has a unique source ID and target observation, an official canonical URL, an existing local artifact, a matching SHA-256, and matching provenance fields on the target observation. The added source-backed disambiguations include RP's COO transition, Bradley Kuhn's board/staff split, Divya Nair's Chief Technical Officer remit, Lisa Morrison Butler's Chief Impact Officer expansion, and the CRFB and Vera person/title splits.

## Compensation and source integrity

- All 136 referenced XML filings are well formed and match their recorded SHA-256 values.
- EIN, IRS object ID, and tax-period boundaries agree with the acquisition manifest.
- There are 814 exact Schedule J matches and 813 rows with positive Schedule J base compensation.
- Filing-organization and related-organization Schedule J totals equal the sum of base, bonus, other reportable, deferred, and nontaxable components for every matched row.
- Part VII cash equals Schedule J base plus bonus plus other reportable compensation in 811 of 814 rows. The three differences are source-native and preserved: $10 for Bradley Townsend, $1 for Alexander Main, and $602 for Conor McGurk.

## Interpretation and residual caveats

- Part VII filing-plus-related compensation is reportable W-2/1099 cash compensation, not exact base salary. Exact base is available only where Schedule J reports it. The application therefore labels the default non-CEO measure as **reportable compensation**.
- Part VII is threshold-selected and is not a workforce salary census.
- Multiple rows from one organization are not independent; organization-balanced weighting is the default for non-CEO position views.
- Creative Commons' Erika Drushka and Monica Granados remain role-eligible but sensitivity-only because all cash is attributed to a controlled related entity and the employer/scale pairing is unresolved.
- Animal Equality's Jose Antonio Valle Blanco is a paid 40-hour VP and Secretary who is also a director/trustee. Retaining him is source-valid; excluding corporate/governance hybrids would be a separate estimand choice.
- Abraham Rowe's 2023 RP COO compensation is a clean historical observation, but it should appear only if explicitly labeled historical rather than as the current RP reference.
- In `benchmark/deliverables/source_acquisition_manifest.csv`, legacy `validation_failed` statuses on otherwise hash-valid position XML files remain unsuitable as a source-availability signal and should not drive UI claims.

## Conclusion

The position layer is suitable for application use under the documented Form 990 limitations. The current **778 role-eligible**, **755 default-included**, **14 primary-position**, and **26 supporting-source** boundaries all pass independent validation. Raw source fields remain unchanged, reviewed effective fields are explicit and fail-closed, and unresolved employer boundaries are retained outside the default distribution rather than guessed.
