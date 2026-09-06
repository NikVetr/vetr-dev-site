#!/usr/bin/env python3
"""Audit the FTE-standardized Schedule J base-pay comparator.

This is independent validation of the current application attachment. It does
not modify app data, model inputs, or source observations. Its FTE gate is
deliberately broader than the live legacy attachment: it retains role/year/
former safeguards, removes the 30-hour screen, and excludes the documented
Center for Public Integrity 0.5-hour anomaly.
"""

from __future__ import annotations

import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
POSITIONS = ROOT / "benchmark" / "enrichment" / "form990_position_observations.csv"
APP_DATA = ROOT / "app-data.js"
OUTPUT = ROOT / "benchmark" / "enrichment" / "highest_other_fte_audit.csv"

EXPECTED = {
    "positive_noncanonical": 895,
    "fte_candidates": 614,
    "current_base_attachments": 98,
    "reranked_attachments": 4,
}
CPI_HOURS_ANOMALY_SOURCE = "SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY"


def text(value: object) -> str:
    return "" if value is None else str(value).strip()


def number(value: object) -> float | None:
    value = text(value)
    return float(value) if value else None


def yes(value: object) -> bool:
    return text(value).casefold() in {"yes", "true", "1"}


def person_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", text(value).casefold())


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_value(element: ET.Element, name: str) -> str:
    for child in element:
        if local_name(child.tag) == name:
            return text(child.text)
    return ""


def locator_element(root: ET.Element, locator: str) -> ET.Element | None:
    match = re.search(r"/([^/\[]+)\[(\d+)\]$", locator)
    if not match:
        return None
    tag, index = match.group(1), int(match.group(2))
    matches = [element for element in root.iter() if local_name(element.tag) == tag]
    return matches[index - 1] if len(matches) >= index else None


def xml_validation(row: dict[str, str]) -> str:
    path = ROOT / text(row["source_local_path"])
    if not path.is_file():
        raise FileNotFoundError(f"Missing source XML: {path}")
    root = ET.parse(path).getroot()
    part = locator_element(root, row["part_vii_xml_locator"])
    if part is None:
        raise ValueError(f"Missing Part VII locator: {row['observation_id']}")
    for xml_field, csv_field in (
        ("PersonNm", "person_name"),
        ("AverageHoursPerWeekRt", "average_hours_per_week"),
        ("AverageHoursPerWeekRltdOrgRt", "average_hours_related_orgs"),
        ("ReportableCompFromOrgAmt", "part_vii_org_nominal"),
        ("ReportableCompFromRltdOrgAmt", "part_vii_related_nominal"),
        ("OtherCompensationAmt", "part_vii_other_nominal"),
    ):
        actual = child_value(part, xml_field)
        expected = row[csv_field]
        if xml_field == "PersonNm":
            if actual != expected:
                raise ValueError(f"Part VII name mismatch: {row['observation_id']}")
        elif (number(actual) or 0) != (number(expected) or 0):
            raise ValueError(f"Part VII {xml_field} mismatch: {row['observation_id']}")
    combined = (number(row["average_hours_per_week"]) or 0) + (number(row["average_hours_related_orgs"]) or 0)
    if not math.isclose(number(row["total_reported_hours"]) or 0, combined):
        raise ValueError(f"Combined weekly hours mismatch: {row['observation_id']}")
    if not yes(row["schedule_j_present"]):
        return "part_vii_verified_no_schedule_j"
    schedule = locator_element(root, row["schedule_j_xml_locator"])
    if schedule is None:
        raise ValueError(f"Missing Schedule J locator: {row['observation_id']}")
    if person_key(child_value(schedule, "PersonNm")) != person_key(row["person_name"]):
        raise ValueError(f"Schedule J name mismatch: {row['observation_id']}")
    base = (number(child_value(schedule, "BaseCompensationFilingOrgAmt")) or 0) + (
        number(child_value(schedule, "CompensationBasedOnRltdOrgsAmt")) or 0
    )
    if base != (number(row["schedule_j_base_total_nominal"]) or 0):
        raise ValueError(f"Schedule J base mismatch: {row['observation_id']}")
    return "part_vii_and_schedule_j_verified"


def fte_candidate(row: dict[str, str]) -> bool:
    """The reviewed FTE candidate gate; distinct from the production legacy gate."""
    return (
        text(row["role_scope"]) in {"functional", "organization_wide"}
        and text(row["compensation_year_role_status"])
        in {"no_transition_indicated", "verified_full_year"}
        and not yes(row["former_officer_director_trustee"])
        and text(row["source_id"]) != CPI_HOURS_ANOMALY_SOURCE
        and (number(row["schedule_j_base_total_nominal"]) or 0) > 0
        and (number(row["total_reported_hours"]) or 0) > 0
    )


