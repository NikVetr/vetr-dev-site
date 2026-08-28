#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "deliverables"
OUT = D / "source_acquisition_manifest.csv"


def clean(v):
    if pd.isna(v):
        return ""
    return str(v).strip()


def slug(s: str, limit: int = 110) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]+", "-", s).strip("-._").lower()
    return (s or "source")[:limit]


def url_ext(url: str, default: str) -> str:
    path = urlparse(url).path.lower()
    for ext in (".pdf", ".xml", ".csv", ".json", ".xlsx", ".zip", ".txt"):
        if path.endswith(ext):
            return ext
    return default

rows: list[dict] = []

# Every filing observation is required because the report includes broad, strict,
# structural, and exclusion/sensitivity analyses.  Official IRS XML is canonical.
f = pd.read_csv(D / "form990_evidence.csv")
for _, r in f.iterrows():
    oid = clean(r.get("irs_object_id"))
    sid = clean(r.get("source_id"))
    url = clean(r.get("official_irs_url"))
    if not oid or not url:
        raise ValueError(f"Filing source missing object ID or official URL: {sid}")
    rows.append({
        "source_id": sid,
        "organization": clean(r.get("organization")),
        "evidence_stream": "form990",
        "required_for_source_complete_release": "yes",
        "canonical_url": url,
        "fallback_url_1": clean(r.get("propublica_url")),
        "fallback_url_2": f"https://projects.propublica.org/nonprofits/download-xml?object_id={oid}",
        "preferred_provenance": "official IRS e-file XML",
        "expected_local_path": f"sources/native/form990/{oid}_public.xml",
        "expected_mime_family": "xml",
        "minimum_bytes": 10000,
        "ein": clean(r.get("ein")),
        "irs_object_id": oid,
        "tax_period_begin": clean(r.get("tax_period_begin")),
        "tax_period_end": clean(r.get("tax_period_end")),
        "analysis_use": clean(r.get("analysis_status")) or "filing evidence",
        "validation_rule": "well-formed XML; EIN and tax-period end must match; extracted compensation and scale fields are rechecked",
        "current_status": "missing_source_native",
        "current_local_path": "",
        "current_sha256": "",
        "current_byte_length": "",
        "last_attempt_timestamp": "",
        "last_attempt_result": "",
    })

# RP itself is displayed as a non-analytical reference row. Keep its source-native
# filing in the same acquisition and validation system as peer Form 990 evidence.
rp_local_path = "sources/native/form990/202502879349301540_public.xml"
rp_path = ROOT / rp_local_path
rp_metadata_path = Path(f"{rp_path}.metadata.json")
rp_state = {
    "current_status": "missing_source_native",
    "current_local_path": "",
    "current_sha256": "",
    "current_byte_length": "",
    "last_attempt_timestamp": "",
    "last_attempt_result": "",
}
if rp_path.is_file() and rp_metadata_path.is_file():
    rp_bytes = rp_path.read_bytes()
    rp_metadata = json.loads(rp_metadata_path.read_text(encoding="utf-8"))
    rp_state = {
        "current_status": "present_verified_source_native",
        "current_local_path": rp_local_path,
        "current_sha256": hashlib.sha256(rp_bytes).hexdigest(),
        "current_byte_length": len(rp_bytes),
        "last_attempt_timestamp": clean(rp_metadata.get("retrieval_timestamp_utc")),
        "last_attempt_result": "downloaded from official IRS TEOS bulk archive",
    }
rows.append({
    "source_id": "SRC-990-RP-REFERENCE",
    "organization": "Rethink Priorities",
    "evidence_stream": "form990",
    "required_for_source_complete_release": "yes",
    "canonical_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_11A.zip",
    "fallback_url_1": "https://projects.propublica.org/nonprofits/organizations/843896318",
    "fallback_url_2": "https://projects.propublica.org/nonprofits/download-xml?object_id=202502879349301540",
    "preferred_provenance": "official IRS e-file XML from the TEOS bulk archive",
    "expected_local_path": rp_local_path,
    "expected_mime_family": "xml",
    "minimum_bytes": 10000,
    "ein": "84-3896318",
    "irs_object_id": "202502879349301540",
    "tax_period_begin": "2024-01-01",
    "tax_period_end": "2024-12-31",
    "analysis_use": "non-analytical RP comparison row",
    "validation_rule": "well-formed XML; EIN, tax period, CEO compensation, expenses, revenue, and employee count are rechecked by the app-data build",
    **rp_state,
})

