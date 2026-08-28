# Category Explainers: Methodology and Provenance Notes

## Scope

This package explains the categorical fields used in the RP CEO compensation benchmark. It was generated from the preserved benchmark materials under `benchmark/`, with primary attention to:

- `benchmark/frozen/original_benchmark_protocol.md`
- `benchmark/frozen/first_expansion_protocol.md`
- `benchmark/frozen/extension2_protocol_amendment.md`
- `benchmark/frozen/extension3_protocol_amendment.md`
- the frozen `*_precomp.csv` files
- `benchmark/deliverables/expanded_reference_set_144.csv`
- `benchmark/deliverables/form990_evidence.csv`
- `benchmark/deliverables/job_ad_evidence.csv`
- `benchmark/scripts/normalize_and_analyze.py`

The outputs contain 270 field/value definitions and 312 row-level category-rationale records: 144 selected-reference records, 135 Form 990 records, and 33 job-ad records.

## Classification layers

The benchmark uses several different kinds of categories. They should not be treated as if they were all assigned at the same time or with the same evidentiary status.

### 1. Preregistered rules

The original benchmark protocol froze functional, scale, geography, title, recency, evidence, and inclusion/exclusion rules before peer compensation was viewed. See `benchmark/frozen/original_benchmark_protocol.md:L16-L43` and `L61-L83`.

The first expansion froze a deterministic non-pay comparability framework before systematic compensation review of newly added organizations. Its components were function (0-30), expense/budget (0-25), staff (0-15), EA affinity (0-20), structure (0-7), and geography (0-3). See `benchmark/frozen/first_expansion_protocol.md:L29-L38`. Tier A/B/C rules appear at `L40-L48`.

The second and third amendments preserved the earlier rules while adding new candidate waves before systematic pay review. See `benchmark/frozen/extension2_protocol_amendment.md:L7-L26` and `benchmark/frozen/extension3_protocol_amendment.md:L13-L23`.

### 2. Pre-compensation normalized labels

`topic_cluster`, `ea_affinity_precomp`, and `expected_structure_precomp` were assigned in the frozen candidate-universe files before systematic compensation review for the relevant wave. These are analyst-normalized descriptors, not necessarily source-native legal terms.

- Topic clusters are broad thematic tags. They are not a mutually exclusive ontology.
- EA labels are scoring categories: EA-core (20 points), EA-adjacent (14), functional-only (7), and no meaningful relationship (0) under the frozen first-expansion protocol.
- Expected-structure labels describe the structure believed likely at candidate freeze. They are not substitutes for later legal-entity or filing verification.

### 3. Post-source, non-pay verification

Final A/B/C selection and job-ad inclusion were allowed to change for preregistered non-pay reasons: verified function, scale, geography, role/title, legal structure, full-year status, transition status, or source adequacy. Compensation magnitude was not an allowed reason to add, remove, promote, demote, or reweight a peer.

The final selected reference set contains 79 Tier A, 39 Tier B, and 26 Tier C organizations. Legacy `strict_primary` and `secondary` labels remain in `tier_label`; the analysis maps them to A and B respectively. The mapping is explicit in `benchmark/scripts/normalize_and_analyze.py:L35-L36`.

### 4. Post-filing descriptive flags

`structure_flag` is an observation-level taxonomy created after filing and role review. Many exact strings are bespoke and were not enumerated in a frozen protocol. They describe issues such as founder status, dual leadership, transitions, scale deviations, delivery or grantmaking models, related-organization pay, and missing measurements.

These flags do not apply a uniform numeric penalty. Their effects occur through `peer_tier`, `analysis_status`, and named sensitivity samples. The code-defined unusual-structure sensitivity removes six exact flags at `benchmark/scripts/normalize_and_analyze.py:L256-L258`.

Some structure flags are compensation-informed, including labels referring to unusually high cash or other compensation, related-organization pay, or all cash being paid by a related organization. Those labels were assigned after pay was observed. They did not determine precomp peer selection and are explicitly identified as post-filing analyst flags in `category_dictionary.csv`.

### 5. Derived analysis normalizations

The current title sensitivity is binary:

- `CEO_title_match` when the raw title contains `CEO` or `Chief Executive`.
- `ED_or_President` otherwise.

See `benchmark/scripts/normalize_and_analyze.py:L253-L254`. This is a descriptive sensitivity, not a pure title premium and not a substitute for verifying organization-wide executive scope. The original code would place blank or unusual non-CEO strings into `ED_or_President`; this explainer instead uses `uncoded` where no raw title exists.

The explainer also uses `uncoded` for EA, expected structure, or topic/model when a job-ad organization has no exact match in the frozen candidate universe. `uncoded` is an explainer-layer value only and does not overwrite the source deliverables.

