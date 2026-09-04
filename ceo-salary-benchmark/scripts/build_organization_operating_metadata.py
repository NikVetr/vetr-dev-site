#!/usr/bin/env python3
"""Validate and consolidate reviewed organization work-model/sponsorship metadata."""

from __future__ import annotations

import csv
import hashlib
import json
import mimetypes
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENRICHMENT = ROOT / "benchmark" / "enrichment"
OUTPUT = ENRICHMENT / "organization_operating_metadata.csv"
MANUAL_OUTPUT = ENRICHMENT / "organization_operating_metadata_manual_requests.csv"
SOURCE_MANIFEST = ENRICHMENT / "organization_operating_metadata_source_manifest.csv"
INPUTS = [
    ENRICHMENT / "organization_operating_metadata_batch_1.csv",
    ENRICHMENT / "organization_operating_metadata_batch_2.csv",
    ENRICHMENT / "organization_operating_metadata_batch_3.csv",
    ENRICHMENT / "organization_operating_metadata_batch_4.csv",
    ENRICHMENT / "organization_operating_metadata_rp.csv",
]
MANUAL_INPUTS = [
    ENRICHMENT / f"organization_operating_metadata_manual_batch_{index}.csv"
    for index in range(1, 5)
]
FIELDS = [
    "organization", "is_remote", "remote_category", "remote_evidence",
    "remote_source_url", "remote_local_path", "serves_as_fiscal_sponsor",
    "fiscal_sponsor_evidence", "fiscal_sponsor_source_url",
    "fiscal_sponsor_local_path", "confidence", "caveats", "retrieved_at",
]
MANUAL_FIELDS = [
    "organization", "url", "reason", "requested_artifact",
    "proposed_local_path", "retrieved_at",
]


def load_app_data() -> dict:
    raw = (ROOT / "app-data.js").read_text(encoding="utf-8")
    prefix = "window.CEO_BENCHMARK_DATA = "
    if not raw.startswith(prefix) or not raw.rstrip().endswith(";"):
        raise ValueError("Unexpected app-data.js wrapper")
    return json.loads(raw[len(prefix):].strip().removesuffix(";"))


def app_organizations(data: dict) -> set[str]:
    organizations = {
        row["organization"] for row in [*data["incumbents"], *data["jobAds"]]
    }
    for group in ("positionObservations", "positionJobAds", "rpReferencesByPosition"):
        for group_rows in data[group].values():
            organizations.update(row["organization"] for row in group_rows)
    organizations.add(data["rpReference"]["organization"])
    return organizations


def read_rows(path: Path, fields: list[str]) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != fields:
            raise ValueError(f"Unexpected columns in {path}: {reader.fieldnames}")
        return list(reader)


def tristate(value: str, *, path: Path, organization: str) -> str:
    normalized = value.strip().casefold()
    if normalized in {"true", "yes", "1"}:
        return "true"
    if normalized in {"false", "no", "0"}:
        return "false"
    if normalized in {"", "unknown", "unclear", "not reported"}:
        return "unknown"
    raise ValueError(f"Invalid tri-state value in {path} for {organization}: {value!r}")


def validate_local_path(value: str, *, path: Path, organization: str) -> None:
    if not value:
        return
    local_path = ROOT / value
    if not local_path.is_file() or local_path.stat().st_size == 0:
        raise ValueError(f"Missing/empty local source in {path} for {organization}: {value}")


def normalized_row(row: dict[str, str], path: Path) -> dict[str, str]:
    result = {key: (row.get(key) or "").strip() for key in FIELDS}
    organization = result["organization"]
    if not organization:
        raise ValueError(f"Blank organization in {path}")
    result["is_remote"] = tristate(result["is_remote"], path=path, organization=organization)
    result["serves_as_fiscal_sponsor"] = tristate(
        result["serves_as_fiscal_sponsor"], path=path, organization=organization
    )
    result["remote_category"] = {
        "true": "remote", "false": "in-person / hybrid", "unknown": "unknown",
    }[result["is_remote"]]
    for prefix in ("remote", "fiscal_sponsor"):
        if not result[f"{prefix}_evidence"]:
            raise ValueError(f"Missing {prefix} evidence in {path} for {organization}")
        source_url = result[f"{prefix}_source_url"]
        if source_url and not source_url.startswith(("https://", "http://")):
            raise ValueError(f"Invalid {prefix} URL in {path} for {organization}")
        if not source_url and not result[f"{prefix}_local_path"]:
            raise ValueError(f"Missing both {prefix} URL and local evidence in {path} for {organization}")
        validate_local_path(result[f"{prefix}_local_path"], path=path, organization=organization)
    if result["confidence"].casefold() not in {"high", "medium", "low"}:
        raise ValueError(f"Invalid confidence in {path} for {organization}: {result['confidence']!r}")
    if len(result["retrieved_at"]) != 10:
        raise ValueError(f"Invalid retrieval date in {path} for {organization}: {result['retrieved_at']!r}")
    return result


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def build_source_manifest(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        for claim, prefix in (("work_model", "remote"), ("fiscal_sponsor", "fiscal_sponsor")):
            url = row[f"{prefix}_source_url"]
            local_path = row[f"{prefix}_local_path"]
            key = (row["organization"], claim, url)
            if key in seen:
                continue
            seen.add(key)
            resolved = None
            if local_path:
                resolved = ROOT / local_path
            output.append({
                "organization": row["organization"],
                "claim": claim,
                "source_url": url,
                "local_path": local_path,
                "mime_type": mimetypes.guess_type(str(resolved or local_path))[0] or "",
                "byte_length": resolved.stat().st_size if resolved else "",
                "sha256": hashlib.sha256(resolved.read_bytes()).hexdigest() if resolved else "",
                "retrieved_at": row["retrieved_at"],
            })
    return output


def main() -> None:
    data = load_app_data()
    expected = app_organizations(data)
    combined: dict[str, dict[str, str]] = {}
    for path in INPUTS:
        for raw in read_rows(path, FIELDS):
            row = normalized_row(raw, path)
            organization = row["organization"]
            if organization in combined:
                raise ValueError(f"Duplicate organization across batches: {organization}")
            combined[organization] = row
    missing = sorted(expected - combined.keys())
    extra = sorted(combined.keys() - expected)
    if missing or extra:
        raise ValueError(f"Operating-metadata universe mismatch; missing={missing}, extra={extra}")

    output_rows = [combined[organization] for organization in sorted(combined, key=str.casefold)]
    write_csv(OUTPUT, FIELDS, output_rows)

    manual_rows: list[dict[str, str]] = []
    for path in MANUAL_INPUTS:
        if path.is_file():
            manual_rows.extend(read_rows(path, MANUAL_FIELDS))
    write_csv(MANUAL_OUTPUT, MANUAL_FIELDS, manual_rows)

    source_fields = [
        "organization", "claim", "source_url", "local_path", "mime_type",
        "byte_length", "sha256", "retrieved_at",
    ]
    write_csv(SOURCE_MANIFEST, source_fields, build_source_manifest(output_rows))
    print(
        f"wrote {OUTPUT} with {len(output_rows)} organizations; "
        f"{len(manual_rows)} manual requests; {len(output_rows) * 2} claim sources"
    )


if __name__ == "__main__":
    main()
