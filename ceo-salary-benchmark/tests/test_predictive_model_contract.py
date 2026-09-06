import importlib.util
import csv
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from predictive_model_contract import EXTRA_TRAINING_ROWS, predictive_training_eligible
from operating_evidence_review import reviewed_hiring_market, load_reviews


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
    def test_sampler_refinements_match_published_chain_counts(self):
        path = ROOT / "benchmark/analysis/predictive_salary_models"
        artifact = json.loads((path / "model_artifact.json").read_text())
        refinements = {(row["model"], row["fold"]): row for row in artifact["fitConfiguration"]["cvRefinements"]}
        with (path / "sampler_diagnostics.csv").open() as handle:
            rows = [row for row in csv.DictReader(handle) if row["phase"] == "cross_validation"]
        self.assertEqual(len(rows), 80)
        for row in rows:
            refinement = refinements.get((row["model"], int(row["fold"])))
            expected = refinement["samplingPerChain"] if refinement else 500
            self.assertEqual(int(row["draws_per_chain"]), expected)
            self.assertEqual(int(row["chains"]), 4)
            self.assertLessEqual(float(row["max_rhat"]), 1.05)
            self.assertGreaterEqual(float(row["min_bulk_ess"]), 100)
            self.assertGreaterEqual(float(row["min_tail_ess"]), 100)

    def test_published_other_pay_and_training_share_40_hour_basis(self):
        data = load_app_data()
        orcid = next(row for row in data["incumbents"] if row["organization"] == "ORCID")
        other = orcid["highestPaidOtherEmployee40h"]["base"]
        self.assertEqual(other["weeklyHours"], 30)
        self.assertAlmostEqual(other["nominal"], 98827 * 40 / 30)
        self.assertAlmostEqual(other["adjusted"], 140266.88)
        with (ROOT / "benchmark/analysis/predictive_salary_models/training_data.csv").open() as handle:
            training = next(row for row in csv.DictReader(handle) if row["organization"] == "ORCID")
        self.assertEqual(float(training["highest_other_base"]), other["adjusted"])
        self.assertEqual(training["other_base_maximum_identified"], "0")

    def test_work_guesses_distinguish_supported_and_historical_evidence(self):
        reviews = load_reviews()
        self.assertEqual(sum("unknown_followup" in row for row in reviews.values()), 57)
        self.assertEqual(reviews["Healthcare Career Advancement Program"]["work_model"], "remote")
        self.assertEqual(reviews["Third Way Institute"]["work_model"], "hybrid")
        self.assertEqual(reviews["Copenhagen Consensus Center"]["work_model"], "unknown")
        self.assertEqual(reviews["Copenhagen Consensus Center"]["unknown_followup"]["best_guess"], "remote")
        self.assertEqual(reviews["Federal Funds Information for States"]["work_model"], "unknown")
        self.assertTrue(reviews["Center for Responsible Lending"]["office_present_inferred"])
        marine = reviews["Marine Science Institute"]
        self.assertTrue(marine["office_present_inferred"])
        self.assertEqual(reviewed_hiring_market(marine), ("United States", "direct_role"))
        self.assertTrue(any("aeoe.org" in item["url"] for item in marine["evidence"]))
        self.assertFalse(any("up.edu.ph" in item["url"] for item in marine["evidence"]))

    def test_hiring_market_respects_role_evidence_and_separates_footprint(self):
        review = {"ceo_hiring_scope": "unknown", "ceo_scope_basis": "unknown",
                  "hiring_scope": "unknown", "operating_scope": "international", "confidence": "high"}
        self.assertEqual(reviewed_hiring_market(review), ("Location not reported", "unknown"))
        review.update(hiring_scope="us_only", confidence="medium")
        self.assertEqual(reviewed_hiring_market(review), ("United States", "inferred_staff_market"))
        review.update(confidence="low")
        self.assertEqual(reviewed_hiring_market(review), ("Location not reported", "unknown"))
        review.update(ceo_hiring_scope="international", ceo_scope_basis="direct_role", confidence="high")
        self.assertEqual(reviewed_hiring_market(review), ("International / multi-country", "direct_role"))

    def test_rp_remote_profile_and_reported_hours_sensitivities(self):
        data = load_app_data()
        self.assertEqual(data["rpReference"]["remoteCategory"], "Remote")
        reviewed = [row for row in data["incumbents"] if row["organization"] in
                    {"Center for Public Integrity", "Nuclear Threat Initiative"}]
        self.assertEqual(len(reviewed), 2)
        for row in reviewed:
            self.assertFalse(row["defaultIncluded"])
            self.assertGreater(row["salary"]["base"], 0)
            self.assertFalse(predictive_training_eligible("filing", row))
            self.assertIn("hours", row["eligibilityReview"])

    def test_bayesian_models_export_joint_missing_input_provenance(self):
        artifact = json.loads(
            (ROOT / "benchmark" / "analysis" / "predictive_salary_models" / "model_artifact.json")
            .read_text(encoding="utf-8")
        )
        for key, model in artifact["models"].items():
            if not key.startswith("bayesian"):
                continue
            missing = model["missingInputs"]
            features = [item["key"] for item in model["preprocessing"]]
            self.assertEqual(missing["featureKeys"], features)
            self.assertEqual(missing["distribution"], "joint_normal_standardized_log_inputs")
            self.assertEqual(missing["correlationPrior"], "LKJ(2)")
            self.assertEqual(len(missing["posteriorMeanCorrelation"]), len(features))
            # The fitted input model must learn the strong observed financial association.
            self.assertGreater(missing["posteriorMeanCorrelation"][0][1], .5)

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
                "bayesianGam", "bayesianGamNoHighest", "bayesianGamRanges", "bayesianGamRangesNoHighest",
                "svr", "svrNoHighest", "gp", "gpNoHighest",
            },
        )
        for model_key in ("bayesian", "bayesianRanges", "gam", "linear", "bayesianGam", "bayesianGamRanges", "svr", "gp"):
            self.assertEqual(
                [item["key"] for item in artifact["models"][model_key]["preprocessing"]],
                expected,
            )
            self.assertTrue(artifact["models"][model_key]["includeHighestOtherPay"])
        reduced = expected[:-1]
        for model_key in (
            "bayesianNoHighest", "bayesianRangesNoHighest", "gamNoHighest",
            "linearNoHighest",
            "bayesianGamNoHighest", "bayesianGamRangesNoHighest", "svrNoHighest", "gpNoHighest",
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
        self.assertEqual(sum(artifact["eaFilingCounts"]), 124)
        for feature in artifact["categoricalFeatures"]:
            self.assertEqual(len(feature["filingCounts"]), len(feature["levels"]))
            self.assertEqual(sum(feature["filingCounts"]), 124)

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
            ("bayesian_gam_no_highest", False, False), ("bayesian_gam", True, False),
            ("bayesian_gam_ranges_no_highest", False, True), ("bayesian_gam_ranges", True, True),
            ("svr_no_highest", False, False), ("svr", True, False),
            ("gp_no_highest", False, False), ("gp", True, False),
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
        self.assertEqual((exact, cash, ads), (112, 12, 27))
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
            "SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY", "SRC-990-EXT-NUCLEAR-THREAT-INITIATIVE",
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
