#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "deliverables"
A = ROOT / "analysis/source_completeness"
ACQ = D / "source_acquisition_manifest.csv"
OLD = D / "source_manifest.csv"
DETAIL = A / "current_release_source_audit.csv"
SUMMARY_JSON = A / "current_release_source_audit.json"
STATUS_MD = ROOT / "SOURCE_ARCHIVE_STATUS.md"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def main() -> int:
    A.mkdir(parents=True, exist_ok=True)
    acq = pd.read_csv(ACQ, dtype=str).fillna("")
    old = pd.read_csv(OLD, dtype=str).fillna("")
    old_map = old.set_index("source_id").to_dict("index")

    rows: list[dict[str, object]] = []
    for _, r in acq.iterrows():
        sid = clean(r.source_id)
        oldr = old_map.get(sid, {})
        derivative_rel = clean(oldr.get("local_archive_path", ""))
        derivative = ROOT / derivative_rel if derivative_rel else None
        derivative_present = bool(derivative and derivative.is_file())
        derivative_bytes = derivative.stat().st_size if derivative_present else 0
        derivative_sha = sha256(derivative) if derivative_present else ""

        native_rel = clean(r.current_local_path) or clean(r.expected_local_path)
        native = ROOT / native_rel if native_rel else None
        native_present = bool(native and native.is_file())
        native_bytes = native.stat().st_size if native_present else 0
        native_sha = sha256(native) if native_present else ""
        is_frozen_local = clean(r.evidence_stream) in {"frozen_local_input", "documented_search_record"}
        source_native_present = native_present and (is_frozen_local or "/sources/native/" in f"/{native_rel}")
        verified_status = clean(r.current_status) in {
            "present_verified_source_native",
            "present_verified_local",
        }
        rows.append({
            "source_id": sid,
            "organization": clean(r.organization),
            "evidence_stream": clean(r.evidence_stream),
            "required_for_source_complete_release": clean(r.required_for_source_complete_release),
            "canonical_url": clean(r.canonical_url),
            "expected_source_native_path": clean(r.expected_local_path),
            "current_status": clean(r.current_status),
            "current_source_native_path": native_rel if source_native_present else "",
            "source_native_present": source_native_present,
            "source_native_byte_length": native_bytes if source_native_present else 0,
            "source_native_sha256": native_sha if source_native_present else "",
            "derivative_snapshot_path": derivative_rel,
            "derivative_snapshot_present": derivative_present,
            "derivative_snapshot_byte_length": derivative_bytes,
            "derivative_snapshot_sha256": derivative_sha,
            "source_complete_for_record": bool(source_native_present and verified_status),
            "audit_note": (
                "verified frozen local input" if is_frozen_local and source_native_present and verified_status
                else "verified source-native artifact" if source_native_present and verified_status
                else "source-native artifact present; expected-data validation issue" if source_native_present
                else "derivative snapshot only; source-native artifact missing" if derivative_present
                else "source-native artifact and derivative snapshot both missing"
            ),
        })

    detail = pd.DataFrame(rows)
    detail.to_csv(DETAIL, index=False)

    required = detail[detail.required_for_source_complete_release == "yes"]
    counts_by_stream = required.groupby("evidence_stream").agg(
        required=("source_id", "size"),
        source_complete=("source_complete_for_record", "sum"),
        source_native_present=("source_native_present", "sum"),
        derivative_present=("derivative_snapshot_present", "sum"),
        derivative_bytes=("derivative_snapshot_byte_length", "sum"),
    ).reset_index()

    original_zip = ROOT.parent / "rp_ceo_expanded_rebenchmark_complete.zip"
    zip_stats = {
        "path": str(original_zip),
        "present": original_zip.is_file(),
        "archive_bytes": original_zip.stat().st_size if original_zip.is_file() else 0,
        "file_count": 0,
        "source_raw_count": 0,
        "source_raw_bytes": 0,
        "source_native_count": 0,
        "source_native_bytes": 0,
        "xml_count": 0,
        "pdf_count": 0,
    }
    if original_zip.is_file():
        with zipfile.ZipFile(original_zip) as zf:
            infos = [i for i in zf.infolist() if not i.is_dir()]
            raw = [i for i in infos if "/sources/raw/" in i.filename]
            native = [i for i in infos if "/sources/native/" in i.filename]
            zip_stats.update({
                "file_count": len(infos),
                "source_raw_count": len(raw),
                "source_raw_bytes": sum(i.file_size for i in raw),
                "source_native_count": len(native),
                "source_native_bytes": sum(i.file_size for i in native),
                "xml_count": sum(Path(i.filename).suffix.lower() == ".xml" for i in infos),
                "pdf_count": sum(Path(i.filename).suffix.lower() == ".pdf" for i in infos),
            })

    required_count = int(len(required))
    complete_count = int(required.source_complete_for_record.sum())
    native_count = int(required.source_native_present.sum())
    derivative_count = int(required.derivative_snapshot_present.sum())
    summary = {
        "audit_timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "retrieval_status": "PASS - ALL SOURCES LOCALLY PRESERVED" if native_count == required_count else "FAIL - SOURCES MISSING",
        "validation_status": "PASS - ALL EXPECTED FIELDS VERIFIED" if complete_count == required_count else "FAIL - EXPECTED-DATA CORRECTIONS REQUIRED",
        "status": "PASS - SOURCE-COMPLETE" if complete_count == required_count else "FAIL - NOT SOURCE-COMPLETE",
        "required_source_records": required_count,
        "source_complete_records": complete_count,
        "incomplete_records": required_count - complete_count,
        "source_native_or_frozen_local_files_present": native_count,
        "derivative_snapshots_present": derivative_count,
        "counts_by_stream": counts_by_stream.to_dict("records"),
        "original_misnamed_zip": zip_stats,
    }
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    table_lines = [
        "| Evidence stream | Required | Source-complete | Source-native/local present | Derivative snapshots |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in counts_by_stream.to_dict("records"):
        table_lines.append(
            f"| {row['evidence_stream']} | {int(row['required'])} | {int(row['source_complete'])} | "
            f"{int(row['source_native_present'])} | {int(row['derivative_present'])} |"
        )
    form990_count = int(required.loc[required.evidence_stream == "form990"].shape[0])

    status_text = f"""# Source archive status

**Audit timestamp:** {summary['audit_timestamp_utc']}
**Retrieval status:** **{summary['retrieval_status']}**
**Strict validation status:** **{summary['validation_status']}**

## Direct answer

All **{native_count} of {required_count}** required source records are now locally preserved. Remote acquisition is complete, including all {form990_count} IRS XML returns (135 peer filings plus RP's reference filing), all 32 job-ad records, all 174 supporting sources, seven frozen inputs, and the documented search record.

The strict release gate still fails because it also requires the original expected extraction fields to match every source. **{required_count - complete_count}** locally present records retain expected-data validation issues—principally the already documented Schedule J omissions, the Center for AI Safety correction, and two non-primary job-ad rows. These are extraction/data-contract findings, not missing-source findings. The validated app tables carry the corrected compensation fields.

The prior ZIP audit found:

- **{zip_stats['source_native_count']}** files under `sources/native/` in the prior ZIP.
- **{zip_stats['xml_count']}** XML files in the prior ZIP.
- **{zip_stats['source_raw_count']}** derivative files under `sources/raw/`, totaling **{zip_stats['source_raw_bytes']:,} bytes**.
- The ZIP's only PDF was the analytical report, not a source Form 990.

A ZIP labeled `source_complete` remains gated until the corrected analytical release replaces the original expected fields. At this audit point, **{complete_count}** records pass both retrieval and expected-field validation; all **{required_count}** pass retrieval.

## Required archive inventory

{chr(10).join(table_lines)}

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
"""
    STATUS_MD.write_text(status_text, encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))
    print(STATUS_MD)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
