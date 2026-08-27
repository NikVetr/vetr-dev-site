# Independent methodology and input audit

## Bottom line

The benchmark is a useful, unusually transparent **decision-support exercise**, but the published report should not be treated as a fully source-validated estimate in its current form. The peer-selection framework, separation of evidence types, inflation convention, and sensitivity analyses are broadly sound. The central salary ranges remain plausible after correction, but two compensation-data findings require a corrected analysis release:

1. The original extraction omitted Schedule J base compensation throughout the dataset. Exact base compensation is locally recoverable for 120 of 135 filing rows, including 110 of 116 primary-use observations.
2. The Center for AI Safety row used the wrong Part VII compensation amounts. The filing reports $314,534 from the organization and $6,749 of other compensation for Daniel James Hendrycks, not $242,953 and $22,764.

The existing headline ranges were entered as explicit analyst judgment, not calculated market percentiles. They should remain labeled that way.

## What was done well

- The original protocol was frozen before peer-pay review, and later exposure/non-blinding is disclosed rather than hidden.
- Recruitment ranges, Schedule J base, Part VII reportable compensation, other compensation, and total proxies are conceptually separated.
- The analysis uses one observation per legal organization and excludes or flags interim, partial-year, co-leadership, affiliate, and unusual-structure cases.
- CPI-U normalization uses the correct July 2026 all-items, not-seasonally-adjusted index of 333.918. The compensation-year convention is consistent with IRS calendar-year reporting for all analyzed compensation rows.
- The report avoids calling the convenience sample a population or market percentile and exposes broad, clean, Tier A, scale, title, EA-affinity, founder, recency, and leave-out sensitivities.
- The analytical release reproduces successfully: the existing independent release validator passes 155 checks with no failures.

## Findings requiring correction

### Schedule J omission — high severity

The source fields exist in the XML, but `schedule_j_base` is blank for every original row. Independent parsing found 120 matched Schedule J base records, including 110 primary-use rows. This makes the report's statements that there are zero exact-base observations incorrect.

In July 2026 dollars, the newly recovered exact-base evidence is:

| Sample | n | Q1 | Median | Q3 |
|---|---:|---:|---:|---:|
| All primary | 110 | $244,832 | $294,619 | $397,100 |
| Structurally clean | 76 | $249,452 | $302,099 | $392,076 |
| Tier A | 70 | $252,890 | $312,773 | $421,904 |
| Expense plus no-known-staff-contradiction | 59 | $255,082 | $315,993 | $410,924 |
| Expense and known-staff match | 17 | $252,297 | $303,379 | $393,861 |

These medians do not invalidate the published $290,000-$350,000 incumbent-base judgment range, but they materially change its evidentiary basis and reduce the need to infer base salary from Part VII cash proxies.

### Center for AI Safety extraction — high severity, limited aggregate effect

The package attributed $242,953 of Part VII organization compensation and $22,764 of other compensation to Dan Hendrycks. Neither number appears in the selected XML return. The return reports Daniel James Hendrycks, Executive Director, at $314,534 and $6,749, with Schedule J base compensation of $314,534.

Correcting this one primary Tier A row changes the all-primary July 2026 cash-proxy median from $300,521 to $302,426 and the total-proxy median from $335,530 to $336,549. The aggregate conclusions are therefore not driven by this error, but the row must be corrected before app use.

### Peer-score provenance — moderate severity

The first expansion retains component scores for function, expense, staff, EA affinity, structure, and geography. The later frozen candidate files retain candidate identity and pre-compensation descriptors, but not the component-level scoring record used to produce every final comparability score and tier. The final totals are available, yet an independent reviewer cannot reconstruct all later scores solely from frozen component inputs.

This is an auditability limitation, not evidence that pay affected selection. The app should treat these scores as analyst judgments and expose component weights only after the components are reconstructed and documented.

### Staff completeness and scale labeling — moderate severity

Employee count is missing for 73 of 116 primary observations. The `close_scale` view contains 59 rows, but 42 of them enter because staff is missing and therefore presents no known contradiction; only 17 jointly match the expense and known-staff bands. The current labels disclose this distinction, but the broader view should not be described simply as a joint size match.

Direct XML validation also found eight employee-count transcription differences. None changes the current in-band/out-of-band classification, but the validated XML values should replace the original values before app release.

### Selection scope and weights — moderate severity

The original strict scale band was $5M-$20M and about 25-100 staff. Later amendments deliberately widened the Tier A envelope, generally to $4M-$30M and 20-125 staff, while Tier B and C extend much further. That is acceptable for sensitivity work, but the 116-row primary sample is not equivalent to the original strict peer group.

The comparability-weighted median uses `score / mean(score)`, clipped to 0.5-1.5. This is transparent but has no empirical calibration, so unweighted results should remain primary and score weighting should remain a sensitivity.

### Decision bands are judgment, not fitted estimates — moderate severity

The code identifies the advertised, incumbent-base, and total-compensation ranges as manually rounded analyst judgments. They are not the output of a regression, quantile estimator, lognormal fit, or gamma fit. The narrative mostly says this correctly; future app views should never label those bands as estimated quantiles.

### Minor normalization exception

One excluded, non-numeric row—Center for a Humane Economy—labels a November 2023 through October 2024 return as compensation year 2024. Under the IRS convention it should be 2023. Because the row has no compensation measure and is excluded, this has no analytical effect. Two quantitative job ads use closing-month rather than posting-month CPI despite the protocol preferring posting month; the effect is small but should be standardized in a corrected build.

## Source and extraction validation

- 135 of 135 Form 990 XML returns are locally preserved from official IRS bulk archives, with SHA-256 and retrieval metadata.
- Part VII D/E/F amounts match the original extraction in 128 rows. Six other rows had no expected compensation record; one row has the substantive discrepancy described above.
- All 15 primary quantitative job-ad ranges and all 3 sensitivity-only ranges verify against local source text or structured page data. A complete Arena mirror verifies H-CAP's $150,000-$170,000 range.
- The archive contains all 349 manifest records. User-supplied browser captures recovered the previously blocked pages, complete H-CAP and Marine Science Institute mirrors, and ProPublica entity pages for the four formerly undefined supporting rows.
- Marine Science Institute's excluded role title is corrected from President and CEO to Executive Director. Its salary and location were already correct, and the correction has no quantitative effect because the row was excluded for a predeclared non-pay reason.

See `compensation_extraction_audit.csv`, `job_ad_extraction_audit.csv`, and `../../deliverables/source_retrieval_status.csv` for row-level results.

## Recommended data contract for the later app

1. Use `validated_form990_compensation.csv` and `validated_job_ad_compensation.csv`, not the original evidence tables, as the starting data layer.
2. Keep advertised base, Schedule J base, Part VII cash proxy, Part VII other compensation, and Schedule J/Part VII total separate and user-selectable.
3. Default to unweighted summaries. Make peer inclusion and any continuous weight explicit, reversible, and visible in the denominator.
4. Treat lognormal or gamma fits as model-based sensitivity summaries of the selected convenience sample. Show empirical quantiles alongside fitted quantiles and use bootstrap intervals that rerun filtering/weighting.
5. Reconstruct auditable component scores for later-wave peers before exposing individual score sliders.
6. Carry source ID, local source path, canonical URL, resolved retrieval URL, checksum, extraction status, role-structure flags, and compensation year into every app observation.
