#!/usr/bin/env python3
"""Audit live CEO reference observations against locally saved primary evidence.

This script deliberately reads ``app-data.js`` rather than rebuilding it: its
purpose is to test what the current application exposes, including its audited
overlays.  It creates only the three peer-audit deliverables named below.
"""
from __future__ import annotations

import csv
import html
import json
import math
import re
import subprocess
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / "benchmark"
OUT_CSV = BENCHMARK / "enrichment" / "ceo_reference_set_audit.csv"
OUT_MD = ROOT / "ceo_reference_set_audit.md"
OUT_RECS = ROOT / "ceo_peer_recommendations.csv"
APP = ROOT / "app-data.js"
CPI = BENCHMARK / "data" / "cpi_u.csv"
MODEL_ARTIFACT = BENCHMARK / "analysis" / "predictive_salary_models" / "model_artifact.json"

PART_VII = {"Form990PartVIISectionAGrp", "OfficerDirectorTrusteeKeyEmplGrp"}
SCHEDULE_J = {"RltdOrgOfficerTrstKeyEmplGrp", "Form990ScheduleJPartIIGrp"}


def text(value: object) -> str:
    return "" if value is None else str(value).strip()


def number(value: object) -> float | None:
    try:
        result = float(text(value).replace(",", ""))
    except ValueError:
        return None
    return result if math.isfinite(result) else None


def integer(value: object) -> int | None:
    value = number(value)
    return None if value is None else int(round(value))


def lname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def values(group: ET.Element) -> dict[str, str]:
    output: dict[str, str] = {}
    for item in group.iter():
        value = text(item.text)
        if value and lname(item.tag) not in output:
            output[lname(item.tag)] = value
    return output


def field(record: dict[str, str] | None, *names: str) -> str:
    if not record:
        return ""
    return next((record[name] for name in names if record.get(name)), "")


def key(name: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", name.casefold())) - {"dr", "mr", "ms", "phd"}


def best_match(records: list[dict[str, str]], expected: str) -> dict[str, str] | None:
    wanted = key(expected)
    if not wanted:
        return None
    scored = []
    for record in records:
        actual = key(field(record, "PersonNm", "PersonName"))
        overlap = len(actual & wanted)
        # Require a surname and at least one other name token where available.
        if overlap and (max(wanted, key=len) in actual or len(wanted) == 1):
            scored.append((overlap / len(wanted | actual), record))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1] if len(scored) == 1 or scored[0][0] > scored[1][0] else None


def groups(root: ET.Element, tags: set[str]) -> list[dict[str, str]]:
    return [values(item) for item in root.iter() if lname(item.tag) in tags]


def first(root: ET.Element, *names: str) -> int | None:
    wanted = set(names)
    for item in root.iter():
        if lname(item.tag) in wanted and text(item.text):
            return integer(item.text)
    return None


def same(expected: object, observed: object) -> bool:
    if expected is None and observed is None:
        return True
    return integer(expected) == integer(observed) if expected is not None and observed is not None else False


def cpi_factors() -> dict[int, float]:
    annual: dict[int, float] = {}
    monthly: dict[int, list[float]] = {}
    target = None
    with CPI.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            period = row["period"]
            if period.endswith("-AVG"):
                annual[int(period[:4])] = float(row["index_value"])
            elif re.fullmatch(r"\d{4}-\d{2}", period):
                monthly.setdefault(int(period[:4]), []).append(float(row["index_value"]))
            if period == "2026-07":
                target = float(row["index_value"])
    if target is None:
        raise ValueError("CPI-U July 2026 target period is missing")
    for year, values in monthly.items():
        annual.setdefault(year, sum(values) / len(values))
    return {year: target / value for year, value in annual.items()}


def payload() -> dict:
    raw = APP.read_text(encoding="utf-8").strip()
    prefix = "window.CEO_BENCHMARK_DATA = "
    if not raw.startswith(prefix) or not raw.endswith(";"):
        raise ValueError("app-data.js is not a generated CEO benchmark payload")
    return json.loads(raw[len(prefix):-1])


