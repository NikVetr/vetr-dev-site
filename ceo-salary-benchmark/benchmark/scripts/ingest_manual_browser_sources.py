#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "deliverables" / "source_acquisition_manifest.csv"
REPORT_PATH = ROOT / "analysis" / "source_validation" / "manual_source_ingestion.csv"
LOG_PATH = ROOT / "analysis" / "source_completeness" / "fetch_log.jsonl"


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def saved_url(text: str) -> str:
    match = re.search(r"saved from url=\(\d+\)(https?://.*?)\s*-->", text[:3000], re.I | re.S)
    if match:
        return match.group(1).strip()
    match = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', text[:20000], re.I)
    return match.group(1).strip() if match else ""


def ein_from_url(url: str) -> str:
    match = re.search(r"(?:%2c|,)(\d{9})(?:/|$)", url, re.I)
    if match:
        return match.group(1)
    match = re.search(r"/organizations/(\d{8,9})(?:/|$)", url, re.I)
    return match.group(1).zfill(9) if match else ""


def archive_capture(source: Path, source_id: str, resolved_url: str) -> dict:
    destination_dir = ROOT / "sources" / "native" / "manual_browser" / source_id.lower()
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / source.name
    shutil.copy2(source, destination)
    assets = source.with_name(source.stem + "_files")
    if assets.is_dir():
        shutil.copytree(assets, destination_dir / assets.name, dirs_exist_ok=True)
    relative = str(destination.relative_to(ROOT))
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    metadata = {
        "source_id": source_id,
        "requested_url": resolved_url,
        "resolved_url": resolved_url,
        "retrieval_timestamp_utc": timestamp,
        "retrieval_method": "manual browser Save Page As supplied by user",
        "content_type": "text/html; manual browser capture",
        "byte_length": destination.stat().st_size,
        "sha256": digest(destination),
        "local_path": relative,
        "companion_assets_preserved": assets.is_dir(),
        "original_capture_filename": source.name,
    }
    metadata_path = destination.with_suffix(destination.suffix + ".metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return metadata


def archive_supplemental_capture(source: Path, source_id: str, resolved_url: str) -> dict:
    destination_dir = ROOT / "sources" / "native" / "manual_browser" / source_id.lower() / "supplemental"
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / source.name
    shutil.copy2(source, destination)
    assets = source.with_name(source.stem + "_files")
    if assets.is_dir():
        shutil.copytree(assets, destination_dir / assets.name, dirs_exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    metadata = {
        "source_id": source_id,
        "requested_url": resolved_url,
        "resolved_url": resolved_url,
        "retrieval_timestamp_utc": timestamp,
        "retrieval_method": "manual browser Save Page As supplied by user; supplemental mirror",
        "content_type": "text/html; manual browser capture",
        "byte_length": destination.stat().st_size,
        "sha256": digest(destination),
        "local_path": str(destination.relative_to(ROOT)),
        "companion_assets_preserved": assets.is_dir(),
        "original_capture_filename": source.name,
    }
    destination.with_suffix(destination.suffix + ".metadata.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=Path)
    args = parser.parse_args()
    input_dir = args.input_dir.resolve()
    manifest = pd.read_csv(MANIFEST_PATH, dtype=str).fillna("")
    causeiq = manifest[
        manifest.canonical_url.str.contains("causeiq.com", case=False, na=False)
        & manifest.current_status.isin({"missing_source_native", "download_failed"})
    ]
    causeiq_by_ein = {
        ein_from_url(row.canonical_url): idx for idx, row in causeiq.iterrows()
    }
    supporting_by_ein = {
        "471988398": "SRC-990-CEA",
        "010686889": "SRC-990-FAUNALYTICS",
        "208625442": "SRC-990-GIVEWELL",
        "582565917": "SRC-990-MIRI",
    }
    accepted: list[tuple[int, Path, str]] = []
    accepted_source_ids: set[str] = set()
    supplemental: list[tuple[Path, str, str]] = []
    report: list[dict] = []

    for source in sorted(input_dir.glob("*.html")):
        text = source.read_text(encoding="utf-8", errors="ignore")
        url = saved_url(text)
        ein = ein_from_url(url)
        if ein and ein in causeiq_by_ein:
            idx = causeiq_by_ein.pop(ein)
            accepted.append((idx, source, url))
            accepted_source_ids.add(str(manifest.loc[idx, "source_id"]))
            continue
        if "projects.propublica.org" in url and ein and ein in supporting_by_ein:
            source_id = supporting_by_ein[ein]
            matches = manifest.index[manifest.source_id.eq(source_id)].tolist()
            if len(matches) != 1:
                raise ValueError(f"Could not uniquely resolve {source_id}")
            accepted.append((matches[0], source, url))
            accepted_source_ids.add(source_id)
            continue
        if all(token in text for token in ["H-CAP Executive Director", "150,000", "170,000", "March 15, 2026"]):
            source_id = "SRC-AD-HCAP-2026"
            matches = manifest.index[manifest.source_id.eq(source_id)].tolist()
            if len(matches) != 1:
                raise ValueError(f"Could not uniquely resolve {source_id}")
            accepted.append((matches[0], source, url))
            accepted_source_ids.add(source_id)
            continue
        if all(token in text for token in ["Marine Science Institute", "Executive Director", "195,000", "240,000", "January 20, 2026"]):
            source_id = "SRC-AD-MSI"
            if source_id in accepted_source_ids:
                supplemental.append((source, source_id, url))
                continue
            matches = manifest.index[manifest.source_id.eq(source_id)].tolist()
            if len(matches) != 1:
                raise ValueError(f"Could not uniquely resolve {source_id}")
            accepted.append((matches[0], source, url))
            accepted_source_ids.add(source_id)
            continue
        if "The Colorado Health Foundation" in text and all(
            token in text for token in ["626,000", "736,000", "Chief Executive Officer"]
        ):
            matches = manifest.index[manifest.source_id.eq("SRC-AD-CHF-2026")].tolist()
            if len(matches) != 1:
                raise ValueError("Could not uniquely resolve SRC-AD-CHF-2026")
            accepted.append((matches[0], source, url))
            continue
        if "DailyRemote" in source.name or "This Job Has Expired" in text:
            reason = "expired placeholder; no complete H-CAP posting"
        elif "jobmatic" in source.name.lower():
            reason = "generic search results; missing H-CAP organization and $170,000 endpoint"
        elif "Marine Science Institute" in text:
            reason = "organization homepage/field-trips page; not the executive job posting"
        else:
            reason = "unrelated manual capture"
        report.append({
            "candidate_file": str(source.relative_to(ROOT.parent)),
            "source_id": "",
            "decision": "rejected",
            "reason": reason,
            "local_path": "",
        })

    if causeiq_by_ein:
        unresolved = manifest.loc[list(causeiq_by_ein.values()), ["source_id", "organization"]]
        raise ValueError(f"Missing CauseIQ captures:\n{unresolved.to_string(index=False)}")

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as log:
        for idx, source, url in accepted:
            row = manifest.loc[idx]
            metadata = archive_capture(source, row.source_id, url or row.canonical_url)
            manifest.at[idx, "current_status"] = "present_downloaded_unvalidated"
            manifest.at[idx, "current_local_path"] = metadata["local_path"]
            manifest.at[idx, "current_sha256"] = metadata["sha256"]
            manifest.at[idx, "current_byte_length"] = str(metadata["byte_length"])
            manifest.at[idx, "last_attempt_timestamp"] = metadata["retrieval_timestamp_utc"]
            manifest.at[idx, "last_attempt_result"] = "manual browser capture ingested and identity-checked"
            log.write(json.dumps(metadata, sort_keys=True) + "\n")
            report.append({
                "candidate_file": str(source.relative_to(ROOT.parent)),
                "source_id": row.source_id,
                "decision": "accepted",
                "reason": "canonical URL/EIN matched" if row.evidence_stream == "supporting_web_source" else "organization, role, and salary endpoints matched",
                "local_path": metadata["local_path"],
            })

        for source, source_id, url in supplemental:
            metadata = archive_supplemental_capture(source, source_id, url)
            log.write(json.dumps(metadata, sort_keys=True) + "\n")
            report.append({
                "candidate_file": str(source.relative_to(ROOT.parent)),
                "source_id": source_id,
                "decision": "accepted_supplemental",
                "reason": "complete second mirror retained alongside the primary capture",
                "local_path": metadata["local_path"],
            })

    manifest.to_csv(MANIFEST_PATH, index=False)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(report).sort_values(["decision", "source_id", "candidate_file"]).to_csv(REPORT_PATH, index=False)
    print(f"accepted={len(accepted)} supplemental={len(supplemental)} rejected={len(report) - len(accepted) - len(supplemental)}")
    print(REPORT_PATH)


if __name__ == "__main__":
    main()
