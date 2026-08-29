#!/usr/bin/env python3
"""Reproducible OOS experiments for CEO benchmark weighting (stdlib + NumPy only).

Reads the generated app-data.js but never modifies repository files.  The primary
estimand is the conditional distribution of inflation-adjusted Schedule J base
salary among default-included incumbent Form 990 peers.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

SEED = 20260828
RIDGE_GRID = np.array([0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0])
CAT_FACTORS = np.array([1.0, 3.0, 10.0, 30.0])
H_GRID = np.array([0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0, 3.0, 5.0])
CAT_GRID = np.array([0.0, 0.25, 0.5, 1.0, 2.0])


def load_data(repo: Path):
    raw = (repo / "app-data.js").read_text(encoding="utf-8")
    payload = json.loads(raw.split("=", 1)[1].strip().rstrip(";"))
    return payload


def finite_positive(x):
    return isinstance(x, (int, float)) and math.isfinite(x) and x > 0


def salary(row, measure):
    x = (row.get("salary") or {}).get(measure)
    return float(x) if finite_positive(x) else None


def make_sample(data, kind):
    if kind == "inc_base":
        rows = data["incumbents"]
        measure = "base"
    elif kind == "inc_cash":
        rows = data["incumbents"]
        measure = "cash"
    elif kind == "combined_base":
        rows = data["incumbents"] + data["jobAds"]
        measure = "base"
    elif kind == "job_base":
        rows = data["jobAds"]
        measure = "base"
    else:
        raise ValueError(kind)
    rows = [r for r in rows if r.get("defaultIncluded") and salary(r, measure)]
    y = np.log(np.array([salary(r, measure) for r in rows], dtype=float))
    groups = np.array([str(r.get("organization") or r.get("id")) for r in rows])
    return rows, y, groups, measure


def group_folds(groups, k, seed):
    unique = np.array(sorted(set(groups.tolist())))
    rng = np.random.default_rng(seed)
    rng.shuffle(unique)
    buckets = [set(x.tolist()) for x in np.array_split(unique, min(k, len(unique)))]
    return [np.array([i for i, g in enumerate(groups) if g in b], dtype=int) for b in buckets]


def numeric_raw(row, key):
    if key.startswith("log_"):
        value = row.get(key[4:])
        return math.log(float(value)) if finite_positive(value) else math.nan
    value = row.get(key)
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else math.nan


def fit_design(rows, train_idx, test_idx, spec):
    train_rows = [rows[i] for i in train_idx]
    test_rows = [rows[i] for i in test_idx]
    train_cols, test_cols, penalties, names = [], [], [], []
    standardized_train = {}
    standardized_test = {}
    for key in spec.get("continuous", []):
        a = np.array([numeric_raw(r, key) for r in train_rows])
        b = np.array([numeric_raw(r, key) for r in test_rows])
        missing_a = ~np.isfinite(a)
        missing_b = ~np.isfinite(b)
        observed = a[~missing_a]
        mean = float(np.mean(observed)) if len(observed) else 0.0
        sd = float(np.std(observed, ddof=0)) if len(observed) else 1.0
        if not math.isfinite(sd) or sd < 1e-8:
            sd = 1.0
        az = (np.where(missing_a, mean, a) - mean) / sd
        bz = (np.where(missing_b, mean, b) - mean) / sd
        train_cols.append(az); test_cols.append(bz); penalties.append(1.0); names.append(key)
        standardized_train[key] = az; standardized_test[key] = bz
        if missing_a.any() or missing_b.any():
            train_cols.append(missing_a.astype(float)); test_cols.append(missing_b.astype(float))
            penalties.append(1.0); names.append(key + "_missing")
    for key in spec.get("quadratic", []):
        if key in standardized_train:
            train_cols.append(standardized_train[key] ** 2 - 1.0)
            test_cols.append(standardized_test[key] ** 2 - 1.0)
            penalties.append(1.0); names.append(key + "^2")
    for key in spec.get("categorical", []):
        levels = sorted({str(r.get(key) or "Not reported") for r in train_rows})
        for level in levels:
            train_cols.append(np.array([float(str(r.get(key) or "Not reported") == level) for r in train_rows]))
            test_cols.append(np.array([float(str(r.get(key) or "Not reported") == level) for r in test_rows]))
            penalties.append(float(spec.get("cat_factor", 1.0))); names.append(f"{key}={level}")
    xtr = np.column_stack([np.ones(len(train_rows))] + train_cols)
    xte = np.column_stack([np.ones(len(test_rows))] + test_cols)
    p = np.array([0.0] + penalties)
    return xtr, xte, p, ["intercept"] + names


def ridge_fit(x, y, lam, penalty, robust=False):
    weights = np.ones(len(y))
    beta = np.zeros(x.shape[1])
    for _ in range(30 if robust else 1):
        xw = x * np.sqrt(weights)[:, None]
        yw = y * np.sqrt(weights)
        mat = xw.T @ xw + lam * np.diag(penalty)
        beta_new = np.linalg.pinv(mat, rcond=1e-10) @ (xw.T @ yw)
        if not robust:
            return beta_new
        resid = y - x @ beta_new
        med = np.median(resid)
        scale = 1.4826 * np.median(np.abs(resid - med))
        if scale < 1e-7:
            beta = beta_new
            break
        u = np.abs(resid) / (1.345 * scale)
        new_weights = np.where(u <= 1, 1.0, 1.0 / np.maximum(u, 1e-12))
        if np.max(np.abs(beta_new - beta)) < 1e-8:
            beta = beta_new
            break
        beta, weights = beta_new, new_weights
    return beta


def regression_candidates(spec):
    if not spec.get("continuous") and not spec.get("categorical"):
        return [(0.0, 1.0)]
    factors = CAT_FACTORS if spec.get("categorical") else np.array([1.0])
    return [(float(lam), float(f)) for lam in RIDGE_GRID for f in factors]


def inner_regression_cv(rows, y, groups, train_idx, spec, outer_seed):
    candidates = regression_candidates(spec)
    if len(candidates) == 1:
        best = candidates[0]
    else:
        local_groups = groups[train_idx]
        folds = group_folds(local_groups, 5, outer_seed)
        losses = np.zeros(len(candidates))
        counts = np.zeros(len(candidates))
        for val_local in folds:
            tr_local = np.setdiff1d(np.arange(len(train_idx)), val_local)
            tr = train_idx[tr_local]; va = train_idx[val_local]
            for ci, (lam, cat_factor) in enumerate(candidates):
                this_spec = dict(spec, cat_factor=cat_factor)
                xtr, xva, penalty, _ = fit_design(rows, tr, va, this_spec)
                beta = ridge_fit(xtr, y[tr], lam, penalty, spec.get("robust", False))
                losses[ci] += np.sum((y[va] - xva @ beta) ** 2)
                counts[ci] += len(va)
        best = candidates[int(np.argmin(losses / counts))]
    # Proper training-only cross-fitted residuals for a predictive interval.
    local_groups = groups[train_idx]
    folds = group_folds(local_groups, 5, outer_seed + 991)
    residuals = []
    for val_local in folds:
        tr_local = np.setdiff1d(np.arange(len(train_idx)), val_local)
        tr = train_idx[tr_local]; va = train_idx[val_local]
        this_spec = dict(spec, cat_factor=best[1])
        xtr, xva, penalty, _ = fit_design(rows, tr, va, this_spec)
        beta = ridge_fit(xtr, y[tr], best[0], penalty, spec.get("robust", False))
        residuals.extend(np.abs(y[va] - xva @ beta).tolist())
    q90 = float(np.quantile(residuals, 0.9, method="higher"))
    return best, q90


def evaluate_regressions(rows, y, groups, repeats=5, folds_n=10):
    specs = {
        "unconditional": {},
        "score_only [diagnostic]": {"continuous": ["comparabilityScore"]},
        "expenses": {"continuous": ["log_expenses"]},
        "scale": {"continuous": ["log_expenses", "log_staff"]},
        "scale+year": {"continuous": ["log_expenses", "log_staff", "compensationYear"]},
        "scale nonlinear": {"continuous": ["log_expenses", "log_staff"], "quadratic": ["log_expenses", "log_staff"]},
        "partial-pool core": {"continuous": ["log_expenses", "log_staff", "compensationYear"], "categorical": ["titleGroup", "eaAffinity", "structure"]},
        "partial-pool core Huber": {"continuous": ["log_expenses", "log_staff", "compensationYear"], "categorical": ["titleGroup", "eaAffinity", "structure"], "robust": True},
        "full taxonomy [diagnostic]": {"continuous": ["log_expenses", "log_staff", "log_revenue", "compensationYear", "comparabilityScore"], "categorical": ["titleGroup", "eaAffinity", "structure", "topic", "tier"]},
    }
    results = {}
    for mi, (name, spec) in enumerate(specs.items()):
        repeat_metrics, all_predictions, all_truth, all_covered, chosen = [], [], [], [], []
        by_row = defaultdict(list)
        for rep in range(repeats):
            folds = group_folds(groups, folds_n, SEED + rep * 1009)
            pred = np.full(len(y), np.nan); covered = np.zeros(len(y), dtype=bool)
            for fi, test in enumerate(folds):
                train = np.setdiff1d(np.arange(len(y)), test)
                (lam, cat_factor), q90 = inner_regression_cv(rows, y, groups, train, spec, SEED + mi * 100003 + rep * 101 + fi)
                this_spec = dict(spec, cat_factor=cat_factor)
                xtr, xte, penalty, _ = fit_design(rows, train, test, this_spec)
                beta = ridge_fit(xtr, y[train], lam, penalty, spec.get("robust", False))
                pred[test] = xte @ beta
                covered[test] = np.abs(y[test] - pred[test]) <= q90
                chosen.append((lam, cat_factor))
            residual = y - pred
            repeat_metrics.append({
                "rmse_log": float(np.sqrt(np.mean(residual ** 2))),
                "mae_log": float(np.mean(np.abs(residual))),
                "r2_oos": float(1 - np.sum(residual ** 2) / np.sum((y - np.mean(y)) ** 2)),
                "mdape": float(np.median(np.abs(np.exp(pred - y) - 1))),
                "coverage90": float(np.mean(covered)),
            })
            for i, p in enumerate(pred): by_row[i].append(float(p))
            all_predictions.extend(pred.tolist()); all_truth.extend(y.tolist()); all_covered.extend(covered.tolist())
        agg_pred = np.array([np.mean(by_row[i]) for i in range(len(y))])
        results[name] = {
            "repeat_metrics": repeat_metrics,
            "aggregate_predictions": agg_pred,
            "chosen": chosen,
            "summary": {
                key: float(np.median([m[key] for m in repeat_metrics]))
                for key in repeat_metrics[0]
            },
        }
    return results


def robust_scale(values):
    values = np.asarray(values, dtype=float)
    q25, q75 = np.quantile(values, [0.25, 0.75])
    s = float((q75 - q25) / 1.349)
    if not math.isfinite(s) or s < 1e-6:
        s = float(np.std(values))
    return max(s, 1e-6)


EA_ORDINAL = {"EA-core": 1.0, "EA-adjacent": 0.65, "functional-only": 0.0}


def distance_matrix(train_rows, target_rows, kind, cat_weight):
    d2 = np.zeros((len(target_rows), len(train_rows)))
    numeric = {
        "expenses": ["log_expenses"],
        "scale": ["log_expenses", "log_staff"],
        "core_mixed": ["log_expenses", "log_staff"],
        "full_mixed": ["log_expenses", "log_staff"],
    }[kind]
    for key in numeric:
        train = np.array([numeric_raw(r, key) for r in train_rows])
        observed = train[np.isfinite(train)]
        median = float(np.median(observed))
        scale = robust_scale(observed)
        train_missing = ~np.isfinite(train)
        train = np.where(train_missing, median, train)
        target = np.array([numeric_raw(r, key) for r in target_rows])
        target_missing = ~np.isfinite(target)
        target = np.where(target_missing, median, target)
        d2 += ((target[:, None] - train[None, :]) / scale) ** 2
        d2 += (target_missing[:, None] != train_missing[None, :]).astype(float)
    if kind in ("core_mixed", "full_mixed"):
        for key in ("titleGroup", "structure"):
            a = np.array([str(r.get(key) or "Not reported") for r in target_rows])
            b = np.array([str(r.get(key) or "Not reported") for r in train_rows])
            d2 += cat_weight * (a[:, None] != b[None, :]).astype(float)
        a = np.array([EA_ORDINAL.get(str(r.get("eaAffinity")), 0.35) for r in target_rows])
        b = np.array([EA_ORDINAL.get(str(r.get("eaAffinity")), 0.35) for r in train_rows])
        d2 += cat_weight * ((a[:, None] - b[None, :]) / 0.65) ** 2
    if kind == "full_mixed":
        for key in ("topic",):
            a = np.array([str(r.get(key) or "Not reported") for r in target_rows])
            b = np.array([str(r.get(key) or "Not reported") for r in train_rows])
            d2 += cat_weight * (a[:, None] != b[None, :]).astype(float)
    return d2


def effective_n(weights):
    w = np.asarray(weights, dtype=float)
    return float(w.sum() ** 2 / np.sum(w ** 2)) if np.sum(w ** 2) else 0.0


def kernel_weights(d2, h, min_ess=0):
    def at(bw):
        z = -0.5 * d2 / (bw * bw)
        z -= np.max(z)
        w = np.exp(z)
        return w / w.sum()
    w = at(h)
    if min_ess and len(w) >= min_ess and effective_n(w) < min_ess:
        lo, hi = h, max(h, 1.0)
        while effective_n(at(hi)) < min_ess and hi < 1e4: hi *= 2
        for _ in range(40):
            mid = math.sqrt(lo * hi)
            if effective_n(at(mid)) < min_ess: lo = mid
            else: hi = mid
        w = at(hi)
        h = hi
    return w, h


def crps_empirical(train_y, weights, target_y):
    first = np.sum(weights * np.abs(train_y - target_y))
    second = 0.5 * np.sum(weights[:, None] * weights[None, :] * np.abs(train_y[:, None] - train_y[None, :]))
    return float(first - second)


def weighted_quantile(values, weights, q):
    order = np.argsort(values); v = values[order]; w = weights[order]
    c = np.cumsum(w) / np.sum(w)
    return float(v[min(np.searchsorted(c, q, side="left"), len(v) - 1)])


def kernel_candidates(kind):
    if kind == "uniform": return [(1e9, 0.0)]
    cats = CAT_GRID if "mixed" in kind else np.array([0.0])
    return [(float(h), float(c)) for h in H_GRID for c in cats]


def choose_kernel(rows, y, groups, train_idx, kind, min_ess, seed):
    candidates = kernel_candidates(kind)
    if kind == "uniform": return candidates[0]
    folds = group_folds(groups[train_idx], 5, seed)
    loss = np.zeros(len(candidates)); n = np.zeros(len(candidates))
    for val_local in folds:
        tr_local = np.setdiff1d(np.arange(len(train_idx)), val_local)
        tr_idx = train_idx[tr_local]; va_idx = train_idx[val_local]
        tr_rows = [rows[i] for i in tr_idx]; va_rows = [rows[i] for i in va_idx]
        # Distances differ with the candidate categorical scale but numeric transforms are fold-local.
        for ci, (h, cat) in enumerate(candidates):
            d2 = distance_matrix(tr_rows, va_rows, kind, cat)
            for j, target in enumerate(va_idx):
                w, _ = kernel_weights(d2[j], h, min(min_ess, len(tr_idx)))
                loss[ci] += crps_empirical(y[tr_idx], w, y[target]); n[ci] += 1
    return candidates[int(np.argmin(loss / n))]


def evaluate_kernels(rows, y, groups, repeats=5, folds_n=10, min_ess=20):
    kinds = ["uniform", "expenses", "scale", "core_mixed", "full_mixed"]
    out = {}
    for ki, kind in enumerate(kinds):
        repeat_metrics=[]; choices=[]
        for rep in range(repeats):
            folds=group_folds(groups, folds_n, SEED+rep*1009)
            crps=[]; mederr=[]; cover80=[]; cover90=[]; ess=[]; heff=[]
            for fi,test in enumerate(folds):
                train=np.setdiff1d(np.arange(len(y)),test)
                h,cat=choose_kernel(rows,y,groups,train,kind,min_ess,SEED+ki*100003+rep*101+fi)
                d2=distance_matrix([rows[i] for i in train],[rows[i] for i in test], "expenses" if kind=="uniform" else kind,cat)
                for j,target in enumerate(test):
                    if kind=="uniform": w=np.repeat(1/len(train),len(train)); actual_h=h
                    else: w,actual_h=kernel_weights(d2[j],h,min(min_ess,len(train)))
                    crps.append(crps_empirical(y[train],w,y[target]))
                    med=weighted_quantile(y[train],w,.5); mederr.append(abs(med-y[target]))
                    cover80.append(weighted_quantile(y[train],w,.1)<=y[target]<=weighted_quantile(y[train],w,.9))
                    cover90.append(weighted_quantile(y[train],w,.05)<=y[target]<=weighted_quantile(y[train],w,.95))
                    ess.append(effective_n(w));heff.append(actual_h)
                choices.append((h,cat))
            repeat_metrics.append({"crps_log":float(np.mean(crps)),"median_abs_log":float(np.median(mederr)),"coverage80":float(np.mean(cover80)),"coverage90":float(np.mean(cover90)),"median_ess":float(np.median(ess)),"median_effective_h":float(np.median(heff))})
        out[kind]={"repeat_metrics":repeat_metrics,"choices":choices,"summary":{k:float(np.median([m[k] for m in repeat_metrics])) for k in repeat_metrics[0]}}
    return out


def bootstrap_deltas(y, results, reference="unconditional", draws=4000):
    rng=np.random.default_rng(SEED+77); n=len(y)
    ref=(y-results[reference]["aggregate_predictions"])**2
    out={}
    for name,item in results.items():
        if name==reference: continue
        err=(y-item["aggregate_predictions"])**2
        delta=err-ref
        boot=np.array([np.mean(delta[rng.integers(0,n,n)]) for _ in range(draws)])
        out[name]={"mean_delta_mse_log":float(np.mean(delta)),"ci95":[float(x) for x in np.quantile(boot,[.025,.975])]}
    return out


def full_sample_rp_kernel(rows,y,groups,rp,kind,min_ess=25):
    h,cat=choose_kernel(rows,y,groups,np.arange(len(rows)),kind,min_ess,SEED+555)
    d2=distance_matrix(rows,[rp],kind,cat)[0]
    w,heff=kernel_weights(d2,h,min(min_ess,len(rows)))
    order=np.argsort(-w)
    return {"h_cv":h,"h_effective":heff,"cat_weight":cat,"ess":effective_n(w),"median_salary":math.exp(weighted_quantile(y,w,.5)),"p25":math.exp(weighted_quantile(y,w,.25)),"p75":math.exp(weighted_quantile(y,w,.75)),"top_weights":[{"organization":rows[i]["organization"],"weight_share":float(w[i]),"normalized_weight":float(w[i]*len(w)),"salary":float(math.exp(y[i])),"expenses":rows[i].get("expenses"),"staff":rows[i].get("staff")} for i in order[:15]]}


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--repo",type=Path,required=True);ap.add_argument("--out",type=Path,required=True);ap.add_argument("--repeats",type=int,default=5)
    args=ap.parse_args();data=load_data(args.repo)
    app_data_path = args.repo / "app-data.js"
    report={
        "seed":SEED,
        "input_app_data_sha256": hashlib.sha256(app_data_path.read_bytes()).hexdigest(),
        "input_generated_at": data.get("generatedAt"),
        "ridge_grid":RIDGE_GRID.tolist(),
        "bandwidth_grid":H_GRID.tolist(),
        "categorical_distance_grid":CAT_GRID.tolist(),
        "samples":{},
    }
    for sample in ["inc_base","inc_cash","combined_base"]:
        rows,y,groups,measure=make_sample(data,sample)
        reg=evaluate_regressions(rows,y,groups,repeats=args.repeats,folds_n=min(10,len(set(groups))))
        kernels=evaluate_kernels(rows,y,groups,repeats=args.repeats,folds_n=min(10,len(set(groups))),min_ess=min(20,len(set(groups))-2)) if sample=="inc_base" else None
        report["samples"][sample]={"n":len(rows),"organizations":len(set(groups)),"measure":measure,"regression":{k:{"summary":v["summary"],"chosen_hyperparameter_counts":dict(Counter(str(x) for x in v["chosen"]))} for k,v in reg.items()},"paired_mse_bootstrap":bootstrap_deltas(y,reg),"kernels":kernels}
        if sample=="inc_base":
            report["rp_kernel"]={kind:full_sample_rp_kernel(rows,y,groups,data["rpReference"],kind,25) for kind in ["expenses","scale","core_mixed","full_mixed"]}
    args.out.write_text(json.dumps(report,indent=2),encoding="utf-8")
    with args.out.with_suffix(".summary.csv").open("w",newline="",encoding="utf-8") as f:
        w=csv.writer(f,lineterminator="\n");w.writerow(["sample","model","rmse_log","mae_log","r2_oos","mdape","coverage90"])
        for sample,item in report["samples"].items():
            for model,rr in item["regression"].items():
                s=rr["summary"];w.writerow([sample,model,s["rmse_log"],s["mae_log"],s["r2_oos"],s["mdape"],s["coverage90"]])
    print(args.out)


if __name__ == "__main__": main()
