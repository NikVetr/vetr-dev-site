#!/usr/bin/env python3
from __future__ import annotations

import html
import math
import re
from pathlib import Path

import pandas as pd
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
DELIVERABLES = ROOT / "deliverables"
OUT_DIR = ROOT / "analysis" / "source_validation"
DETAIL_PATH = OUT_DIR / "job_ad_extraction_audit.csv"
REPORT_PATH = OUT_DIR / "job_ad_extraction_audit.md"
VALIDATED_PATH = DELIVERABLES / "validated_job_ad_compensation.csv"


def expected_integer(raw: object) -> int | None:
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    text = str(raw).strip()
    return None if not text or text.lower() == "nan" else int(round(float(text)))


def source_text(path: Path) -> tuple[str, str]:
    if path.suffix.lower() == ".pdf":
        visible = "\n".join((page.extract_text() or "") for page in PdfReader(str(path)).pages)
        return visible, visible
    raw = path.read_bytes().decode("utf-8", "ignore")
    visible = re.sub(r"(?is)<script.*?>.*?</script>|<style.*?>.*?</style>", " ", raw)
    visible = html.unescape(re.sub(r"(?s)<[^>]+>", " ", visible))
    return re.sub(r"\s+", " ", visible).strip(), html.unescape(raw)


def annual_amounts(text: str) -> set[int]:
    lowered = text.lower().replace("\\u0024", "$")
    amounts: set[int] = set()
    for match in re.finditer(
        r"(?<!\d)(\d{2,3})(?:\s*[-–—]\s*|\s+to\s+)(\d{2,3})\s*k\b",
        lowered,
    ):
        amounts.update({int(match.group(1)) * 1000, int(match.group(2)) * 1000})
    for match in re.finditer(r"(?<!\d)(\d{2,3}(?:,\d{3})|\d{5,6})(?!\d)", lowered):
        amounts.add(int(match.group(1).replace(",", "")))
    for match in re.finditer(r"(?<!\d)(\d{2,3})\s*k\b", lowered):
        amounts.add(int(match.group(1)) * 1000)
    return amounts


def identity_match(text: str, organization: str, role: str) -> tuple[bool, bool]:
    lowered = text.lower()
    generic = {
        "foundation", "institute", "center", "association", "national",
        "international", "organization", "research", "program",
    }
    org_words = [
        word.lower()
        for word in re.findall(r"[A-Za-z0-9]+", organization)
        if len(word) >= 4 and word.lower() not in generic
    ]
    role_words = [word.lower() for word in re.findall(r"[A-Za-z]+", role) if len(word) >= 3]
    org_found = sum(word in lowered for word in org_words)
    role_found = sum(word in lowered for word in role_words)
    org_match = not org_words or org_found >= min(2, len(org_words))
    role_match = not role_words or role_found >= max(1, len(role_words) // 2)
    return org_match, role_match


def main() -> None:
    evidence = pd.read_csv(DELIVERABLES / "job_ad_evidence.csv")
    manifest = pd.read_csv(
        DELIVERABLES / "source_acquisition_manifest.csv", dtype=str
    ).fillna("")
    manifest_columns = manifest.set_index("source_id")[[
        "current_status", "current_local_path", "canonical_url",
        "fallback_url_1", "fallback_url_2",
    ]].to_dict("index")
    rows: list[dict] = []

    for _, expected in evidence.iterrows():
        source_id = expected.source_id
        source = manifest_columns.get(source_id, {})
        local_path = source.get("current_local_path", "")
        path = ROOT / local_path if local_path else None
        expected_min = expected_integer(expected.salary_min)
        expected_max = expected_integer(expected.salary_max)
        base = {
            "source_id": source_id,
            "organization": expected.organization,
            "role_title": expected.role_title,
            "included_in_quantitative_analysis": expected.included_in_quantitative_analysis,
            "expected_salary_min": expected_min,
            "expected_salary_max": expected_max,
            "manifest_status": source.get("current_status", "manifest_row_missing"),
            "local_path": local_path,
            "canonical_url": source.get("canonical_url", ""),
            "fallback_url_1": source.get("fallback_url_1", ""),
            "fallback_url_2": source.get("fallback_url_2", ""),
        }
        if path is None or not path.is_file():
            rows.append({**base, "audit_status": "source_missing"})
            continue

        visible, raw = source_text(path)
        org_match, role_match = identity_match(visible + " " + raw, expected.organization, expected.role_title)
        amounts = annual_amounts(visible + " " + raw)
        minimum_match = expected_min is None or expected_min in amounts
        maximum_match = expected_max is None or expected_max in amounts
        salary_match = minimum_match and maximum_match
        if not org_match or not role_match:
            status = "wrong_or_incomplete_source"
        elif not salary_match:
            status = "salary_discrepancy_or_unverifiable"
        else:
            status = "verified"
        rows.append({
            **base,
            "extractable_text_characters": len(visible),
            "organization_match": org_match,
            "role_match": role_match,
            "salary_min_match": minimum_match,
            "salary_max_match": maximum_match,
            "salary_values_match": salary_match,
            "matched_salary_min": expected_min if minimum_match else None,
            "matched_salary_max": expected_max if maximum_match else None,
            "audit_status": status,
        })

    audit = pd.DataFrame(rows)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    audit.to_csv(DETAIL_PATH, index=False)
    validated = evidence.merge(
        audit.drop(columns=["organization", "role_title", "included_in_quantitative_analysis"]),
        on="source_id",
        how="left",
        validate="one_to_one",
    )
    validated.to_csv(VALIDATED_PATH, index=False)

    primary = audit[audit.included_in_quantitative_analysis.eq("yes")]
    sensitivity = audit[audit.included_in_quantitative_analysis.eq("sensitivity_only")]
    lines = [
        "# Job-ad compensation extraction audit",
        "",
        "This audit checks each locally preserved posting independently of the analytical normalization pipeline. Identity/title checks and exact salary-endpoint checks include visible text and embedded structured data.",
        "",
        "## Results",
        "",
        f"- Job-ad rows audited: **{len(audit)}**.",
        f"- Rows with a local source: **{int(audit.local_path.ne('').sum())}**.",
        f"- Rows whose organization, role, and salary values verify: **{int(audit.audit_status.eq('verified').sum())}**.",
        f"- Primary quantitative rows verified: **{int(primary.audit_status.eq('verified').sum())} of {len(primary)}**.",
        f"- Sensitivity-only rows verified: **{int(sensitivity.audit_status.eq('verified').sum())} of {len(sensitivity)}**.",
        "",
        "## Audit status counts",
        "",
        "| Status | Rows |",
        "|---|---:|",
    ]
    lines.extend(
        f"| {label} | {count} |" for label, count in audit.audit_status.value_counts().items()
    )
    lines.extend([
        "",
        "A missing or inaccessible source is reported as unverified, not treated as evidence that the recorded range is wrong.",
        "",
    ])
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(REPORT_PATH.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
