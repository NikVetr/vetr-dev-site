#!/usr/bin/env python3
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    filing = pd.read_csv(ROOT / "deliverables" / "validated_form990_compensation.csv")
    jobs = pd.read_csv(ROOT / "deliverables" / "validated_job_ad_compensation.csv")
    sources = pd.read_csv(ROOT / "deliverables" / "source_retrieval_status.csv")
    acquisition = pd.read_csv(ROOT / "deliverables" / "source_acquisition_manifest.csv")

    assert len(filing) == 135 and filing.source_id.is_unique
    assert filing.local_path.fillna("").ne("").all()
    assert filing.observed_schedule_j_base_org.notna().sum() == 120
    cais = filing.loc[filing.organization.eq("Center for AI Safety")].iloc[0]
    assert cais.observed_part_vii_org == 314_534
    assert cais.observed_part_vii_other == 6_749

    primary_jobs = jobs[jobs.included_in_quantitative_analysis.eq("yes")]
    sensitivity_jobs = jobs[jobs.included_in_quantitative_analysis.eq("sensitivity_only")]
    assert len(primary_jobs) == 17
    assert primary_jobs.audit_status.eq("verified").sum() == 17
    assert sensitivity_jobs.audit_status.eq("verified").all()

    assert len(sources) == 350 and sources.source_id.is_unique
    assert sources.retrieval_status.ne("missing").sum() == 350
    assert sources.query("evidence_stream == 'form990'").retrieval_status.ne("missing").all()
    assert len(acquisition) == 366 and acquisition.source_id.is_unique
    position_sources = acquisition[acquisition.evidence_stream.eq("position_job_ad")]
    assert set(position_sources.source_id) == {
        "SRC-AD-CAIS-COS-2026", "SRC-AD-CAIS-DEVELOPMENT-2026",
        "SRC-AD-GIVEWELL-SENIOR-RESEARCHER-2026", "SRC-AD-LEEP-COS-2025",
        "SRC-AD-LAWAI-COO-2026", "SRC-AD-LAWAI-COS-2026",
        "SRC-AD-NEWROOTS-COS-2026", "SRC-AD-NEWROOTS-RESEARCH-2026",
    }
    assert position_sources.current_status.eq("present_verified_source_native").all()
    new_job_ids = {
        "SRC-AD-CAIF-2026", "SRC-AD-ALLFED-2026", "SRC-AD-AAPO-2026",
        "SRC-AD-TAIMAKA-2025", "SRC-AD-EAD-2026", "SRC-AD-SCREWWORM-2025",
        "SRC-AD-FIRST-EMBRACE-2026",
    }
    added_sources = acquisition[acquisition.source_id.isin(new_job_ids)]
    assert set(added_sources.source_id) == new_job_ids
    assert added_sources.current_status.eq("present_verified_source_native").all()
    print("VALIDATION AUDIT TESTS: PASS")


if __name__ == "__main__":
    main()
