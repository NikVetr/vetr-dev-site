import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from predictive_model_contract import EXTRA_TRAINING_ROWS, predictive_training_eligible


def load_prepare_module():
    path = ROOT / "benchmark" / "analysis" / "predictive_salary_models" / "prepare_model_data.py"
    spec = importlib.util.spec_from_file_location("prepare_model_data", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_app_data():
    raw = (ROOT / "app-data.js").read_text(encoding="utf-8")
    prefix = "window.CEO_BENCHMARK_DATA = "
    return json.loads(raw[len(prefix):].strip().removesuffix(";"))


class PredictiveModelContractTest(unittest.TestCase):
    def test_reviewed_training_eligibility_has_expected_counts(self):
        data = load_app_data()
        exact = cash = ads = 0
        admitted_nondefault = set()
        for source, rows in (("filing", data["incumbents"]), ("job_ad", data["jobAds"])):
            for row in rows:
                if not predictive_training_eligible(source, row):
                    continue
                salary = row.get("salary") or {}
                if source == "filing" and salary.get("base") is not None:
                    exact += 1
                elif source == "filing" and salary.get("cash") is not None:
                    cash += 1
                elif source == "job_ad" and salary.get("base") is not None:
                    ads += 1
                if not row.get("defaultIncluded"):
                    admitted_nondefault.add(row["id"])
        self.assertEqual((exact, cash, ads), (114, 12, 27))
        self.assertEqual(admitted_nondefault, set(EXTRA_TRAINING_ROWS))

    def test_known_noncomparable_records_are_not_admitted(self):
        for row_id in (
            "SRC-990-EXT-INSTITUTE-FOR-WOMEN-S-POLICY-RESEARCH",
            "SRC-990-EXT-CENTER-FOR-LAW-AND-SOCIAL-POLICY",
            "SRC-990-EA-QUALIA-RESEARCH-INSTITUTE",
            "SRC-AD-PVARF", "SRC-AD-WILLIAMS", "SRC-AD-CSCCE",
            "SRC-AD-AAPO-2026", "SRC-AD-FIRST-EMBRACE-2026",
            "SRC-AD-CETI", "SRC-AD-NPF", "SRC-AD-SNAP",
            "SRC-AD-ALLCHICAGO", "SRC-AD-INJUSTICEWATCH", "SRC-AD-DRW",
        ):
            self.assertNotIn(row_id, EXTRA_TRAINING_ROWS)

    def test_rp_is_rejected_even_under_a_different_row_id(self):
        module = load_prepare_module()
        reference = {"id": "RP-REFERENCE", "organization": "Rethink Priorities"}
        injected = {
            "id": "FUTURE-ELIGIBLE-FILING",
            "organization": "  rethink   priorities ",
            "analysisStatus": "primary",
            "defaultIncluded": True,
        }
        self.assertTrue(module.is_rp_reference(injected, reference))

    def test_location_mapping_does_not_default_foreign_or_ambiguous_rows_to_us(self):
        module = load_prepare_module()
        self.assertEqual(module.broad_location("Remote / Gombe, Nigeria"), "Outside United States")
        self.assertEqual(module.broad_location("Remote"), "Location not reported")
        self.assertEqual(module.broad_location("Seattle/remote"), "United States")
        with self.assertRaisesRegex(ValueError, "Unreviewed model location"):
            module.broad_location("New country not yet reviewed")

    def test_focus_mapping_is_explicit_for_inherited_mixed_topic_labels(self):
        module = load_prepare_module()
        mixed = "Research, evaluation, philanthropy infrastructure, and policy"
        self.assertEqual(module.broad_focus(mixed, "PEAK Grantmaking"), "Philanthropy / nonprofit support")
        self.assertEqual(module.broad_focus(mixed, "San Francisco Estuary Institute"), "Climate / environment")
        self.assertEqual(module.broad_focus(mixed, "Stimson Center"), "Security / governance")
        self.assertEqual(module.broad_focus(mixed, "Demos"), "Research / evidence")
        with self.assertRaisesRegex(ValueError, "Missing reviewed focus override"):
            module.broad_focus(mixed, "New organization")


if __name__ == "__main__":
    unittest.main()