def legacy_candidate(row: dict[str, str]) -> bool:
    """The current loader's 30-combined-hour base candidate rule."""
    return fte_candidate(row) and yes(row["default_hours_eligible"])


def fte_base(row: dict[str, str]) -> tuple[float, float]:
    base = number(row["schedule_j_base_total_nominal"])
    hours = number(row["total_reported_hours"])
    if base is None or base <= 0 or hours is None or hours <= 0:
        raise ValueError(f"Invalid FTE candidate values: {row['observation_id']}")
    return base * 40 / hours, hours


def ranked_candidates(
    rows: list[dict[str, str]], ceo_keys: set[str], gate: object
) -> tuple[list[tuple[dict[str, str], float, float, float]], list[tuple[dict[str, str], float, float, float]]]:
    candidates = []
    for row in rows:
        if not gate(row):
            continue
        if person_key(row["person_key"]) in ceo_keys or person_key(row["person_name"]) in ceo_keys:
            continue
        base = number(row["schedule_j_base_total_nominal"])
        fte, hours = fte_base(row)
        candidates.append((row, base, hours, fte))
    raw = sorted(candidates, key=lambda item: (-item[1], text(item[0]["person_name"]).casefold()))
    standardized = sorted(candidates, key=lambda item: (-item[3], text(item[0]["person_name"]).casefold()))
    return raw, standardized


