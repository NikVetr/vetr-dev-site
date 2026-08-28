# RP CEO expanded compensation rebenchmark

## Archive status - read first

This directory contains the analytical model, extracted evidence tables, calculations, report, and a strict source-acquisition framework. An independent source audit has now preserved all 135 peer IRS XML returns, plus RP's reference filing, and found a material Schedule J omission plus one Part VII extraction error. Use `analysis/source_validation/methodology_audit.md` and the `validated_*_compensation.csv` deliverables for subsequent work; the original report is retained as the artifact that was audited.

The local archive now contains all 350 manifest records. Remote acquisition is complete: user-supplied browser captures recovered H-CAP, Marine Science Institute, and the four formerly undefined supporting records; RP's own 2024 filing was added from the official IRS TEOS bulk archive. The strict source-complete release gate still fails because it also checks the original expected extraction fields, which retain the documented Schedule J omissions, the Center for AI Safety discrepancy, and two non-primary job-ad validation issues.

The earlier file named `rp_ceo_expanded_rebenchmark_complete.zip` contained derivative text snapshots and source identifiers, but no complete IRS XML returns. That filename was misleading. The corrected ordinary release is therefore named:

`rp_ceo_expanded_rebenchmark_analysis_only_source_ready.zip`

A ZIP named `rp_ceo_expanded_rebenchmark_source_complete.zip` can be created only by `scripts/package_source_complete.py`, which fails closed unless every required filing, job advertisement, supporting source, and frozen input passes source-level validation.

See `SOURCE_ARCHIVE_STATUS.md` and `analysis/source_completeness/source_completeness_validation.txt` for the current audit.

## Purpose

This package extends the independently selected comparison universe for the full-time, organization-wide Chief Executive Officer of Rethink Priorities and reruns the public-market compensation analysis as of August 17, 2026.

The original nine-organization strict benchmark is preserved as a baseline. The later expansion waves are not blind to that earlier result. To prevent pay-driven peer selection, each new candidate list and combined peer universe was frozen before systematic review of newly added executive compensation.

## Headline result

- External recruitment posting: **$250,000-$340,000 base**, descriptive center **$295,000**, expected hire zone **$280,000-$320,000**.
- Successful incumbent: **$290,000-$350,000 base**, descriptive center **$320,000**.
- Recurring total compensation: **$340,000-$435,000**, descriptive center **$385,000**, with low-to-moderate confidence.

These are decision ranges, not estimated population percentiles.

## Evidence coverage

- 450 frozen expansion candidates plus two legacy-only original-protocol peers: **452 documented organizations**.
- **144 selected reference organizations**: 79 Tier A, 39 Tier B, and 26 Tier C.
- **116 primary-use Form 990 incumbent observations**, including **79 structurally clean** observations.
- **15 current quantitative CEO/ED recruitment advertisements**.
- **110 independently recovered exact Schedule J base observations among 116 primary-use rows**. The original evidence table omitted these fields; `deliverables/validated_form990_compensation.csv` contains the reparsed values. Form 990 Part VII reportable compensation remains a cash/W-2 proxy, not exact base salary.

## Two different reproduction commands

### 1. Rebuild the analysis-only, source-ready release

From the package root:

```bash
./reproduce.sh
```

This rebuilds the analytical datasets, statistics, sensitivity analyses, charts, Markdown/PDF report, Excel workbook, derivative source snapshots, source-acquisition manifest, source audit, validation output, checksums, and an explicitly labeled analysis-only ZIP.

It **does not** assert that raw source files have been downloaded.

### 2. Download, validate, and build a source-complete release

Run this command in a normal network-enabled environment:

```bash
./fetch_and_build_source_complete.sh
```

The command:

1. Rebuilds the analytical outputs and derivative provenance layer.
2. Creates the 350-row source-acquisition manifest.
3. Downloads complete official IRS XML returns first, using a declared raw-XML mirror only when needed.
4. Downloads employer/recruiter job materials and supporting public sources without bypassing access controls.
5. Creates response-metadata sidecars containing requested/resolved URLs, retrieval timestamps, MIME type, byte length, HTTP headers, and SHA-256.
6. Revalidates filing identity, tax period, revenue, expenses, employee count where available, CEO identity/title, and Part VII compensation fields against the XML.
7. Revalidates quantitative job-ad salary text and organizational/role identifiers.
8. Refuses to package unless every required source passes.

Successful downloads are retained, so the command can be rerun to resume after temporary failures. Configure retrieval behavior with:

```bash
SOURCE_FETCH_TIMEOUT=60 SOURCE_FETCH_RETRIES=5 ./fetch_and_build_source_complete.sh
```

The successful output is:

`../rp_ceo_expanded_rebenchmark_source_complete.zip`

The packager will not create that file while the validation report says `FAIL - NOT SOURCE-COMPLETE`.

For a lightweight network-only rebuild from an already completed analytical package, use:

```bash
SOURCE_SKIP_ANALYSIS_REBUILD=1 ./fetch_and_build_source_complete.sh
```

A manually triggered GitHub Actions workflow is included at `.github/workflows/build-source-complete.yml`. It installs only the source-archive dependencies, runs the strict acquisition pipeline on a network-enabled runner, and uploads the ZIP only when the source gate passes.

## Source archive specification

The required source inventory is recorded in:

`deliverables/source_acquisition_manifest.csv`

It contains one row for each required source with:

- Source ID and organization.
- Evidence stream and analytical use.
- Canonical and fallback URLs.
- Preferred provenance.
- Expected source-native archive path and MIME family.
- Minimum byte threshold.
- EIN, IRS object ID, and tax period where applicable.
- Validation rule.
- Current local path, checksum, byte length, retrieval timestamp, and status.

