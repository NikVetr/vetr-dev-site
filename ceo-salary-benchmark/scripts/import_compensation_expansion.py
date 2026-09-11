#!/usr/bin/env python3
"""Review a cumulative research package and materialize a source-pinned empirical overlay.

Original XML is reconciled by person, component and filing identity. Other formats
require an independently reviewed row/source decision supplied with --review.
"""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import re
import shutil
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
from urllib.parse import parse_qsl, urlencode, urlsplit

from compensation_expansion import ROOT, EXPANSION, validate_addition
from build_app_data import cpi_factor


COMPONENTS = {
    "base": ("BaseCompensationFilingOrgAmt", "CompensationBasedOnRltdOrgsAmt"),
    "bonus": ("BonusFilingOrganizationAmount", "BonusRelatedOrganizationsAmt"),
    "other_reportable": ("OtherCompensationFilingOrgAmt", "OtherCompensationRltdOrgsAmt"),
    "deferred": ("DeferredCompensationFlngOrgAmt", "DeferredCompRltdOrgsAmt"),
    "nontaxable": ("NontaxableBenefitsFilingOrgAmt", "NontaxableBenefitsRltdOrgsAmt"),
    "total": ("TotalCompensationFilingOrgAmt", "TotalCompensationRltdOrgsAmt"),
    "reported_prior": ("CompReportPrior990FilingOrgAmt", "CompReportPrior990RltdOrgsAmt"),
}
STABLE_TENURE = {"no_transition_flag", "no_transition_indicated", "verified_full_year"}


