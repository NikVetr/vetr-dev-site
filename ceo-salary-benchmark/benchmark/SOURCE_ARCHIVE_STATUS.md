# Source archive status

**Audit timestamp:** 2026-08-28T19:58:49+00:00
**Retrieval status:** **PASS - ALL SOURCES LOCALLY PRESERVED**
**Strict validation status:** **FAIL - EXPECTED-DATA CORRECTIONS REQUIRED**

## Direct answer

All **350 of 350** required source records are now locally preserved. Remote acquisition is complete, including all 136 IRS XML returns (135 peer filings plus RP's reference filing), all 32 job-ad records, all 174 supporting sources, seven frozen inputs, and the documented search record.

The strict release gate still fails because it also requires the original expected extraction fields to match every source. **123** locally present records retain expected-data validation issues—principally the already documented Schedule J omissions, the Center for AI Safety correction, and two non-primary job-ad rows. These are extraction/data-contract findings, not missing-source findings. The validated app tables carry the corrected compensation fields.

The prior ZIP audit found:

- **0** files under `sources/native/` in the prior ZIP.
- **0** XML files in the prior ZIP.
- **0** derivative files under `sources/raw/`, totaling **0 bytes**.
- The ZIP's only PDF was the analytical report, not a source Form 990.

A ZIP labeled `source_complete` remains gated until the corrected analytical release replaces the original expected fields. At this audit point, **227** records pass both retrieval and expected-field validation; all **350** pass retrieval.

## Required archive inventory

| Evidence stream | Required | Source-complete | Source-native/local present | Derivative snapshots |
|---|---:|---:|---:|---:|
| documented_search_record | 1 | 1 | 1 | 1 |
| form990 | 136 | 15 | 136 | 135 |
| frozen_local_input | 7 | 7 | 7 | 7 |
| job_ad | 32 | 30 | 32 | 32 |
| supporting_web_source | 174 | 174 | 174 | 174 |

For Form 990 evidence, the canonical artifact is the complete official IRS e-file XML for the exact IRS object ID used in the analysis. A ProPublica raw-XML copy may be retained as a labeled mirror when the official individual-file endpoint is unavailable. Organization landing pages and extracted compensation tables do not substitute for the filing artifact.

For recruitment evidence, the archive should retain the employer/recruiter PDF or HTML, or a complete lawful mirror when the original has expired or is inaccessible. It must retain retrieval metadata, byte length, MIME type, and SHA-256.

## Remediation controls added

The package now includes:

1. `deliverables/source_acquisition_manifest.csv` - one required row per filing, advertisement, supporting source, and frozen input, with canonical URLs and expected archive paths.
2. `scripts/fetch_source_native.py` - resumable retrieval with official-first URL ordering, mirrors where declared, response metadata sidecars, byte counts, and SHA-256.
3. `scripts/verify_source_native.py` - strict validation of file presence, metadata, checksums, IRS XML identity and tax period, filing amounts, and advertisement text.
4. `scripts/package_source_complete.py` - a release gate that refuses to create a ZIP labeled `source_complete` unless every required source passes.
5. `fetch_and_build_source_complete.sh` - the end-to-end network-enabled acquisition, validation, and packaging command.

## Files produced by this audit

- `analysis/source_completeness/current_release_source_audit.csv`
- `analysis/source_completeness/current_release_source_audit.json`
- `analysis/source_completeness/source_completeness_validation.txt`
- `analysis/source_completeness/source_validation_details.csv`

The earlier ZIP should not be cited or circulated as a complete raw-evidence archive.
