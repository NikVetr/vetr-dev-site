#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "deliverables"
MANIFEST = D / "source_acquisition_manifest.csv"
SOURCE_NATIVE_MANIFEST = D / "source_native_manifest.csv"
VALIDATION_REPORT = ROOT / "analysis/source_completeness/source_completeness_validation.txt"
DEFAULT_ZIP = ROOT.parent / "rp_ceo_expanded_rebenchmark_source_complete.zip"
ARC_ROOT = "rp_ceo_expanded_benchmark_v2_source_complete"
EXCLUDED_PARTS = {"_renders", "_nettest", "__pycache__"}
EXCLUDED_SUFFIXES = {".pyc", ".part"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def metadata_for(path: Path) -> dict:
    meta = path.with_suffix(path.suffix + ".metadata.json")
    if not meta.is_file():
        return {}
    return json.loads(meta.read_text(encoding="utf-8"))


def build_source_native_manifest(df: pd.DataFrame) -> None:
    rows = []
    for _, row in df.iterrows():
        path = ROOT / str(row.current_local_path)
        meta = metadata_for(path)
        rows.append({
            "source_id": row.source_id,
            "organization": row.organization,
            "evidence_stream": row.evidence_stream,
            "provenance": row.preferred_provenance,
            "canonical_url": row.canonical_url,
            "requested_url": meta.get("requested_url", ""),
            "resolved_url": meta.get("resolved_url", ""),
            "retrieval_timestamp_utc": meta.get("retrieval_timestamp_utc", "not_applicable_frozen_local"),
            "local_archive_path": row.current_local_path,
            "mime_type": meta.get("content_type", "local/frozen"),
            "byte_length": path.stat().st_size,
            "sha256": sha256(path),
            "ein": row.ein,
            "irs_object_id": row.irs_object_id,
            "tax_period_begin": row.tax_period_begin,
            "tax_period_end": row.tax_period_end,
            "validation_status": row.current_status,
            "validation_rule": row.validation_rule,
            "metadata_sidecar": str(path.with_suffix(path.suffix + ".metadata.json").relative_to(ROOT)) if meta else "",
        })
    pd.DataFrame(rows).to_csv(SOURCE_NATIVE_MANIFEST, index=False)


def add_file(zf: zipfile.ZipFile, path: Path, arcname: str) -> None:
    data = path.read_bytes()
    info = zipfile.ZipInfo(arcname, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
    info.external_attr = mode << 16
    zf.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=8)


def main() -> int:
    ap = argparse.ArgumentParser(description="Create a source-complete ZIP only after every required artifact passes validation.")
    ap.add_argument("--output", type=Path, default=DEFAULT_ZIP)
    args = ap.parse_args()

    verify = subprocess.run([sys.executable, str(ROOT / "scripts/verify_source_native.py")])
    if verify.returncode != 0:
        print("REFUSING TO PACKAGE: source-completeness validation failed.", file=sys.stderr)
        print(f"See {VALIDATION_REPORT}", file=sys.stderr)
        args.output.unlink(missing_ok=True)
        return 2

    df = pd.read_csv(MANIFEST, dtype=str).fillna("")
    required = df[df.required_for_source_complete_release == "yes"].copy()
    allowed = {"present_verified_source_native", "present_verified_local"}
    bad = required[~required.current_status.isin(allowed)]
    if len(bad):
        print(f"REFUSING TO PACKAGE: {len(bad)} required records are not verified.", file=sys.stderr)
        args.output.unlink(missing_ok=True)
        return 2
    for _, row in required.iterrows():
        path = ROOT / row.current_local_path
        if not path.is_file():
            print(f"REFUSING TO PACKAGE: missing {path}", file=sys.stderr)
            args.output.unlink(missing_ok=True)
            return 2
        if sha256(path) != row.current_sha256:
            print(f"REFUSING TO PACKAGE: checksum mismatch {path}", file=sys.stderr)
            args.output.unlink(missing_ok=True)
            return 2

    build_source_native_manifest(required)
    subprocess.run([sys.executable, str(ROOT / "scripts/build_source_audit.py")], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts/build_hashes.py")], check=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_suffix(args.output.suffix + ".part")
    tmp.unlink(missing_ok=True)
    with zipfile.ZipFile(tmp, "w") as zf:
        for f in sorted(ROOT.rglob("*")):
            if not f.is_file():
                continue
            rel = f.relative_to(ROOT)
            if any(part in EXCLUDED_PARTS for part in rel.parts):
                continue
            if f.suffix in EXCLUDED_SUFFIXES:
                continue
            add_file(zf, f, f"{ARC_ROOT}/{rel.as_posix()}")
    tmp.replace(args.output)
    digest = sha256(args.output)
    args.output.with_suffix(args.output.suffix + ".sha256").write_text(
        f"{digest}  {args.output.name}\n", encoding="utf-8"
    )
    print(args.output)
    print(f"sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