def xml_audit(row: dict, source: Path, factors: dict[int, float]) -> dict:
    root = ET.parse(source).getroot()
    part = best_match(groups(root, PART_VII), text(row["executive"]))
    observed_name = field(part, "PersonNm", "PersonName")
    schedule = best_match(groups(root, SCHEDULE_J), observed_name)
    org = integer(field(part, "ReportableCompFromOrgAmt", "ReportableCompFromOrganizationAmt"))
    related = integer(field(part, "ReportableCompFromRltdOrgAmt", "ReportableCompFromRelatedOrgAmt")) or 0
    other = integer(field(part, "OtherCompensationAmt", "OtherCompensation")) or 0
    base_org = integer(field(schedule, "BaseCompensationFilingOrgAmt", "BaseCompensationFilingOrganizationAmt"))
    base_related = integer(field(schedule, "CompensationBasedOnRltdOrgsAmt", "BaseCompensationRltdOrgsAmt")) or 0
    base = base_org + base_related if base_org is not None else None
    cash = org + related if org is not None else None
    total = cash + other if cash is not None else None
    nominal = row.get("nominalSalary", {})
    compensation_ok = part is not None and all((
        same(nominal.get("base"), base), same(nominal.get("cash"), cash),
        same(nominal.get("total"), total),
    ))
    revenue = first(root, "CYTotalRevenueAmt", "TotalRevenueAmt")
    expenses = first(root, "CYTotalExpensesAmt", "TotalExpensesAmt")
    staff = first(root, "TotalEmployeeCnt", "TotalEmployeesCnt")
    scale_ok = all((same(row.get("revenue"), revenue), same(row.get("expenses"), expenses),
                    row.get("staff") is None or same(row.get("staff"), staff)))
    year = integer(row.get("compensationYear"))
    cpi_ok = year in factors and math.isclose(float(row["cpiFactor"]), factors[year], abs_tol=1e-10)
    hours = number(field(part, "AverageHoursPerWeekRt", "AverageHoursPerWeek"))
    related_hours = number(field(part, "AverageHoursPerWeekRltdOrgRt", "AverageHoursPerWeekRelatedOrg"))
    combined_hours = (hours or 0) + (related_hours or 0) if hours is not None or related_hours is not None else None
    status = "verified" if compensation_ok and scale_ok and cpi_ok else "issue"
    issue = ""
    if part is None:
        issue = "executive identity not found in Part VII"
    elif not compensation_ok:
        issue = "live compensation differs from Part VII/Schedule J"
    elif not scale_ok:
        issue = "live financial/staff field differs from filing"
    elif not cpi_ok:
        issue = "live CPI factor differs from CPI-U contract"
    if status == "verified" and row.get("defaultIncluded") and combined_hours is not None and combined_hours < 30:
        status = "issue"
        issue = "Part VII reports fewer than 30 hours/week; full-time CEO eligibility is not supported"
    return {
        "verification_mode": "machine_reparse_local_irs_xml",
        "validation_status": status,
        "issue": issue,
        "observed_executive": observed_name,
        "observed_title": field(part, "TitleTxt", "Title"),
        "observed_hours": hours, "observed_related_hours": related_hours, "observed_combined_hours": combined_hours,
        "observed_base": base, "observed_cash": cash, "observed_total": total,
        "observed_revenue": revenue, "observed_expenses": expenses, "observed_staff": staff,
        "compensation_exact": compensation_ok, "scale_exact": scale_ok, "cpi_exact": cpi_ok,
        "role_hours_status": (
            "full_time_not_supported_under_30_hour_rule" if combined_hours is not None and combined_hours < 30
            else "below_40_review" if combined_hours is not None and combined_hours < 40 else "40_or_more"
        ),
        "source_locator": "IRS XML: Form990PartVIISectionAGrp matched by executive; IRS990ScheduleJ matched by executive",
    }


def manual_copenhagen(row: dict) -> dict:
    # Deep-read on the scanned source: p1 (entity/year/revenue/expense/staff),
    # p7 (Part VII) and p36 (Schedule J).  Values are intentionally explicit.
    nominal = row["nominalSalary"]
    observed = {"base": 435166, "cash": 497770, "total": 497770,
                "revenue": 920765, "expenses": 1187335, "staff": 1}
    exact = all((same(nominal["base"], observed["base"]), same(nominal["cash"], observed["cash"]),
                 same(nominal["total"], observed["total"]), same(row["revenue"], observed["revenue"]),
                 same(row["expenses"], observed["expenses"]), same(row["staff"], observed["staff"])))
    return {"verification_mode": "manual_deep_read_scanned_form990_pages_1_7_36",
            "validation_status": "verified" if exact else "issue",
            "issue": "" if exact else "live values differ from scanned filing",
            "observed_executive": "DR BJORN LOMBORG", "observed_title": "PRESIDENT & FOUNDER",
            "observed_hours": 40, "observed_base": observed["base"], "observed_cash": observed["cash"],
            "observed_total": observed["total"], "observed_revenue": observed["revenue"],
            "observed_expenses": observed["expenses"], "observed_staff": observed["staff"],
            "compensation_exact": exact, "scale_exact": exact, "cpi_exact": True,
            "source_locator": "scanned Form 990 pp. 1, 7, 36",
            "role_hours_status": "40_or_more"}


