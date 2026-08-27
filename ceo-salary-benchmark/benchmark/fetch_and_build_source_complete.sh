#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT"

TIMEOUT="${SOURCE_FETCH_TIMEOUT:-45}"
RETRIES="${SOURCE_FETCH_RETRIES:-3}"
failed=0

# Rebuild the analysis and derivative provenance layer first unless the package
# already contains validated analytical outputs (useful for a lightweight CI run).
if [ "${SOURCE_SKIP_ANALYSIS_REBUILD:-0}" != "1" ]; then
  python3 scripts/normalize_and_analyze.py
  python3 scripts/build_report.py
  python3 scripts/build_sources_manifest.py
  python3 scripts/build_workbook.py
  python3 scripts/recalc_render_workbook.py
  python3 scripts/validate_release.py
fi
python3 scripts/build_source_acquisition_manifest.py

# Continue across streams so one inaccessible source does not hide other results.
python3 scripts/fetch_irs_bulk_xml.py --timeout "$TIMEOUT" --retries "$RETRIES" || failed=1
for stream in job_ad supporting_web_source; do
  python3 scripts/fetch_source_native.py --only "$stream" --timeout "$TIMEOUT" --retries "$RETRIES" || failed=1
done
python3 scripts/verify_source_native.py || failed=1
python3 scripts/build_source_audit.py

if [ "$failed" -ne 0 ]; then
  echo "Source acquisition or validation is incomplete. No source-complete ZIP was created." >&2
  echo "Review analysis/source_completeness/source_completeness_validation.txt and rerun this command; successful downloads are retained." >&2
  exit 2
fi

python3 scripts/package_source_complete.py