A successful source-complete build also creates:

`deliverables/source_native_manifest.csv`

The source-native directory structure is:

```text
sources/native/form990/
sources/native/job_ads/
sources/native/supporting/
```

Each downloaded file has a neighboring `.metadata.json` sidecar.

## Main analytical deliverables

- `deliverables/rp_ceo_expanded_rebenchmark_report.pdf`
- `deliverables/rp_ceo_expanded_rebenchmark_report.md`
- `deliverables/rp_ceo_expanded_benchmark_workbook.xlsx`
- `deliverables/expanded_reference_set.csv`
- `deliverables/form990_evidence.csv`
- `deliverables/job_ad_evidence.csv`
- `deliverables/peer_inclusion_exclusion_log.csv`
- `deliverables/rp_public_profile.csv`
- `deliverables/source_manifest.csv`
- `analysis/validation_report.txt`

## Source-completeness deliverables and controls

- `SOURCE_ARCHIVE_STATUS.md`
- `deliverables/source_acquisition_manifest.csv`
- `analysis/source_completeness/current_release_source_audit.csv`
- `analysis/source_completeness/current_release_source_audit.json`
- `analysis/source_completeness/source_completeness_validation.txt`
- `analysis/source_completeness/source_validation_details.csv`
- `scripts/fetch_source_native.py`
- `scripts/verify_source_native.py`
- `scripts/package_source_complete.py`
- `fetch_and_build_source_complete.sh`

## Frozen selection files

| File | SHA-256 |
|---|---|
| `frozen/extension2_protocol_amendment.md` | `bcfa477a761a54ee0ea99c4a8d969ab440f50a247b54f3b144bf4d7226bb81b2` |
| `frozen/extension2_new_candidates_precomp.csv` | `9ed0ee56e13d29ea571124a8373d39e1d5d2b877d599e410f5c27d3b9ede68a8` |
| `frozen/combined_peer_universe_precomp.csv` | `5ab36e39683e2b11f96faabaa39a8994081e13e82425263e45a28bd3f37daeba` |
| `frozen/extension3_protocol_amendment.md` | `c048466b556ea38232fcfbd8ed92745fa9a198706eb2a9a7115041c1b9dea27b` |
| `frozen/extension3_new_candidates_precomp.csv` | `b0c04fb1cec71b2496da1d8ade07d74ebf14abc43f11dc7ede81581f3b3316cc` |
| `frozen/combined_peer_universe_3wave_precomp.csv` | `d84b6c772f8017bd4ddb8a4327012aabe40b6cd25198552558b4018f6c32e4c3` |
| `frozen/legacy_original_peer_bridge_precomp.csv` | `ec5924cc4586012f2d1d1f902284954958d31a03bf4578807be399729a255c12` |

## Analytical reproduction pipeline

1. `scripts/normalize_and_analyze.py` validates and CPI-normalizes filing and advertisement inputs, constructs the selected set, and calculates statistics and sensitivities.
2. `scripts/build_report.py` builds the Markdown and PDF report.
3. `scripts/build_sources_manifest.py` rebuilds derivative source snapshots and the checksum-bearing analytical source manifest.
4. `scripts/build_workbook.py` builds the formula-driven Excel workbook.
5. `scripts/recalc_render_workbook.py` recalculates and renders the workbook when the optional spreadsheet engine is available.
6. `scripts/validate_release.py` independently reproduces counts, medians, quartiles, leave-one-out results, filing arithmetic, cutoff checks, workbook structure, report claims, and derivative source checksums.
7. `scripts/build_source_acquisition_manifest.py` creates the strict raw-source inventory.
8. `scripts/verify_source_native.py` performs the independent raw-source validation pass.
9. `scripts/build_source_audit.py` documents the archive’s actual completeness.
10. `scripts/build_hashes.py` creates the complete artifact checksum manifest.
11. `scripts/package_analysis_only.py` creates the ordinary analysis-only ZIP.

The append scripts in `scripts/` preserve row-level extraction and data-assembly provenance for the expansion waves. They are not required to rebuild the report from the frozen extracted inputs.

## Evidence definitions

- **Base salary:** fixed annual cash salary stated in a job advertisement or separately disclosed in Schedule J.
- **Cash/W-2 proxy:** Form 990 Part VII reportable compensation from the organization plus related organizations; it can include bonuses and other taxable compensation.
- **Other compensation:** Form 990 Part VII column F or separately reported deferred/nontaxable amounts.
- **Filing total proxy:** cash/W-2 proxy plus Part VII other compensation when Schedule J total is unavailable.
- **Structurally clean:** full-year organization-wide top-executive observation without a predeclared transition or unusual leadership/pay-structure flag.

## Software requirements

Core Python requirements are `pandas`, `numpy`, `matplotlib`, `mistune`, `weasyprint`, `openpyxl`, `pypdf`, and `requests`. Workbook cached-value recalculation and rendering use the installed spreadsheet engine when available; otherwise the workbook remains configured for recalculation when opened in a compatible spreadsheet application.

## Analytical limitations

Employee count is unavailable for 73 of 116 primary observations, so the analysis separately reports expense-only, expense-plus-no-known-contradiction, and strict joint expense-and-known-staff views. Exact filing base salary is used only where Schedule J reports it; no base salary is imputed. See `KNOWN_LIMITATIONS.md` for the complete list.

This analysis is not a legal opinion and does not replace board conflict-of-interest, comparability, or compensation-reasonableness procedures.