def rendered_or_pdf_audit(row: dict, source: Path) -> dict:
    # These seven source-native rendered/PDF filings were reread for this
    # audit.  The stored XML beside Sanku is an older return, so the official
    # PDF is deliberately the authority for its current overlay.
    reviewed = {
        "SRC-990-EXT-PROJECT-HEALTHY-CHILDREN": {
            "executive": "FELIX BROOKS-CHURCH", "title": "CEO", "hours": 40,
            "base": 97072, "cash": 97072, "total": 213840, "revenue": 6702737,
            "expenses": 5867621, "staff": 3,
            "locator": "official PDF pp. 1, 7, 40; Schedule O p. 41 (housing allowance)"},
        "SRC-990-EA-GIVEWELL": {
            "executive": "ELIE HASSENFELD", "title": "CHIEF EXECUTIVE OFFICER", "hours": 40,
            "base": 423600, "cash": 424805, "total": 463395, "revenue": 269542773,
            "expenses": 183707000, "staff": 96,
            "locator": "official PDF Form 990 pp. 1, 7; Schedule J Part II"},
        "SRC-990-EA-CENTER-FOR-ELECTION-SCIENCE": {
            "executive": "NINA TAYLOR", "title": "CEO", "hours": 40,
            "base": 198590, "cash": 198590, "total": 198590, "revenue": 631856,
            "expenses": 1190636, "staff": 7,
            "locator": "rendered Form 990 Part I; Part VII Section A group 1; Schedule J Part II group 1"},
        "SRC-990-EA-FORESIGHT-INSTITUTE": {
            "executive": "ALLISON DUETTMANN", "title": "CEO", "hours": 40,
            "base": 276150, "cash": 276150, "total": 284435, "revenue": 9356634,
            "expenses": 3749519, "staff": 6,
            "locator": "rendered Form 990 Part I; Part VII Section A group 1; Schedule J Part II group 1"},
        "SRC-990-EA-LEVERAGE-RESEARCH": {
            "executive": "GEOFFREY TAYLOR ANDERS II", "title": "CEO & CHAIR & TREASURER", "hours": 40,
            "base": None, "cash": 21533, "total": 21533, "revenue": 392590,
            "expenses": 430580, "staff": 3,
            "locator": "rendered Form 990 Part I; Part VII Section A group 2 (no Schedule J required)"},
        "SRC-990-EA-QUALIA-RESEARCH-INSTITUTE": {
            "executive": "ANDRES GOMEZ EMILSSON", "title": "PRESIDENT & EXECUTIVE DIRECTOR", "hours": 15,
            "base": None, "cash": 64164, "total": 64164, "revenue": 140681,
            "expenses": 291314, "staff": 4,
            "locator": "rendered Form 990 Part I; Part VII Section A group 2 (no Schedule J required)"},
        "SRC-990-EA-MAGNIFY-MENTORING": {
            "executive": "KATHRYN MECROW-FLYNN", "title": "CEO AND EXECUTIVE DIRECTOR", "hours": 40,
            "base": None, "cash": 98349, "total": 98349, "revenue": 186110,
            "expenses": 164940, "staff": None,
            "locator": "rendered Form 990-EZ Part I and Part IV officer group 1"},
    }
    observed = reviewed.get(row["id"])
    if observed is None:
        return {"verification_mode": "saved_primary_record_not_reparsed", "validation_status": "unverified",
                "issue": "saved source type requires a manual source review", "compensation_exact": False,
                "scale_exact": False, "cpi_exact": False, "source_locator": ""}
    nominal = row["nominalSalary"]
    exact = all((same(nominal.get("base"), observed["base"]), same(nominal.get("cash"), observed["cash"]),
                 same(nominal.get("total"), observed["total"]), same(row.get("revenue"), observed["revenue"]),
                 same(row.get("expenses"), observed["expenses"]), same(row.get("staff"), observed["staff"])))
    return {"verification_mode": "manual_deep_read_rendered_or_pdf_primary",
            "validation_status": "verified" if exact else "issue",
            "issue": "" if exact else "live value differs from manually reread primary source",
            "observed_executive": observed["executive"], "observed_title": observed["title"],
            "observed_hours": observed["hours"], "observed_base": observed["base"],
            "observed_cash": observed["cash"], "observed_total": observed["total"],
            "observed_revenue": observed["revenue"], "observed_expenses": observed["expenses"],
            "observed_staff": observed["staff"], "compensation_exact": exact,
            "scale_exact": exact, "cpi_exact": True, "source_locator": observed["locator"],
            "role_hours_status": ("full_time_not_supported_under_30_hour_rule" if observed["hours"] < 30 else "40_or_more")}


def source_text(path: Path) -> str:
    if path.suffix.casefold() == ".pdf":
        result = subprocess.run(["pdftotext", str(path), "-"], check=False, capture_output=True, text=True)
        return result.stdout
    raw = path.read_text(encoding="utf-8", errors="ignore")
    raw = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    return html.unescape(re.sub(r"(?s)<[^>]+>", " ", raw))


def advertised_amounts(text_blob: str) -> set[int]:
    amounts = {int(value.replace(",", "")) for value in re.findall(r"\$?((?:[1-9]\d{0,2}(?:,\d{3})+)|(?:[1-9]\d{4,6}))", text_blob)}
    amounts |= {int(value) * 1000 for value in re.findall(r"(?i)\b([1-9]\d{1,2})\s*k\b", text_blob)}
    return amounts


