#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "deliverables"
MANIFEST_PATH = D / "source_acquisition_manifest.csv"
REPORT_PATH = ROOT / "analysis/source_completeness/source_completeness_validation.txt"
DETAIL_PATH = ROOT / "analysis/source_completeness/source_validation_details.csv"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def metadata_checks(path: Path, row: pd.Series, digest: str, length: int) -> list[dict]:
    if str(row.evidence_stream) in {"frozen_local_input", "documented_search_record"}:
        return []
    meta_path = path.with_suffix(path.suffix + ".metadata.json")
    checks = [{
        "check": "retrieval_metadata_present",
        "passed": meta_path.is_file(),
        "expected": str(meta_path.relative_to(ROOT)),
        "observed": "present" if meta_path.is_file() else "missing",
    }]
    if not meta_path.is_file():
        return checks
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception as exc:
        checks.append({"check": "retrieval_metadata_json", "passed": False, "expected": "valid JSON", "observed": repr(exc)})
        return checks
    checks.extend([
        {"check": "metadata_source_id", "passed": str(meta.get("source_id", "")) == str(row.source_id), "expected": str(row.source_id), "observed": str(meta.get("source_id", ""))},
        {"check": "metadata_local_path", "passed": str(meta.get("local_path", "")) == str(path.relative_to(ROOT)), "expected": str(path.relative_to(ROOT)), "observed": str(meta.get("local_path", ""))},
        {"check": "metadata_byte_length", "passed": int(meta.get("byte_length", -1)) == length, "expected": length, "observed": meta.get("byte_length", "")},
        {"check": "metadata_sha256", "passed": str(meta.get("sha256", "")) == digest, "expected": digest, "observed": str(meta.get("sha256", ""))},
        {"check": "metadata_resolved_url", "passed": bool(str(meta.get("resolved_url", "")).strip()), "expected": "nonblank resolved URL", "observed": str(meta.get("resolved_url", ""))},
        {"check": "metadata_retrieval_timestamp", "passed": bool(str(meta.get("retrieval_timestamp_utc", "")).strip()), "expected": "nonblank UTC retrieval timestamp", "observed": str(meta.get("retrieval_timestamp_utc", ""))},
    ])
    return checks


def lname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def norm_text(v: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(v or "").lower())


def to_int(v: object) -> int | None:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return None
    return int(round(float(s)))


def tag_values(root: ET.Element) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for e in root.iter():
        txt = (e.text or "").strip()
        if txt:
            out.setdefault(lname(e.tag), []).append(txt)
    return out


def first_date(values: dict[str, list[str]], names: list[str]) -> str:
    for n in names:
        if values.get(n):
            return values[n][0]
    return ""


def first_numeric(values: dict[str, list[str]], names: list[str]) -> int | None:
    for n in names:
        for v in values.get(n, []):
            try:
                return int(round(float(v.replace(",", ""))))
            except Exception:
                continue
    return None


def descendant_map(e: ET.Element) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for c in e.iter():
        txt = (c.text or "").strip()
        if txt:
            out.setdefault(lname(c.tag), []).append(txt)
    return out


def person_name(dm: dict[str, list[str]]) -> str:
    for key in ["PersonNm", "PersonName", "NamePerson", "BusinessNameLine1Txt", "BusinessNameLine1"]:
        if dm.get(key):
            return dm[key][0]
    return ""


def find_part_vii_record(root: ET.Element, target_name: str) -> tuple[dict[str, list[str]] | None, list[str]]:
    target = norm_text(target_name)
    candidates: list[tuple[str, dict[str, list[str]], str]] = []
    for e in root.iter():
        n = lname(e.tag)
        if n not in {
            "Form990PartVIISectionAGrp", "Form990PartVIISectionA",
            "OfficerDirectorTrusteeKeyEmplGrp", "CompensationInformationGrp",
        }:
            continue
        dm = descendant_map(e)
        nm = person_name(dm)
        if nm:
            candidates.append((norm_text(nm), dm, nm))
    # exact normalized match first, then surname + first initial containment.
    for nn, dm, _ in candidates:
        if target and nn == target:
            return dm, [x[2] for x in candidates]
    if target:
        target_parts = re.findall(r"[a-z0-9]+", str(target_name).lower())
        last = target_parts[-1] if target_parts else ""
        first = target_parts[0] if target_parts else ""
        matches = []
        for nn, dm, display in candidates:
            if last and last in nn and (not first or nn.startswith(first[:1])):
                matches.append((dm, display))
        if len(matches) == 1:
            return matches[0][0], [x[2] for x in candidates]
    return None, [x[2] for x in candidates]


