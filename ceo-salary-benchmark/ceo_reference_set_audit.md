# CEO reference-set audit

## Scope and method

This audit tests the live `app-data.js` CEO observations, not frozen historical CSV fields. It reparses locally saved IRS XML when available and tests the current Form 990 overlay path. It manually rereads the seven rendered/PDF incumbent sources and Copenhagen's scanned filing. It does not treat a row's statistical influence as evidence of invalidity.

- Incumbent rows audited: **153**.
- Salary-bearing job-ad rows audited: **38**.
- Default incumbent cash observations: **120**.
- Machine-reparsed live IRS XML incumbent observations: **121**.
- Manually reread rendered/PDF incumbent observations: **7**; Copenhagen Consensus Center: **scanned Form 990 pages 1, 7, and 36**.

## Results

| Stream | Status | Rows |
|---|---|---:|
| incumbent | not_applicable | 24 |
| incumbent | verified | 129 |
| job_ad | unverified | 5 |
| job_ad | verified | 33 |

### Live correction and extraction conclusions

- **Center for AI Safety is not a live extraction error.** The current app applies `incumbent_compensation_updates.csv` over the historical discrepancy: Daniel James Hendrycks, 40 hours, cash/base $314,534, other $6,749, total $321,283. The live row's retained `part_vii_discrepancy` audit label identifies the obsolete historical field, not a mismatch in the displayed/training values.
- **Reported hours require two eligibility sensitivities.** Center for Public Integrity reports Paul Cheung at 0.5 weekly hours alongside several senior officers; this may be a filing convention, but earlier 40-hour evidence does not resolve the current year. Nuclear Threat Initiative reports Ernest Moniz at 25 hours with no related-organization hours, and official biographies identify concurrent external CEO work. Both retain source-exact pay but are off by default and excluded from model training pending resolution.
- **ORCID is source-exact.** Its saved XML reports Christian Shillum, Executive Director, 40 hours; Part VII $292,165 cash plus $26,746 other; Schedule J $270,253 base plus $21,912 bonus and $26,746 deferred/nontaxable benefits, total $318,911; revenue $6,811,163, expenses $5,803,116, and 9 employees. The current live values match. Its official employment page says it is global and 100% remote, while its filing says executive pay is adjusted for geographic location. Membership-funded digital infrastructure and global labor-market exposure are substantive functional/labor-market reasons for a sensitivity toggle, not an extraction error. Its highest disclosed non-CEO Schedule J base is $98,827 for Thomas Tepper Jr., finance/operations director at 30 weekly hours. Will Simpson, a foreign technology employee at 40 hours, has $139,527 reported cash but no separate base-pay disclosure. Thus the other-pay predictor is source-exact but selectively disclosed and not adjusted to full-time-equivalent pay.
- **Copenhagen Consensus Center is source-exact.** The scanned 2024 Form 990 identifies Copenhagen Consensus Center USA Inc. (EIN 26-1214521), Dr Bjorn Lomborg as principal officer and President & Founder, 40 hours, with $497,770 Part VII compensation, no related/other compensation; Schedule J breaks this into $435,166 base and $62,604 bonus. Page 1 reports $920,765 revenue, $1,187,335 expenses, and one employee. Its official contact disclosure says the core team spans five continents and work uses contractors/volunteers. Thus one employee measures the US filer payroll, not the full delivery network. Founder leadership, small US filer scale, and global expert-network delivery support a **Tier C sensitivity toggle**, not a pay-driven exclusion.
- Broad `schedule_j_base_omitted_or_mismatched` labels on legacy rows mean the frozen analytical source left Schedule J blank while the current validated overlay provides it. They are historical-provenance flags, not by themselves evidence that the live base field is invalid; the CSV identifies which live rows were actually reparsed.

## Job-ad follow-up and model membership

