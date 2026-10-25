import csv
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCREENING = ROOT / "benchmark/enrichment/ea_core_candidate_screening.csv"
UNIVERSE = ROOT / "benchmark/frozen/combined_peer_universe_3wave_precomp.csv"
DISPOSITIONS = {
    "selected_below_scale_not_collected", "structural_context_frozen", "structural_context_non_us",
    "structural_context_project", "structural_context_umbrella", "excluded_part_time",
    "excluded_transition", "excluded_no_usable_filing", "deferred_no_filing",
    "eligible_prior_clean_year_pending",
}


def rows(path):
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


class EaCoreScreeningTest(unittest.TestCase):
    def test_every_frozen_ea_core_candidate_has_one_pay_blind_disposition(self):
        screening = rows(SCREENING)
        expected = {row["candidate_id"] for row in rows(UNIVERSE) if row["ea_affinity_precomp"] == "EA-core"}
        self.assertEqual({row["candidate_id"] for row in screening}, expected)
        self.assertEqual(len(screening), len(expected))
        for row in screening:
            self.assertIn(row["screening_disposition"], DISPOSITIONS, row["candidate_id"])
            self.assertTrue(row["nonpay_reason"] and row["sources"], row["candidate_id"])
            self.assertNotIn("$", row["nonpay_reason"], row["candidate_id"])
            self.assertEqual(row["pay_seen"], "no", row["candidate_id"])

    def test_no_screened_out_candidate_enters_the_default_cohort(self):
        raw = (ROOT / "app-data.js").read_text(encoding="utf-8")
        data = json.loads(raw.removeprefix("window.CEO_BENCHMARK_DATA = ").strip().removesuffix(";"))
        default_organizations = {row["organization"].casefold() for row in data["incumbents"] if row["defaultIncluded"]}
        for row in rows(SCREENING):
            if row["screening_disposition"] == "selected_below_scale_not_collected":
                continue
            # Frozen names can carry an alias after " / " or inside "(formerly ...)".
            aliases = re.split(r" / |\(formerly ", row["organization"].removesuffix(")"))
            for alias in aliases:
                self.assertNotIn(alias.strip().casefold(), default_organizations, row["organization"])


if __name__ == "__main__":
    unittest.main()
