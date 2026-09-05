#!/usr/bin/env python3
"""Compare matched OOF predictions with the independent-input model in git."""

import argparse
import csv
import io
import math
import subprocess
from pathlib import Path


MODEL_DIR = Path(__file__).resolve().parent
GIT_ROOT = MODEL_DIR.parents[3]


def read_csv(content):
    return list(csv.DictReader(io.StringIO(content)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-ref", default="b871665")
    parser.add_argument("--output", type=Path, default=MODEL_DIR / "missing_input_comparison.csv")
    args = parser.parse_args()
    baseline = subprocess.check_output(
        ["git", "rev-parse", "--verify", args.baseline_ref + "^{commit}"], cwd=GIT_ROOT, text=True,
    ).strip()

    def old_content(name):
        path = (MODEL_DIR / name).relative_to(GIT_ROOT)
        return subprocess.check_output(["git", "show", f"{baseline}:{path}"], cwd=GIT_ROOT, text=True)

    training_text = (MODEL_DIR / "training_data.csv").read_text()
    if old_content("training_data.csv") != training_text:
        raise ValueError("Paired comparison requires identical training rows, inputs, outcomes, and folds")
    training = {row["id"]: row for row in read_csv(training_text)}
    old_rows = read_csv(old_content("cross_validation_predictions.csv"))
    new_rows = read_csv((MODEL_DIR / "cross_validation_predictions.csv").read_text())
    old = {(row["model"], row["id"]): row for row in old_rows}
    new = {(row["model"], row["id"]): row for row in new_rows}
    if len(old) != len(old_rows) or len(new) != len(new_rows) or old.keys() != new.keys():
        raise ValueError("OOF model/record keys are duplicated or unmatched")
    for key in old:
        for column in ("fold", "source", "observation", "observed_log_salary", "observed_log_cash_proxy",
                       "observed_log_lower", "observed_log_upper"):
            if old[key][column] != new[key][column]:
                raise ValueError(f"OOF provenance changed: {key}, {column}")

    output = []
    for model in dict.fromkeys(row["model"] for row in new_rows if row["model"].startswith("Bayesian")):
        features = ["expenses", "revenue", "staff"]
        if model.endswith("with other pay"):
            features.append("highest_other_base")

        def incomplete(key):
            return any(not training[key[1]][feature] or float(training[key[1]][feature]) <= 0 for feature in features)

        keys = [key for key in new if key[0] == model]
        strata = {
            "exact_all": [key for key in keys if new[key]["observation"] == "exact_base"],
            "cash_proxy": [key for key in keys if new[key]["observation"] == "cash_proxy"],
            "ad_interval": [key for key in keys if new[key]["observation"] == "interval"],
            "ad_point": [key for key in keys if new[key]["observation"] == "advertised_point"],
        }
        strata["exact_complete"] = [key for key in strata["exact_all"] if not incomplete(key)]
        strata["exact_incomplete"] = [key for key in strata["exact_all"] if incomplete(key)]
        for stratum, selected in strata.items():
            if not selected:
                continue
            result = dict(baseline_commit=baseline, model=model, stratum=stratum, n=len(selected))
            for label, rows in (("independent", old), ("joint", new)):
                scores = [float(rows[key]["log_predictive_density"]) for key in selected]
                result[f"{label}_mean_log_score"] = sum(scores) / len(scores)
                if stratum.startswith("exact"):
                    residuals = [float(rows[key]["observed_log_salary"]) - float(rows[key]["predicted_log_salary"])
                                 for key in selected]
                    result[f"{label}_log_rmse"] = math.sqrt(sum(value**2 for value in residuals) / len(residuals))
                    coverage = [float(rows[key]["coverage90"]) for key in selected]
                    if any(value not in (0, 1) for value in coverage):
                        raise ValueError("Invalid exact-filing coverage indicator")
                    result[f"{label}_coverage90"] = sum(coverage) / len(selected)
                else:
                    result[f"{label}_log_rmse"] = result[f"{label}_coverage90"] = ""
            result["delta_log_score_sum"] = len(selected) * (result["joint_mean_log_score"] - result["independent_mean_log_score"])
            fold_deltas = {}
            for key in selected:
                fold = new[key]["fold"]
                fold_deltas[fold] = fold_deltas.get(fold, 0) + float(new[key]["log_predictive_density"]) - float(old[key]["log_predictive_density"])
            result["folds_improved_log_score"] = sum(delta > 0 for delta in fold_deltas.values())
            result["folds_present"] = len(fold_deltas)
            output.append(result)
    with args.output.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=output[0].keys())
        writer.writeheader()
        writer.writerows(output)
    print(f"Wrote {len(output)} paired model/stratum comparisons to {args.output}")


if __name__ == "__main__":
    main()
