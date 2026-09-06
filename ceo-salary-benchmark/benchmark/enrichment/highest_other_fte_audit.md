# Highest-other-pay 40-hour-equivalent audit

Reviewed 2026-09-06 against the current `app-data.js`,
`form990_position_observations.csv`, and their locally preserved source XML.
The application implements the combined-hours convention in
`scripts/other_employee_pay.py`; the reported source observations remain available
alongside the standardized predictor.

## Source checks and retained reported-pay comparison

The retained `highestPaidOtherEmployee` attachment ranks reported amounts
under the legacy 30-hour eligibility screen. `highestPaidOtherEmployee40h`
ranks after standardization and allows otherwise eligible part-time roles.
`prepare_model_data.py` consumes the latter attachment’s CPI-adjusted base as
`highest_other_base`; the former feeds the reported-pay sensitivity.

Form 990 Part VII reports average weekly hours devoted to the filing
organization and separately lists weekly hours for related organizations.
[The official 2024 form](https://www.irs.gov/pub/irs-tege/2024form990withfieldnames.pdf)
and [its instructions](https://www.irs.gov/pub/irs-prior/i990--2024.pdf)
describe those two fields, but neither creates an FTE conversion rule.
Schedule J reports filing- and related-organization compensation in separate
rows, and defines base compensation as agreed, nondiscretionary pay for
services ([IRS Schedule J instructions](https://www.irs.gov/instructions/i990sj)).

The payer fields cannot safely allocate salary to hours. The IRS says that
compensation paid by a common paymaster, payroll/reporting agent, or some
unrelated payers can be reported as compensation from the filing organization
when the Part VII threshold is met ([Form 990 instructions](https://www.irs.gov/instructions/i990)).
Thus, zero related-organization compensation does **not** establish that the
related hours were unpaid or outside the salaried job.

### Living Goods check

For Sonja Kotze, the native filing reports 32 filing-organization hours, 8
related-organization hours, $160,574 Part VII filing compensation, zero Part
VII related compensation, and the same Schedule J base allocation. These are
verified source facts at Part VII group 4 and Schedule J group 4 in
`benchmark/sources/native/form990/202433199349307518_public.xml`. Schedule O
also says the global CEO and global CFO are compensated by a related Kenyan
entity, but it does not name the person and therefore cannot conclusively be
assigned to Kotze. It reinforces that payroll payer and service allocation are
not inferable from the numeric fields alone.

A denominator containing only hours assigned to the paying entity would
treat Kotze as a 32-hour employee and inflate $160,574 to $200,717.50 despite
the filing reporting 40 combined hours. The available filing does not justify
that inference.

## Implemented modeling convention

For a 40-hour-equivalent *base* predictor, retain the existing full-year,
functional/organization-wide, and non-former safeguards; exclude the known
Center for Public Integrity 0.5-hour filing anomaly pending resolution. Drop
the legacy 30-hour screen for otherwise clean, positive-base records. For each
remaining candidate, before ranking, calculate:

`base_40h = Schedule J base total × 40 / (Part VII filing hours + related-organization hours)`.

Then rank candidates by `base_40h`, excluding the target CEO exactly as the
current loader does, and apply the existing CPI adjustment. This is a
transparent **modeling convention** for total disclosed salary and total
reported work effort; it is not an IRS-prescribed conversion. It treats a
40-hour role split across affiliates consistently whether payroll is centralized
or allocated. Do not cap values at 40 hours: documented 45- or 50-hour roles
scale down and 20- to 30-hour roles scale up.

Keep records with positive related hours and zero related base in the default
combined-hours calculation, but disclose an entity-allocation caveat and reserve
a payer-hours alternative for an employer-specific allocation review.

## Results under the implemented convention

- Audited **895** positive, non-canonical-CEO Part VII records. All matched
  their Part VII XML locator: 692 also matched their Schedule J locator and
  base amount; the remaining 203 correctly had no Schedule J row.
- The legacy 30-hour base gate has **612** candidates. The FTE rule adds two
  clean full-year Institute on Taxation and Economic Policy records: Michael
  Ettlinger (26.3 hours) and Nicholas Johnson (29.6). Its FTE pool is therefore
  **614** records. Kristin Berdan's 20-hour Internet Security Research Group
  row remains unavailable for this *base* predictor because it has no Schedule
  J base amount, independently of hours.
- The three Center for Public Integrity 0.5-hour Schedule J-base rows remain
  excluded as explicit unresolved filing anomalies.
- All **98** current `base` attachments match the raw loader's selected
  person. Re-ranking after combined-hours standardization changes **four**:

| Organization | Raw current highest other | Raw base / combined hours | 40-hour equivalent | New highest other | New equivalent |
| --- | --- | ---: | ---: | --- | ---: |
| Institute on Taxation and Economic Policy | Jon Whiten | $163,593 / 35 | $186,963.43 | Michael Ettlinger | $241,800.76 |
| National Employment Law Project | Heather McGrew | $250,000 / 36 | $277,777.78 | Catherine Ruckelshaus | $282,971.43 |
| Global Health Corps | John Cape | $128,918 / 50 | $103,134.40 | Brittany Cesarini | $121,942.00 |
| Vera Institute of Justice | Insha Rahman | $331,613 / 49 | $270,704.49 | Edward Kwang Yoon Chung | $328,250.00 |

ORCID is a clean example: Thomas Tepper Jr. has $98,827 Schedule J base at 30
combined hours and remains the highest other employee. The 40-hour equivalent
is **$131,769.33 nominal** before the existing CPI adjustment. This is not a
partial-year or former-role record.

## Role-scope check for the four new highest-other selections

No source contradiction was found. Each native Part VII row is a functional
role, has `no_transition_indicated`, is not marked former, and names a separate
organization head in the same compensation-year filing.

| Person | Filing evidence | Independent continuity evidence | Result |
| --- | --- | --- | --- |
| Michael Ettlinger, ITEP | 2025: Senior Fellow, 26.3 hours; Amy Hanauer is separately Executive Director. `202611559349300546_public.xml`, Part VII group 21 / Schedule J group 3. | [ITEP’s 2023 staff entry](https://itep.org/team/cross-cutting-research/) identifies him as Senior Fellow; [ITEP’s 2024 *Who Pays?* report](https://media.itep.org/ITEP-Who-Pays-7th-edition.pdf?eId=0b6a1886-421d-4c94-8efe-6aadce1ca123&eType=EmailBlastContent) lists him as Senior Fellow alongside Hanauer as Executive Director; ITEP published his work in 2025. | Retain. The low weekly hours establish a fractional work schedule, not a partial-year tenure. No CEO/co-CEO evidence found. |
| Catherine Ruckelshaus, NELP | 2024: General Counsel, 35 hours; Rebecca Dixon is separately President & CEO. `202523089349302957_public.xml`, Part VII group 16 / Schedule J group 2. | [NELP’s official biography](https://www.nelp.org/person/catherine-ruckelshaus-2/) calls her Legal Director and General Counsel; a [June 2023 NELP statement](https://www.nelp.org/on-the-supreme-courts-decision-in-glacier-northwest-v-international-brotherhood-of-teamsters/) does the same. | Retain. Direct title and an earlier official source support a continuing legal-leadership role, not an organization-wide head role. |
| Brittany Cesarini, Global Health Corps | 2024: Senior Director of Development & Communications, 40 hours; Heather Anderson is separately CEO. `202600139349300115_public.xml`, Part VII group 16 / Schedule J group 3. | GHC’s [2022–25 strategy](https://ghcorps.org/wp-content/uploads/2022/09/GHC-Strategy-to-2025_FINAL.pdf) identifies her as Senior Director of Communications; a [2025 GHC post](https://ghcorps.org/news-press/harnessing-the-power-of-community-at-skoll-world-forum/) names Anderson as CEO and Cesarini as Senior Director of Communications & Development. | Retain. Sources show a continuing functional communications/development role. |
| Edward Kwangyoon Chung, Vera Institute of Justice | 2024: VP, Initiatives, 40 hours; Nicholas R. Turner is separately President and Director. `202631359349314463_public.xml`, Part VII group 24 / Schedule J group 2. | Vera’s [2021 Form 990](https://vera-institute.files.svdcdn.com/production/downloads/2021-form-990.pdf) records `VP, Initiatives, eff. 10/2021`; its [2022 Form 990](https://vera-institute.files.svdcdn.com/production/downloads/2022-form-990.pdf) again lists him as VP, Initiatives. | Retain. The 2021 start notation is historical, while the 2022 and 2024 filings support continuation through the reviewed 2024 compensation year. |

This check does not prove that a fractional schedule is comparable to a
40-hour job; that is the stated FTE modeling convention. It does show no
evidence that the four records are CEOs/co-CEOs or that their low reported
hours mask a source-indicated partial-year transition.

## Related hours, flags, and evidence limits

Twenty-six FTE candidates have related-organization hours. Three Bipartisan
Policy Center candidates also have positive related Schedule J base and 40
combined hours: Elena Muehlenbeck (38 + 2), Lisel Loy (36 + 4), and William
Hoagland (30 + 10). The other 23 have positive related hours and zero related
Schedule J base. They are valid under the combined-hours convention but should
be marked as entity-allocation sensitivity cases, including Living Goods
Kotze, Vera Rahman, and National Employment Law Project McGrew.

The combined-hours convention does not treat the six
Center for Responsible Lending records (zero filing hours, 40 related hours,
positive reported filing base) as unresolvable. Their payroll-versus-service
allocation is uncertain, but combined reported hours give a defined FTE
denominator. Flag them for sensitivity disclosure if their source is used.

The extractor rejects duplicate normalized Schedule J names and non-case-only
Schedule J/Part VII name mismatches. Every audited record has
`duplicate_source_rows = 1`. Partial-year, former-role, governance, and
otherwise out-of-scope records remain excluded by the retained safeguards.

## Machine-readable evidence

`highest_other_fte_audit.csv` has one row for every audited positive
non-canonical-CEO record, including source XML locators, raw compensation,
filing and related hours, combined FTE denominator, candidate status, XML
validation result, raw/FTE ranks where currently attached, and rank changes.

Reproduce it from the project root with:

```sh
python3 scripts/audit_highest_other_fte.py
```

The generator independently validates source XML locators and amounts, unique
output observations, denominators, the current legacy raw attachment, and the
reviewed 895-row/614-candidate/four-rerank snapshot. Its FTE gate is
deliberately broader than the production legacy attachment: it retains the
role/year/former safeguards, removes the 30-hour screen, and withholds the
documented Center for Public Integrity 0.5-hour anomaly.
