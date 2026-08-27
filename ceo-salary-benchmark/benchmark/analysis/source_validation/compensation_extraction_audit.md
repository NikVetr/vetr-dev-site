# Compensation extraction audit

This audit reparses the locally preserved IRS XML independently of the analytical normalization pipeline.

## Results

- Filing rows audited: **135**.
- Part VII D/E/F values matching the package extraction: **128**.
- Returns with a matched Schedule J base-compensation field: **120**.
- Primary or primary-with-flag rows with matched Schedule J base: **110**.
- The package's `schedule_j_base` field is blank for every row, so every observed Schedule J base is an omission.

## Audit status counts

| Status | Rows |
|---|---:|
| schedule_j_base_omitted_or_mismatched | 119 |
| verified | 9 |
| no_expected_compensation_record | 6 |
| part_vii_discrepancy | 1 |

See `compensation_extraction_audit.csv` for the check-level evidence and `../../deliverables/validated_form990_compensation.csv` for an app-ready merge of the original analytical fields with independently observed XML values.
