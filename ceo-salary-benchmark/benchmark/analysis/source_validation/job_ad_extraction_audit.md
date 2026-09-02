# Job-ad compensation extraction audit

This audit checks each locally preserved posting independently of the analytical normalization pipeline. Identity/title checks and exact salary-endpoint checks include visible text and embedded structured data.

## Results

- Job-ad rows audited: **40**.
- Rows with a local source: **40**.
- Rows whose organization, role, and salary values verify: **30**.
- Primary quantitative rows verified: **17 of 17**.
- Sensitivity-only rows verified: **5 of 5**.

## Audit status counts

| Status | Rows |
|---|---:|
| verified | 30 |
| salary_discrepancy_or_unverifiable | 8 |
| wrong_or_incomplete_source | 2 |

A missing or inaccessible source is reported as unverified, not treated as evidence that the recorded range is wrong.
