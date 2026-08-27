#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd

try:
    import requests
except Exception as e:  # pragma: no cover
    raise SystemExit("requests is required: python -m pip install requests") from e

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "deliverables/source_acquisition_manifest.csv"
LOG_PATH = ROOT / "analysis/source_completeness/fetch_log.jsonl"

USER_AGENT = (
    "Mozilla/5.0 (compatible; RP-CEO-Compensation-Research/1.0; "
    "+public-record archival; contact=research@example.invalid)"
)

CONTENT_EXT = {
    "application/pdf": ".pdf",
    "application/xml": ".xml",
    "text/xml": ".xml",
    "application/json": ".json",
    "text/csv": ".csv",
    "text/html": ".html",
    "application/xhtml+xml": ".html",
    "text/plain": ".txt",
    "application/zip": ".zip",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sniff_ext(content_type: str, url: str, body: bytes) -> str:
    ctype = (content_type or "").split(";", 1)[0].strip().lower()
    if ctype in CONTENT_EXT:
        return CONTENT_EXT[ctype]
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {".pdf", ".xml", ".json", ".csv", ".html", ".htm", ".txt", ".zip"}:
        return ".html" if suffix == ".htm" else suffix
    head = body[:100].lstrip()
    if head.startswith(b"%PDF"):
        return ".pdf"
    if head.startswith(b"PK\x03\x04"):
        return ".zip"
    if head.startswith(b"<?xml") or head.startswith(b"<Return"):
        return ".xml"
    if head.startswith(b"{") or head.startswith(b"["):
        return ".json"
    if b"<html" in body[:2000].lower() or b"<!doctype html" in body[:2000].lower():
        return ".html"
    return ".bin"


def appears_error_page(body: bytes, content_type: str) -> bool:
    if len(body) < 120:
        return True
    if body.lstrip().startswith(b"<?xml") or body.startswith(b"%PDF"):
        return False
    text = body.decode("utf-8", "ignore").lower()
    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", text)
    title = re.sub(r"<[^>]+>", " ", title_match.group(1)) if title_match else ""
    error_titles = [
        "access denied", "forbidden", "request blocked", "page not found",
        "error 404", "job not found", "job does not exist",
        "internal server error", "temporarily unavailable",
    ]
    if any(marker in title for marker in error_titles):
        return True
    if "cloudflare ray id" in text[:10000] or "cf-chl-" in text[:10000]:
        return True
    return False


def candidate_urls(row: pd.Series) -> list[str]:
    stream = str(row.evidence_stream)
    urls = []
    if stream == "form990":
        # Canonical IRS XML first. ProPublica raw XML is a lawful source-native mirror;
        # the organization landing page is not a substitute for a filing artifact.
        for key in ("canonical_url", "fallback_url_2"):
            u = str(row.get(key, "") or "").strip()
            if u and u not in urls:
                urls.append(u)
    else:
        for key in ("canonical_url", "fallback_url_1", "fallback_url_2"):
            u = str(row.get(key, "") or "").strip()
            if u and u not in urls:
                urls.append(u)
    return urls


def download_one(session: requests.Session, row: pd.Series, timeout: int, retries: int) -> tuple[bool, dict]:
    sid = str(row.source_id)
    expected = ROOT / str(row.expected_local_path)
    expected.parent.mkdir(parents=True, exist_ok=True)
    last_error = ""
    for url in candidate_urls(row):
        for attempt in range(1, retries + 1):
            try:
                resp = session.get(url, timeout=timeout, allow_redirects=True, stream=False)
                status = resp.status_code
                body = resp.content
                ctype = resp.headers.get("Content-Type", "")
                if status >= 400:
                    raise RuntimeError(f"HTTP {status}")
                if appears_error_page(body, ctype):
                    raise RuntimeError("response resembles an error/challenge page")
                minimum = int(float(row.minimum_bytes))
                if len(body) < minimum:
                    raise RuntimeError(f"body too small: {len(body)} < {minimum}")
                ext = sniff_ext(ctype, str(resp.url), body)
                if str(row.evidence_stream) == "form990" and ext != ".xml":
                    raise RuntimeError(f"filing response is not XML (detected {ext}, content-type={ctype!r})")
                dest = expected.with_suffix(ext)
                tmp = dest.with_suffix(dest.suffix + ".part")
                tmp.write_bytes(body)
                tmp.replace(dest)
                meta = {
                    "source_id": sid,
                    "requested_url": url,
                    "resolved_url": str(resp.url),
                    "retrieval_timestamp_utc": now_iso(),
                    "http_status": status,
                    "content_type": ctype,
                    "content_length_header": resp.headers.get("Content-Length", ""),
                    "byte_length": len(body),
                    "sha256": sha256(dest),
                    "local_path": str(dest.relative_to(ROOT)),
                    "response_headers": {k: v for k, v in resp.headers.items()},
                }
                meta_path = dest.with_suffix(dest.suffix + ".metadata.json")
                meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8")
                return True, meta
            except Exception as e:
                last_error = f"{url} attempt {attempt}/{retries}: {type(e).__name__}: {e}"
                if attempt < retries:
                    time.sleep(min(2 ** (attempt - 1), 8))
    return False, {
        "source_id": sid,
        "retrieval_timestamp_utc": now_iso(),
        "error": last_error or "no usable URL",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Download source-native evidence for the RP CEO benchmark.")
    ap.add_argument("--only", choices=["all", "form990", "job_ad", "supporting_web_source"], default="all")
    ap.add_argument("--timeout", type=int, default=45)
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--limit", type=int, default=0, help="Testing limit; 0 means no limit")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()

    if not MANIFEST_PATH.exists():
        raise SystemExit(f"Missing {MANIFEST_PATH}; run build_source_acquisition_manifest.py first")
    df = pd.read_csv(MANIFEST_PATH, dtype=str).fillna("")
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "application/xml,text/xml,application/pdf,text/html,text/plain,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
    })

    indices = []
    for idx, row in df.iterrows():
        if row.required_for_source_complete_release != "yes":
            continue
        if row.evidence_stream == "frozen_local_input":
            continue
        if args.only != "all" and row.evidence_stream != args.only:
            continue
        current = ROOT / row.current_local_path if row.current_local_path else None
        if (
            not args.overwrite
            and current
            and current.exists()
            and row.current_status.startswith("present_verified")
        ):
            continue
        indices.append(idx)
    if args.limit:
        indices = indices[: args.limit]

    ok_count = 0
    fail_count = 0
    with LOG_PATH.open("a", encoding="utf-8") as log:
        for n, idx in enumerate(indices, 1):
            row = df.loc[idx]
            print(f"[{n}/{len(indices)}] {row.source_id} - {row.organization}", flush=True)
            ok, result = download_one(session, row, args.timeout, args.retries)
            log.write(json.dumps(result, sort_keys=True) + "\n")
            log.flush()
            df.at[idx, "last_attempt_timestamp"] = result.get("retrieval_timestamp_utc", now_iso())
            if ok:
                df.at[idx, "current_status"] = "present_downloaded_unvalidated"
                df.at[idx, "current_local_path"] = result["local_path"]
                df.at[idx, "current_sha256"] = result["sha256"]
                df.at[idx, "current_byte_length"] = str(result["byte_length"])
                df.at[idx, "last_attempt_result"] = f"downloaded from {result['resolved_url']}"
                ok_count += 1
            else:
                df.at[idx, "current_status"] = "download_failed"
                df.at[idx, "last_attempt_result"] = result.get("error", "download failed")
                fail_count += 1
            df.to_csv(MANIFEST_PATH, index=False)

    print(f"downloaded={ok_count} failed={fail_count} attempted={len(indices)}")
    return 0 if fail_count == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