def main() -> None:
    positions = list(csv.DictReader(POSITIONS.open(encoding="utf-8", newline="")))
    by_id = {row["observation_id"]: row for row in positions}
    if len(by_id) != len(positions):
        raise ValueError("Position observations have duplicate observation IDs")
    app = json.loads(APP_DATA.read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\n"))
    ceos = app["incumbents"] + [app["rpReference"]]
    attached: dict[str, list[dict]] = defaultdict(list)
    for ceo in ceos:
        current = ((ceo.get("highestPaidOtherEmployee") or {}).get("base") or {})
        if current:
            keys = {
                person_key(ceo.get("executive")),
                person_key(ceo.get("rawExecutive")),
                person_key(text(ceo.get("id")).rsplit("::", 1)[-1]),
            } - {""}
            attached[text(ceo["sourceId"])].append({
                "id": text(ceo["id"]), "keys": keys, "actual": current,
                "actual40h": (ceo.get("highestPaidOtherEmployee40h") or {}).get("base"),
            })
    if sum(len(items) for items in attached.values()) != EXPECTED["current_base_attachments"]:
        raise ValueError("Current attachment count changed; update the review")

    by_source: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in positions:
        by_source[row["source_id"]].append(row)

    attachment_summary: dict[str, dict] = {}
    for source_id, ceo_rows in attached.items():
        source_rows = by_source[source_id]
        if not source_rows:
            raise ValueError(f"Current attachment lacks source positions: {source_id}")
        for ceo in ceo_rows:
            legacy_raw, _ = ranked_candidates(source_rows, ceo["keys"], legacy_candidate)
            fte_raw, fte_ranked = ranked_candidates(source_rows, ceo["keys"], fte_candidate)
            if not legacy_raw or not fte_raw or not fte_ranked:
                raise ValueError(f"No ranked candidates for current attachment: {ceo['id']}")
            actual = text(ceo["actual"].get("personKey"))
            if actual != text(legacy_raw[0][0]["person_key"]):
                raise ValueError(f"Legacy raw attachment mismatch: {ceo['id']}")
            standardized = ceo["actual40h"]
            if not standardized or standardized["personKey"] != fte_ranked[0][0]["person_key"] or not math.isclose(
                standardized["nominal"], fte_ranked[0][3]
            ):
                raise ValueError(f"Published 40-hour attachment mismatch: {ceo['id']}; rebuild app data")
            attachment_summary[ceo["id"]] = {
                "id": ceo["id"],
                "source_id": source_id,
                "actual_person_key": actual,
                "legacy_raw_top": text(legacy_raw[0][0]["person_key"]),
                "fte_raw_top": text(fte_raw[0][0]["person_key"]),
                "fte_top": text(fte_ranked[0][0]["person_key"]),
                "rank_changed": text(fte_raw[0][0]["person_key"])
                != text(fte_ranked[0][0]["person_key"]),
            }

    output_rows = []
    for row in positions:
        if text(row["record_type"]) == "canonical_ceo" or (number(row["part_vii_total_nominal"]) or 0) <= 0:
            continue
        candidate = fte_candidate(row)
        fte, hours = fte_base(row) if candidate else (None, None)
        source_attachments = [
            summary for summary in attachment_summary.values()
            if summary["source_id"] == row["source_id"]
        ]
        raw_ranks, fte_ranks, raw_tops, fte_tops, changes = [], [], [], [], []
        for summary in source_attachments:
            ceo = next(item for item in attached[row["source_id"]] if item["id"] == summary["id"])
            fte_raw, fte_ranked = ranked_candidates(by_source[row["source_id"]], ceo["keys"], fte_candidate)
            row_id = row["observation_id"]
            raw_ranks.append(str(next((i for i, item in enumerate(fte_raw, 1) if item[0]["observation_id"] == row_id), "")))
            fte_ranks.append(str(next((i for i, item in enumerate(fte_ranked, 1) if item[0]["observation_id"] == row_id), "")))
            raw_tops.append(text(fte_raw[0][0]["person_key"]))
            fte_tops.append(text(fte_ranked[0][0]["person_key"]))
            changes.append(str(fte_raw[0][0]["person_key"] != fte_ranked[0][0]["person_key"]).lower())
        output_rows.append({
            "source_id": row["source_id"], "organization": row["organization"],
            "observation_id": row["observation_id"], "person_name": row["person_name"],
            "effective_title": row["effective_title"], "record_type": row["record_type"],
            "role_scope": row["role_scope"],
            "compensation_year_role_status": row["compensation_year_role_status"],
            "former_officer_director_trustee": row["former_officer_director_trustee"],
            "default_hours_eligible": row["default_hours_eligible"],
            "average_hours_per_week": row["average_hours_per_week"],
            "average_hours_related_orgs": row["average_hours_related_orgs"],
            "total_reported_hours": row["total_reported_hours"],
            "part_vii_cash_nominal": row["part_vii_cash_nominal"],
            "part_vii_total_nominal": row["part_vii_total_nominal"],
            "schedule_j_present": row["schedule_j_present"],
            "schedule_j_base_total_nominal": row["schedule_j_base_total_nominal"],
            "schedule_j_base_org_nominal": row["schedule_j_base_org_nominal"],
            "schedule_j_base_related_nominal": row["schedule_j_base_related_nominal"],
            "combined_reported_hours": hours or "",
            "schedule_j_base_40h_nominal": round(fte, 2) if fte is not None else "",
            "base_predictor_candidate": "yes" if candidate else "no",
            "fte_standardization_status": "standardizable_combined_40h_equivalent" if candidate else "not_fte_candidate",
            "xml_validation": xml_validation(row),
            "part_vii_xml_locator": row["part_vii_xml_locator"],
            "schedule_j_xml_locator": row["schedule_j_xml_locator"],
            "attached_base_ceo_ids": "|".join(summary.get("id", "") for summary in source_attachments),
            "raw_base_rank_when_attached": "|".join(raw_ranks),
            "fte_base_rank_when_attached": "|".join(fte_ranks),
            "selected_raw_top_when_attached": "|".join(raw_tops),
            "selected_fte_top_when_attached": "|".join(fte_tops),
            "rank_changes_when_attached": "|".join(changes),
            "source_local_path": row["source_local_path"],
        })

    if len(output_rows) != EXPECTED["positive_noncanonical"]:
        raise ValueError("Positive non-canonical record count changed; update the review")
    if len({row["observation_id"] for row in output_rows}) != len(output_rows):
        raise ValueError("Audit output has duplicate observation IDs")
    if any(row["xml_validation"] not in {"part_vii_and_schedule_j_verified", "part_vii_verified_no_schedule_j"} for row in output_rows):
        raise ValueError("XML validation did not cover every output row")
    candidates = [row for row in output_rows if row["base_predictor_candidate"] == "yes"]
    if len(candidates) != EXPECTED["fte_candidates"]:
        raise ValueError("FTE candidate count changed; update the review")
    if any(not row["combined_reported_hours"] or not row["schedule_j_base_40h_nominal"] for row in candidates):
        raise ValueError("FTE candidate lacks denominator or standardized base")
    changed = [summary for summary in attachment_summary.values() if summary["rank_changed"]]
    if len(changed) != EXPECTED["reranked_attachments"]:
        raise ValueError("FTE rerank count changed; update the review")

    fields = list(output_rows[0])
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(output_rows)
    print(
        f"wrote {OUTPUT}: {len(output_rows)} XML-verified records; "
        f"{len(candidates)} FTE candidates; {len(changed)} reranked attachments"
    )


if __name__ == "__main__":
    main()
