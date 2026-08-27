#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis/source_completeness/release_gate_test.txt"

with tempfile.TemporaryDirectory() as td:
    target = Path(td) / "must_not_exist_source_complete.zip"
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts/package_source_complete.py"), "--output", str(target)],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    passed = proc.returncode != 0 and not target.exists()

lines = [
    "SOURCE-COMPLETE RELEASE GATE TEST",
    "=================================",
    f"Packager return code: {proc.returncode}",
    f"Prohibited partial ZIP exists: {target.exists()}",
    f"Fail-closed behavior passed: {passed}",
    "",
    "Packager stderr:",
    proc.stderr.strip(),
    "",
    "STATUS: PASS" if passed else "STATUS: FAIL",
]
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(OUT.read_text(encoding="utf-8"))
raise SystemExit(0 if passed else 2)
