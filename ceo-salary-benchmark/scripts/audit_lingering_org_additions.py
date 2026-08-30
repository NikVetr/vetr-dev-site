#!/usr/bin/env python3
"""Audit the lingering-organization bundle and extract recovered U.S. filings.

The supplied ZIP is a research handoff, not an application input. This script
checks its mechanical integrity, then independently extracts every officer row
from the ten source-native IRS filings recovered during review. It never
turns transition-year, co-leader, or explicit-zero rows into a default CEO
benchmark observation.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / "benchmark"
ZIP_PATH = ROOT / "tmp" / "rp_lingering_org_additions.zip"
ZIP_ROOT = "rp_lingering_org_additions/"
RECOVERY_POSITIONS = BENCHMARK / "enrichment" / "lingering_org_recovered_us_positions.csv"
RECOVERY_SOURCES = BENCHMARK / "enrichment" / "lingering_org_recovered_us_sources.csv"

EXPECTED_ZIP_SHA256 = "413e38c1ae305bc784a329b6c37a9c2675b377bd8ac4d2cb5c9c3bf37ede2844"
EXPECTED_PACKAGE_COUNTS = {
    "entity_resolution.csv": 49,
    "compensation_observations.csv": 84,
    "all_reported_positions.csv": 39,
    "organization_scale.csv": 50,
    "classification_evidence.csv": 34,
    "source_manifest.csv": 109,
    "manual_save_requests.csv": 33,
    "candidate_summary.csv": 34,
}

SOURCES = (
    {
        "source_id": "SRC-990-RECOVERY-EPOCH",
        "candidate_organization": "Epoch",
        "legal_entity": "Epoch Artificial Intelligence Inc",
        "ein": "99-4050541",
        "object_id": "202513219349201141",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_11D.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/index_2025.csv",
        "download_url": "https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/202513219349201141_public.xml",
        "sha256": "0451baf23dff72f6c39cd95d16f6a8217c9d01d2eecb885d971187a23c0c672a",
    },
    {
        "source_id": "SRC-990-RECOVERY-GOVAI",
        "candidate_organization": "GovAI",
        "legal_entity": "Centre for the Governance of AI Inc",
        "ein": "99-4000294",
        "object_id": "202543179349304359",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_11B.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/index_2025.csv",
        "download_url": "https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/202543179349304359_public.xml",
        "sha256": "c7776d70920bc2a95731fc62ea43ed93d1c4cfcb0225c1de2caf65b4564c004c",
    },
    {
        "source_id": "SRC-990-RECOVERY-LEAD-EXPOSURE-ELIMINATION-PROJECT",
        "candidate_organization": "Lead Exposure Elimination Project",
        "legal_entity": "Lead Exposure Elimination Project Inc",
        "ein": "87-3016729",
        "object_id": "202631969349301838",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2026/2026_TEOS_XML_07A.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2026/index_2026.csv",
        "download_url": "",
        "sha256": "c83f569c9d2281ec225f6d2e43c8dbe533f0deaecd5dc9ca7738e88654ef0391",
    },
    {
        "source_id": "SRC-990-RECOVERY-ANIMAL-ADVOCACY-AFRICA",
        "candidate_organization": "Animal Advocacy Africa",
        "legal_entity": "Animal Advocacy Africa",
        "ein": "93-1669847",
        "object_id": "202522199349301567",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_08A.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/index_2025.csv",
        "download_url": "https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/202522199349301567_public.xml",
        "sha256": "06915c326a51630cabc7a3a010724acc0d5518526856a76cbc766d4f8af10511",
    },
    {
        "source_id": "SRC-990-RECOVERY-APOLLO-ACADEMIC-SURVEYS",
        "candidate_organization": "Apollo Academic Surveys",
        "legal_entity": "Apollo Academic Surveys Incorporated",
        "ein": "88-2798817",
        "object_id": "202620539349200207",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2026/2026_TEOS_XML_03A.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2026/index_2026.csv",
        "download_url": "https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/202620539349200207_public.xml",
        "sha256": "f6b3330fdd43b16289aaa5d853fcaa7b9712a317a90e748da506b7ddc482e3a3",
    },
    {
        "source_id": "SRC-990-RECOVERY-APOLLO-ACADEMIC-SURVEYS-2023",
        "candidate_organization": "Apollo Academic Surveys",
        "legal_entity": "Apollo Academic Surveys Incorporated",
        "ein": "88-2798817",
        "object_id": "202430789349200603",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2024/2024_TEOS_XML_03A.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2024/index_2024.csv",
        "download_url": "",
        "sha256": "246402689dd7479631c42085ef95091233302f853618e14882694e8f55b42d1d",
    },
    {
        "source_id": "SRC-990-RECOVERY-EMPOWER-LEARNING-AFRICA-USA-2024",
        "candidate_organization": "Teaching at the Right Level Africa",
        "legal_entity": "Empower Learning Africa USA",
        "ein": "92-2014591",
        "object_id": "202501199349301740",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_05A.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/index_2025.csv",
        "download_url": "",
        "sha256": "3c9d5d5448b9dda47374b58f6111cadf144835b0d6ecb32d1e76332f2b9dae34",
    },
    {
        "source_id": "SRC-990-RECOVERY-EMPOWER-LEARNING-AFRICA-USA-2023",
        "candidate_organization": "Teaching at the Right Level Africa",
        "legal_entity": "Empower Learning Africa USA",
        "ein": "92-2014591",
        "object_id": "202410939349200436",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2024/2024_TEOS_XML_04A.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2024/index_2024.csv",
        "download_url": "",
        "sha256": "c1c3f8bf8c53d19af30f31cff8b92ab9c5c33de8c2667bdd11a917714edd99d4",
    },
    {
        "source_id": "SRC-990-RECOVERY-HEALTHIER-HENS",
        "candidate_organization": "Healthier Hens",
        "legal_entity": "Healthier Hens",
        "ein": "88-1680823",
        "object_id": "202511359349208821",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_05A.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/index_2025.csv",
        "download_url": "https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/202511359349208821_public.xml",
        "sha256": "579c133706bd5576e681a1b583ebad6034bc8161e6522baa2b1ea96a40556912",
    },
    {
        "source_id": "SRC-990-RECOVERY-PROBABLY-GOOD",
        "candidate_organization": "Probably Good",
        "legal_entity": "Probably Good Foundation Inc",
        "ein": "99-2361194",
        "object_id": "202503089349302335",
        "archive_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_11A.zip",
        "index_url": "https://apps.irs.gov/pub/epostcard/990/xml/2025/index_2025.csv",
        "download_url": "https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/202503089349302335_public.xml",
        "sha256": "6391ebdc50fd2fa0204eef4c5e2f2f706f6ac12c8de7eb56d10bc7e6affff558",
    },
)

POSITION_FIELDS = (
    "source_id", "candidate_organization", "legal_entity", "ein", "irs_object_id",
    "return_type", "reporting_period_start", "reporting_period_end",
    "compensation_calendar_year", "person_name", "source_title",
    "average_hours_per_week", "part_vii_organization", "part_vii_related",
    "part_vii_other", "part_vii_cash_proxy", "part_vii_total_proxy",
    "form990ez_officer_compensation", "form990ez_benefits",
    "form990ez_expense_account_allowances", "revenue", "expenses", "staff",
    "staff_measure_definition", "outcome", "usable_point_observation",
    "recommended_disposition", "reason", "evidence_locator", "source_url",
    "local_path", "source_sha256",
)

SOURCE_FIELDS = (
    "source_id", "candidate_organization", "legal_entity", "ein", "irs_object_id",
    "reporting_period_start", "reporting_period_end", "return_type", "source_url",
    "mirror_download_url", "official_irs_index_url", "official_irs_bulk_archive_url",
    "official_irs_archive_member", "local_path", "mime_type", "byte_length", "sha256",
    "retrieval_timestamp_utc", "validation_status",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_zip_csv(archive: ZipFile, filename: str) -> list[dict[str, str]]:
    raw = archive.read(f"{ZIP_ROOT}{filename}")
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))


def number(value: str) -> Decimal | None:
    value = (value or "").strip()
    return Decimal(value) if value else None


def audit_zip() -> dict[str, int]:
    if not ZIP_PATH.is_file():
        raise FileNotFoundError(f"Missing handoff ZIP: {ZIP_PATH}")
    if sha256(ZIP_PATH.read_bytes()) != EXPECTED_ZIP_SHA256:
        raise ValueError("Lingering-organization ZIP hash changed; review it as a new handoff")
    with ZipFile(ZIP_PATH) as archive:
        if archive.testzip() is not None:
            raise ValueError("Lingering-organization ZIP is corrupt")
        if len(archive.namelist()) != 184:
            raise ValueError(f"Expected 184 ZIP members, found {len(archive.namelist())}")
        tables = {name: read_zip_csv(archive, name) for name in EXPECTED_PACKAGE_COUNTS}
        for name, expected in EXPECTED_PACKAGE_COUNTS.items():
            if len(tables[name]) != expected:
                raise ValueError(f"{name}: expected {expected} rows, found {len(tables[name])}")

        manifest = tables["source_manifest.csv"]
        for row in manifest:
            member = f"{ZIP_ROOT}{row['local_relative_path']}"
            raw = archive.read(member)
            if len(raw) != int(row["byte_length"]) or sha256(raw) != row["sha256"]:
                raise ValueError(f"Manifest mismatch: {row['source_id']}")
        if any(row["original_byte_length"].strip() for row in manifest):
            raise ValueError("Expected the handoff's original-byte fields to remain empty")
        if any(not row["local_relative_path"].endswith(".txt") for row in manifest):
            raise ValueError("The package unexpectedly contains a source-native artifact")

        arithmetic_checked = 0
        for row in tables["compensation_observations.csv"]:
            org = number(row["part_vii_organization"])
            related = number(row["part_vii_related"])
            other = number(row["part_vii_other"])
            cash = number(row["part_vii_cash_proxy"])
            total = number(row["part_vii_total_proxy"])
            if cash is not None:
                if cash != (org or Decimal(0)) + (related or Decimal(0)):
                    raise ValueError(f"Part VII cash arithmetic failed: {row['observation_id']}")
                arithmetic_checked += 1
            if total is not None and total != (cash or Decimal(0)) + (other or Decimal(0)):
                raise ValueError(f"Part VII total arithmetic failed: {row['observation_id']}")
            lower = number(row["disclosed_band_lower"])
            upper = number(row["disclosed_band_upper"])
            if lower is not None and upper is not None and lower > upper:
                raise ValueError(f"Reversed disclosed band: {row['observation_id']}")

        return {
            "zip_members": len(archive.namelist()),
            "sources": len(manifest),
            "distinct_source_urls": len({row["direct_download_url"] for row in manifest}),
            "source_native_labels_on_text_summaries": sum(row["source_native"] == "yes" for row in manifest),
            "source_native_artifacts": 0,
            "compensation_rows": len(tables["compensation_observations.csv"]),
            "part_vii_arithmetic_rows": arithmetic_checked,
        }


def local_name(element: ET.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def elements(parent: ET.Element, name: str) -> list[ET.Element]:
    return [element for element in parent.iter() if local_name(element) == name]


def child_text(parent: ET.Element, name: str) -> str:
    for element in parent:
        if local_name(element) == name:
            return (element.text or "").strip()
    return ""


def first_descendant_text(parent: ET.Element, name: str) -> str:
    found = elements(parent, name)
    return (found[0].text or "").strip() if found else ""


def integer_text(value: str) -> str:
    return str(int(Decimal(value))) if value.strip() else ""


def disposition(source: dict[str, str], person: str, title: str, total: int) -> tuple[str, str, str, str]:
    object_id = source["object_id"]
    normalized_person = person.upper()
    if object_id == "202543179349304359":
        return (
            "partial_year_or_transition", "no", "not_usable",
            "The filing labels the role as beginning in June; the amount is partial-year and the U.S./U.K. employer boundary remains unresolved.",
        )
    if object_id == "202631969349301838" and normalized_person == "TOMOS DAVIES":
        return (
            "validated_positive_exact", "yes", "observed_only",
            "Named full-time COO amount from the newer filing; valid as an observed-only COO record, not a CEO observation.",
        )
    if object_id == "202631969349301838" and "CO-EXEC" in title.upper():
        return (
            "validated_positive_exact", "yes", "observed_only",
            "Named full-time co-executive-director amount; retain each co-leader separately and never combine or annualize them.",
        )
    if object_id == "202511359349208821" and total > 0:
        return (
            "validated_positive_exact", "no", "not_usable",
            "Exact historical officer payment from the final return of a terminated entity, but the filing does not establish a current organization-wide executive role.",
        )
    if object_id == "202430789349200603" and normalized_person == "CHRIS SAID" and total > 0:
        return (
            "validated_positive_exact", "no", "not_usable",
            "Exact historical president payment; the current 2025 return reports zero, so this older amount is not a current salary observation.",
        )
    if object_id == "202501199349301740" and normalized_person == "DAVID SEARS" and total > 0:
        return (
            "validated_positive_exact", "no", "not_usable",
            "Exact U.S.-affiliate president amount, not compensation for Teaching at the Right Level Africa's organization-wide executive.",
        )
    zero_reasons = {
        "202513219349201141": "Explicit officer zero in Epoch's setup/pre-full-spinout filing; it is not evidence of current pay.",
        "202631969349301838": "Explicit zero for a low-hour board officer, not executive salary.",
        "202522199349301567": "Explicit zero for a low-hour officer; no paid organization-wide executive is identified in this filing.",
        "202620539349200207": "Explicit zero in a Form 990-EZ officer row; this filing does not establish a positive current salary.",
        "202511359349208821": "Explicit zero in the final return of a terminated entity.",
        "202503089349302335": "Explicit zero in a pre-operations filing with zero expenses and employees; it is not a current salary point.",
        "202430789349200603": "Explicit zero for a historical low-hour Apollo officer; it is not a salary observation.",
        "202501199349301740": "Explicit zero for a low-hour Empower Learning Africa USA affiliate officer; it is not pay for the Africa executive.",
        "202410939349200436": "Explicit zero in Empower Learning Africa USA's setup-year filing; it is not pay for the Africa executive.",
    }
    if total == 0:
        return "validated_zero", "no", "not_usable", zero_reasons[object_id]
    raise ValueError(f"Unreviewed positive row: {source['candidate_organization']} / {person}")


def write_csv(path: Path, rows: list[dict[str, object]], fields: tuple[str, ...]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="raise", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def extract_recovered_sources() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    position_rows: list[dict[str, object]] = []
    source_rows: list[dict[str, object]] = []
    for source in SOURCES:
        filename = f"{source['object_id']}_public.xml"
        path = BENCHMARK / "sources" / "native" / "form990" / filename
        metadata_path = path.with_suffix(path.suffix + ".metadata.json")
        raw = path.read_bytes()
        if sha256(raw) != source["sha256"]:
            raise ValueError(f"Recovered source hash mismatch: {source['source_id']}")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata["sha256"] != source["sha256"] or metadata["byte_length"] != len(raw):
            raise ValueError(f"Recovered-source metadata mismatch: {source['source_id']}")

        root = ET.fromstring(raw.decode("utf-8-sig"))
        header = elements(root, "ReturnHeader")[0]
        filer = elements(header, "Filer")[0]
        ein = first_descendant_text(filer, "EIN")
        period_start = first_descendant_text(header, "TaxPeriodBeginDt")
        period_end = first_descendant_text(header, "TaxPeriodEndDt")
        return_type_code = first_descendant_text(header, "ReturnTypeCd")
        if ein != source["ein"].replace("-", ""):
            raise ValueError(f"EIN mismatch: {source['source_id']}")
        return_type = "Form 990-EZ" if return_type_code == "990EZ" else "Form 990"
        # IRS publishes these objects as members of bulk ZIP archives rather
        # than stable per-object URLs. Link the canonical archive and preserve
        # the exact member name separately; the mirror URL remains explicit.
        official_source_url = source["archive_url"]
        body_tag = "IRS990EZ" if return_type_code == "990EZ" else "IRS990"
        body = elements(root, body_tag)[0]
        revenue = (
            first_descendant_text(body, "TotalRevenueAmt")
            if return_type_code == "990EZ"
            else first_descendant_text(body, "CYTotalRevenueAmt")
        )
        expenses = (
            first_descendant_text(body, "TotalExpensesAmt")
            if return_type_code == "990EZ"
            else first_descendant_text(body, "CYTotalExpensesAmt")
        )
        staff = first_descendant_text(body, "TotalEmployeeCnt") if return_type_code != "990EZ" else ""
        staff_definition = "Form 990 Part I line 5 total employees" if staff else "Not disclosed by Form 990-EZ"
        group_tag = "OfficerDirectorTrusteeEmplGrp" if return_type_code == "990EZ" else "Form990PartVIISectionAGrp"
        groups = elements(body, group_tag)

        for index, group in enumerate(groups, 1):
            person = child_text(group, "PersonNm") or child_text(group, "BusinessNameLine1Txt")
            title = child_text(group, "TitleTxt")
            hours = child_text(group, "AverageHrsPerWkDevotedToPosRt") or child_text(group, "AverageHoursPerWeekRt")
            if return_type_code == "990EZ":
                compensation = int(child_text(group, "CompensationAmt") or 0)
                benefits = int(child_text(group, "EmployeeBenefitProgramAmt") or 0)
                allowances = int(child_text(group, "ExpenseAccountOtherAllwncAmt") or 0)
                total = compensation + benefits + allowances
                org = related = other = cash = part_vii_total = ""
                locator = f"Return/ReturnData/IRS990EZ/OfficerDirectorTrusteeEmplGrp[{index}]"
            else:
                org = int(child_text(group, "ReportableCompFromOrgAmt") or 0)
                related = int(child_text(group, "ReportableCompFromRltdOrgAmt") or 0)
                other = int(child_text(group, "OtherCompensationAmt") or 0)
                cash = org + related
                part_vii_total = cash + other
                compensation = benefits = allowances = ""
                total = part_vii_total
                locator = f"Return/ReturnData/IRS990/Form990PartVIISectionAGrp[{index}]"
            outcome, usable, recommended, reason = disposition(source, person, title, total)
            position_rows.append({
                "source_id": source["source_id"],
                "candidate_organization": source["candidate_organization"],
                "legal_entity": source["legal_entity"],
                "ein": source["ein"],
                "irs_object_id": source["object_id"],
                "return_type": return_type,
                "reporting_period_start": period_start,
                "reporting_period_end": period_end,
                "compensation_calendar_year": period_start[:4],
                "person_name": person,
                "source_title": title,
                "average_hours_per_week": hours,
                "part_vii_organization": org,
                "part_vii_related": related,
                "part_vii_other": other,
                "part_vii_cash_proxy": cash,
                "part_vii_total_proxy": part_vii_total,
                "form990ez_officer_compensation": compensation,
                "form990ez_benefits": benefits,
                "form990ez_expense_account_allowances": allowances,
                "revenue": integer_text(revenue),
                "expenses": integer_text(expenses),
                "staff": integer_text(staff),
                "staff_measure_definition": staff_definition,
                "outcome": outcome,
                "usable_point_observation": usable,
                "recommended_disposition": recommended,
                "reason": reason,
                "evidence_locator": locator,
                "source_url": official_source_url,
                "local_path": f"benchmark/sources/native/form990/{filename}",
                "source_sha256": source["sha256"],
            })

        source_rows.append({
            "source_id": source["source_id"],
            "candidate_organization": source["candidate_organization"],
            "legal_entity": source["legal_entity"],
            "ein": source["ein"],
            "irs_object_id": source["object_id"],
            "reporting_period_start": period_start,
            "reporting_period_end": period_end,
            "return_type": return_type,
            "source_url": official_source_url,
            "mirror_download_url": source["download_url"],
            "official_irs_index_url": source["index_url"],
            "official_irs_bulk_archive_url": source["archive_url"],
            "official_irs_archive_member": filename,
            "local_path": f"benchmark/sources/native/form990/{filename}",
            "mime_type": "application/xml",
            "byte_length": len(raw),
            "sha256": source["sha256"],
            "retrieval_timestamp_utc": metadata["retrieval_timestamp_utc"],
            "validation_status": "well_formed_xml; hash_ein_period_and_arithmetic_verified",
        })

    write_csv(RECOVERY_POSITIONS, position_rows, POSITION_FIELDS)
    write_csv(RECOVERY_SOURCES, source_rows, SOURCE_FIELDS)
    return position_rows, source_rows


def main() -> None:
    package = audit_zip()
    positions, sources = extract_recovered_sources()
    positives = sum(row["outcome"] == "validated_positive_exact" for row in positions)
    zeros = sum(row["outcome"] == "validated_zero" for row in positions)
    transitions = sum(row["outcome"] == "partial_year_or_transition" for row in positions)
    print(json.dumps({
        "package": package,
        "recovered_sources": len(sources),
        "recovered_position_rows": len(positions),
        "validated_positive_exact": positives,
        "validated_zero": zeros,
        "partial_year_or_transition": transitions,
        "new_default_ceo_observations": 0,
        "new_default_position_observations": 0,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