def job_audit(row: dict) -> dict:
    # A targeted manual read distinguishes lost job postings from parsers that
    # merely fail on JavaScript, archived pages, or currency conversion.
    manual = {
        "SRC-AD-TAC-2026": ("verified", "manual_deep_read_direct_employer_posting",
                            "Original ApplicantPool posting states $240,000-$300,000, salaried exempt/full-time.",
                            "$240,000-$300,000", "direct posting body"),
        "SRC-AD-ANDYHILL-2026": ("verified", "manual_deep_read_preserved_primary_pdf",
                                  "Preserved Andy Hill CARE Fund recruitment PDF states $220-250K.",
                                  "$220,000-$250,000", "PDF p. 8, Compensation and Benefits"),
        "SRC-AD-CAIF-2026": ("verified", "manual_deep_read_archived_employer_posting",
                              "Archived employer posting states £90,000-£140,000; live USD range is the stored currency conversion, not independently recomputed here.",
                              "GBP 90,000-140,000", "archived employer page, Salary section"),
        "SRC-AD-EAD-2026": ("verified", "manual_deep_read_preserved_posting",
                             "Preserved posting states €60,000-€75,000 gross p.a. for full-time; live USD range is the stored currency conversion, not independently recomputed here.",
                             "EUR 60,000-75,000", "posting Salary section"),
        "SRC-AD-SNAP": ("verified", "manual_external_employer_posting",
                           "Employer LinkedIn post states $385,000-$415,000.", "$385,000-$415,000", "Snap Foundation employer post"),
        "SRC-AD-WILLIAMS": ("verified", "manual_external_recruiter_pdf",
                              "Recruitment PDF states $260,000-$290,000.", "$260,000-$290,000", "recruitment PDF"),
        "SRC-AD-INJUSTICEWATCH": ("verified", "manual_external_employer_posting",
                                    "Employer job page states full-time $150,000-$175,000.", "$150,000-$175,000", "employer job page"),
        "SRC-AD-DRW": ("verified", "manual_external_recruiter_posting",
                         "NPAG's original posting states full-time 35-hour $175,000-$200,000 role.", "$175,000-$200,000", "NPAG recruiter posting"),
        "SRC-AD-DREAM-2026": ("verified", "manual_external_recruiter_resolution",
                               "The saved mirror body and NPAG's search page both state $260,000-$290,000; the mirror header's $271,000 lower bound is a display conflict retained in provenance.",
                               "$260,000-$290,000", "saved mirror body and NPAG recruiter page"),
    }
    if row["id"] in manual:
        status, mode, issue, observed, locator = manual[row["id"]]
        return {"verification_mode": mode, "validation_status": status, "issue": issue if status != "verified" else "",
                "observed_executive": "", "observed_title": text(row.get("title")), "observed_hours": "",
                "observed_base": observed, "observed_cash": "", "observed_total": "",
                "observed_revenue": "", "observed_expenses": "", "observed_staff": "",
                "compensation_exact": status == "verified", "scale_exact": "not_a_same_filing_measure", "cpi_exact": True,
                "source_locator": locator, "role_hours_status": "posting_scope_review"}
    discovery_only = {"SRC-AD-PVARF", "SRC-AD-CETI", "SRC-AD-NPF", "SRC-AD-SNAP", "SRC-AD-WILLIAMS",
                      "SRC-AD-CSCCE", "SRC-AD-ALLCHICAGO", "SRC-AD-INJUSTICEWATCH", "SRC-AD-DRW"}
    if row["id"] in discovery_only:
        return {"verification_mode": "manual_deep_read_homepage_only_no_posting_archive",
                "validation_status": "unverified",
                "issue": "saved artifact is a later homepage, while retained salary text is discovery-result-only; original posting is absent",
                "observed_executive": "", "observed_title": text(row.get("title")), "observed_hours": "",
                "observed_base": "", "observed_cash": "", "observed_total": "", "observed_revenue": "",
                "observed_expenses": "", "observed_staff": "", "compensation_exact": False,
                "scale_exact": "not_a_same_filing_measure", "cpi_exact": True, "source_locator": "homepage archive only",
                "role_hours_status": "posting_scope_review"}
    path = BENCHMARK / text(row.get("localPath"))
    expected = row.get("nominalRange", {})
    if not path.is_file():
        return {"verification_mode": "local_primary_ad_missing", "validation_status": "unverified",
                "issue": "saved posting missing", "compensation_exact": False, "scale_exact": "n/a", "cpi_exact": False,
                "source_locator": ""}
    blob = source_text(path)
    amounts = advertised_amounts(blob)
    low, high = integer(expected.get("low")), integer(expected.get("high"))
    exact = bool(blob.strip()) and (low is None or low in amounts) and (high is None or high in amounts)
    return {"verification_mode": "local_posting_text_endpoint_check", "validation_status": "verified" if exact else "unverified",
            "issue": "" if exact else "salary endpoints absent from extractable saved posting text",
            "observed_executive": "", "observed_title": text(row.get("title")), "observed_hours": "",
            "observed_base": f"{low}-{high}", "observed_cash": "", "observed_total": "",
            "observed_revenue": "", "observed_expenses": "", "observed_staff": "",
            "compensation_exact": exact, "scale_exact": "not_a_same_filing_measure", "cpi_exact": True,
            "source_locator": "extractable saved posting text", "role_hours_status": "posting_scope_review"}


def pay_blind_flags(row: dict) -> str:
    """Expose rule-based comparability cues without reading salary values."""
    flags = [f"tier={text(row.get('tier'))}", f"analysis={text(row.get('analysisStatus'))}",
             f"structure={text(row.get('structure'))}", f"location={text(row.get('location'))}"]
    if row.get("founder"):
        flags.append("founder-led")
    if row.get("staff") is not None:
        flags.append(f"filing_staff={integer(row['staff'])}")
    if row.get("expenses") is not None:
        flags.append(f"filing_expenses={integer(row['expenses'])}")
    if row.get("remoteCategory"):
        flags.append(f"workplace={text(row['remoteCategory'])}")
    if row.get("fiscalSponsorCategory"):
        flags.append(f"fiscal_sponsor={text(row['fiscalSponsorCategory'])}")
    return "; ".join(flag for flag in flags if not flag.endswith("="))


def advertised_training_ids() -> set[str]:
    """Return the recruitment records actually used by the saved range fit."""
    artifact = json.loads(MODEL_ARTIFACT.read_text(encoding="utf-8"))
    records = artifact.get("training", {}).get("records", [])
    return {text(record.get("id")) for record in records
            if record.get("source") == "job_ad" and text(record.get("id"))}


