#!/usr/bin/env python3
"""Describe disclosure cohorts without treating cash-only pay as observed base."""
import csv
import hashlib
import json
import math
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def read_csv(path):
    with path.open() as handle:
        return list(csv.DictReader(handle))


def run():
    training = read_csv(HERE / "training_data.csv")
    artifact = json.loads((HERE / "model_artifact.json").read_text())
    raw = (ROOT / "app-data.js").read_text()
    data = json.loads(raw.removeprefix("window.CEO_BENCHMARK_DATA = ").strip().removesuffix(";"))
    training_hash = hashlib.sha256((HERE / "training_data.csv").read_bytes()).hexdigest()
    if (artifact["provenance"]["trainingCsvSha256"] != training_hash
            or data["predictiveModel"] != artifact):
        raise ValueError("Rebuild the app from the current fitted artifact before auditing disclosure")
    sources = {row["id"]: row for row in data["incumbents"]}
    groups = {key: [row for row in training if row["observation"] == key]
              for key in ("exact_base", "cash_proxy")}
    if len(groups["exact_base"]) != 112 or len(groups["cash_proxy"]) != 12:
        raise ValueError("Reassess the disclosure report for the changed cohort")
    pairs = groups["exact_base"]
    if any(not row["cash_proxy"] or float(row["cash_proxy"]) < float(row["salary_midpoint"]) - .5 for row in pairs):
        raise ValueError("Exact-base/cash pairing violates the measurement model")
    summaries = []
    for key, rows in groups.items():
        values = lambda column: [float(row[column]) for row in rows if row[column]]
        summaries.append(dict(cohort=key, records=len(rows), organizations=len({r["organization_group"] for r in rows}),
            median_cash=median(values("cash_proxy")), median_expenses=median(values("expenses")),
            median_staff=median(values("staff")), staff_observed=len(values("staff")),
            other_pay_observed=len(values("highest_other_base"))))
    zero = sum(abs(float(row["cash_proxy"]) - float(row["salary_midpoint"])) < .5 for row in pairs)
    positive = [math.log(float(row["cash_proxy"]) / float(row["salary_midpoint"])) for row in pairs
                if float(row["cash_proxy"]) - float(row["salary_midpoint"]) >= .5]
    cash_rows = []
    for row in groups["cash_proxy"]:
        source = sources[row["id"]]
        cash_rows.append({**{key: row[key] for key in ("id", "organization", "organization_group", "cash_proxy", "expenses", "staff", "highest_other_base")},
            "nominal_cash": source["nominalSalary"]["cash"], "nominal_total": source["nominalSalary"]["total"],
            "reported_weekly_hours": source.get("averageHoursPerWeek"), "source": source["sourceUrl"],
            "saved_source": source["cachedSource"]})
    for filename, rows in (("cash_disclosure_summary.csv", summaries), ("cash_disclosure_records.csv", cash_rows)):
        with (HERE / filename).open("w") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
            writer.writeheader(); writer.writerows(rows)
    metrics = {row["key"]: row for row in artifact["comparison"]}
    lines = ["# Cash and base-disclosure sensitivity", "",
        "**The exact-base scoring cohort selects a higher-paid, larger-organization group.** "
        "The current cash-to-base likelihood addresses compensation components but does not model that selection. "
        "The exact-base-only Bayesian model is a useful benchmark sensitivity, not a correction for representativeness.", "",
        "| Observed cohort | Records / organizations | Median cash pay | Median expenses | Median employees | Other pay observed |",
        "| --- | ---: | ---: | ---: | ---: | ---: |"]
    for row in summaries:
        lines.append(f"| {row['cohort']} | {row['records']} / {row['organizations']} | ${row['median_cash']:,.0f} | "
                     f"${row['median_expenses']:,.0f} | {row['median_staff']:g} ({row['staff_observed']} observed) | {row['other_pay_observed']} |")
    lines += ["", "Cash is compared with cash in this table; neither column substitutes cash for base. Pay is in July 2026 USD; "
        "organization expenses are the recorded financial-year amounts. These are record-level descriptive medians, not adjusted effects. "
        "The two Lead Exposure Elimination Project records share an organization group and always stay in the same CV fold.", "",
        f"Among {len(pairs)} paired exact-base records, {zero} have cash equal to base within $0.50. "
        f"Among the {len(positive)} positive increments, the median log(cash/base) is {median(positive):.3f} "
        f"(an increase of {100 * math.expm1(median(positive)):.1f}%). "
        "These paired amounts identify the current zero-or-positive increment model inside the base-disclosing cohort. "
        "They do not establish its transport to cash-only organizations.", "",
        "## Matched validation", "",
        "| Bayesian linear specification | Other pay | Log RMSE | Mean error | 90% coverage | Log score |",
        "| --- | --- | ---: | ---: | ---: | ---: |"]
    for key in ("bayesian", "bayesian_exact", "bayesian_no_highest", "bayesian_exact_no_highest"):
        row = metrics[key]
        lines.append(f"| {'Exact base only' if key.startswith('bayesian_exact') else 'Exact base + cash'} | "
            f"{'Yes' if row['includeHighestOtherPay'] else 'No'} | {row['logRmse']:.3f} | "
            f"{row['meanAbsPercentError']:.1%} | {row['coverage90']:.1%} | {row['meanLogPredictiveDensity']:.3f} |")
    lines += ["", "All four procedures score the same 112 held-out exact-base records using the same organization-grouped folds, "
        "priors, and training-fold preprocessing. They exclude ads. The with-other-pay exact-only CV fits reuse the "
        "first repetition of the [three-split measurement study](measurement_sensitivity/README.md). "
        "No organization is deleted for a large residual. A validation advantage on base-disclosing organizations does not "
        "identify prediction accuracy for cash-only organizations, whose base pay is unobserved.", "",
        "**All 12 cash-only records also lack highest-other base pay**, versus 16 of 112 exact-base records. "
        "Disclosure cohort and this missing-input pattern are therefore entangled. In the production split, "
        "the exact-base-only improvement is larger among held-out records missing other pay:", "",
        "| Held-out exact-base stratum | N | Exact + cash log RMSE | Exact-only log RMSE |",
        "| --- | ---: | ---: | ---: |"]
    oof = read_csv(HERE / "cross_validation_predictions.csv")
    by_id = {row["id"]: row for row in training}
    for observed in (True, False):
        scores = []
        for model in ("Bayesian multilevel · with other pay", "Bayesian exact base · with other pay"):
            rows = [r for r in oof if r["model"] == model and r["observation"] == "exact_base"
                    and bool(by_id[r["id"]]["highest_other_base"]) == observed]
            scores.append(math.sqrt(sum((float(r["predicted_log_salary"]) - float(r["observed_log_salary"])) ** 2
                                        for r in rows) / len(rows)))
        lines.append(f"| Other pay {'observed' if observed else 'missing'} | {len(rows)} | {scores[0]:.3f} | {scores[1]:.3f} |")
    lines += ["", "This post-hoc stratification is descriptive; the missing-input subgroup has only 16 observations. "
        "It does not isolate a defect in imputation or identify a causal disclosure effect.", "",
        "## Why disclosure matters", "",
        "Schedule J generally requires itemized compensation for current listed leaders when Form 990 Part VII "
        "columns D–F exceed $150,000 combined; other reporting triggers also apply. That threshold concerns nominal "
        "total reported compensation, not inflation-adjusted base pay. "
        "[IRS Schedule J instructions, Part II](https://www.irs.gov/instructions/i990sj). "
        "The instructions also separate base, bonuses, and other reportable compensation. "
        "[IRS Schedule J instructions](https://www.irs.gov/instructions/i990sj).", "",
        "**Inference:** selection into an observed-base outcome can depend on compensation itself. "
        "Exact-only fitting and scoring therefore condition on disclosure; adding low-paid cash-only records changes the training population. "
        "A better-fitting cash ratio alone cannot remove this mismatch.", "",
        "## Next measurement model", "",
        "Retain latent log base Y and the nonnegative cash increment D, with observed log cash C = Y + D. "
        "A disclosure-aware model would jointly represent the base-observation indicator R using the actual filing rules, "
        "nominal reportable compensation and benefits, filing form, and any voluntary disclosure. The current pipeline lacks "
        "some of those rule inputs, so R must not be equated with a simple threshold on adjusted base salary.", "",
        "A tractable interim sensitivity is a regularized cash-disclosure-group salary offset: "
        "Y ~ Normal(mu(X) + delta * I(cash-only), sigma). Compare explicit prior scales for delta, alongside the exact-only "
        "and pooled fits. Delta would mix population differences and measurement misspecification; it is not an identified "
        "correction and requires new validation. The existing app models keep their specified likelihoods unchanged.", "",
        "For an incompletely disclosed highest-other base maximum, preserve the largest known value as a lower bound "
        "for a latent maximum rather than treating it as exact. A joint input model could integrate over that bound; "
        "selection of employees into the filing remains a separate issue. Seek actual base-pay evidence for cash-only "
        "organizations before judging any disclosure model's predictions for them.", "",
        "## Reproduction", "", "Run `python3 benchmark/analysis/predictive_salary_models/audit_cash_disclosure.py` after fitting and building. "
        "The companion CSVs retain the cohort counts and all cash-only records with raw pay, available hours and source links.", "",
        "Training CSV SHA-256: `" + training_hash + "`."]
    (HERE / "cash_disclosure_audit.md").write_text("\n".join(lines) + "\n")
    print("Wrote disclosure summaries, 12 cash-only source records, and matched model comparison")


if __name__ == "__main__":
    run()