# RP's 2024 return reports zero employees. Preserve the most recent nonzero
# value from the same Part I, line 5 field as a separately labeled 2023 source.
rp_staff_local_path = "sources/native/form990/202433179349301723_public.pdf"
rp_staff_path = ROOT / rp_staff_local_path
rp_staff_metadata_path = Path(f"{rp_staff_path}.metadata.json")
rp_staff_state = {
    "current_status": "missing_source_native",
    "current_local_path": "",
    "current_sha256": "",
    "current_byte_length": "",
    "last_attempt_timestamp": "",
    "last_attempt_result": "",
}
if rp_staff_path.is_file() and rp_staff_metadata_path.is_file():
    rp_staff_bytes = rp_staff_path.read_bytes()
    rp_staff_metadata = json.loads(rp_staff_metadata_path.read_text(encoding="utf-8"))
    rp_staff_state = {
        "current_status": "present_verified_source_native",
        "current_local_path": rp_staff_local_path,
        "current_sha256": hashlib.sha256(rp_staff_bytes).hexdigest(),
        "current_byte_length": len(rp_staff_bytes),
        "last_attempt_timestamp": clean(rp_staff_metadata.get("retrieval_timestamp_utc")),
        "last_attempt_result": "downloaded from the organization-hosted public filing",
    }
rows.append({
    "source_id": "SRC-990-RP-STAFF-2023",
    "organization": "Rethink Priorities",
    "evidence_stream": "supporting_web_source",
    "required_for_source_complete_release": "yes",
    "canonical_url": "https://rethinkpriorities.org/wp-content/uploads/2024/11/RP-2023-990-No-Schedule-B.pdf",
    "fallback_url_1": "https://projects.propublica.org/nonprofits/organizations/843896318/202433179349301723/full",
    "fallback_url_2": "",
    "preferred_provenance": "organization-hosted public Form 990 PDF",
    "expected_local_path": rp_staff_local_path,
    "expected_mime_family": "pdf_or_html_or_text",
    "minimum_bytes": 10000,
    "ein": "84-3896318",
    "irs_object_id": "202433179349301723",
    "tax_period_begin": "2023-01-01",
    "tax_period_end": "2023-12-31",
    "analysis_use": "filing-derived RP staff reference; Part I line 5",
    "validation_rule": "source-native PDF; checksum and employee count are rechecked by the app-data build",
    **rp_staff_state,
})

# Every advertisement row is retained because inclusion/exclusion and sensitivity
# judgments are part of the evidentiary chain.  An excluded discovery record with
# no recoverable URL is preserved as a frozen local search record, not falsely
# represented as source-native.
j = pd.read_csv(D / "job_ad_evidence.csv")
for _, r in j.iterrows():
    sid = clean(r.get("source_id"))
    url = clean(r.get("original_url")) or clean(r.get("resolved_url"))
    resolved = clean(r.get("resolved_url"))
    archive_path = clean(r.get("archive_path"))
    if not url:
        local = ROOT / archive_path
        if clean(r.get("included_in_quantitative_analysis")).lower() not in {"no", ""}:
            raise ValueError(f"Quantitative advertisement lacks a source URL: {sid}")
        if not local.is_file():
            raise FileNotFoundError(local)
        b = local.read_bytes()
        rows.append({
            "source_id": sid,
            "organization": clean(r.get("organization")),
            "evidence_stream": "documented_search_record",
            "required_for_source_complete_release": "yes",
            "canonical_url": "",
            "fallback_url_1": "",
            "fallback_url_2": "",
            "preferred_provenance": "frozen browser-search discovery record; no recoverable source URL",
            "expected_local_path": archive_path,
            "expected_mime_family": "local",
            "minimum_bytes": 1,
            "ein": "",
            "irs_object_id": "",
            "tax_period_begin": "",
            "tax_period_end": "",
            "analysis_use": "excluded discovery/search log",
            "validation_rule": "existing local discovery record; byte length and SHA-256 verified; never treated as a source-native quantitative advertisement",
            "current_status": "present_verified_local",
            "current_local_path": archive_path,
            "current_sha256": hashlib.sha256(b).hexdigest(),
            "current_byte_length": len(b),
            "last_attempt_timestamp": "not_applicable",
            "last_attempt_result": "no recoverable URL; frozen excluded-search record retained",
        })
        continue
    ext = url_ext(url, ".html")
    rows.append({
        "source_id": sid,
        "organization": clean(r.get("organization")),
        "evidence_stream": "job_ad",
        "required_for_source_complete_release": "yes",
        "canonical_url": url,
        "fallback_url_1": resolved if resolved and resolved != url else "",
        "fallback_url_2": "",
        "preferred_provenance": clean(r.get("upstream_provenance")) or "employer/recruiter/job-board source",
        "expected_local_path": f"sources/native/job_ads/{slug(sid)}{ext}",
        "expected_mime_family": "pdf_or_html_or_text",
        "minimum_bytes": 500,
        "ein": "",
        "irs_object_id": "",
        "tax_period_begin": "",
        "tax_period_end": "",
        "analysis_use": clean(r.get("included_in_quantitative_analysis")) or clean(r.get("tier")),
        "validation_rule": "source-native artifact; title, organization, salary text, location, and posting date checked where reported",
        "current_status": "missing_source_native",
        "current_local_path": "",
        "current_sha256": "",
        "current_byte_length": "",
        "last_attempt_timestamp": "",
        "last_attempt_result": "",
    })

