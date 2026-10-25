#!/usr/bin/env python3
"""Derive the CEO decision ranges from the live validated app data.

Every number comes from a fixed, pre-registered view of the generated
`app-data.js`: Schedule J base for incumbents, advertised USD ranges for
postings, CPI-adjusted to July 2026, quantiles by linear interpolation
(R type 7). Judgment overlays are recorded separately and never alter the
computed values.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INPUT = ROOT / "app-data.js"
OUTPUT_DIR = Path(__file__).resolve().parent

# Original protocol: the main analysis excludes organizations below USD 3M or
# above USD 35M; the strict primary band is USD 5M-20M or 25-100 staff, with the
# other criterion no more than 50% outside its band.
MAIN_EXPENSE_BAND = (3_000_000, 35_000_000)
STRICT_EXPENSE_BAND = (5_000_000, 20_000_000)
STRICT_STAFF_BAND = (25, 100)
STRICT_TOLERANCE = 0.5

STRICT_AD_TIERS = {"strict_primary"}
CLOSE_AD_TIERS = STRICT_AD_TIERS | {"expanded_primary_title", "expanded_broad_functional"}

# The views whose medians bound the computed center range. Each is a
# pre-registered comparability cut of the main view.
RANGE_VIEWS = ("main", "strict_scale", "tier_a", "structurally_clean", "ea_adjacent", "functional_only")

# Ranges chosen by analyst judgment in the historical report
# (benchmark/scripts/normalize_and_analyze.py). Retained for comparison only.
HISTORICAL_JUDGMENT = {
    "incumbent_base": {"low": 290_000, "high": 350_000, "center": 320_000},
    "recurring_total": {"low": 340_000, "high": 435_000, "center": 385_000},
    "external_posting": {"low": 250_000, "high": 340_000, "center": 295_000,
                         "expected_hire_low": 280_000, "expected_hire_high": 320_000},
}


def load_app_data(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    prefix = "window.CEO_BENCHMARK_DATA = "
    if not raw.startswith(prefix) or not raw.rstrip().endswith(";"):
        raise ValueError(f"Unexpected app-data wrapper: {path}")
    return json.loads(raw[len(prefix):].strip().removesuffix(";"))


def within(value: float | None, band: tuple[float, float]) -> bool:
    return value is not None and band[0] <= value <= band[1]


def strict_scale(row: dict) -> bool:
    expenses, staff = row.get("expenses"), row.get("staff")
    if expenses is None or staff is None:
        return False
    loose_expenses = (STRICT_EXPENSE_BAND[0] * (1 - STRICT_TOLERANCE), STRICT_EXPENSE_BAND[1] * (1 + STRICT_TOLERANCE))
    loose_staff = (STRICT_STAFF_BAND[0] * (1 - STRICT_TOLERANCE), STRICT_STAFF_BAND[1] * (1 + STRICT_TOLERANCE))
    return (within(expenses, STRICT_EXPENSE_BAND) and within(staff, loose_staff)) or (
        within(staff, STRICT_STAFF_BAND) and within(expenses, loose_expenses)
    )


def summary(values: list[float]) -> dict:
    if len(values) < 5:
        raise ValueError(f"Too few observations for a quantile summary: {len(values)}")
    q1, median, q3 = statistics.quantiles(values, n=4, method="inclusive")
    return {"n": len(values), "p25": q1, "median": median, "p75": q3, "min": min(values), "max": max(values)}


def incumbent_views(incumbents: list[dict]) -> dict[str, list[dict]]:
    default = [row for row in incumbents if row["defaultIncluded"]]
    if any(row["organization"] == "Rethink Priorities" for row in default):
        raise ValueError("RP must never enter the benchmark distribution")
    main = [row for row in default if within(row.get("expenses"), MAIN_EXPENSE_BAND)]
    return {
        "main": main,
        "strict_scale": [row for row in main if strict_scale(row)],
        "tier_a": [row for row in main if row["tier"] == "A"],
        "structurally_clean": [row for row in main if row["structurallyClean"]],
        "ea_adjacent": [row for row in main if row["eaAffinity"] == "EA-adjacent"],
        "functional_only": [row for row in main if row["eaAffinity"] == "functional-only"],
        "all_default_any_scale": default,
    }


def measure_values(rows: list[dict], measure: str) -> list[float]:
    values = [row["salary"][measure] for row in rows]
    return [value for value in values if value is not None and value > 0]


def leave_one_out_medians(rows: list[dict], measure: str) -> dict:
    organizations = sorted({row["organization"] for row in rows})
    medians = [
        statistics.median(measure_values([row for row in rows if row["organization"] != organization], measure))
        for organization in organizations
    ]
    return {"organizations": len(organizations), "min_median": min(medians), "max_median": max(medians)}


def center_range(view_stats: dict[str, dict]) -> dict:
    medians = {key: view_stats[key]["median"] for key in RANGE_VIEWS}
    return {
        "center": view_stats["main"]["median"],
        "low": min(medians.values()),
        "high": max(medians.values()),
        "low_view": min(medians, key=medians.get),
        "high_view": max(medians, key=medians.get),
        "peer_p25": view_stats["main"]["p25"],
        "peer_p75": view_stats["main"]["p75"],
    }


def posting_summary(ads: list[dict]) -> dict:
    lows = [row["range"]["low"] for row in ads]
    highs = [row["range"]["high"] for row in ads]
    mids = [row["salary"]["base"] for row in ads]
    return {
        "n": len(ads),
        "organizations": sorted(row["organization"] for row in ads),
        "median_low": statistics.median(lows),
        "median_high": statistics.median(highs),
        "median_midpoint": statistics.median(mids),
        "envelope_low": min(lows),
        "envelope_high": max(highs),
        "intersection": [max(lows), min(highs)] if max(lows) <= min(highs) else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    data = load_app_data(args.input)
    views = incumbent_views(data["incumbents"])
    for key, rows in views.items():
        organizations = [row["organization"] for row in rows]
        if len(organizations) != len(set(organizations)):
            raise ValueError(f"View {key} has more than one observation for an organization")
    stats = {
        measure: {key: summary(measure_values(rows, measure)) for key, rows in views.items()}
        for measure in ("base", "cash", "total")
    }
    computed = {
        "incumbent_base": center_range(stats["base"]),
        "recurring_total": center_range(stats["total"]),
    }
    base_main = [row for row in views["main"] if row["salary"]["base"]]
    computed["incumbent_base"]["leave_one_out"] = leave_one_out_medians(base_main, "base")

    usd_ads = [
        row for row in data["jobAds"]
        if row["defaultIncluded"] and row.get("reportedCurrency") == "USD"
        and row["range"]["low"] and row["range"]["high"]
    ]
    if len(usd_ads) != sum(row["defaultIncluded"] for row in data["jobAds"]):
        raise ValueError("A default posting is not a bounded USD range")
    postings = {
        "strict": posting_summary([row for row in usd_ads if row["tier"] in STRICT_AD_TIERS]),
        "close": posting_summary([row for row in usd_ads if row["tier"] in CLOSE_AD_TIERS]),
        "all_default": posting_summary(usd_ads),
    }
    computed["external_posting"] = {
        "low": postings["close"]["median_low"],
        "high": postings["close"]["median_high"],
        "center": postings["close"]["median_midpoint"],
    }

    input_path = args.input.resolve()
    result = {
        "inputPath": str(input_path.relative_to(ROOT) if input_path.is_relative_to(ROOT) else input_path),
        "inputSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "inputGeneratedAt": data["generatedAt"],
        "priceBasis": data["priceBasis"],
        "rules": {
            "mainView": "Default CEO incumbent filings with expenses in USD 3M-35M; RP excluded.",
            "quantiles": "Linear interpolation (R type 7), unweighted, one observation per organization.",
            "incumbentRange": "Center is the main-view median; the range spans the medians of the main, strict-scale, Tier A, structurally clean, EA-adjacent and functional-only views.",
            "totalRange": "Same rule applied to the filing total-compensation proxy.",
            "postingRange": "Medians of the advertised minimums and maximums for the close posting set (strict primary, primary-title and broad-functional tiers); center is the median midpoint. USD postings only.",
            "judgment": "Historical judgment ranges are retained for comparison and do not alter computed values.",
        },
        "views": stats,
        "postings": postings,
        "computed": computed,
        "historicalJudgment": HISTORICAL_JUDGMENT,
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "decision_ranges.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    with (args.output_dir / "decision_range_views.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["measure", "view", "n", "p25", "median", "p75", "min", "max"])
        for measure, measure_stats in stats.items():
            for view, row in measure_stats.items():
                writer.writerow([measure, view, row["n"], *(round(row[key]) for key in ("p25", "median", "p75", "min", "max"))])
    (args.output_dir / "decision_ranges.md").write_text(render_markdown(result), encoding="utf-8")
    base = computed["incumbent_base"]
    print(f"incumbent base center {base['center']:,.0f}; range {base['low']:,.0f}-{base['high']:,.0f}")


VIEW_LABELS = {
    "main": "Main view (USD 3M-35M expenses)",
    "strict_scale": "Strict protocol scale band",
    "tier_a": "Tier A",
    "structurally_clean": "Structurally clean",
    "ea_adjacent": "EA-adjacent peers",
    "functional_only": "Functional-only peers",
    "all_default_any_scale": "All default peers, any scale (reference)",
}


def k(value: float) -> str:
    return f"${value / 1000:,.0f}K"


def render_markdown(result: dict) -> str:
    computed, views, postings = result["computed"], result["views"], result["postings"]
    base, total, posting = computed["incumbent_base"], computed["recurring_total"], computed["external_posting"]
    historical = result["historicalJudgment"]
    lines = [
        "# CEO decision ranges",
        "",
        "Generated by `compute_decision_ranges.py` from `app-data.js` "
        f"(generated {result['inputGeneratedAt']}). July 2026 USD. Do not edit by hand.",
        "",
        "## Computed ranges",
        "",
        "| Decision use | Computed range | Center | Historical judgment range |",
        "| --- | ---: | ---: | ---: |",
        f"| Incumbent base salary | {k(base['low'])}-{k(base['high'])} | {k(base['center'])} | "
        f"{k(historical['incumbent_base']['low'])}-{k(historical['incumbent_base']['high'])} (center {k(historical['incumbent_base']['center'])}) |",
        f"| Recurring total compensation | {k(total['low'])}-{k(total['high'])} | {k(total['center'])} | "
        f"{k(historical['recurring_total']['low'])}-{k(historical['recurring_total']['high'])} (center {k(historical['recurring_total']['center'])}) |",
        f"| External posting range | {k(posting['low'])}-{k(posting['high'])} | {k(posting['center'])} | "
        f"{k(historical['external_posting']['low'])}-{k(historical['external_posting']['high'])} (center {k(historical['external_posting']['center'])}) |",
        "",
        "The incumbent and total ranges span the medians of the pre-registered comparability views. "
        f"The incumbent low end is the median for {VIEW_LABELS[base['low_view']]}; the high end is the median for "
        f"{VIEW_LABELS[base['high_view']]}. Peer pay itself is much wider: the main-view "
        f"interquartile range is {k(base['peer_p25'])}-{k(base['peer_p75'])}. Leaving out one organization at a "
        f"time moves the main-view median between {k(base['leave_one_out']['min_median'])} and "
        f"{k(base['leave_one_out']['max_median'])}.",
        "",
        "The posting range is the median advertised minimum to the median advertised maximum of the close "
        f"posting set ({postings['close']['n']} USD postings). The historical report's upper bound and expected-hire "
        "zone were judgment overlays above every close-posting midpoint.",
        "",
        "## Incumbent views",
        "",
        "| View | n | Base P25 | Base median | Base P75 | Total median |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for key, label in VIEW_LABELS.items():
        row, total_row = views["base"][key], views["total"][key]
        lines.append(f"| {label} | {row['n']} | {k(row['p25'])} | {k(row['median'])} | {k(row['p75'])} | {k(total_row['median'])} |")
    lines += [
        "",
        "EA-adjacent and functional-only peers are reported side by side because they are the largest split in the "
        "evidence and RP's relevant labor market is a judgment the data cannot settle.",
        "",
        "## Postings",
        "",
        "| Set | n | Median minimum | Median maximum | Median midpoint | Envelope |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for key, label in (("strict", "Strict primary"), ("close", "Close set"), ("all_default", "All default USD postings")):
        row = postings[key]
        lines.append(f"| {label} | {row['n']} | {k(row['median_low'])} | {k(row['median_high'])} | {k(row['median_midpoint'])} | "
                     f"{k(row['envelope_low'])}-{k(row['envelope_high'])} |")
    lines += ["", "## Rules", ""] + [f"- **{key}:** {value}" for key, value in result["rules"].items()] + [""]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
