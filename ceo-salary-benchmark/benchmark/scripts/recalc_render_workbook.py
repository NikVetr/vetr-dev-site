#!/usr/bin/env python3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'deliverables/rp_ceo_expanded_benchmark_workbook.xlsx'
tmp=ROOT/'deliverables/rp_ceo_expanded_benchmark_workbook_recalc.xlsx'
preview=ROOT/'_renders/workbook_summary.png'
preview.parent.mkdir(parents=True,exist_ok=True)

try:
    from artifact_tool import SpreadsheetFile, Blob
except Exception as exc:
    # The workbook remains valid without a cached recalculation. Excel/LibreOffice
    # will recalculate on open because build_workbook.py sets fullCalcOnLoad.
    print(f'Optional workbook recalc/render skipped: {exc}')
    raise SystemExit(0)

blob=Blob.load(str(path))
wb=SpreadsheetFile.import_xlsx(blob)
wb.recalculate()
out=SpreadsheetFile.export_xlsx(wb)
out.save(str(tmp))
img=wb.render({'sheet_name':'Summary','range':'A1:H26','format':'png','scale':1.5,'headers':True,'auto_crop':'all'})
img.save(str(preview))
tmp.replace(path)
print(str(path))
print(str(preview))
