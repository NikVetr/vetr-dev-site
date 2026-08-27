#!/usr/bin/env python3
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    filing = pd.read_csv(ROOT / "deliverables" / "validated_form990_compensation.csv")
    jobs = pd.read_csv(ROOT / "deliverables" / "validated_job_ad_compensation.csv")
    sources = pd.read_csv(ROOT / "deliverables" / "source_retrieval_status.csv")

    assert len(filing) == 135 and filing.source_id.is_unique
    assert filing.local_path.fillna("").ne("").all()
    assert filing.observed_schedule_j_base_org.notna().sum() == 120
    cais = filing.loc[filing.organization.eq("Center for AI Safety")].iloc[0]
    assert cais.observed_part_vii_org == 314_534
    assert cais.observed_part_vii_other == 6_749

    primary_jobs = jobs[jobs.included_in_quantitative_analysis.eq("yes")]
    sensitivity_jobs = jobs[jobs.included_in_quantitative_analysis.eq("sensitivity_only")]
    assert len(primary_jobs) == 15
    assert primary_jobs.audit_status.eq("verified").sum() == 15
    assert sensitivity_jobs.audit_status.eq("verified").all()

    assert len(sources) == 349 and sources.source_id.is_unique
    assert sources.retrieval_status.ne("missing").sum() == 349
    assert sources.query("evidence_stream == 'form990'").retrieval_status.ne("missing").all()
    print("VALIDATION AUDIT TESTS: PASS")


if __name__ == "__main__":
    main()