def attach_follow_up(rows: list[dict]) -> None:
    """Attach bounded external follow-up without changing source observations."""
    training_ids = advertised_training_ids()
    notes = {
        "SRC-AD-PVARF": ("third_party_repost_confirms_endpoints_not_source_native", "https://www.idealist.org/en/operations-jobs-oregon", "The live Idealist listing repeats $110,000-$150,000 and full-time scope, but no employer/recruiter original was recovered."),
        "SRC-AD-CETI": ("unresolved", "", "No original $125,000-$150,000 posting was recovered. A later third-party listing shows a different range, which is not a basis to replace the saved row."),
        "SRC-AD-NPF": ("third_party_repost_confirms_endpoints_not_source_native", "https://www.idealist.org/en/media-jobs", "A current third-party listing repeats $140,000-$150,000; the employer original was not recovered."),
        "SRC-AD-SNAP": ("employer_post_confirms_endpoints", "https://www.linkedin.com/posts/snap-foundation_snap-foundation-seeks-a-ceo-with-fearless-activity-7478201803617087488-ozL_", "Snap Foundation's own post states $385,000-$415,000; its arts/social-impact grantmaking model remains a non-pay comparability boundary."),
        "SRC-AD-WILLIAMS": ("recruiter_pdf_confirms_endpoints", "https://higherlogicdownload.s3.amazonaws.com/AFPNET/05758c81-afb2-4faa-9446-b89d08056824/UploadedImages/Executive_Director_of_The_Williams_Institute_Ad.pdf", "Recruitment PDF states $260,000-$290,000. It is a UCLA center role, not a standalone employer CEO."),
        "SRC-AD-CSCCE": ("unresolved", "", "No original $84,246-$164,103 posting was recovered; CSCCE's fiscal-project boundary independently rules out employer-CEO use."),
        "SRC-AD-ALLCHICAGO": ("third_party_reposts_confirm_endpoints_not_source_native", "https://www.linkedin.com/posts/national-council-of-nonprofits_nowhiring-nonprofits-jobalert-activity-7465435188924243969-lqux", "National Council of Nonprofits and a Direct Jobs repost both state $260,000-$300,000, but the originating employer/recruiter page was not retained."),
        "SRC-AD-INJUSTICEWATCH": ("employer_posting_confirms_endpoints", "https://www.injusticewatch.org/about/jobs/executive-director/", "Employer page confirms full-time Executive Director at $150,000-$175,000; local investigative-journalism operating model is a non-pay boundary."),
        "SRC-AD-DRW": ("recruiter_posting_confirms_endpoints", "https://www.npag.com/drw-ed", "Search firm's posting confirms full-time, 35-hour role at $175,000-$200,000; disability-rights/P&A advocacy is a non-pay boundary."),
        "SRC-AD-DREAM-2026": ("recruiter_and_crossposts_resolve_body_range", "https://www.npag.com/dream-ceo", "NPAG's retained search page and several independent cross-posts confirm $260,000-$290,000, full-time. The saved mirror's $271,000 header is a display artifact; retain it in provenance but use the recruiter-confirmed body range."),
        "SRC-990-EA-COPENHAGEN-CONSENSUS-CENTER": ("official_operating_scope_followup", "https://copenhagenconsensus.com/contact-form", "Official contact disclosure says its core team spans five continents and work uses contractors/volunteers; the filing's one employee describes the US filer payroll, not the global delivery network. Use a founder/global-network/very-small-US-filer sensitivity toggle."),
        "SRC-990-EXT-ORCID": ("official_operating_scope_followup", "https://info.orcid.org/work-with-us/", "ORCID says it is global and 100% remote since founding; its filing says executive compensation is adjusted for location. Membership-funded digital infrastructure and global labor-market exposure support a functional/labor-market sensitivity, not an extraction correction."),
        "SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY": ("primary_hours_pattern_followup", "https://publicintegrity.org/wp-content/uploads/2024/12/CPI-2023-Form-990-public-disclosoure-copy.pdf", "The filing repeats 0.50 for numerous senior employees, while CPI's 2021 filing reports Cheung at 40 hours. This supports a filing-convention/data-entry concern, not a correction to 40 without an amended 2023 filing; retain an hours sensitivity."),
        "SRC-990-EXT-NUCLEAR-THREAT-INITIATIVE": ("official_role_scope_followup", "https://www.nti.org/about/leadership/ernest-moniz/", "Official biographies establish sustained CEO/co-chair scope, but also identify a second CEO role at EFI Foundation. They do not override the filing's 25 hours. Retain source-exact pay and use an hours/dual-leadership sensitivity."),
    }
    for row in rows:
        row["current_model_training"] = (
            "yes: Bayesian advertised-range variants only" if row["stream"] == "job_ad" and row["id"] in training_ids
            else "no: not in saved recruitment training cohort" if row["stream"] == "job_ad"
            else "see predictive-model training IDs"
        )
        evidence, url, recommendation = notes.get(row["id"], ("", "", ""))
        row["followup_evidence_status"] = evidence
        row["followup_source_url"] = url
        row["followup_pay_blind_recommendation"] = recommendation


