#!/usr/bin/env python3
"""Compatibility wrapper: the ordinary release is explicitly analysis-only.

A ZIP containing the label source_complete can only be created by
scripts/package_source_complete.py after strict source validation passes.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
raise SystemExit(subprocess.call([sys.executable, str(ROOT / "scripts/package_analysis_only.py")]))