def find_schedule_j_record(root: ET.Element, target_name: str) -> tuple[dict[str, list[str]] | None, list[str]]:
    target = norm_text(target_name)
    candidates: list[tuple[str, dict[str, list[str]], str]] = []
    for e in root.iter():
        if lname(e.tag) not in {
            "RltdOrgOfficerTrstKeyEmplGrp", "Form990ScheduleJPartIIGrp",
            "ScheduleJPartIIGrp",
        }:
            continue
        dm = descendant_map(e)
        nm = person_name(dm)
        if nm:
            candidates.append((norm_text(nm), dm, nm))
    for normalized, dm, _ in candidates:
        if target and normalized == target:
            return dm, [x[2] for x in candidates]
    if target:
        parts = re.findall(r"[a-z0-9]+", str(target_name).lower())
        first = parts[0] if parts else ""
        last = parts[-1] if parts else ""
        matches = [
            (dm, display)
            for normalized, dm, display in candidates
            if last and last in normalized and (not first or normalized.startswith(first[:1]))
        ]
        if len(matches) == 1:
            return matches[0][0], [x[2] for x in candidates]
    return None, [x[2] for x in candidates]


def amount_from_record(dm: dict[str, list[str]], names: list[str]) -> int | None:
    for n in names:
        for v in dm.get(n, []):
            try:
                return int(round(float(v.replace(",", ""))))
            except Exception:
                continue
    return None


def validate_990(path: Path, expected: pd.Series) -> list[dict]:
    checks: list[dict] = []
    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except Exception as e:
        return [{"check": "well_formed_xml", "passed": False, "expected": "valid XML", "observed": repr(e)}]
    checks.append({"check": "well_formed_xml", "passed": True, "expected": "valid XML", "observed": lname(root.tag)})
    vals = tag_values(root)

    ein_obs = ""
    for key in ["EIN", "EmployerIdentificationNumber"]:
        if vals.get(key):
            ein_obs = vals[key][0]
            break
    checks.append({
        "check": "ein",
        "passed": norm_text(ein_obs) == norm_text(expected.ein),
        "expected": str(expected.ein),
        "observed": ein_obs,
    })

    end_obs = first_date(vals, ["TaxPeriodEndDt", "TaxPeriodEndDate"])
    checks.append({
        "check": "tax_period_end",
        "passed": end_obs[:10] == str(expected.tax_period_end)[:10],
        "expected": str(expected.tax_period_end),
        "observed": end_obs,
    })

    revenue_obs = first_numeric(vals, [
        "CYTotalRevenueAmt", "TotalRevenueCurrentYear", "TotalRevenueAmt",
        "TotalRevenue", "TotalRevAndSupportAmt",
    ])
    expenses_obs = first_numeric(vals, [
        "CYTotalExpensesAmt", "TotalExpensesCurrentYear", "TotalExpensesAmt",
        "TotalExpenses", "TotalFunctionalExpensesAmt",
    ])
    rev_exp = to_int(expected.revenue)
    exp_exp = to_int(expected.expenses)
    checks.append({"check": "revenue", "passed": revenue_obs == rev_exp, "expected": rev_exp, "observed": revenue_obs})
    checks.append({"check": "expenses", "passed": expenses_obs == exp_exp, "expected": exp_exp, "observed": expenses_obs})

    emp_exp = to_int(expected.employee_count)
    if emp_exp is not None:
        emp_obs = first_numeric(vals, ["TotalEmployeeCnt", "TotalEmployeesCnt", "EmployeeCnt"])
        checks.append({"check": "employee_count", "passed": emp_obs == emp_exp, "expected": emp_exp, "observed": emp_obs})

    ceo_name = "" if pd.isna(expected.ceo_name) else str(expected.ceo_name).strip()
    org_exp = to_int(expected.part_vii_org)
    rel_exp = to_int(expected.part_vii_related)
    oth_exp = to_int(expected.part_vii_other)
    if ceo_name and org_exp is not None:
        dm, names = find_part_vii_record(root, ceo_name)
        checks.append({
            "check": "ceo_record_found",
            "passed": dm is not None,
            "expected": ceo_name,
            "observed": person_name(dm) if dm else "; ".join(names[:12]),
        })
        if dm is not None:
            title_obs = (dm.get("TitleTxt") or dm.get("Title") or [""])[0]
            title_expected = "" if pd.isna(expected.ceo_title) else str(expected.ceo_title)
            checks.append({
                "check": "ceo_title",
                "passed": bool(title_obs) and (norm_text(title_expected) in norm_text(title_obs) or norm_text(title_obs) in norm_text(title_expected)),
                "expected": title_expected,
                "observed": title_obs,
            })
            org_obs = amount_from_record(dm, ["ReportableCompFromOrgAmt", "ReportableCompFromOrganizationAmt"])
            rel_obs = amount_from_record(dm, ["ReportableCompFromRltdOrgAmt", "ReportableCompFromRelatedOrgAmt"])
            oth_obs = amount_from_record(dm, ["OtherCompensationAmt", "OtherCompensation"])
            checks.append({"check": "part_vii_org", "passed": org_obs == org_exp, "expected": org_exp, "observed": org_obs})
            checks.append({"check": "part_vii_related", "passed": (rel_obs or 0) == (rel_exp or 0), "expected": rel_exp or 0, "observed": rel_obs or 0})
            checks.append({"check": "part_vii_other", "passed": (oth_obs or 0) == (oth_exp or 0), "expected": oth_exp or 0, "observed": oth_obs or 0})
        schedule_expected = to_int(expected.schedule_j_base)
        schedule_dm, _ = find_schedule_j_record(root, ceo_name)
        schedule_observed = None
        if schedule_dm is not None:
            schedule_observed = amount_from_record(
                schedule_dm,
                ["BaseCompensationFilingOrgAmt", "BaseCompensationFilingOrganizationAmt"],
            )
        if schedule_expected is not None or schedule_observed is not None:
            checks.append({
                "check": "schedule_j_base",
                "passed": schedule_observed == schedule_expected,
                "expected": schedule_expected if schedule_expected is not None else "blank",
                "observed": schedule_observed,
            })
    return checks


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
            return "\n".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)
        except Exception:
            return ""
    body = path.read_bytes()
    text = body.decode("utf-8", "ignore")
    if suffix in {".html", ".htm"} or "<html" in text[:3000].lower():
        text = re.sub(r"(?is)<script.*?>.*?</script>|<style.*?>.*?</style>", " ", text)
        text = re.sub(r"(?s)<[^>]+>", " ", text)
        text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def amount_tokens(v: object) -> set[str]:
    i = to_int(v)
    if i is None:
        return set()
    return {
        str(i), f"{i:,}", f"{i // 1000}k", f"{i / 1000:g}k",
    }