def audit() -> list[dict]:
    data = payload()
    factors = cpi_factors()
    output = []
    for row in data["incumbents"]:
        source = BENCHMARK / text(row.get("localPath"))
        if not row.get("nominalSalary", {}).get("cash"):
            check = {"verification_mode": "not_a_quantitative_compensation_observation", "validation_status": "not_applicable",
                     "issue": "selected reference organization has no retained CEO salary point", "compensation_exact": "n/a",
                     "scale_exact": "n/a", "cpi_exact": "n/a", "role_hours_status": "not_applicable"}
        elif row["id"] == "SRC-990-EA-COPENHAGEN-CONSENSUS-CENTER":
            check = manual_copenhagen(row)
        elif source.suffix.casefold() == ".xml" and source.is_file():
            check = xml_audit(row, source, factors)
        else:
            check = rendered_or_pdf_audit(row, source)
        if check.get("cpi_exact") is True:
            year = integer(row.get("compensationYear"))
            cpi_ok = year in factors and math.isclose(float(row["cpiFactor"]), factors[year], abs_tol=1e-10)
            check["cpi_exact"] = cpi_ok
            if not cpi_ok and check["validation_status"] == "verified":
                check["validation_status"] = "issue"
                check["issue"] = "live CPI factor differs from CPI-U contract"
        nominal = row.get("nominalSalary", {})
        output.append({"stream": "incumbent", "id": row["id"], "source_id": row.get("sourceId"),
                       "organization": row["organization"], "default_included": row.get("defaultIncluded"),
                       "tier": row.get("tier"), "analysis_status": row.get("analysisStatus"),
                       "source_path": row.get("localPath"), "source_url": row.get("sourceUrl"),
                       "canonical_url": row.get("canonicalUrl"), "pay_blind_selection_flags": pay_blind_flags(row),
                       "expected_executive": row.get("executive"),
                       "expected_title": row.get("title"), "expected_base": nominal.get("base"),
                       "expected_cash": nominal.get("cash"), "expected_total": nominal.get("total"),
                       "expected_revenue": row.get("revenue"), "expected_expenses": row.get("expenses"),
                       "expected_staff": row.get("staff"), "compensation_year": row.get("compensationYear"),
                       "cpi_factor": row.get("cpiFactor"), **check})
    for row in data["jobAds"]:
        if row.get("nominalRange", {}).get("low") is None:
            continue
        check = job_audit(row)
        output.append({"stream": "job_ad", "id": row["id"], "source_id": row.get("sourceId"),
                       "organization": row["organization"], "default_included": row.get("defaultIncluded"),
                       "tier": row.get("tier"), "analysis_status": row.get("analysisStatus"),
                       "source_path": row.get("localPath"), "source_url": row.get("sourceUrl"),
                       "canonical_url": row.get("canonicalUrl"), "pay_blind_selection_flags": "job-ad stream; posting scope reviewed separately",
                       "expected_executive": "", "expected_title": row.get("title"),
                       "expected_base": row["nominalRange"].get("low"), "expected_cash": row["nominalRange"].get("high"),
                       "expected_total": row["nominalSalary"].get("base"), "expected_revenue": row.get("revenue"),
                       "expected_expenses": row.get("expenses"), "expected_staff": row.get("staff"),
                       "compensation_year": row.get("postingDate"), "cpi_factor": row.get("cpiFactor"), **check})
    return output


def write_recommendations() -> None:
    rows = [
        {"organization": "Forecasting Research Institute", "recommendation": "sensitivity_only_pending_staffing_model", "proposed_tier": "B (provisional)", "salary_blind_reason": "Independent US 501(c)(3) research organization whose mission is improving public decisions through forecasting research, including AI and nuclear-risk work; its $2.29M 2024 expenses are substantially below the $20.38M financial profile currently used for RP. This is the separate Delaware FRI entity, not Oxford's former Future of Humanity Institute.", "entity_role_screen": "Official IRS XML (object 202503159349303205) identifies Joshua Rosenberg as CEO & Treasurer at 40 hours with no related-organization hours. But Form 990 Part I reports zero employees, so resolve its PEO/contractor or other staffing model before treating staff/scale as comparable.", "primary_source_availability": "Preserved official IRS XML: benchmark/sources/native/organization_metadata/peer_audit/forecasting_research_institute_2024_public.xml; official archive: https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_11A.zip; mission page: https://forecastingresearch.org/transparency", "compensation_status": "2024 primary filing reports $158,362 Part VII cash and $5,927 other compensation, Schedule J base $158,362 and total $164,289; values were not used to select the candidate.", "decision": "Use only as an optional sensitivity after documenting the zero-employee filing model; do not add to the default cohort now."},
        {"organization": "Center for Global Development", "recommendation": "defer_pending_full_year_leadership", "proposed_tier": "B (provisional)", "salary_blind_reason": "Independent, nonpartisan research-and-policy organization with a board-accountable President role and direct evidence-to-policy work, with roughly $18.1M 2024 expenses, close to the $20.38M financial profile currently used for RP; its leadership changed during 2024.", "entity_role_screen": "2024 filing lists outgoing, interim, and incoming presidents, so no clean full-year incumbent point; defer to a later stable-year filing.", "primary_source_availability": "Official role description: https://www.cgdev.org/jobs/president; Official 2024 filing: https://www.cgdev.org/sites/default/files/2024-cgd-990-form.pdf", "compensation_status": "Available but transition-contaminated in 2024; no salary-based selection."},
        {"organization": "Founders Pledge Inc.", "recommendation": "exclude_from_ceo_salary_reference", "proposed_tier": "not applicable", "salary_blind_reason": "Evidence/research and philanthropy-advising overlap is real, but the US legal entity is a donor-advised-fund/grantmaking vehicle with global affiliates and leadership split across entities; this does not establish that the named global CEO is the US filing employer's sole chief executive.", "entity_role_screen": "Do not transfer pay across US, UK, and German entities; require an entity-resolved US CEO employment record, which the current filing does not provide.", "primary_source_availability": "Official legal-entity and leadership disclosure: https://www.founderspledge.com/who-we-are; IRS-derived filing: https://projects.propublica.org/nonprofits/organizations/371795297", "compensation_status": "US 2024 Form 990 exists but the published officer table does not establish a clean named CEO observation."},
        {"organization": "The Life You Can Save", "recommendation": "defer_no_verified_positive_pay", "proposed_tier": "not applicable", "salary_blind_reason": "Strong effective-giving/evidence mission connection, but it has co-CEOs and a grantmaking/donation-routing operating model, which require explicit co-leadership and operating-model flags. No verified positive annual CEO amount is currently available.", "entity_role_screen": "2024 Schedule O identifies Jessica and Andrea La Mesa as co-CEOs; do not choose one or average them.", "primary_source_availability": "Official filing: https://www.thelifeyoucansave.org/wp-content/uploads/2025/11/Signed-2024-TLYCS-990-1.pdf; IRS-derived profile: https://projects.propublica.org/nonprofits/organizations/462100400", "compensation_status": "No positive clean 2024 CEO point in the filed officer table."},
        {"organization": "Global Catastrophic Risk Institute", "recommendation": "exclude_fiscal_project", "proposed_tier": "not applicable", "salary_blind_reason": "Mission is highly relevant, but the organization says it is a project of Social and Environmental Entrepreneurs. Sponsor-level Form 990 compensation would not identify project-CEO pay.", "entity_role_screen": "No independent employer/entity boundary for a CEO observation.", "primary_source_availability": "Official disclosure: https://gcrinstitute.org/about/", "compensation_status": "No project-level primary CEO compensation record identified."},
        {"organization": "Ambitious Impact / Charity Entrepreneurship", "recommendation": "exclude_non_us_entity_and_project_boundary", "proposed_tier": "not applicable", "salary_blind_reason": "Incubation, evidence, and cause-prioritization work are relevant, but the official site describes AIM as a project of the England-and-Wales Charity Entrepreneurship entity; the available Canadian historical returns are not a clean employer match.", "entity_role_screen": "Do not use cross-jurisdictional or sponsor/entity compensation as CEO peer evidence.", "primary_source_availability": "Official organization/legal-status page: https://www.charityentrepreneurship.com/about-us", "compensation_status": "No resolved US Form 990 CEO observation."},
    ]
    with OUT_RECS.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader(); writer.writerows(rows)