## Job-ad tier subtypes

The original categories `strict_primary`, `secondary`, `secondary_structural`, `secondary_scale`, and `older_structural_sensitivity` are closely tied to the frozen original protocol and its scale/structure rules.

Later exact subtypes such as `expanded_primary_title`, `expanded_secondary_scale`, `expanded_secondary_scale_unknown`, `expanded_secondary_structural`, `expanded_broad_functional`, `date_ambiguity_sensitivity`, and `fractional_sensitivity` are preserved from `job_ad_evidence.csv`. Their exact names were not preregistered. Their meanings are reconstructed from the row-level `inclusion_reason`, `exclusion_reason`, and `evidence_quality_notes`; they are therefore labeled as post-collection normalized analyst categories.

## Row-level provenance approach

`organization_category_rationale.csv` uses one row per preserved record in three streams:

1. `reference_selection`: one row for each of the 144 selected reference organizations.
2. `form990`: one row for each of the 135 filing observations.
3. `job_ad`: one row for each of the 33 recruitment observations.

Each row is keyed to the most stable available identifier:

- `source_id` for Form 990 and job-ad observations.
- Frozen `candidate_id` for selected-reference organizations when available.
- A source ID or clearly labeled generated reference ID for legacy cases without a frozen candidate ID.

Every category has a separate rationale and a path-plus-row/source locator. CSV row numbers count the header as row 1. External source URLs are included where available, but the category assignment citation points first to the preserved benchmark artifact that contains the exact value.

## Source-native descriptions versus analyst categories

The package distinguishes four provenance types:

- `preregistered_rule`: a rule stated in a frozen protocol.
- `source_native_posting_description` or filing-derived role data: wording or facts taken from the underlying source evidence.
- `normalized_label`: a concise category assigned to support filtering or sensitivity analysis.
- `analyst_flag` or `derived_analysis_rule`: a post-source judgment or deterministic code transformation.

For job ads without a frozen topic/EA/structure match, `source_native_topic_or_model_description` preserves the advertisement's mission/operating-model description while the normalized category remains `uncoded`.

## Known ambiguities and labels that cannot be reconstructed confidently

1. **`app-data.js` was not present in the supplied benchmark package.** Exact UI-only aliases or display strings cannot be verified. The files preserve strings found in the CSV deliverables and analysis code. Any additional label found only in a separate `app-data.js` should be reconciled before replacing that application's data.
2. **`Research, evaluation, policy, or EA-adjacent evidence organization`** is a generic legacy-bridge fallback inserted by the normalization script, not a source-specific topic assignment. Its more precise meaning cannot be reconstructed.
3. **Topic clusters are not a controlled ontology.** Capitalization variants such as `Animal welfare and food systems` and `animal welfare and food systems` are preserved as different exact strings because the request requires exact-value preservation.
4. **EA-adjacent assignments are preserved, but the precise reason is not always documented row by row.** The frozen files usually retain a discovery URL, but not a quoted source passage establishing adjacency.
5. **Expected structure is not verified structure.** `expected_structure_precomp` may describe uncertainty (`nonprofit/project`, `nonprofit or fiscally sponsored`) and should not be converted into a definitive legal-form claim.
6. **Exact expanded job-ad subtype names were not preregistered.** `expanded_primary_title`, `expanded_broad_functional`, and `expanded_secondary_scale_unknown` are especially dependent on one or a few row-level explanations.
7. **Several structure flags are bespoke rather than standardized.** `long_tenured` has no preserved tenure threshold; `lower_edge_expense`, `lower_edge_scale`, and `upper_edge_scale` do not preserve a separate exact boundary beyond the wider protocol bands; the `unusually_high_*` labels do not preserve a universal numeric threshold.
8. **The binary title grouping is coarse.** It does not distinguish a solo CEO from `CEO/Board Secretary`, `CEO & Chief Scientist`, co-leadership, regional roles, or titles missing entirely; those issues must be read alongside `structure_flag`, `analysis_status`, and the raw title.
9. **Legacy bridge metadata was normalized later.** Niskanen Center, Results for America, and R Street Institute predate the later topic/EA/expected-structure vocabulary. Their explainer categories are clearly marked as later normalized defaults grounded in the original functional descriptions.
10. **No pay-driven selection should be inferred from post-pay flags.** Compensation-informed flags were used for transparency and sensitivity after selection, not to choose the peer set.

## Recommended use

Use `category_dictionary.csv` to populate tooltips, legends, and validation rules. Use `organization_category_rationale.csv` for row-level audit and click-through provenance. Do not collapse `expected_structure` and `observation_structure_flag`: the first is a precomp expectation, while the second is a later observation-specific flag.