def normalized(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def canonical_ad_url(url):
    original = re.sub(r"^https?://web\.archive\.org/web/[^/]+/(https?://)", r"\1", url or "")
    parsed = urlsplit(original)
    query = [(k, v) for k, v in parse_qsl(parsed.query) if k != "gh_src" and not k.startswith("utm_")]
    return parsed.netloc.lower().removeprefix("www."), parsed.path.rstrip("/"), urlencode(sorted(query))


def scope_exclusion(record, key):
    title = record.get("effective_title") or record["native_title"]
    if record.get("is_hybrid"):
        return "Hybrid role requires a separately reviewed combined-role benchmark"
    if key == "managing_director" and re.search(r"\b(assistant|associate|deputy)\b", title, re.I):
        return "Assistant/associate/deputy Managing Director is not a Managing Director peer"
    return ""


def scope_sensitivity(record, key):
    title = record.get("effective_title") or record["native_title"]
    if key == "research_executive" and re.search(r"research\s*(?:and|&|/)\s*(?:policy|programs?)\b", title, re.I):
        return "Combined research/policy or research/program authority requires role-scope review."
    return ""


def read_json(path):
    return json.loads(Path(path).read_text())


def recover_missing_base(record, audit, path):
    recovery = audit.get("recoveredBase")
    if not recovery:
        return record
    if record["base_nominal"] is not None or path.suffix.lower() != ".xml":
        raise ValueError("Base recovery requires a missing value and native XML")
    tree = ET.parse(path).getroot()
    for node in tree.iter():
        node.tag = node.tag.split("}")[-1]
    schedule = tree.find(recovery["locator"].removeprefix("Return/"))
    if schedule is None or normalized(schedule.findtext("PersonNm")) != normalized(record["person_name"]):
        raise ValueError("Recovered base person/locator mismatch")
    components = {component: [float(schedule.findtext(tag) or 0) for tag in tags] for component, tags in COMPONENTS.items()}
    if components["base"] != [recovery["filer"], recovery["related"]] or sum(components["base"]) <= 0:
        raise ValueError("Recovered base column mismatch")
    if sum(sum(components[k]) for k in ("base", "bonus", "other_reportable")) != record["cash_nominal"]:
        raise ValueError("Recovered Schedule J does not reconcile reportable cash")
    if sum(components["total"]) != record["total_nominal"]:
        raise ValueError("Recovered Schedule J does not reconcile total compensation")
    updated = {**record, "base_nominal": sum(components["base"]), "schedule_j_locator": recovery["locator"]}
    for component, amounts in components.items():
        for side, amount in zip(("org", "related"), amounts):
            field = f"schedule_j_{component}_{side}_nominal"
            if record.get(field) is not None and record[field] != amount:
                raise ValueError(f"Base recovery contradicts an existing component: {field}")
            updated[field] = amount
    return updated


def native_xml_check(row: dict, path: Path) -> tuple[bool, str]:
    """Validate values in their exact XML columns; nearby matching numbers do not suffice."""
    tree = ET.parse(path).getroot()
    for node in tree.iter():
        node.tag = node.tag.split("}")[-1]

    def locate(locator):
        return tree.find(locator.removeprefix("Return/")) if locator else None

    def amount(node, field):
        value = node.findtext(field)
        return float(value) if value is not None else 0.0

    person = locate(row["part_vii_locator"])
    if person is None:
        return False, "Part VII locator not found"
    if normalized(person.findtext("PersonNm")) != normalized(row["person_name"]):
        return False, "Part VII person mismatch"
    if normalized(person.findtext("TitleTxt")) != normalized(row["native_title"]):
        return False, "Native title mismatch"
    for field, tag in (("weekly_hours_filer", "AverageHoursPerWeekRt"), ("weekly_hours_related", "AverageHoursPerWeekRltdOrgRt")):
        if row.get(field) is not None and float(row[field]) != amount(person, tag):
            return False, f"Hours mismatch: {field}"
    ein = tree.findtext("ReturnHeader/Filer/EIN")
    if row["entity_id"] != f"US-EIN-{ein}":
        return False, "Legal employer EIN mismatch"
    end = tree.findtext("ReturnHeader/TaxPeriodEndDt")
    compensation_year = int(end[:4]) if end[5:] == "12-31" else int(end[:4]) - 1
    if end != row["tax_period_end"] or compensation_year != int(row["compensation_year"]):
        return False, "Filing or compensation year mismatch"
    if row.get("tax_period_begin") and row["tax_period_begin"] != tree.findtext("ReturnHeader/TaxPeriodBeginDt"):
        return False, "Filing period start mismatch"
    if row.get("financial_year_end") is not None and int(row["financial_year_end"]) != int(end[:4]):
        return False, "Financial year mismatch"
    cash = amount(person, "ReportableCompFromOrgAmt") + amount(person, "ReportableCompFromRltdOrgAmt")
    if cash != row["cash_nominal"]:
        return False, "Part VII cash mismatch"
    for field, tag in (("part_vii_org_nominal", "ReportableCompFromOrgAmt"),
                       ("part_vii_related_nominal", "ReportableCompFromRltdOrgAmt"),
                       ("part_vii_other_nominal", "OtherCompensationAmt")):
        if row.get(field) is not None and row[field] != amount(person, tag):
            return False, f"Part VII component mismatch: {field}"
    schedule = locate(row.get("schedule_j_locator"))
    if row["base_nominal"] is not None and schedule is None:
        return False, "Base pay lacks Schedule J row"
    if schedule is not None:
        if normalized(schedule.findtext("PersonNm")) != normalized(row["person_name"]):
            return False, "Schedule J person mismatch"
        for component, tags in COMPONENTS.items():
            for side, tag in zip(("org", "related"), tags):
                field = f"schedule_j_{component}_{side}_nominal"
                if row.get(field) is not None and row[field] != amount(schedule, tag):
                    return False, f"Schedule J component mismatch: {field}"
        if row["base_nominal"] != sum(amount(schedule, tag) for tag in COMPONENTS["base"]):
            return False, "Schedule J base sum mismatch"
    total = (sum(amount(schedule, tag) for tag in COMPONENTS["total"])
             if schedule is not None and row["total_basis"].startswith("Schedule J")
             else cash + amount(person, "OtherCompensationAmt"))
    if total != row["total_nominal"]:
        return False, "Total-compensation basis mismatch"
    for field, tag in (("revenue_nominal_usd", "CYTotalRevenueAmt"),
                       ("expenses_nominal_usd", "CYTotalExpensesAmt"), ("filing_employees", "TotalEmployeeCnt")):
        if row.get(field) is not None:
            value = tree.findtext("ReturnData/IRS990/" + tag)
            if value is None or row[field] != float(value):
                return False, f"Organization context mismatch: {field}"
    return True, "Exact native XML identity, periods, hours, pay components and organization context reconciled"


def app_rows(data):
    return data["incumbents"] + data["jobAds"] + [r for key in ("positionObservations", "positionJobAds") for rows in data[key].values() for r in rows]


def prepare(package: Path, review_path: Path, baseline_path: Path):
    review = read_json(review_path)
    baseline = read_json(baseline_path)
    if hashlib.sha256(json.dumps(baseline, sort_keys=True, separators=(",", ":")).encode()).hexdigest() != review["baselineAppSha256"]:
        raise ValueError("Baseline differs from the independently reviewed app snapshot")
    for name, expected in review["inputTableSha256"].items():
        if hashlib.sha256((package / "data" / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Reviewed package table changed: {name}")
    observations = read_json(package / "data/role_observations.json")
    ads = read_json(package / "data/advertised_ranges.json")
    organizations = {r["entity_id"]: r for r in read_json(package / "data/organizations.json")}
    mapping = {r["role_detail"]: r for r in review["roleMapping"] if r.get("app_position_key")}
    manual = review["verifiedObservations"]
    original_rows = {r["id"]: r for r in app_rows(baseline)}
    original_ids = set(original_rows)
    existing_ad_urls = {(r.get("positionKey", "ceo"), canonical_ad_url(r["sourceUrl"])): r["id"]
                       for r in original_rows.values() if r["evidenceStream"] == "jobAds"}
    existing_positions = {r["key"] for r in baseline["positionCatalog"]}
    profiles = {r["organization"]: r for r in app_rows(baseline)}
    # Source aliases can change between research rounds; canonical native bytes
    # identify the same filing even when its local path/source ID changes.
    existing_sources, existing_people, existing_person_years = {}, set(), set()
    existing_raw = list(csv.DictReader((ROOT / "benchmark/enrichment/form990_position_observations.csv").open()))
    names_by_ein = {r["ein"]: r["organization"] for r in existing_raw}
    ein_by_name = {name: ein for ein, name in names_by_ein.items()}
    for row in app_rows(baseline):
        if row["evidenceStream"] != "incumbents":
            continue
        path = ROOT / row["cachedSource"] if row.get("cachedSource") else None
        digest = hashlib.sha256(path.read_bytes()).hexdigest() if path else None
        if digest:
            existing_sources[digest] = row["sourceId"]
        for name in (row.get("executive"), row.get("rawExecutive")):
            if name:
                if digest:
                    existing_people.add((digest, normalized(name)))
                existing_person_years.add((ein_by_name.get(row["organization"]), row.get("compensationYear"), normalized(name)))
    cpi = list(csv.DictReader((ROOT / "benchmark/data/cpi_u.csv").open()))
    cpi_by_period = {r["period"]: float(r["index_value"]) for r in cpi}
    sources, output, decisions, seen, memberships = {}, [], [], set(), []
    imported_person_years = set()
    source_store = ROOT / "benchmark/sources/native/compensation_expansion"
    source_store.mkdir(parents=True, exist_ok=True)

    def retain_source(path, url):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        key = existing_sources.get(digest, "EXPANSION-" + digest[:20])
        target = source_store / (digest[:20] + path.suffix.lower())
        if path.resolve() != target.resolve():
            shutil.copyfile(path, target)
        sources[key] = {"key": key, "localPath": str(target.relative_to(ROOT)), "sha256": digest, "url": url}
        return key, digest

    def row_profile(record):
        entity = organizations.get(record.get("entity_id"), {})
        ein = record.get("ein") or (record.get("entity_id") or "").removeprefix("US-EIN-")
        name = names_by_ein.get(ein, record["organization"])
        profile = profiles.get(name, {})
        return name, entity, profile

    def convert(record, key, source_key, digest, audit, *, ad=False):
        organization, entity, profile = row_profile(record)
        year = int((audit["year"] if "year" in audit else record.get("intended_pay_year" if ad else "compensation_year")) or 0)
        if year == 2026:
            factor, period = 1.0, "July 2026 target-year approximation for a 2026 advertisement"
        elif f"{year}-AVG" in cpi_by_period or all(f"{year}-{month:02}" in cpi_by_period for month in range(1, 13)):
            factor, period = cpi_factor(year), f"{year} annual average"
        else:
            if not ad:
                return None, "No frozen CPI for verified compensation year"
            factor, period = None, "Nominal only: no verified year or frozen CPI conversion"
        if record.get("currency") != "USD":
            return None, "Non-USD conversion not independently reviewed"
        if not ad and not any((record[m + "_nominal"] or 0) > 0 for m in ("base", "cash", "total")):
            return None, "No positive incumbent compensation; unpaid disclosure"
        low, high = (audit["low"], audit["high"]) if ad else (None, None)
        nominal = ({"base": (low + high) / 2, "cash": None, "total": None} if ad else
                   {m: record[m + "_nominal"] if (record[m + "_nominal"] or 0) > 0 else None for m in ("base", "cash", "total")})
        scope_note = scope_sensitivity(record, key)
        primary = bool(audit.get("defaultIncluded", record.get("primary_benchmark_eligible"))) and key != "ceo" and factor is not None and not scope_note
        note = audit["reason"] + (" " + scope_note if scope_note else "")
        if audit.get("recoveredBase"):
            note += " Previously missing base pay recovered from the named native Schedule J row."
        if key == "ceo":
            note += " Additional CEO disclosure: selectable in All records; excluded from the frozen model and default CEO cohort."
        if not ad:
            note += " Reported annual pay; weekly hours do not establish contractual FTE or a complete year."
        context_verified = not ad and audit.get("contextVerified") is True
        if not ad and not context_verified:
            note += " Organization size is omitted pending source-field reconciliation."
        title = record.get("effective_title") or record["native_title"]
        position = next(r for r in mapping.values() if r["app_position_key"] == key)
        formatted = {m: f"${value:,.0f}" if value is not None else "not disclosed" for m, value in nominal.items()}
        evidence = (f"{title}. Advertised annual USD range ${low:,.0f}–${high:,.0f}; midpoint is a policy-range summary, not observed employee pay. "
                    if ad else f"{record['person_name']}, {title}. Nominal {year} USD: Schedule J base {formatted['base']}; Part VII reportable cash {formatted['cash']}; total {formatted['total']} ({record['total_basis']}). ")
        scope = record.get("scope") or "functional"
        row = {
            "id": record["observation_id"], "sourceId": existing_sources.get(digest, source_key),
            "organization": organization, "entityId": record.get("entity_id"), "executive": "" if ad else record["person_name"],
            "rawExecutive": "" if ad else record["person_name"], "title": title, "rawTitle": record["native_title"],
            "titleGroup": position["label"], "positionKey": key, "positionFamily": record["role_detail"],
            "secondaryRoleTags": [], "seniorityGroup": position["menu_group"], "roleScope": scope,
            "incumbencyStatus": "recruitment posting" if ad else record["tenure_status"],
            "compensationYearRoleStatus": "prospective" if ad else record["tenure_status"],
            "averageHoursPerWeek": record.get("weekly_hours" if ad else "weekly_hours_filer"),
            "averageHoursRelatedOrgs": None if ad else record.get("weekly_hours_related"),
            "totalReportedHours": record.get("weekly_hours_combined_reported"), "defaultHoursEligible": bool(record.get("reported_hours_screen")),
            "tier": profile.get("tier", "B"), "topic": profile.get("topic") or entity.get("mission_focus_raw") or "Not classified",
            "eaAffinity": profile.get("eaAffinity") or record.get("ea_affinity") or entity.get("ea_affinity") or "Not classified",
            "location": record.get("eligible_work_locations") or "Not reported", "remoteStatus": record.get("work_arrangement") or "Not reported",
            "structure": profile.get("structure") or entity.get("legal_structure_raw") or "Not classified",
            "revenue": record.get("revenue_nominal_usd") if context_verified else None,
            "expenses": record.get("expenses_nominal_usd") if context_verified else None, "staff": record.get("filing_employees") if context_verified else None,
            "comparabilityScore": profile.get("comparabilityScore", 0), "compensationYear": year or None,
            "salary": {m: round(v * factor, 2) if v is not None and factor is not None else None for m, v in nominal.items()}, "nominalSalary": nominal,
            "cpiFactor": factor, "cpiPeriod": period, "defaultIncluded": primary,
            "structurallyClean": primary, "founder": False, "analysisStatus": "primary" if primary else "sensitivity_only",
            "auditStatus": "independently reconciled source evidence", "selectionNote": note, "sensitivityOnlyReason": "" if primary else note,
            "evidenceText": evidence + note, "sourceUrl": audit.get("url") or record["source_url"],
            "canonicalUrl": audit.get("url") or record["source_url"], "cachedSource": "", "localPath": sources[source_key]["localPath"],
            "sourceType": "Job posting" if ad else "Form 990", "evidenceStream": "jobAds" if ad else "incumbents",
            "homepageUrl": profile.get("homepageUrl") or entity.get("official_website") or "", "wikipediaTitle": profile.get("wikipediaTitle", ""), "wikipediaUrl": profile.get("wikipediaUrl", ""),
            "categoryProvenance": {"provenanceType": "independent_expansion_review", "confidence": "Source pay checked; role scope remains disclosure-based", "caveats": note},
            "positionTaxonomy": {"classificationRule": position["native_title_alias_guard"], "confidence": "reviewed", "partViiLocator": record.get("part_vii_locator"), "scheduleJLocator": record.get("schedule_j_locator"), "methodologyPath": "benchmark/enrichment/compensation_expansion_audit.md"},
            "expansionReview": {"sourceVerified": True, "quarantined": False, "isRpReference": False, "sourceKey": source_key,
                "packageObservationId": record["observation_id"], "identity": ("ad:" + str(record.get("ad_group_id") or record.get("ad_id"))) if ad else digest + ":" + normalized(record["person_name"]),
                "verification": audit["reason"], "empiricalOnly": True, "contractualFte": record.get("contractual_FTE"),
                "taxPeriodBegin": record.get("tax_period_begin"), "taxPeriodEnd": record.get("tax_period_end"),
                "financialYearEnd": record.get("financial_year_end"), "staffDefinition": "Form 990 calendar-year employees; not FTE or point-in-time headcount",
                "rawPayComponents": {k: v for k, v in record.items() if k.startswith(("schedule_j_", "part_vii_")) and k.endswith("_nominal")},
                "reportedHours40Sensitivity": {m: record.get(m + "_40h_july2026") for m in ("base", "cash", "total")}},
        }
        if row["eaAffinity"] not in {"EA-adjacent", "EA-core", "functional-only"}:
            row["eaAffinity"] = "Not assessed"
        if audit.get("recoveredBase"):
            row["expansionReview"]["baseRecovery"] = {"originalBaseNominal": None, **audit["recoveredBase"]}
        if ad:
            row.update(range={"low": round(low * factor, 2) if factor is not None else None, "high": round(high * factor, 2) if factor is not None else None}, nominalRange={"low": low, "high": high},
                       reportedRange={"low": low, "high": high}, reportedCurrency="USD", reportedPayPeriod="year", reportedSalaryText=f"${low:,.0f}–${high:,.0f}")
        if audit.get("secondarySource"):
            secondary = audit["secondarySource"]
            path = ROOT / secondary["path"]
            if hashlib.sha256(path.read_bytes()).hexdigest() != secondary["sha256"]:
                raise ValueError(f"Secondary source review hash changed: {record['observation_id']}")
            secondary_key, _ = retain_source(path, secondary["url"])
            row["expansionReview"]["secondarySourceKey"] = secondary_key
            row["secondarySourceLabel"] = secondary.get("label", "Schedule J")
            row["secondaryCachedLabel"] = "saved " + row["secondarySourceLabel"]
        return row, "accepted"

    for record in observations + ads:
        identifier = record["observation_id"]
        ad = record in ads
        decision = {"id": identifier, "organization": record["organization"], "role_detail": record["role_detail"]}
        reason = ""
        key = mapping.get(record["role_detail"], {}).get("app_position_key")
        audit = manual.get(identifier)
        if audit and audit.get("positionKey"):
            key = audit["positionKey"]
        if identifier in original_ids:
            reason = "Existing app observation retained unchanged"
            original = original_rows[identifier]
            if (key and key not in existing_positions and not ad and record.get("role_sample_eligible")
                    and not scope_exclusion(record, key)
                    and not any(record.get(flag) for flag in ("is_rp_reference", "rp_affiliation_holdout", "source_integrity_holdout", "governance_excluded", "security_redacted"))):
                path = package / record["source_path"]
                if path.suffix.lower() == ".xml" and path.is_file():
                    digest = hashlib.sha256(path.read_bytes()).hexdigest()
                    original_path = ROOT / original["cachedSource"]
                    verified, message = native_xml_check(record, path)
                    if (verified and digest == record["source_sha256"]
                            and digest == hashlib.sha256(original_path.read_bytes()).hexdigest()
                            and original["compensationYear"] == record["compensation_year"]
                            and all(original["nominalSalary"][m] == (record[m + "_nominal"] or None) for m in ("base", "cash"))):
                        source_key, _ = retain_source(path, record["source_url"])
                        memberships.append({"observationId": identifier, "positionKey": key,
                            "defaultIncluded": bool(original["defaultIncluded"] and record["primary_benchmark_eligible"] and not scope_sensitivity(record, key)),
                            "sourceKey": source_key, "sourceVerified": True,
                            "selectionNote": "Reviewed functional cross-listing; original compensation retained. "
                                + ("Expansion cohort restriction: " + record["primary_exclusion_reason"].replace("_", " ") + "."
                                   if record.get("primary_exclusion_reason") else original.get("sensitivityOnlyReason", ""))
                                + scope_sensitivity(record, key),
                            "verification": message, "classificationRule": mapping[record["role_detail"]]["native_title_alias_guard"]})
                        reason = "Reviewed functional cross-listing; canonical observation retained unchanged"
        elif record.get("is_rp_reference") or record.get("rp_affiliation_holdout") or record.get("source_integrity_holdout") or record.get("governance_excluded") or record.get("security_redacted"):
            reason = "Reference, governance, redaction or source quarantine"
        elif identifier in review.get("excludedObservations", {}):
            reason = review["excludedObservations"][identifier]
        elif ad and (key, canonical_ad_url((audit or {}).get("url") or record["source_url"])) in existing_ad_urls:
            reason = "Recruitment campaign already in app; archive corroborates existing observation"
        elif not key:
            reason = "No reviewed compatible public role; hybrid/unresolved/specialist scope retained in research inventory"
        elif scope_exclusion(record, key):
            reason = scope_exclusion(record, key)
        elif not ad and not (record.get("role_sample_eligible") or key == "ceo" and record.get("tenure_status") in STABLE_TENURE and (record.get("weekly_hours_filer") or 0) >= 30):
            reason = "Fails existing employee-role, hours or transition gate"
        elif ad and not audit:
            reason = "Advertisement lacks independently recovered and reviewed original"
        else:
            path = (ROOT / audit["path"] if audit else package / record["source_path"])
            if not path.is_file():
                reason = "Original unavailable"
            elif audit:
                if hashlib.sha256(path.read_bytes()).hexdigest() != audit["sha256"]:
                    raise ValueError(f"Independent source review hash changed: {identifier}")
            elif path.suffix.lower() != ".xml":
                reason = "Non-XML evidence requires independent row and source review"
            elif hashlib.sha256(path.read_bytes()).hexdigest() != record["source_sha256"]:
                reason = "Package native source hash mismatch"
            else:
                verified, message = native_xml_check(record, path)
                if not verified:
                    reason = message
                else:
                    audit = {"reason": message, "contextVerified": True}
            if not reason:
                if audit.get("nativeLocators"):
                    if ad or path.suffix.lower() != ".xml":
                        raise ValueError(f"Native locators require an XML incumbent source: {identifier}")
                    record = {**record, "part_vii_locator": audit["nativeLocators"]["partVII"],
                              "schedule_j_locator": audit["nativeLocators"].get("scheduleJ")}
                record = recover_missing_base(record, audit, path)
                if not ad and path.suffix.lower() == ".xml":
                    verified, message = native_xml_check(record, path)
                    if not verified:
                        raise ValueError(f"Reviewed native XML no longer reconciles: {identifier}: {message}")
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                identity = (digest, normalized(record.get("person_name")))
                ein = (record.get("entity_id") or "").removeprefix("US-EIN-")
                person_year = (ein, record.get("compensation_year"), normalized(record.get("person_name")))
                if not ad and (identity in existing_people or person_year in existing_person_years):
                    reason = "Same person and original filing already in app under another source ID"
                else:
                    source_key, digest = retain_source(path, audit.get("url") or record["source_url"])
                    row, reason = convert(record, key, source_key, digest, audit, ad=ad)
                    if row:
                        unique = row["expansionReview"]["identity"]
                        if unique in seen or not ad and person_year in imported_person_years:
                            reason = "Duplicate campaign variant or person/filing"
                        else:
                            seen.add(unique)
                            if not ad:
                                imported_person_years.add(person_year)
                            output.append(row)
        decision["decision"] = reason
        decision["position_key"] = key
        decisions.append(decision)

    positions = []
    membership_rows = [{**original_rows[m["observationId"]], "positionKey": m["positionKey"], "defaultIncluded": m["defaultIncluded"]} for m in memberships]
    for key in sorted({r["positionKey"] for r in output + membership_rows} - existing_positions):
        definition = next(r for r in mapping.values() if r["app_position_key"] == key)
        defaults = [r for r in output + membership_rows if r["positionKey"] == key and r["defaultIncluded"]]
        employers = len({r["organization"] for r in defaults})
        positions.append({"key": key, "label": definition["label"], "pageLabel": definition["label"], "menuGroup": definition["menu_group"], "expansion": True,
            "defaultMeasure": "cash" if any(r["evidenceStream"] == "incumbents" for r in defaults) else "base",
            "defaultSample": "primary" if defaults else "observed", "defaultInflationAdjusted": bool(defaults),
            "supportLevel": "primary" if len(defaults) >= 15 and employers >= 12 else "exploratory",
            "description": definition["description"] + f" {len(defaults)} usable pay records from {employers} selected peer organizations. "
                + ("Small exploratory reference set. " if len(defaults) < 15 or employers < 12 else "")
                + "Disclosed employee pay and advertised ranges are separate evidence streams; distributions describe the selected records.",
            "methodologyPath": "benchmark/enrichment/compensation_expansion_audit.md"})
    used = {r["expansionReview"]["sourceKey"] for r in output} | {m["sourceKey"] for m in memberships}
    used.update(r["expansionReview"]["secondarySourceKey"] for r in output if r["expansionReview"].get("secondarySourceKey"))
    for source in review.get("supplementalSources", []):
        path = ROOT / source["path"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Supplemental date/source evidence changed")
        source_key, _ = retain_source(path, source["url"])
        used.add(source_key)
    corroborating = []
    for source in review.get("corroboratingSources", []):
        path = ROOT / source["path"]
        if source["observationId"] not in original_ids or hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Invalid corroborating source review")
        source_key, _ = retain_source(path, source["url"])
        used.add(source_key)
        corroborating.append({"observationId": source["observationId"], "sourceKey": source_key, "label": source["label"]})
    sources = {key: source for key, source in sources.items() if key in used}
    for row in output:
        validate_addition(row, sources, existing_positions | {p["key"] for p in positions})
    summary = {"package": package.name, "reviewDate": "2026-09-10", "addedRecords": len(output), "addedPositions": len(positions),
               "newCeoRecords": sum(r["positionKey"] == "ceo" for r in output), "newAds": sum(r["evidenceStream"] == "jobAds" for r in output),
               "originalSources": len(sources), "functionalCrossListings": len(memberships), "decisions": dict(Counter(r["decision"] for r in decisions))}
    payload = {"schemaVersion": 1, "positions": positions, "observations": output, "memberships": memberships, "sources": list(sources.values()), "corroboratingSources": corroborating, "summary": summary}
    EXPANSION.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    audit_file = EXPANSION.with_name("compensation_expansion_decisions.json")
    audit_file.write_text(json.dumps(decisions, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.package.resolve(), args.review.resolve(), args.baseline.resolve())
