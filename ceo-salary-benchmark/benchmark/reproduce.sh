#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT"

python3 scripts/normalize_and_analyze.py
python3 scripts/build_report.py
python3 scripts/build_sources_manifest.py
python3 scripts/build_workbook.py
python3 scripts/recalc_render_workbook.py
python3 scripts/validate_release.py
python3 scripts/build_source_acquisition_manifest.py
python3 scripts/verify_source_native.py --allow-incomplete
python3 scripts/build_source_audit.py
python3 scripts/build_hashes.py
python3 scripts/package_analysis_only.py
