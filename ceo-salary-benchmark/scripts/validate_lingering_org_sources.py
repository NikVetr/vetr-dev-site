#!/usr/bin/env python3
"""Validate the source-native lingering-organization recovery layer."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "benchmark" / "enrichment" / "lingering_org_original_source_manifest.csv"
MANUAL = ROOT / "benchmark" / "enrichment" / "lingering_org_remaining_manual_save_requests.csv"
PEER_REVIEW = ROOT / "benchmark" / "enrichment" / "lingering_org_peer_eligibility_review.csv"
PACKAGE = ROOT / "tmp" / "rp_lingering_org_additions.zip"
PACKAGE_MANIFEST = "rp_lingering_org_additions/source_manifest.csv"
EXPECTED_PACKAGE_SHA256 = "413e38c1ae305bc784a329b6c37a9c2675b377bd8ac4d2cb5c9c3bf37ede2844"
EXPECTED_IMAGE_ONLY = {"S008", "S036", "S090", "S093", "S112"}
EXPECTED_MANUAL_REQUESTS = {"M018", "M024", "M026"}
EXPECTED_MANUAL_STATUSES = {
    "M018": "retired_user_deprioritized",
    "M024": "retired_user_deprioritized",
    "M026": "retired_user_deprioritized",
}
EXPECTED_XML = {
    "S012": ("873016729", "2023-09-01", "2024-08-31"),
    "S096": ("922014591", "2025-01-01", "2025-12-31"),
}


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def first_text(root: ET.Element, name: str) -> str:
    return next(((element.text or "").strip() for element in root.iter() if local_name(element.tag) == name), "")


def main() -> None:
    if sha256(PACKAGE) != EXPECTED_PACKAGE_SHA256:
        raise ValueError("The lingering-organization handoff changed; reacquisition must be re-audited")
    with ZipFile(PACKAGE) as archive:
        package_manifest = list(csv.DictReader(
            archive.read(PACKAGE_MANIFEST).decode("utf-8-sig").splitlines()
        ))
    package_source_ids = {row["source_id"] for row in package_manifest}

    manifest = rows(MANIFEST)
    if len(manifest) != 72:
        raise ValueError(f"Expected 72 source mappings, found {len(manifest)}")
    if any(row["source_id"] not in package_source_ids for row in manifest):
        missing = sorted({row["source_id"] for row in manifest} - package_source_ids)
        raise ValueError(f"Recovered source IDs are absent from the handoff manifest: {missing}")
    if any(not row["source_url"].startswith(("https://", "http://")) for row in manifest):
        raise ValueError("Every acquired mapping must retain its original public URL")

    by_path: dict[str, list[dict[str, str]]] = {}
    for row in manifest:
        by_path.setdefault(row["recommended_final_local_path"], []).append(row)
    if len(by_path) != 63:
        raise ValueError(f"Expected 63 distinct acquired artifacts, found {len(by_path)}")

    artifact_types: Counter[str] = Counter()
    for local_path, mappings in by_path.items():
        path = ROOT / local_path
        if not path.is_file():
            raise FileNotFoundError(f"Missing acquired source: {path}")
        expected_sizes = {int(row["bytes"]) for row in mappings}
        expected_hashes = {row["sha256"] for row in mappings}
        expected_mimes = {row["mime_type"] for row in mappings}
        if len(expected_sizes) != 1 or len(expected_hashes) != 1 or len(expected_mimes) != 1:
            raise ValueError(f"Conflicting metadata for shared artifact: {local_path}")
        if path.stat().st_size != expected_sizes.pop() or sha256(path) != expected_hashes.pop():
            raise ValueError(f"Size or SHA-256 mismatch: {local_path}")
        mime = expected_mimes.pop()
        artifact_types[mime] += 1
        raw = path.read_bytes()
        if mime == "application/pdf":
            if not raw.startswith(b"%PDF-"):
                raise ValueError(f"Invalid PDF signature: {local_path}")
        elif mime in {"text/xml", "application/xml"}:
            root = ET.fromstring(raw.decode("utf-8-sig"))
            source_id = mappings[0]["source_id"]
            expected = EXPECTED_XML.get(source_id)
            if expected is None:
                raise ValueError(f"Unexpected XML source: {source_id}")
            observed = (
                first_text(root, "EIN"),
                first_text(root, "TaxPeriodBeginDt"),
                first_text(root, "TaxPeriodEndDt"),
            )
            if observed != expected:
                raise ValueError(f"IRS XML identity/period mismatch for {source_id}: {observed}")
        elif mime == "text/html":
            beginning = raw[:4096].decode("utf-8", errors="ignore").lower()
            if "<html" not in beginning and "<!doctype html" not in beginning:
                raise ValueError(f"Invalid HTML capture: {local_path}")
        else:
            raise ValueError(f"Unsupported acquired MIME type: {mime}")

    if artifact_types != Counter({"text/html": 43, "application/pdf": 18, "text/xml": 2}):
        raise ValueError(f"Acquired artifact counts changed: {artifact_types}")
    image_only = {
        row["source_id"] for row in manifest
        if "image-only" in row["validation"]
    }
    if image_only != EXPECTED_IMAGE_ONLY:
        raise ValueError(f"Image-only PDF boundary changed: {sorted(image_only)}")
    incomplete_html = {
        row["source_id"] for row in manifest
        if "incomplete" in row["validation"]
    }
    if incomplete_html != {"S060", "S082", "S111"}:
        raise ValueError(f"Incomplete HTML boundary changed: {sorted(incomplete_html)}")

    manual = rows(MANUAL)
    if {row["request_id"] for row in manual} != EXPECTED_MANUAL_REQUESTS or len(manual) != 3:
        raise ValueError("The retired manual-acquisition audit boundary changed")
    manual_statuses = {row["request_id"]: row["request_status"] for row in manual}
    if manual_statuses != EXPECTED_MANUAL_STATUSES:
        raise ValueError(f"Manual-acquisition statuses changed: {manual_statuses}")
    if any(not row["direct_clickable_url"].startswith("https://") for row in manual):
        raise ValueError("Every retired request must retain its secure discovery URL")

    peer_review = rows(PEER_REVIEW)
    dispositions = Counter(row["recommended_peer_disposition"] for row in peer_review)
    if len(peer_review) != 34 or dispositions != Counter({
        "not_usable": 22,
        "sensitivity": 8,
        "observed_only": 4,
    }):
        raise ValueError(f"Peer-review disposition boundary changed: {dispositions}")

    print(json.dumps({
        "source_mappings": len(manifest),
        "acquired_artifacts": len(by_path),
        "artifact_types": dict(sorted(artifact_types.items())),
        "image_only_pdfs": len(image_only),
        "incomplete_html_captures": len(incomplete_html),
        "retired_manual_requests": len(manual),
        "manual_request_statuses": dict(sorted(Counter(manual_statuses.values()).items())),
        "peer_dispositions": dict(sorted(dispositions.items())),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
