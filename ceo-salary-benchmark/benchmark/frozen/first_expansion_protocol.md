# Expanded Peer Benchmark Protocol Amendment

**Original benchmark:** RP CEO independent benchmark, cutoff 2026-08-17.  
**Amendment freeze timestamp:** `2026-08-25T14:47:22-0700`  
**Purpose:** dramatically expand the organization reference universe while preserving the original nine-organization strict benchmark as a separately reported legacy core.  
**Status:** frozen before extracting or reviewing compensation for any newly added candidate organization.

## Independence and exposure statement

This amendment is not a new blind benchmark with respect to the original report: the analyst has already seen compensation for the original strict peers and the original conclusions. Those legacy observations are quarantined from the expanded selection algorithm. The expanded organization universe and all scoring rules below were frozen before reviewing pay for newly added candidates.

During tooling tests before this amendment was frozen, a search result incidentally displayed compensation for **Partnership to Advance Responsible Technology**. That organization is not included in the frozen candidate universe and will not be used in any expanded compensation summary. Search results also displayed compensation for unrelated organizations that are outside the frozen universe. No newly selected candidate was added or removed because of pay.

## Research question

How sensitive is the RP CEO compensation benchmark to a much broader, systematically tiered peer universe emphasizing nonprofit topic/function, operating budget, staff count, and effective-altruism affinity?

## Units of analysis

1. **Candidate universe:** every organization named in `expanded_peer_universe_precomp.csv`; inclusion here does not imply quantitative use.
2. **Quantitative organization peer:** an independent nonprofit with a clean full-time organization-wide CEO/President-CEO/Executive Director observation and usable scale evidence.
3. **Structural/context peer:** university center, fiscally sponsored project, umbrella/project relationship, private foundation, non-US entity, grantmaking/pass-through-dominated entity, co-CEO, transition, or other structure unsuitable for direct pooling.
4. No more than one compensation observation per legal organization.

## Candidate discovery sources

Candidates were assembled from public EA and EA-adjacent organization directories, effective-giving ecosystem materials, 80,000 Hours recommended-organization materials, and a broad functional set of research/evaluation/policy/philanthropy-infrastructure nonprofits. Cause-area familiarity alone is insufficient for high-tier placement.

## Deterministic scoring, applied without reference to pay

Each candidate receives an unweighted 0-100 comparability score built from the following components. Missing headcount is not imputed; the headcount component is marked missing and weights are renormalized across available non-pay components.

- **Functional/operating-model similarity (0-30):** independent research, evaluation, policy analysis, advisory/consulting, evidence infrastructure, field building, or a close hybrid; deductions for direct-service, field-delivery, litigation, publishing, certification, or grantmaking dominance.
- **Expense/budget similarity (0-25):** RP core anchor $7.5M-$9.3M. Full points for $5M-$20M; partial points for $3M-$35M; limited points for $1.5M-$50M; zero outside unless consolidated-scale sensitivity applies.
- **Staff-count similarity (0-15):** RP core anchor roughly 45-57 staff. Full points for 25-100; partial points for 15-150; limited points for 8-200.
- **EA affinity (0-20):** 20 explicit EA-core organization/project; 14 EA-adjacent organization or prominent EA-recommended/evaluated cause organization; 7 functional-only comparator with evidence-first methods; 0 no meaningful EA relationship.
- **CEO structure and independence (0-7):** full points for one full-time organization-wide chief executive; deductions/exclusion for project directors, university centers, subsidiaries, affiliates, co-CEOs, interim/partial-year leaders, or dual top leadership.
- **Geographic/labor-market relevance (0-3):** US national/remote/major hub receives full points; international English-language knowledge-sector organizations are contextual; local/regional delivery organizations receive less.

## Tier rules

- **Tier A expanded primary:** score >=75; clean independent organization-wide CEO; expenses $3M-$35M or headcount 15-150; functional score >=20; no dominant structural exclusion.
- **Tier B EA-weighted secondary:** score >=62 and EA affinity >=14, including scale deviations, or score >=68 for functional-only peers.
- **Tier C broad functional sensitivity:** score >=52 with usable CEO observation, but weaker scale, operating-model, or geographic match.
- **Structural/context only:** otherwise relevant but not directly poolable because of legal host, university parent, grantmaking/pass-through dominance, non-US comparability, co-CEO/interim/transition, or unclear top-executive mapping.
- **Excluded after verification:** defunct/merged, for-profit/government entity, no organization-wide chief executive, no credible scale evidence, or operating model outside the pre-registered scope.

Tier assignment may change after factual verification of mission, expenses, headcount, and legal structure, but never because compensation is high or low. All changes must cite the deterministic rule and preserve the frozen candidate row.

## Compensation evidence and measure separation

- Primary incumbent evidence: most recent full Form 990 available by 2026-08-17, ideally official IRS XML; ProPublica may be used for navigation/corroboration.
- Job advertisements remain a separate forward-looking stream.
- Schedule J base is exact base only when separately disclosed.
- Part VII reportable compensation from organization plus related organizations is a cash/W-2 proxy, not base salary.
- Part VII other compensation remains separate.
- Total proxy equals reportable plus other only when Schedule J total is unavailable.
- Partial-year, interim, co-CEO, founder-transition, severance, deferred-compensation, and related-organization complications are flagged and excluded from primary summaries under pre-specified rules.

## Weighting and summaries

No single weighted regression is treated as definitive. Report:

1. Unweighted medians/quartiles for Tier A; Tier A+B; and A+B+C.
2. EA-stratified summaries: EA-core, EA-adjacent, functional-only.
3. A transparent weighted median using organization weights derived only from comparability score: weight = score / mean(score) within the included view, capped at 1.5 and floored at 0.5.
4. Expense-band and staff-band sensitivities.
5. Functional versus title-matched sensitivities.
6. Geography and legal-structure sensitivities.
7. Leave-one-out for Tier A and leave-category-out for the broader set.
8. Winsorized summaries at the 5th/95th percentiles only as labeled robustness checks; raw results remain primary.
9. No convenience-sample result will be described as a population percentile.

## Inflation and compensation year

Use the same CPI-U series and July 2026 target date as the original benchmark. Determine compensation calendar year under IRS reporting convention; do not assume the fiscal-year ending year is the pay year.

## Minimum completion thresholds

- Frozen universe target: at least 120 named candidates.
- Verified organization records target: at least 100.
- Clean quantitative compensation observations target: at least 50, with an aspirational target of 100.
- If fewer than 50 clean observations are obtainable, report the shortfall rather than relaxing structural or title rules after seeing pay.

## Amendment rule

The original `benchmark_protocol.md` is unchanged. Any later change to this amendment must be preserved as a dated amendment, with the original file and hash retained.
