#!/usr/bin/env python3
"""Summarize paired repeated validation without treating repetitions as new people."""
import csv
import hashlib
import json
import math
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "measurement_sensitivity"


def read_csv(path):
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


metrics = read_csv(OUTPUT / "metrics.csv")
predictions = read_csv(OUTPUT / "predictions.csv")
design = json.loads((OUTPUT / "study_design.json").read_text())
for key, filename in (("trainingSha256", "training_data.csv"), ("fitScriptSha256", "fit_salary_models.R")):
    if design[key] != hashlib.sha256((ROOT / filename).read_bytes()).hexdigest():
        raise ValueError(f"Stale measurement study: {filename}")
expected = {row["id"] for row in read_csv(ROOT / "training_data.csv") if row["observation"] == "exact_base"}
labels = {
    "bayesian_filing": "Bayesian linear · exact + cash · all categories",
    "bayesian_exact": "Bayesian linear · exact only · all categories",
    "bayesian_numeric": "Bayesian linear · exact only · numeric inputs",
    "scale_linear": "Numeric linear", "gam": "Numeric GAM", "svr": "RBF SVR", "gp": "RBF GP",
    "bayesian_reported": "Reported other pay", "bayesian_disclosure": "Uncertain other-pay maxima missing",
}
by_key = {(row["model"], int(row["replicate"])): row for row in metrics}
if len(metrics) != 23 or len(by_key) != 23:
    raise ValueError("Expected 23 specification/repetition combinations")
for key in by_key:
    rows = [row for row in predictions if (row["model"], int(row["replicate"])) == key]
    if len(rows) != len(expected) or {row["id"] for row in rows} != expected:
        raise ValueError(f"Mismatched scoring cohort: {key}")


def value(key, replicate, metric):
    return float(by_key[key, replicate][metric])


lines = ["# Measurement and repeated-validation study", "",
         f"Every comparison scores the same **{len(expected)} exact-base filings**. Three organization-grouped ten-fold repetitions test ranking stability; two additional sensitivities use the production split. All records from a held-out organization are excluded from its training fold. Priors and tuning grids are fixed before scoring.", "",
         "## Repeated comparisons", "",
         "Values are means across the three repetitions; the RMSE range describes split sensitivity, not a confidence interval. Lower errors and CRPS are preferable; higher mean log density is preferable. Coverage needs interval-width context.", "",
         "| Procedure | Mean log RMSE | RMSE range | Mean absolute % error | 90% coverage | Mean log score | Log CRPS |",
         "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
for key in list(labels)[:7]:
    rmse = [value(key, rep, "log_rmse") for rep in (1, 2, 3)]
    averages = {metric: mean(value(key, rep, metric) for rep in (1, 2, 3))
                for metric in ("mean_abs_percent_error", "coverage90", "mean_log_predictive_density", "log_crps")}
    lines.append(f"| {labels[key]} | {mean(rmse):.3f} | {min(rmse):.3f}–{max(rmse):.3f} | {100*averages['mean_abs_percent_error']:.1f}% | {100*averages['coverage90']:.1f}% | {averages['mean_log_predictive_density']:.3f} | {averages['log_crps']:.3f} |")
lines += ["", "## Matched contrasts", ""]
for label, alternate, baseline in (
        ("Exact-only training minus exact-plus-cash training, holding categories fixed", "bayesian_exact", "bayesian_filing"),
        ("Removing categories, holding exact-only training fixed", "bayesian_numeric", "bayesian_exact")):
    differences = [value(alternate, rep, "log_rmse") - value(baseline, rep, "log_rmse") for rep in (1, 2, 3)]
    lines.append(f"- **{label}:** log-RMSE changes {', '.join(f'{x:+.3f}' for x in differences)} across repetitions (negative favors the alternate).")
lines += ["", "These isolate complete fitting procedures on matched outcomes. Removing all categories does not identify which particular category causes a change. Exact-only Bayesian numeric fits still differ from OLS through coefficient priors and joint missing-input inference.", "",
          "## Measurement sensitivities on the production split", "",
          "| Other-pay treatment | Log RMSE | Mean absolute % error | 90% coverage | Mean log score | Log CRPS |",
          "| --- | ---: | ---: | ---: | ---: | ---: |"]
for key in ("bayesian_reported", "bayesian_filing", "bayesian_disclosure"):
    row = by_key[key, 1]
    label = "40-hour equivalent (standard)" if key == "bayesian_filing" else labels[key]
    lines.append(f"| {label} | {float(row['log_rmse']):.3f} | {100*float(row['mean_abs_percent_error']):.1f}% | {100*float(row['coverage90']):.1f}% | {float(row['mean_log_predictive_density']):.3f} | {float(row['log_crps']):.3f} |")
lines += ["", "The reported-pay comparison holds the current cohort, work classifications and folds fixed. It therefore isolates the changed other-pay construction more closely than comparing this run with an older app artifact.", "",
          "The disclosure rule is applied to every organization: mark other base missing if a disclosed eligible employee without a base disclosure has cash pay exceeding the known maximum base. ORCID is the only otherwise observed training value affected; RP's prediction profile also has incomplete maximum-base identification. The sensitivity retains ORCID's outcome and uses joint missing-input inference. It discards its known lower bound; it is not a censored-predictor or disclosure-selection model.", "",
          "### Influential organizations", "",
          "Held-out predictions below use the production split and July 2026 USD. They are diagnostics, not criteria for deleting organizations.", "",
          "| Organization | Observed base | Reported-pay predictor | 40h predictor | Uncertain maximum missing | Exact-only | Exact-only numeric |",
          "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
for name in ("Copenhagen Consensus Center", "ORCID"):
    rows = {row["model"]: row for row in predictions if row["organization"] == name and row["replicate"] == "1"}
    columns = [math.exp(float(rows["bayesian_filing"]["observed_log_salary"]))]
    columns += [math.exp(float(rows[key]["predicted_log_salary"])) for key in
                ("bayesian_reported", "bayesian_filing", "bayesian_disclosure", "bayesian_exact", "bayesian_numeric")]
    lines.append(f"| {name} | " + " | ".join(f"${amount:,.0f}" for amount in columns) + " |")
lines += ["", "## Limits and reproduction", "",
          "The same organizations recur in all three repetitions. Their errors and overlapping training sets are dependent, so 336 scored rows are not 336 independent observations. This is a stability check, not an independent validation cohort. Exact-only scoring assesses base-disclosing organizations; latent base salaries in cash-only organizations remain unvalidated, and disclosure selection may explain part of the difference. GP intervals condition on fitted hyperparameters; numeric residual distributions retain their documented calibration assumptions. A best score among these candidates does not identify a representative salary market or a recommended CEO salary.", "",
          "Run from the CEO project folder:", "", "```sh",
          "Rscript benchmark/analysis/predictive_salary_models/measurement_sensitivity.R .",
          "python3 benchmark/analysis/predictive_salary_models/summarize_measurement_study.py", "```", "",
          "`study_design.json` and `fold_assignments.csv` record the protocol. `metrics.csv`, `predictions.csv` and `sampler_diagnostics.csv` preserve the results. Counts in `metrics.csv` concern scored observations; the design records training-source choices. The study calls the production fitting/scoring functions and enforces the same substantive CV sampler gates. Source-native extraction and hours evidence are in [the FTE audit](../../../enrichment/highest_other_fte_audit.md).", ""]
(OUTPUT / "README.md").write_text("\n".join(lines), encoding="utf-8")
print(f"Validated and summarized {len(metrics)} comparisons and {len(predictions)} held-out predictions")
