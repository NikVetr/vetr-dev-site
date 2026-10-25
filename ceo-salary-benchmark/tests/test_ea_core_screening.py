import csv
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCREENING = ROOT / "benchmark/enrichment/ea_core_candidate_screening.csv"
UNIVERSE = ROOT / "benchmark/frozen/combined_peer_universe_3wave_precomp.csv"
REQUESTED_REVIEWS = {"EXP-091", "EXP-061"}
ADMITTED = {"admitted_prior_clean_year"}
DISPOSITIONS = ADMITTED | {
    "selected_below_scale_not_collected", "structural_context_frozen", "structural_context_non_us",
    "structural_context_project", "structural_context_umbrella", "excluded_part_time",
    "excluded_transition", "excluded_no_usable_filing", "deferred_no_filing",
    "excluded_transition_and_source_quarantine",
}


def rows(path):
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def aliases(organization):
    # Frozen names can carry an alias after " / " or inside "(formerly ...)".
    return [alias.strip().casefold() for alias in re.split(r" / |\(formerly ", organization.removesuffix(")"))]


class EaCoreScreeningTest(unittest.TestCase):
    def test_every_frozen_ea_core_candidate_has_one_pay_blind_disposition(self):
        screening = rows(SCREENING)
        universe = {row["candidate_id"]: row for row in rows(UNIVERSE)}
        expected = {cid for cid, row in universe.items() if row["ea_affinity_precomp"] == "EA-core"}
        self.assertEqual({row["candidate_id"] for row in screening if row["screening_scope"] == "ea_core"}, expected)
        self.assertEqual({row["candidate_id"] for row in screening if row["screening_scope"] == "requested_review"}, REQUESTED_REVIEWS)
        self.assertEqual(len(screening), len(expected) + len(REQUESTED_REVIEWS))
        for row in screening:
            self.assertEqual(universe[row["candidate_id"]]["organization"], row["organization"])
            self.assertIn(row["screening_disposition"], DISPOSITIONS, row["candidate_id"])
            self.assertTrue(row["nonpay_reason"] and row["sources"], row["candidate_id"])
            self.assertNotIn("$", row["nonpay_reason"], row["candidate_id"])
            self.assertEqual(row["pay_seen"], "no", row["candidate_id"])

    def test_default_cohort_follows_the_screening_dispositions(self):
        raw = (ROOT / "app-data.js").read_text(encoding="utf-8")
        data = json.loads(raw.removeprefix("window.CEO_BENCHMARK_DATA = ").strip().removesuffix(";"))
        default_organizations = {row["organization"].casefold() for row in data["incumbents"] if row["defaultIncluded"]}
        for row in rows(SCREENING):
            if row["screening_disposition"] == "selected_below_scale_not_collected":
                continue
            in_default = any(alias in default_organizations for alias in aliases(row["organization"]))
            self.assertEqual(in_default, row["screening_disposition"] in ADMITTED, row["organization"])


if __name__ == "__main__":
    unittest.main()