The stored predictive artifact has 27 recruitment records. **Dream.Org is one of them** and is trained only by the four explicit advertised-range variants of the Bayesian linear and Bayesian GAM families; filing-only Bayesian models and the intercept, linear, GAM, SVR, and GP comparisons set `includeAdvertisedRanges=false`. The nine formerly unresolved ads named in the CSV are absent from that 27-record recruitment cohort, so none currently trains any model variant.

Dream.Org's recruiting firm, NPAG, and independent cross-posts resolve the saved mirror conflict in favor of **$260,000-$290,000**, full-time. The $271,000 lower bound seen only in the saved mirror header remains documented as a display conflict but is not a basis to change the displayed body range. External source checks also resolve Snap Foundation (employer post), Williams Institute (recruitment PDF), Injustice Watch (employer post), and Disability Rights Washington (NPAG post). PVARF, National Press Foundation, and All Chicago have only third-party repost corroboration; CETI and CSCCE remain unresolved. These status distinctions and URLs are machine-readable in the audit CSV.


### Full-time eligibility issues

Two sensitivity-only rows have source-exact pay but cannot satisfy a full-time CEO rule on the 2023/2024 filing alone: **Center for Public Integrity / Paul Cheung** reports 0.5 hours per week and **Nuclear Threat Initiative / Ernest Moniz** reports 25. CPI's official 2021 Form 990 reported Cheung at 40 hours, while its 2023 return repeats 0.50 for numerous senior employees; that pattern creates a credible filing-convention concern but does not justify replacing 0.5 with 40 without an amended filing. NTI's official biography establishes sustained CEO/co-chair duties but also a second CEO role at EFI Foundation; it does not negate the reported 25 hours. Both are excluded from the standard full-time model and default peer selection, with their source-exact pay retained for user-selected sensitivity comparisons. **Third Way is not an hours failure:** Jonathan Cowan's Part VII reports 4 hours for the filing organization plus 36 for a related organization, matching its $413,118 related-organization cash compensation and totaling 40 hours. The CSV also marks 30–39.9-hour rows as reviewable rather than invalid; legitimate full-time definitions vary.

## Reference-set adequacy

The current universe is defensible as a broad, disclosed-peer benchmark when interpreted as an equal-weighted, heterogeneous reference set with explicit Tier/structure/scale toggles. It is not a tight salary survey of organizations that duplicate RP. The rule-based baseline should remain: independent legal employer; saved primary point source; named full-time organization-wide chief executive (co-leadership explicitly flagged); full-period observation; and substantive non-pay A/B/C classification. Apply the same rule before and after seeing compensation.

Use **correction** only for a conflict between the live value and its source. Use a **sensitivity toggle** for founder-led organizations, co-leadership, membership/grantmaking models, large or very small scale, international/distributed labor markets, or missing staff. Use **exclusion** for no resolved legal employer, project/sponsor compensation, part-time/interim/partial-period executive scope, or no point amount. Two organizations' model influence is a robustness reason to expose leave-out results, not grounds to remove them.

### Salary-blind recommendations

See `ceo_peer_recommendations.csv`. Forecasting Research Institute now has a saved, parsed IRS XML and a clean 40-hour CEO role, but its Part I filing reports zero employees. It should remain an optional sensitivity pending a staffing-model explanation, not be added to the default cohort. Center for Global Development is a promising research/policy peer at comparable financial scale, but needs a stable full-year leadership observation. The remaining screened candidates should not be forced into the CEO cohort without resolved entity/role boundaries and a verified annual pay observation.

## Limitations

Automated XML checks establish stored field agreement, not a manual reading of every filing's governance narrative. The CSV marks seven rendered/PDF filings and Copenhagen as manual deep reads; other XML rows are systematically parsed, not manually reread. External posting checks establish endpoint corroboration but do not recreate an employer-owned archive when one is unavailable. CETI and CSCCE remain unresolved; PVARF, National Press Foundation, and All Chicago retain third-party-only provenance. These evidence limits do not assert that the stated salaries are false.
