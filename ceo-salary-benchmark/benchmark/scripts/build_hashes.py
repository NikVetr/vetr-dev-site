#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "ARTIFACT_HASHES.sha256"
INCLUDE_ROOTS = [
    "README_FIRST_SOURCE_ARCHIVE_STATUS.txt",
    "README.md",
    "KNOWN_LIMITATIONS.md",
    "PROTOCOL_CHAIN.md",
    "SOURCE_ARCHIVE_STATUS.md",
    "reproduce.sh",
    "fetch_and_build_source_complete.sh",
    "requirements-source-archive.txt",
    "requirements-analysis.txt",
    ".github",
    "data",
    "frozen",
    "scripts",
    "sources",
    "deliverables",
    "analysis",
]
EXCLUDE_PARTS = {"__pycache__", "_renders", "_nettest"}
EXCLUDE_NAMES = {OUT.name}
EXCLUDE_SUFFIXES = {".pyc", ".part"}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


files: list[Path] = []
for item in INCLUDE_ROOTS:
    p = ROOT / item
    if not p.exists():
        continue
    candidates = [p] if p.is_file() else p.rglob("*")
    for f in candidates:
        if not f.is_file():
            continue
        rel = f.relative_to(ROOT)
        if any(part in EXCLUDE_PARTS for part in rel.parts):
            continue
        if f.name in EXCLUDE_NAMES or f.suffix in EXCLUDE_SUFFIXES:
            continue
        files.append(f)

lines = [f"{digest(f)}  {f.relative_to(ROOT).as_posix()}" for f in sorted(set(files), key=lambda x: x.relative_to(ROOT).as_posix())]
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"{OUT}: {len(lines)} files")
