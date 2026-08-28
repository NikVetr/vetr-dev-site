# Recruitment-posting category enrichment

## Status and scope

This is a post-freeze descriptive enrichment for the application. It covers all 33 recruitment-posting records and does not alter the frozen peer universe, posting tier, inclusion decision, compensation extraction, or any source-complete benchmark deliverable. Compensation values were not used to assign these categories.

The enrichment replaces missing application metadata for three sensitivity-analysis fields:

- `ea_relationship`
- `expected_structure`
- `topic_cluster`

The original source-native mission description, reporting relationship, historical explainer record, and source files remain preserved separately.

## Evidence priority

Assignments use the following order of precedence:

1. Exact organization assignments in the frozen pre-compensation peer universe.
2. Explicit legal-form, affiliation, fiscal-sponsorship, governance, mission, and operating-model statements in the archived recruitment posting or archived organization page.
3. A conservative analyst normalization from the preserved mission and reporting text.

Every row cites its preserved source. A classification is marked high confidence when the relevant status is explicit in a frozen record or archived source, and medium confidence when the normalized category necessarily compresses a more complex organization.

## EA relationship rule

The four organizations already present in the frozen pre-compensation universe retain their frozen `functional-only` assignment. The other recruitment candidates also receive `functional-only`: they entered this comparison as functional, operating-model, title, scale, or broad sensitivity comparators rather than because of an EA relationship. This label does not claim that no staff member, donor, or program has any EA connection; it means no EA-core or EA-adjacent organizational relationship was established for this benchmark.

## Structure rule

`expected_structure` describes the organization or role represented by the posting, not merely the wording of the executive reporting line. An organization is classified as `independent nonprofit` only when the preserved evidence supports a standalone nonprofit with its own organization-wide leadership. Explicit fiscal sponsorship, university control or affiliation, multi-entity governance, grantmaker status, public-private endowment status, network-hub structure, and subordinate regional roles receive distinct labels.

## Topic rule

The recruitment stream uses one compact eight-category taxonomy so all 33 postings can be filtered consistently:

- Research, evaluation, and policy
- Climate, environment, and conservation
- Philanthropy and nonprofit infrastructure
- Health, workforce, and biomedical research
- Justice, housing, and social policy
- Journalism and knowledge dissemination
- Education, culture, and public engagement
- Conflict prevention and security

Each organization receives the category that best represents the mission and operating model relevant to the advertised executive role. The categories describe the posting context, not the source's legal status or benchmark tier.

## Use in the application

These values are suitable for filters and optional sensitivity weights. They are not independent observations, causal variables, or compensation adjustments. Their default multipliers are editable analyst judgments and should be varied in sensitivity analysis.
