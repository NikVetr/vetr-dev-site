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
    def test_generated_app_uses_collapsed_ea_taxonomy(self):
        data = load_app_data()
        self.assertNotIn("EA-core", json.dumps(data))
        all_rows = [
            *data["incumbents"], *data["jobAds"], data["rpReference"],
            *(row for rows in data["positionObservations"].values() for row in rows),
            *(row for rows in data["positionJobAds"].values() for row in rows),
            *(row for rows in data["rpReferencesByPosition"].values() for row in rows),
        ]
        self.assertEqual(
            {row["eaAffinity"] for row in all_rows},
            {"EA-adjacent", "functional-only"},
        )

    def test_model_uses_adjusted_salary_without_a_second_pay_year_effect(self):
        artifact = json.loads(
            (ROOT / "benchmark" / "analysis" / "predictive_salary_models" / "model_artifact.json")
            .read_text(encoding="utf-8")
        )
        expected = ["expenses", "revenue", "staff", "highest_other_base"]
        self.assertEqual([feature["key"] for feature in artifact["continuousFeatures"]], expected)
        self.assertNotIn("compensation_year", artifact["rpProfile"])
        self.assertEqual(
            set(artifact["models"]),
            {
                "bayesian", "bayesianNoHighest", "bayesianRanges",
                "bayesianRangesNoHighest", "gam", "gamNoHighest", "intercept",
                "linear", "linearNoHighest",
            },
        )
        for model_key in ("bayesian", "bayesianRanges", "gam", "linear"):
            self.assertEqual(
                [item["key"] for item in artifact["models"][model_key]["preprocessing"]],
                expected,
            )
            self.assertTrue(artifact["models"][model_key]["includeHighestOtherPay"])
        reduced = expected[:-1]
        for model_key in (
            "bayesianNoHighest", "bayesianRangesNoHighest", "gamNoHighest",
            "linearNoHighest",
        ):
            self.assertEqual(
                [item["key"] for item in artifact["models"][model_key]["preprocessing"]],
                reduced,
            )
            self.assertFalse(artifact["models"][model_key]["includeHighestOtherPay"])
        self.assertEqual(set(artifact["models"]["gam"]["effects"]), {
            "expenses", "revenue", "staff", "highestOther",
        })
        self.assertEqual(
            set(artifact["models"]["gamNoHighest"]["effects"]),
            {"expenses", "revenue", "staff"},
        )
        self.assertEqual(artifact["eaLevels"], ["Functional overlap", "EA-adjacent"])
        self.assertEqual(sum(artifact["eaFilingCounts"]), 126)
        for feature in artifact["categoricalFeatures"]:
            self.assertEqual(len(feature["filingCounts"]), len(feature["levels"]))
            self.assertEqual(sum(feature["filingCounts"]), 126)

    def test_browser_baselines_preserve_leakage_safe_residual_provenance(self):
        artifact = json.loads(
            (ROOT / "benchmark" / "analysis" / "predictive_salary_models" / "model_artifact.json")
            .read_text(encoding="utf-8")
        )
        exact_ids = [
            record["id"]
            for record in artifact["training"]["records"]
            if record["observation"] == "exact_base"
        ]
        for model_key in ("intercept", "linear", "linearNoHighest", "gam", "gamNoHighest"):
            model = artifact["models"][model_key]
            self.assertFalse(model["includeAdvertisedRanges"])
            self.assertEqual(model["trainingRecordIds"], exact_ids)
            self.assertEqual(set(model["residualRecordIds"]), set(exact_ids))
            self.assertEqual(len(model["residualRecordIds"]), len(exact_ids))
            self.assertEqual(len(model["residuals"]), len(exact_ids))
            self.assertEqual(model["diagnostics"]["trainingN"], len(exact_ids))
        candidates = {
            "linear": [
                "log_expenses", "log_revenue", "log_staff", "log_highest_other_base",
                "expenses_missing", "revenue_missing", "staff_missing",
                "highest_other_base_missing",
            ],
            "linearNoHighest": [
                "log_expenses", "log_revenue", "log_staff",
                "expenses_missing", "revenue_missing", "staff_missing",
            ],
        }
        for model_key, expected_candidates in candidates.items():
            model = artifact["models"][model_key]
            self.assertEqual(model["candidateDesignColumns"], expected_candidates)
            self.assertEqual(model["designColumns"], model["activeDesignColumns"])
            self.assertEqual(
                set(model["activeDesignColumns"]) | set(model["droppedDesignColumns"]),
                set(expected_candidates),
            )
            self.assertFalse(
                set(model["activeDesignColumns"]) & set(model["droppedDesignColumns"])
            )
            self.assertEqual(len(model["coefficients"]), len(model["designColumns"]))
            self.assertEqual(
                model["intervalCalibration"],
                "nested organization-fold residual KDE",
            )

    def test_model_comparison_pairs_highest_other_pay_specs(self):
        artifact = json.loads(
            (ROOT / "benchmark" / "analysis" / "predictive_salary_models" / "model_artifact.json")
            .read_text(encoding="utf-8")
        )
        expected = [
            ("intercept", False, False),
            ("linear_no_highest", False, False), ("linear", True, False),
            ("gam_no_highest", False, False), ("gam", True, False),
            ("bayesian_no_highest", False, False), ("bayesian", True, False),
            ("bayesian_ranges_no_highest", False, True),
            ("bayesian_ranges", True, True),
        ]
        self.assertEqual(
            [
                (row["key"], row["includeHighestOtherPay"], row["includeAdvertisedRanges"])
                for row in artifact["comparison"]
            ],
            expected,
        )

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
