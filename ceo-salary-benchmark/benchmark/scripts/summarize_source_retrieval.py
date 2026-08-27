#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "deliverables" / "source_acquisition_manifest.csv"
OUT = ROOT / "deliverables" / "source_retrieval_status.csv"
REPORT = ROOT / "analysis" / "source_validation" / "source_retrieval_status.md"


def main() -> None:
    manifest = pd.read_csv(MANIFEST, dtype=str).fillna("")
    rows: list[dict] = []
    for _, source in manifest.iterrows():
        local_path = source.current_local_path or source.expected_local_path
        path = ROOT / local_path
        present = path.is_file()
        metadata_path = path.with_suffix(path.suffix + ".metadata.json")
        resolved_url = ""
        retrieved_at = ""
        if metadata_path.is_file():
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            resolved_url = str(metadata.get("resolved_url", ""))
            retrieved_at = str(metadata.get("retrieval_timestamp_utc", ""))
        if not present:
            status = "missing"
        elif source.current_status.startswith("present_verified"):
            status = "present_and_validated"
        else:
            status = "present_with_validation_issue"
        rows.append({
            "source_id": source.source_id,
            "organization": source.organization,
            "evidence_stream": source.evidence_stream,
            "retrieval_status": status,
            "local_path": local_path if present else "",
            "metadata_path": str(metadata_path.relative_to(ROOT)) if metadata_path.is_file() else "",
            "canonical_url": source.canonical_url,
            "fallback_url_1": source.fallback_url_1,
            "fallback_url_2": source.fallback_url_2,
            "resolved_url": resolved_url,
            "retrieved_at_utc": retrieved_at,
            "sha256": source.current_sha256 if present else "",
            "byte_length": source.current_byte_length if present else "",
            "validation_status": source.current_status,
            "last_attempt_result": source.last_attempt_result,
        })
    result = pd.DataFrame(rows)
    result.to_csv(OUT, index=False)
    summary = result.groupby(["evidence_stream", "retrieval_status"]).size()
    present = result.retrieval_status.ne("missing")
    lines = [
        "# Source retrieval status",
        "",
        f"- Manifest records: **{len(result)}**.",
        f"- Locally preserved records: **{int(present.sum())}**.",
        f"- Missing records: **{int((~present).sum())}**.",
        "",
        "A validation issue can mean an extraction mismatch rather than a bad local file. Consult the compensation audit tables for that distinction.",
        "",
        "## Status by stream",
        "",
        "| Evidence stream | Retrieval status | Rows |",
        "|---|---|---:|",
    ]
    lines.extend(
        f"| {stream} | {status} | {count} |"
        for (stream, status), count in summary.items()
    )
    lines.append("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(REPORT.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