# Add all other external sources from the original manifest.  Frozen/local analysis
# inputs are already source-complete as local files and are recorded as such.
m = pd.read_csv(D / "source_manifest.csv")
existing = {r["source_id"] for r in rows}
for _, r in m.iterrows():
    sid = clean(r.get("source_id"))
    if sid in existing:
        continue
    local = ROOT / clean(r.get("local_archive_path"))
    url = clean(r.get("original_url")) or clean(r.get("resolved_url"))
    prov = clean(r.get("provenance_class"))
    if not url:
        if not local.exists():
            raise FileNotFoundError(local)
        b = local.read_bytes()
        rows.append({
            "source_id": sid,
            "organization": clean(r.get("organization")),
            "evidence_stream": "frozen_local_input",
            "required_for_source_complete_release": "yes",
            "canonical_url": "",
            "fallback_url_1": "",
            "fallback_url_2": "",
            "preferred_provenance": prov or "frozen local input",
            "expected_local_path": clean(r.get("local_archive_path")),
            "expected_mime_family": "local",
            "minimum_bytes": 1,
            "ein": clean(r.get("ein")),
            "irs_object_id": clean(r.get("irs_object_id")),
            "tax_period_begin": "",
            "tax_period_end": clean(r.get("tax_period")),
            "analysis_use": clean(r.get("document_type")),
            "validation_rule": "existing local file; byte length and SHA-256 verified",
            "current_status": "present_verified_local",
            "current_local_path": clean(r.get("local_archive_path")),
            "current_sha256": hashlib.sha256(b).hexdigest(),
            "current_byte_length": len(b),
            "last_attempt_timestamp": "not_applicable",
            "last_attempt_result": "local frozen input already present",
        })
        continue
    ext = url_ext(url, ".html")
    rows.append({
        "source_id": sid,
        "organization": clean(r.get("organization")),
        "evidence_stream": "supporting_web_source",
        "required_for_source_complete_release": "yes",
        "canonical_url": url,
        "fallback_url_1": clean(r.get("resolved_url")) if clean(r.get("resolved_url")) != url else "",
        "fallback_url_2": "",
        "preferred_provenance": clean(r.get("upstream_provenance")) or prov or "public source",
        "expected_local_path": f"sources/native/supporting/{slug(sid)}{ext}",
        "expected_mime_family": "pdf_or_html_or_text",
        "minimum_bytes": 500,
        "ein": clean(r.get("ein")),
        "irs_object_id": clean(r.get("irs_object_id")),
        "tax_period_begin": "",
        "tax_period_end": clean(r.get("tax_period")),
        "analysis_use": clean(r.get("document_type")),
        "validation_rule": "source-native artifact; MIME, byte length, checksum, URL, and retrieval metadata verified",
        "current_status": "missing_source_native",
        "current_local_path": "",
        "current_sha256": "",
        "current_byte_length": "",
        "last_attempt_timestamp": "",
        "last_attempt_result": "",
    })

out = pd.DataFrame(rows)

# Preserve declared source substitutions for pages that expired or moved after
# the evidence table was frozen. These are attempted only after canonical and
# originally resolved URLs and remain labeled as fallback provenance.
override_path = ROOT / "data" / "source_url_overrides.csv"
if override_path.is_file():
    overrides = pd.read_csv(override_path, dtype=str).fillna("")
    unknown = set(overrides.source_id) - set(out.source_id)
    if unknown:
        raise ValueError(f"URL overrides reference unknown source IDs: {sorted(unknown)}")
    for _, override in overrides.iterrows():
        mask = out.source_id == override.source_id
        for column in ("fallback_url_1", "fallback_url_2"):
            replacement = str(override.get(column, "")).strip()
            if replacement:
                out.loc[mask, column] = replacement

# Preserve successful or in-progress acquisition state when this manifest is rebuilt.
# This makes the end-to-end fetch command resumable rather than erasing downloads.
if OUT.exists():
    old = pd.read_csv(OUT, dtype=str).fillna("")
    old_map = old.set_index("source_id").to_dict("index")
    state_cols = [
        "current_status", "current_local_path", "current_sha256",
        "current_byte_length", "last_attempt_timestamp", "last_attempt_result",
    ]
    for idx, row in out.iterrows():
        if row["evidence_stream"] in {"frozen_local_input", "documented_search_record"}:
            continue
        if row["current_status"] == "present_verified_source_native" and row["current_local_path"]:
            continue
        prev = old_map.get(row["source_id"])
        if not prev:
            continue
        rel = str(prev.get("current_local_path", "") or "").strip()
        path = ROOT / rel if rel else None
        # Carry state only when the referenced file still exists, or when retaining
        # a failed-attempt record that helps diagnose/resume acquisition.
        keep = bool(path and path.is_file()) or str(prev.get("current_status", "")) == "download_failed"
        if keep:
            for col in state_cols:
                out.at[idx, col] = prev.get(col, "")

if out.source_id.duplicated().any():
    dups = out.loc[out.source_id.duplicated(keep=False), "source_id"].tolist()
    raise ValueError(f"Duplicate source IDs in acquisition manifest: {dups[:10]}")
out = out.sort_values(["evidence_stream", "organization", "source_id"]).reset_index(drop=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
out.to_csv(OUT, index=False)
print(f"wrote {OUT} rows={len(out)}")
print(out.groupby(["evidence_stream", "current_status"]).size().to_string())
