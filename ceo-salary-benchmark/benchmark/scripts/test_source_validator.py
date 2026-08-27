#!/usr/bin/env python3
from __future__ import annotations

import html
import importlib.util
import tempfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis/source_completeness/validator_self_test.txt"

spec = importlib.util.spec_from_file_location("verify_source_native", ROOT / "scripts/verify_source_native.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

filings = pd.read_csv(ROOT / "deliverables/form990_evidence.csv")
filing = filings.iloc[0]
jobs = pd.read_csv(ROOT / "deliverables/job_ad_evidence.csv")
job = jobs[jobs.included_in_quantitative_analysis == "yes"].iloc[0]

xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Return xmlns="http://www.irs.gov/efile">
  <ReturnHeader>
    <Filer><EIN>{str(filing.ein).replace('-', '')}</EIN></Filer>
    <TaxPeriodEndDt>{filing.tax_period_end}</TaxPeriodEndDt>
  </ReturnHeader>
  <ReturnData><IRS990>
    <CYTotalRevenueAmt>{int(filing.revenue)}</CYTotalRevenueAmt>
    <CYTotalExpensesAmt>{int(filing.expenses)}</CYTotalExpensesAmt>
    <Form990PartVIISectionAGrp>
      <PersonNm>{html.escape(str(filing.ceo_name))}</PersonNm>
      <TitleTxt>{html.escape(str(filing.ceo_title))}</TitleTxt>
      <ReportableCompFromOrgAmt>{int(filing.part_vii_org)}</ReportableCompFromOrgAmt>
      <ReportableCompFromRltdOrgAmt>{int(filing.part_vii_related)}</ReportableCompFromRltdOrgAmt>
      <OtherCompensationAmt>{int(filing.part_vii_other)}</OtherCompensationAmt>
    </Form990PartVIISectionAGrp>
  </IRS990></ReturnData>
</Return>'''

job_text = (
    f"<html><body>{html.escape(str(job.organization))} "
    f"{html.escape(str(job.role_title))}. Annual base salary ${int(job.salary_min):,} "
    f"to ${int(job.salary_max):,}. Full-time organization-wide role reporting to the board, "
    "with strategy, fundraising, staff leadership, and external representation responsibilities."
    "</body></html>"
)

with tempfile.TemporaryDirectory() as tmpdir:
    tmp = Path(tmpdir)
    xml_path = tmp / "sample.xml"
    xml_path.write_text(xml, encoding="utf-8")
    job_path = tmp / "sample.html"
    job_path.write_text(job_text, encoding="utf-8")

    filing_checks = mod.validate_990(xml_path, filing)
    job_checks = mod.validate_job_ad(job_path, job)
    filing_ok = all(c["passed"] for c in filing_checks)
    job_ok = all(c["passed"] for c in job_checks)

lines = [
    "SOURCE VALIDATOR SELF-TEST",
    "==========================",
    f"Synthetic IRS XML checks: {len(filing_checks)}; all passed: {filing_ok}",
    f"Synthetic job-ad checks: {len(job_checks)}; all passed: {job_ok}",
    "",
    "IRS XML checks:",
]
lines.extend(str(c) for c in filing_checks)
lines.extend(["", "Job-ad checks:"])
lines.extend(str(c) for c in job_checks)
lines.append("")
lines.append("STATUS: PASS" if filing_ok and job_ok else "STATUS: FAIL")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(OUT.read_text(encoding="utf-8"))
raise SystemExit(0 if filing_ok and job_ok else 2)
