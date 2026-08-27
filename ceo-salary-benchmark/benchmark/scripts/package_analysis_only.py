#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ZIP = ROOT.parent / "rp_ceo_expanded_rebenchmark_analysis_only_source_ready.zip"
ARC_ROOT = "rp_ceo_expanded_benchmark_v2_analysis_only_source_ready"
EXCLUDED_PARTS = {"_renders", "_nettest", "__pycache__"}
EXCLUDED_SUFFIXES = {".pyc", ".part"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def add_file(zf: zipfile.ZipFile, path: Path, arcname: str) -> None:
    info = zipfile.ZipInfo(arcname, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
    info.external_attr = mode << 16
    zf.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=8)


def main() -> int:
    ap = argparse.ArgumentParser(description="Package the analysis and source-retrieval framework with an explicit non-complete label.")
    ap.add_argument("--output", type=Path, default=DEFAULT_ZIP)
    args = ap.parse_args()
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
