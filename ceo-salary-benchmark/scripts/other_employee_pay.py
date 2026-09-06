"""Same-filing other-employee pay, with explicit reported-hours standardization."""
from __future__ import annotations

import copy
import csv
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POSITION_DATA = ROOT / "benchmark/enrichment/form990_position_observations.csv"
HOURS_BASIS = "40 / combined reported weekly hours"
UNRESOLVED_HOURS_SOURCES = {"SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY"}
MEASURES = {
    "base": ("schedule_j_base_total_nominal", "schedule_j_base_total_july_2026"),
    "cash": ("part_vii_cash_nominal", "part_vii_cash_july_2026"),
    "total": ("part_vii_total_nominal", "part_vii_total_july_2026"),
}


def number(value: object) -> float | None:
    if value in (None, ""):
        return None
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("Non-finite disclosed pay or hours")
    return value


def person_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def eligible_disclosed_pay_by_source(path: Path = POSITION_DATA, *, standardized: bool = False) -> dict:
    with path.open(encoding="utf-8", newline="") as handle:
        observations = list(csv.DictReader(handle))
    source_rows = {}
    for row in observations:
        if (row["role_scope"] not in {"functional", "organization_wide"}
                or row["compensation_year_role_status"] not in {"no_transition_indicated", "verified_full_year"}
                or row["former_officer_director_trustee"] == "yes"):
            continue
        if not standardized and row["default_hours_eligible"] != "yes":
            continue
        hours = number(row["total_reported_hours"])
        if standardized and (hours is None or hours <= 0 or row["source_id"] in UNRESOLVED_HOURS_SOURCES):
            continue
        source_rows.setdefault(row["source_id"], []).append(row)

    output = {}
    for source_id, candidates in source_rows.items():
        source_result = {}
        for measure, (nominal_field, adjusted_field) in MEASURES.items():
            by_person = {}
            for candidate in candidates:
                nominal, adjusted = number(candidate[nominal_field]), number(candidate[adjusted_field])
                if nominal is None or adjusted is None or nominal <= 0 or adjusted <= 0:
                    continue
                hours = number(candidate["total_reported_hours"])
                factor = 40 / hours if standardized else 1
                key = candidate["person_key"] or person_key(candidate["person_name"])
                item = {
                    "personKey": key,
                    "person": candidate["effective_person_name"] or candidate["person_name"],
                    "title": candidate["effective_title"] or candidate["native_title"],
                    "benchmarkPosition": candidate["benchmark_position"], "roleScope": candidate["role_scope"],
                    "nominal": nominal * factor, "adjusted": adjusted * factor,
                }
                if standardized:
                    item.update(reportedNominal=nominal, reportedAdjusted=adjusted,
                                weeklyHours=hours, filingHours=number(candidate["average_hours_per_week"]),
                                relatedHours=number(candidate["average_hours_related_orgs"]),
                                hoursFactor=factor, hoursBasis=HOURS_BASIS,
                                entityAllocationReview=bool(number(candidate["average_hours_related_orgs"]) and
                                    (not number(candidate["part_vii_org_nominal"]) or not number(candidate["part_vii_related_nominal"]))),
                                sourceObservationId=candidate["observation_id"])
                existing = by_person.get(key)
                if existing is None or item["nominal"] > existing["nominal"]:
                    by_person[key] = item
            ranked = sorted(by_person.values(), key=lambda item: (-item["nominal"], item["person"].casefold()))
            source_result[measure] = [dict(item, sourceRank=rank, eligibleDisclosures=len(ranked))
                                      for rank, item in enumerate(ranked, 1)]
        output[source_id] = source_result
    return output


def attach_highest_paid_other_employee(app_rows: list[dict], path: Path = POSITION_DATA) -> int:
    attached = 0
    for standardized, field in ((False, "highestPaidOtherEmployee"), (True, "highestPaidOtherEmployee40h")):
        by_source = eligible_disclosed_pay_by_source(path, standardized=standardized)
        for row in app_rows:
            row.pop(field, None)
            if standardized:
                row.pop("otherPayDisclosure", None)
            source_result = by_source.get(str(row.get("sourceId") or ""))
            if not source_result:
                continue
            row_keys = {person_key(row.get("executive")), person_key(row.get("rawExecutive")),
                        person_key(str(row.get("id") or "").rsplit("::", 1)[-1])} - {""}
            position = row.get("positionKey") or "ceo"
            matched = {candidate["personKey"] for candidates in source_result.values() for candidate in candidates
                       if candidate["personKey"] in row_keys or person_key(candidate["person"]) in row_keys}
            if not matched:
                continue

            def is_other(candidate: dict) -> bool:
                return candidate["personKey"] not in matched and (
                    candidate["roleScope"] != "organization_wide" if position == "ceo"
                    else candidate["benchmarkPosition"] != position)

            others = {measure: [candidate for candidate in candidates if is_other(candidate)]
                      if standardized or any(candidate["personKey"] in matched for candidate in candidates) else []
                      for measure, candidates in source_result.items()}
            result = {measure: copy.deepcopy(candidates[0]) for measure, candidates in others.items() if candidates}
            if result:
                row[field] = result
                if not standardized:
                    attached += 1
            if standardized:
                base_keys = {candidate["personKey"] for candidate in others["base"]}
                missing_base = [candidate for candidate in others["cash"] if candidate["personKey"] not in base_keys]
                lower = result.get("base", {}).get("adjusted")
                upper_missing = max((candidate["adjusted"] for candidate in missing_base), default=0)
                row["otherPayDisclosure"] = {
                    "baseDisclosures": len(base_keys), "cashDisclosures": len(others["cash"]),
                    "cashWithoutBaseDisclosures": len(missing_base),
                    "maxCashWithoutBase40h": upper_missing or None,
                    "maximumBaseIdentifiedAmongDisclosures": lower is not None and upper_missing <= lower,
                    "scope": "eligible disclosed employees; unlisted employees remain unobserved",
                }
    return attached