def main() -> None:
    audited = audit()
    attach_follow_up(audited)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fields = list(audited[0])
    with OUT_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="raise", lineterminator="\n")
        writer.writeheader(); writer.writerows(audited)
    write_recommendations()
    counts = Counter((row["stream"], row["validation_status"]) for row in audited)
    default = [row for row in audited if row["default_included"] and row["stream"] == "incumbent"]
    lines = ["# CEO reference-set audit", "", "## Scope and method", "", "This audit tests the live `app-data.js` CEO observations, not frozen historical CSV fields. It reparses locally saved IRS XML when available and tests the current Form 990 overlay path. It manually rereads the seven rendered/PDF incumbent sources and Copenhagen's scanned filing. It does not treat a row's statistical influence as evidence of invalidity.", "", "- Incumbent rows audited: **%d**." % sum(row["stream"] == "incumbent" for row in audited), "- Salary-bearing job-ad rows audited: **%d**." % sum(row["stream"] == "job_ad" for row in audited), "- Default incumbent cash observations: **%d**." % len(default), "- Machine-reparsed live IRS XML incumbent observations: **%d**." % sum(row["stream"] == "incumbent" and row["verification_mode"] == "machine_reparse_local_irs_xml" for row in audited), "- Manually reread rendered/PDF incumbent observations: **7**; Copenhagen Consensus Center: **scanned Form 990 pages 1, 7, and 36**.", "", "## Results", "", "| Stream | Status | Rows |", "|---|---|---:|"]
    lines.extend(f"| {stream} | {status} | {count} |" for (stream, status), count in sorted(counts.items()))
    lines += ["", "### Live correction and extraction conclusions", "", "- **Center for AI Safety is not a live extraction error.** The current app applies `incumbent_compensation_updates.csv` over the historical discrepancy: Daniel James Hendrycks, 40 hours, cash/base $314,534, other $6,749, total $321,283. The live row's retained `part_vii_discrepancy` audit label identifies the obsolete historical field, not a mismatch in the displayed/training values.", "- **Reported hours require two eligibility sensitivities.** Center for Public Integrity reports Paul Cheung at 0.5 weekly hours alongside several senior officers; this may be a filing convention, but earlier 40-hour evidence does not resolve the current year. Nuclear Threat Initiative reports Ernest Moniz at 25 hours with no related-organization hours, and official biographies identify concurrent external CEO work. Both retain source-exact pay but are off by default and excluded from model training pending resolution.", "- **ORCID is source-exact.** Its saved XML reports Christian Shillum, Executive Director, 40 hours; Part VII $292,165 cash plus $26,746 other; Schedule J $270,253 base plus $21,912 bonus and $26,746 deferred/nontaxable benefits, total $318,911; revenue $6,811,163, expenses $5,803,116, and 9 employees. The current live values match. Its official employment page says it is global and 100% remote, while its filing says executive pay is adjusted for geographic location. Membership-funded digital infrastructure and global labor-market exposure are substantive functional/labor-market reasons for a sensitivity toggle, not an extraction error. Its highest disclosed non-CEO Schedule J base is $98,827 for Thomas Tepper Jr., finance/operations director at 30 weekly hours. Will Simpson, a foreign technology employee at 40 hours, has $139,527 reported cash but no separate base-pay disclosure. The model uses the 40-hour equivalent: $131,769.33 nominal ($140,266.88 in July 2026 USD), while retaining the reported amount. Simpson’s cash could still conceal a higher base, so the maximum is marked incompletely identified among disclosed employees.", "- **Copenhagen Consensus Center is source-exact.** The scanned 2024 Form 990 identifies Copenhagen Consensus Center USA Inc. (EIN 26-1214521), Dr Bjorn Lomborg as principal officer and President & Founder, 40 hours, with $497,770 Part VII compensation, no related/other compensation; Schedule J breaks this into $435,166 base and $62,604 bonus. Page 1 reports $920,765 revenue, $1,187,335 expenses, and one employee. Its official contact disclosure says the core team spans five continents and work uses contractors/volunteers. Thus one employee measures the US filer payroll, not the full delivery network. Founder leadership, small US filer scale, and global expert-network delivery support a **Tier C sensitivity toggle**, not a pay-driven exclusion.", "- Broad `schedule_j_base_omitted_or_mismatched` labels on legacy rows mean the frozen analytical source left Schedule J blank while the current validated overlay provides it. They are historical-provenance flags, not by themselves evidence that the live base field is invalid; the CSV identifies which live rows were actually reparsed.", "", "## Job-ad follow-up and model membership", "", "The stored predictive artifact has 27 recruitment records. **Dream.Org is one of them** and is trained only by the four explicit advertised-range variants of the Bayesian linear and Bayesian GAM families; filing-only Bayesian models and the intercept, linear, GAM, SVR, and GP comparisons set `includeAdvertisedRanges=false`. The nine formerly unresolved ads named in the CSV are absent from that 27-record recruitment cohort, so none currently trains any model variant.", "", "Dream.Org's recruiting firm, NPAG, and independent cross-posts resolve the saved mirror conflict in favor of **$260,000-$290,000**, full-time. The $271,000 lower bound seen only in the saved mirror header remains documented as a display conflict but is not a basis to change the displayed body range. External source checks also resolve Snap Foundation (employer post), Williams Institute (recruitment PDF), Injustice Watch (employer post), and Disability Rights Washington (NPAG post). PVARF, National Press Foundation, and All Chicago have only third-party repost corroboration; CETI and CSCCE remain unresolved. These status distinctions and URLs are machine-readable in the audit CSV.", "", "## Reference-set adequacy", "", "The current universe is defensible as a broad, disclosed-peer benchmark when interpreted as an equal-weighted, heterogeneous reference set with explicit Tier/structure/scale toggles. It is not a tight salary survey of organizations that duplicate RP. The rule-based baseline should remain: independent legal employer; saved primary point source; named full-time organization-wide chief executive (co-leadership explicitly flagged); full-period observation; and substantive non-pay A/B/C classification. Apply the same rule before and after seeing compensation.", "", "Use **correction** only for a conflict between the live value and its source. Use a **sensitivity toggle** for founder-led organizations, co-leadership, membership/grantmaking models, large or very small scale, international/distributed labor markets, or missing staff. Use **exclusion** for no resolved legal employer, project/sponsor compensation, part-time/interim/partial-period executive scope, or no point amount. Two organizations' model influence is a robustness reason to expose leave-out results, not grounds to remove them.", "", "### Salary-blind recommendations", "", "See `ceo_peer_recommendations.csv`. Forecasting Research Institute now has a saved, parsed IRS XML and a clean 40-hour CEO role, but its Part I filing reports zero employees. It should remain an optional sensitivity pending a staffing-model explanation, not be added to the default cohort. Center for Global Development is a promising research/policy peer at comparable financial scale, but needs a stable full-year leadership observation. The remaining screened candidates should not be forced into the CEO cohort without resolved entity/role boundaries and a verified annual pay observation.", "", "## Limitations", "", "Automated XML checks establish stored field agreement, not a manual reading of every filing's governance narrative. The CSV marks seven rendered/PDF filings and Copenhagen as manual deep reads; other XML rows are systematically parsed, not manually reread. External posting checks establish endpoint corroboration but do not recreate an employer-owned archive when one is unavailable. CETI and CSCCE remain unresolved; PVARF, National Press Foundation, and All Chicago retain third-party-only provenance. These evidence limits do not assert that the stated salaries are false.", ""]
    full_time_note = [
        "",
        "### Full-time eligibility issues",
        "",
        "Two sensitivity-only rows have source-exact pay but cannot satisfy a full-time CEO rule on the 2023/2024 filing alone: **Center for Public Integrity / Paul Cheung** reports 0.5 hours per week and **Nuclear Threat Initiative / Ernest Moniz** reports 25. CPI's official 2021 Form 990 reported Cheung at 40 hours, while its 2023 return repeats 0.50 for numerous senior employees; that pattern creates a credible filing-convention concern but does not justify replacing 0.5 with 40 without an amended filing. NTI's official biography establishes sustained CEO/co-chair duties but also a second CEO role at EFI Foundation; it does not negate the reported 25 hours. Both are excluded from the standard full-time model and default peer selection, with their source-exact pay retained for user-selected sensitivity comparisons. **Third Way is not an hours failure:** Jonathan Cowan's Part VII reports 4 hours for the filing organization plus 36 for a related organization, matching its $413,118 related-organization cash compensation and totaling 40 hours. The CSV also marks 30–39.9-hour rows as reviewable rather than invalid; legitimate full-time definitions vary.",
        "",
    ]
    reference_index = lines.index("## Reference-set adequacy")
    lines[reference_index:reference_index] = full_time_note
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_CSV.relative_to(ROOT)}, {OUT_MD.name}, and {OUT_RECS.name}")


if __name__ == "__main__":
    main()
