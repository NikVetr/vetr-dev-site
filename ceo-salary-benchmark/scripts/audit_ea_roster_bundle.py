#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import re
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_SHA256 = "483dd2fd32e3ed0ad805b2c02f1ab63c2c4377a3f8dd6f6f37dfce76f7c02010"
OUTPUT = ROOT / "benchmark" / "enrichment" / "ea_roster_candidate_review.csv"
SOURCE_MANIFEST = ROOT / "benchmark" / "enrichment" / "ea_roster_source_manifest.csv"
VALIDATED = ROOT / "benchmark" / "enrichment" / "ea_roster_validated_compensation.csv"
SCORED_PATH = "rp_ceo_ea_roster_definitive/deliverables/definitive_scored_additions_reference_schema.csv"
QUEUE_PATH = "rp_ceo_ea_roster_definitive/deliverables/newly_identified_screening_queue.csv"
VALIDATION_PATH = "rp_ceo_ea_roster_definitive/analysis/validation_report.txt"
SUMMARY_PATH = "rp_ceo_ea_roster_definitive/analysis/build_summary.json"
PRESERVED_SOURCES = [
    ("NATIVE-PRINT-GWWC", "Giving What We Can supplied print", "", "sources/native/rosters/print_pdfs/giving_what_we_can_donation_platform_print.pdf", "application/pdf", "preserved_user_supplied_pdf"),
    ("NATIVE-PRINT-WIKIPEDIA", "Wikipedia category supplied print", "", "sources/native/rosters/print_pdfs/wikipedia_ea_organizations_category_print.pdf", "application/pdf", "preserved_user_supplied_pdf"),
    ("NATIVE-PRINT-EAFORUM", "EA Forum supplied print", "", "sources/native/rosters/print_pdfs/ea_forum_organizations_and_projects_print.pdf", "application/pdf", "preserved_user_supplied_pdf"),
    ("SRC-ROSTER-GWWC", "Giving What We Can donation platform", "https://www.givingwhatwecan.org/donate/organizations", "sources/native/rosters/src-roster-gwwc-2026-08-28.html", "text/html", "preserved_live_html"),
    ("SRC-ROSTER-WIKIPEDIA", "Wikipedia EA-organization category", "https://en.wikipedia.org/wiki/Category:Organizations_associated_with_effective_altruism", "sources/native/rosters/src-roster-wikipedia-2026-08-28.html", "text/html", "preserved_live_html"),
    ("SRC-ROSTER-EAFORUM", "EA Forum organizations and projects", "https://forum.effectivealtruism.org/topics/organizations-and-projects-in-effective-altruism", "sources/native/rosters/src-roster-eaforum-2026-08-28.html", "text/html", "preserved_live_html"),
    ("SRC-REC-GIVEWELL", "GiveWell top charities", "https://www.givewell.org/charities/top-charities", "sources/native/rosters/src-rec-givewell-2026-08-28.html", "text/html", "preserved_live_html"),
    ("SRC-REC-ACE", "Animal Charity Evaluators recommended charities", "https://animalcharityevaluators.org/recommended-charities/", "sources/native/rosters/src-rec-ace-2026-08-28.html", "text/html", "preserved_live_html_corrected_url"),
    ("SRC-REC-GIVINGGREEN", "Giving Green top climate nonprofits", "https://www.givinggreen.earth/top-climate-nonprofits", "sources/native/rosters/src-rec-givinggreen-2026-08-28.html", "text/html", "preserved_live_html_corrected_url"),
    ("SRC-PORTFOLIO-AIM", "Charity Entrepreneurship portfolio", "https://www.charityentrepreneurship.com/our-charities", "sources/native/rosters/src-portfolio-aim-2026-08-28.html", "text/html", "preserved_live_html_corrected_url"),
    ("SRC-PORTFOLIO-EV", "Effective Ventures organisations", "https://ev.org/organisations/", "sources/native/rosters/src-portfolio-ev-2026-08-28.html", "text/html", "preserved_live_html_corrected_url"),
    ("SRC-990-EA-CENTER-FOR-ELECTION-SCIENCE", "Center for Election Science Form 990", "https://projects.propublica.org/nonprofits/organizations/452334002/202503189349305870/full", "sources/native/form990/202503189349305870_rendered.html", "text/html", "preserved_rendered_form990"),
    ("SRC-990-EA-CENTER-FOR-ELECTION-SCIENCE-SCHEDULE-J", "Center for Election Science Schedule J", "https://projects.propublica.org/nonprofits/full_text/202503189349305870/IRS990ScheduleJ", "sources/native/form990/202503189349305870_schedule_j_rendered.html", "text/html", "preserved_rendered_form990"),
    ("SRC-990-EA-FORESIGHT-INSTITUTE", "Foresight Institute Form 990", "https://projects.propublica.org/nonprofits/organizations/770119168/202543179349308564/full", "sources/native/form990/202543179349308564_rendered.html", "text/html", "preserved_rendered_form990"),
    ("SRC-990-EA-FORESIGHT-INSTITUTE-SCHEDULE-J", "Foresight Institute Schedule J", "https://projects.propublica.org/nonprofits/full_text/202543179349308564/IRS990ScheduleJ", "sources/native/form990/202543179349308564_schedule_j_rendered.html", "text/html", "preserved_rendered_form990"),
    ("SRC-990-EA-LEVERAGE-RESEARCH", "Leverage Research Form 990", "https://projects.propublica.org/nonprofits/organizations/453989386/202523239349301652/full", "sources/native/form990/202523239349301652_rendered.html", "text/html", "preserved_rendered_form990"),
    ("SRC-990-EA-QUALIA-RESEARCH-INSTITUTE", "Qualia Research Institute Form 990", "https://projects.propublica.org/nonprofits/organizations/825457325/202503499349300780/full", "sources/native/form990/202503499349300780_rendered.html", "text/html", "preserved_rendered_form990"),
    ("SRC-990-EA-MAGNIFY-MENTORING", "Magnify Mentoring Form 990-EZ", "https://projects.propublica.org/nonprofits/organizations/850696012/202601479349201500/full", "sources/native/form990/202601479349201500_rendered.html", "text/html", "preserved_rendered_form990ez"),
]


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def csv_from_zip(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    text = archive.read(name).decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit and classify the supplied EA roster bundle.")
    parser.add_argument("bundle", type=Path, help="Path to rp_ceo_definitive_ea_roster_bundle.zip")
    args = parser.parse_args()
    if digest(args.bundle) != EXPECTED_SHA256:
        raise ValueError("The supplied roster ZIP does not match the reviewed SHA-256")

    with zipfile.ZipFile(args.bundle) as archive:
        scored = csv_from_zip(archive, SCORED_PATH)
        queue = csv_from_zip(archive, QUEUE_PATH)
        validation = archive.read(VALIDATION_PATH).decode("utf-8")
        summary = archive.read(SUMMARY_PATH)

    if len(scored) != 34 or len(queue) != 109:
        raise ValueError(f"Unexpected roster dimensions: scored={len(scored)}, queue={len(queue)}")
    if "Failed: 1" not in validation or "No newly found entity silently assigned a score --" not in validation:
        raise ValueError("The bundle's recorded validation failure changed")
    if summary:
        raise ValueError("Expected the failed build to leave an empty build_summary.json")

    scored_queue = [row for row in queue if row.get("comparability_score", "").strip()]
    if len(scored_queue) != 19:
        raise ValueError(f"Expected 19 silently scored queue rows; found {len(scored_queue)}")
    if not any(normalize(row["organization"]) == normalize("Rethink Priorities") for row in queue):
        raise ValueError("The flawed screening queue no longer contains the benchmark target")

    with VALIDATED.open(encoding="utf-8", newline="") as handle:
        validated = {row["organization"]: row for row in csv.DictReader(handle)}
    if set(validated) != {
        "Center for Election Science", "Foresight Institute", "Leverage Research",
        "Qualia Research Institute", "Magnify Mentoring",
    }:
        raise ValueError("Reviewed compensation set does not contain the expected five organizations")

    extra_fields = [
        "bundle_sha256", "bundle_validation_status", "external_number_review",
        "app_integration_status", "corrected_employee_count", "review_note",
    ]
    output_rows: list[dict[str, str]] = []
    for row in scored:
        organization = row["organization"]
        review = dict(row)
        review["bundle_sha256"] = EXPECTED_SHA256
        review["bundle_validation_status"] = "failed_16_of_17_checks_passed"
        if organization in validated:
            corrected = validated[organization]
            review["external_number_review"] = "validated_against_preserved_rendered_filing"
            review["app_integration_status"] = f"{corrected['default_inclusion_status']}_only"
            review["corrected_employee_count"] = corrected["employee_count"]
            review["review_note"] = corrected["selection_note"]
        else:
            review["external_number_review"] = "not_source_supported_by_bundle"
            review["app_integration_status"] = "not_integrated_no_validated_compensation"
            review["corrected_employee_count"] = ""
            review["review_note"] = (
                "The bundle supplies no compensation observation and no row-level source artifact for its "
                "scale, tier, score, title, structure, or EA-classification claims. Retained for screening only."
            )
        output_rows.append(review)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(scored[0]) + extra_fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(output_rows)

    manifest_rows = []
    for source_id, label, url, local_path, mime_type, status in PRESERVED_SOURCES:
        path = ROOT / "benchmark" / local_path
        if not path.is_file():
            raise FileNotFoundError(f"Missing roster source artifact: {path}")
        manifest_rows.append({
            "source_id": source_id,
            "label": label,
            "canonical_url": url,
            "local_path": local_path,
            "mime_type": mime_type,
            "byte_length": path.stat().st_size,
            "sha256": digest(path),
            "status": status,
            "retrieval_or_freeze_date": "2026-08-28",
        })
    with SOURCE_MANIFEST.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(manifest_rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(manifest_rows)
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)}: 34 candidates; 5 compensation observations validated; "
        f"29 screening-only; 19 invalid scored queue rows detected. Preserved {len(manifest_rows)} sources."
    )


if __name__ == "__main__":
    main()