def salary_amounts(path: Path, extracted_text: str) -> set[int]:
    """Return annual-dollar amounts found in visible text or embedded page data."""
    searchable = extracted_text
    if path.suffix.lower() not in {".pdf"}:
        searchable += " " + path.read_bytes().decode("utf-8", "ignore")
    searchable = html.unescape(searchable).lower()
    amounts: set[int] = set()
    for match in re.finditer(r"(?<!\d)(\d{2,3})(?:\s*[-–—]\s*|\s+to\s+)(\d{2,3})\s*k\b", searchable):
        amounts.update({int(match.group(1)) * 1000, int(match.group(2)) * 1000})
    for match in re.finditer(r"(?<!\d)(\d{2,3}(?:,\d{3})|\d{5,6})(?!\d)", searchable):
        amounts.add(int(match.group(1).replace(",", "")))
    for match in re.finditer(r"(?<!\d)(\d{2,3})\s*k\b", searchable):
        amounts.add(int(match.group(1)) * 1000)
    return amounts


def validate_job_ad(path: Path, expected: pd.Series) -> list[dict]:
    checks = []
    text = extract_text(path)
    low = text.lower()
    checks.append({"check": "extractable_text", "passed": len(text) >= 100, "expected": ">=100 characters", "observed": len(text)})
    org_words = [w.lower() for w in re.findall(r"[A-Za-z0-9]+", str(expected.organization)) if len(w) >= 4 and w.lower() not in {"foundation", "institute", "center", "association", "national", "international", "organization"}]
    if org_words:
        found = sum(w in low for w in org_words)
        checks.append({"check": "organization_text", "passed": found >= min(2, len(org_words)), "expected": "distinctive organization words", "observed": f"{found}/{len(org_words)}"})
    role = str(expected.role_title or "")
    role_words = [w.lower() for w in re.findall(r"[A-Za-z]+", role) if len(w) >= 3]
    if role_words:
        found = sum(w in low for w in role_words)
        checks.append({"check": "role_title_text", "passed": found >= max(1, len(role_words) // 2), "expected": role, "observed": f"{found}/{len(role_words)} role words"})
    if str(expected.included_in_quantitative_analysis).strip().lower() in {"yes", "sensitivity_only"}:
        observed_amounts = salary_amounts(path, text)
        for label in ["salary_min", "salary_max"]:
            tokens = amount_tokens(expected[label])
            expected_amount = to_int(expected[label])
            passed = expected_amount in observed_amounts
            checks.append({
                "check": label,
                "passed": passed,
                "expected": sorted(tokens),
                "observed": "found" if passed else "not found",
            })
    return checks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-incomplete", action="store_true", help="Write report but exit 0 even if incomplete")
    args = ap.parse_args()

    manifest = pd.read_csv(MANIFEST_PATH, dtype=str).fillna("")
    filings = pd.read_csv(D / "form990_evidence.csv")
    filing_map = filings.set_index("source_id")
    jobs = pd.read_csv(D / "job_ad_evidence.csv")
    job_map = jobs.set_index("source_id")

    detail_rows = []
    required = manifest[manifest.required_for_source_complete_release == "yes"]
    for idx, row in required.iterrows():
        sid = row.source_id
        path_str = row.current_local_path or row.expected_local_path
        path = ROOT / path_str
        base_checks = []
        present = path.exists() and path.is_file()
        base_checks.append({"check": "file_present", "passed": present, "expected": path_str, "observed": "present" if present else "missing"})
        if present:
            length = path.stat().st_size
            minimum = int(float(row.minimum_bytes or 1))
            base_checks.append({"check": "minimum_bytes", "passed": length >= minimum, "expected": minimum, "observed": length})
            digest = sha256(path)
            recorded = row.current_sha256
            base_checks.append({"check": "sha256_recorded_matches", "passed": bool(recorded) and digest == recorded, "expected": recorded or "recorded checksum", "observed": digest})
            base_checks.extend(metadata_checks(path, row, digest, length))
            if row.evidence_stream == "form990" and sid in filing_map.index:
                base_checks.extend(validate_990(path, filing_map.loc[sid]))
            elif row.evidence_stream == "job_ad" and sid in job_map.index:
                base_checks.extend(validate_job_ad(path, job_map.loc[sid]))
        all_pass = all(c["passed"] for c in base_checks)
        for c in base_checks:
            detail_rows.append({
                "source_id": sid,
                "organization": row.organization,
                "evidence_stream": row.evidence_stream,
                "local_path": path_str,
                **c,
            })
        if all_pass:
            verified_label = "present_verified_local" if row.evidence_stream in {"frozen_local_input", "documented_search_record"} else "present_verified_source_native"
            manifest.at[idx, "current_status"] = verified_label
        else:
            manifest.at[idx, "current_status"] = "validation_failed" if present else "missing_source_native"
        if all_pass:
            manifest.at[idx, "current_local_path"] = path_str
            manifest.at[idx, "current_sha256"] = sha256(path)
            manifest.at[idx, "current_byte_length"] = str(path.stat().st_size)

    details = pd.DataFrame(detail_rows)
    DETAIL_PATH.parent.mkdir(parents=True, exist_ok=True)
    details.to_csv(DETAIL_PATH, index=False)
    manifest.to_csv(MANIFEST_PATH, index=False)

    status_counts = manifest[manifest.required_for_source_complete_release == "yes"].current_status.value_counts()
    total = len(required)
    verified = int(status_counts.get("present_verified_source_native", 0) + status_counts.get("present_verified_local", 0))
    missing = total - verified
    failed_checks = details[~details.passed.astype(bool)] if not details.empty else details
    stream_summary = manifest[manifest.required_for_source_complete_release == "yes"].groupby(["evidence_stream", "current_status"]).size()

    lines = [
        "RP CEO SOURCE-COMPLETENESS VALIDATION",
        "=====================================",
        f"Required source records: {total}",
        f"Verified source-native or frozen-local records: {verified}",
        f"Incomplete records: {missing}",
        f"Failed validation checks: {len(failed_checks)}",
        "",
        "STATUS: " + ("PASS - SOURCE-COMPLETE" if missing == 0 and len(failed_checks) == 0 else "FAIL - NOT SOURCE-COMPLETE"),
        "",
        "STATUS BY STREAM",
        stream_summary.to_string(),
        "",
    ]
    if len(failed_checks):
        lines += ["FIRST FAILED CHECKS", failed_checks.head(40).to_string(index=False), ""]
    lines += [
        "Release rule: package_source_complete.py refuses to create a source-complete ZIP unless this validation passes with zero missing records and zero failed checks.",
    ]
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(REPORT_PATH.read_text(encoding="utf-8"))
    ok = missing == 0 and len(failed_checks) == 0
    return 0 if ok or args.allow_incomplete else 2


if __name__ == "__main__":
    raise SystemExit(main())
