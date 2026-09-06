# Work arrangement, hiring geography, and fiscal sponsorship

This salary-blind enrichment covers every organization in the app. The reviewed evidence and unresolved cases are retained in `operating_evidence_review/shard_1.jsonl` and `shard_2.jsonl`; each record includes searches, sources, dates, scope, confidence, reasoning, and historical caveats.

## Work arrangement

Prefer an explicit employer policy. Otherwise, use role-level evidence as an explicitly labeled inference:

- Multiple different remote vacancies can support a remote designation when no contradictory office requirement is found.
- Regular on-site requirements support in-person or hybrid. Mixed remote and office roles support a hybrid/mixed designation, with the role-specific nature retained.
- One ambiguous advertisement, an address alone, an employee review, or unsuccessful searches do not establish the organization-wide arrangement.
- Conflicting or weak evidence remains unknown. Absence of on-site advertisements is not proof of universal remote eligibility.

The app/model combine hybrid and in-person as `In-person / hybrid`; the underlying review retains their distinction and whether the conclusion is explicit or inferred. RP's CEO is fully remote, also confirmed by the benchmark owner.

The `unknown_followup_*.jsonl` files revisit all 57 originally unresolved organizations. Twelve support specific inferred arrangements; Center for Responsible Lending and Marine Science Institute support office presence while their hybrid/in-person subtypes stay unresolved. This leaves 43 unknown in the combined predictor. Twelve of those retain directional, weaker or historical guesses in the app and [follow-up report](../../unknown_work_arrangements.md). These guesses do not replace Unknown in training. A 2022 remote policy can support a present-day sensitivity guess without proving that policy persists. Employer identity and the actual job body take precedence over names or locations in sidebar job cards.

## Hiring geography versus footprint

The salary predictor is the CEO role's eligible work locations or hiring market, not the countries where the organization delivers programs. Executive-specific advertisements take precedence. Where those are absent, medium/high-confidence general staff eligibility can supply a labeled `inferred_staff_market`; otherwise the market is unknown. A U.S. incorporation or office address alone does not establish a U.S.-only hiring rule. International programs alone do not establish international hiring.

The app retains CEO hiring scope and its basis, general hiring scope, and operating footprint separately. RP's official careers policy considers applicants in most places with local work authorization, prefers American/European/African time zones, and welcomes others subject to meeting expectations. This supports conditional international eligibility, without implying unrestricted worldwide employment.

## Current and historical evidence

Official policies, employer advertisements and ATS records are preferred. Historical advertisements, dated search records, employer archives, and available archived captures are considered individually. Each record states whether historical evidence was found. A locally saved current page is not a dated Wayback snapshot. Failed or unavailable archive searches remain documented limitations; they do not justify filling a category.

Most compensation records predate this review. Current or inferred policy is a descriptive covariate and cannot establish the arrangement during an earlier compensation year. The review's temporal caveats remain visible in source dialogs. Historic and current evidence can disagree without either being an extraction error.

## Fiscal sponsorship

`serves_as_fiscal_sponsor=true` requires evidence that the organization itself legally or administratively hosts other projects. Being sponsored, regranting money, or receiving grants is insufficient. A negative designation requires affirmative evidence; unresolved cases remain unknown. This field retains its separately reviewed evidence layer.

## Build and modeling

`scripts/operating_evidence_review.py` validates the review schema, source links, controlled labels, search logs, and any claimed local captures. `build_organization_operating_metadata.py` merges the review with fiscal-sponsor evidence and creates the consolidated table and source-integrity manifest. `build_app_data.py` requires complete organization coverage and publishes the evidence behind displayed claims. Only genuinely preserved captures receive local-file links.

Bayesian models use regularized categorical effects with unknown as a separate level. Confidence labels are exposed to users but are not a latent misclassification model. The empirical explorer also exposes these fields as optional filters and weights. Neither fitted associations nor chosen similarity multipliers imply causal salary effects.
