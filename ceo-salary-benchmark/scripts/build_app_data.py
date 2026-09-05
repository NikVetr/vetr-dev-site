#!/usr/bin/env python3
from __future__ import annotations

import csv
import copy
import hashlib
import json
import math
import shutil
import re
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

from predictive_model_contract import predictive_model_input_sha256, predictive_training_eligible


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / "benchmark"
DELIVERABLES = BENCHMARK / "deliverables"
CATEGORY_EXPLAINERS = DELIVERABLES / "category_explainers"
ENRICHMENT = BENCHMARK / "enrichment"
JOB_AD_EVIDENCE_UPDATES = ENRICHMENT / "job_ad_evidence_updates.csv"
EA_ROSTER_COMPENSATION = ENRICHMENT / "ea_roster_validated_compensation.csv"
LIVING_PEER_REVIEW = ENRICHMENT / "living_peer_universe_review.csv"
LIVING_PEER_METHODOLOGY = "benchmark/enrichment/living_peer_universe_methodology.md"
INCUMBENT_COMPENSATION_UPDATES = ENRICHMENT / "incumbent_compensation_updates.csv"
FORM990_POSITION_OBSERVATIONS = ENRICHMENT / "form990_position_observations.csv"
FORM990_POSITION_SUPPORTING_SOURCES = ENRICHMENT / "form990_position_supporting_sources.csv"
FORM990_BENCHMARK_POSITION_CATALOG = ENRICHMENT / "form990_benchmark_position_catalog.csv"
GOODSTRUCTURES_POSITION_JOB_AD_REVIEW = ENRICHMENT / "goodstructures_position_job_ad_review.csv"
LINGERING_ORG_RECOVERED_POSITIONS = ENRICHMENT / "lingering_org_recovered_us_positions.csv"
LINGERING_ORG_PEER_REVIEW = ENRICHMENT / "lingering_org_peer_eligibility_review.csv"
LINGERING_ORG_APP_ADDITIONS = ENRICHMENT / "lingering_org_app_position_additions.csv"
EA_ROSTER_CANDIDATE_REVIEW = ENRICHMENT / "ea_roster_candidate_review.csv"
PREDICTIVE_MODEL_ARTIFACT = BENCHMARK / "analysis" / "predictive_salary_models" / "model_artifact.json"
ORGANIZATION_OPERATING_METADATA = ENRICHMENT / "organization_operating_metadata.csv"
ORGANIZATION_OPERATING_METADATA_MANIFEST = ENRICHMENT / "organization_operating_metadata_source_manifest.csv"
EXPECTED_LIVING_PEER_REVIEW_IDS = {
    "SRC-990-EXT-CENTER-FOR-AI-SAFETY",
    "SRC-990-EXT-INSTITUTE-FOR-WOMEN-S-POLICY-RESEARCH",
    "SRC-990-EXT-CENTER-FOR-LAW-AND-SOCIAL-POLICY",
    "SRC-990-EXT-ANIMAL-EQUALITY",
    "SRC-990-EXT-COMPASSION-IN-WORLD-FARMING-USA",
    "SRC-990-EXT-PROJECT-HEALTHY-CHILDREN",
    "SRC-990-EA-CENTER-FOR-ELECTION-SCIENCE",
    "SRC-990-EA-FORESIGHT-INSTITUTE",
    "SRC-990-EA-LEVERAGE-RESEARCH",
    "SRC-990-EA-QUALIA-RESEARCH-INSTITUTE",
    "SRC-990-EA-MAGNIFY-MENTORING",
    "SRC-990-EA-GIVEWELL",
    "SRC-990-EA-COPENHAGEN-CONSENSUS-CENTER",
    "SRC-990-RECOVERY-LEEP::clare-donaldson",
    "SRC-990-RECOVERY-LEEP::lucia-coulter",
    "SRC-AD-SEATTLEBG",
}
PUBLISHED_HTML_WHITESPACE_NORMALIZATION_SOURCE_IDS = {
    "SRC-POSITION-NEW-ROOTS-JESSE-TANDLER",
    "SRC-POSITION-PAI-FELECIA-WEBB",
    "SRC-POSITION-PAI-STEPHANIE-BELL",
}
JOB_AD_SECONDARY_SOURCES = {
    "SRC-AD-CSCCE": {
        "source_id": "SRC-AD-CSCCE-ABOUT",
        "local_path": "sources/native/job_ads/src-ad-cscce-about.pdf",
        "source_url": "https://www.cscce.org/about/",
        "label": "official About page",
        "cached_label": "cached About page",
    },
    "SRC-AD-TAIMAKA-2025": {
        "source_id": "SRC-AD-TAIMAKA-2025-ORIGINAL",
        "local_path": "sources/native/job_ads/src-ad-taimaka-2025.pdf",
        "source_url": "https://docs.google.com/document/d/1SWKm4NioKb4PGCpmHmKiqe0Aa8USbiVNESE6uybm9BM/edit",
        "label": "original role document",
        "cached_label": "saved original role document",
    },
}
EVIDENCE_DIR = ROOT / "evidence" / "original"
OUTPUT = ROOT / "app-data.js"
WIKIPEDIA_PROFILES = ROOT / "data" / "organization_wikipedia_profiles.csv"
RP_REFERENCE_SOURCE_ID = "SRC-990-RP-REFERENCE"
RP_REFERENCE_LOCAL_PATH = "sources/native/form990/202502879349301540_public.xml"
RP_STAFF_SOURCE_ID = "SRC-990-RP-STAFF-2023"
RP_STAFF_LOCAL_PATH = "sources/native/form990/202433179349301723_public.pdf"
RP_STAFF_SHA256 = "0a8031d7840e38ee76f6802e2e65206771744d4d50722ab32a9d74c0ba0edabf"
RP_STAFF_COUNT = 43
RP_STAFF_YEAR = 2023
RP_STAFF_SOURCE_URL = "https://rethinkpriorities.org/wp-content/uploads/2024/11/RP-2023-990-No-Schedule-B.pdf"
RP_FUNDING_SOURCE_ID = "SRC-RP-FUNDING-NEEDS"
RP_FUNDING_LOCAL_PATH = "sources/native/supporting/src-rp-funding-needs.html"


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def tristate(value: object) -> bool | None:
    normalized = text(value).casefold()
    if normalized in {"true", "yes", "1"}:
        return True
    if normalized in {"false", "no", "0"}:
        return False
    if normalized in {"", "unknown", "not reported", "unclear"}:
        return None
    raise ValueError(f"Invalid three-state value: {value}")


def attach_organization_operating_metadata(app_rows: list[dict]) -> dict[str, int]:
    metadata_rows = rows(ORGANIZATION_OPERATING_METADATA)
    manifest_rows = rows(ORGANIZATION_OPERATING_METADATA_MANIFEST)
    manifest_by_claim = {
        (text(manifest["organization"]), text(manifest["claim"])): manifest
        for manifest in manifest_rows
    }
    if len(manifest_by_claim) != len(manifest_rows):
        raise ValueError("Operating-metadata source manifest contains duplicate claims")
    by_organization: dict[str, dict[str, str]] = {}
    for metadata in metadata_rows:
        organization = text(metadata["organization"])
        if not organization or organization in by_organization:
            raise ValueError(f"Blank or duplicate operating-metadata organization: {organization!r}")
        by_organization[organization] = metadata
    required = {text(row.get("organization")) for row in app_rows}
    missing = sorted(required - by_organization.keys())
    if missing:
        raise ValueError(f"Operating metadata is missing app organizations: {missing}")

    published_by_local_path: dict[str, str] = {}
    for row in app_rows:
        local_path = text(row.get("localPath"))
        cached_path = text(row.get("cachedSource"))
        if local_path and cached_path:
            published_by_local_path[local_path.removeprefix("benchmark/")] = cached_path

    def published_claim_source(organization: str, claim: str, metadata: dict[str, str]) -> str:
        manifest = manifest_by_claim.get((organization, claim))
        if not manifest:
            raise ValueError(f"Operating metadata lacks a source-manifest row: {organization}/{claim}")
        prefix = "remote" if claim == "work_model" else "fiscal_sponsor"
        source_url = text(metadata[f"{prefix}_source_url"])
        local_path = text(metadata[f"{prefix}_local_path"])
        if source_url != text(manifest["source_url"]) or local_path != text(manifest["local_path"]):
            raise ValueError(f"Operating-metadata source manifest is stale: {organization}/{claim}")
        if not local_path:
            if any(text(manifest[field]) for field in ("mime_type", "byte_length", "sha256")):
                raise ValueError(f"URL-only operating source has unexpected file metadata: {organization}/{claim}")
            return ""
        source = ROOT / local_path
        if not source.is_file():
            raise FileNotFoundError(f"Missing operating-metadata source: {source}")
        content = source.read_bytes()
        if len(content) != int(manifest["byte_length"]):
            raise ValueError(f"Operating-metadata source size changed: {organization}/{claim}")
        if hashlib.sha256(content).hexdigest() != text(manifest["sha256"]):
            raise ValueError(f"Operating-metadata source hash changed: {organization}/{claim}")
        benchmark_path = local_path.removeprefix("benchmark/")
        if benchmark_path not in published_by_local_path:
            source_id = f"ORG-META-{Path(benchmark_path).stem}-{hashlib.sha256(benchmark_path.encode()).hexdigest()[:10]}"
            published = cache_source(source_id, benchmark_path)
            if not published:
                raise FileNotFoundError(f"Could not publish operating-metadata source: {source}")
            published_by_local_path[benchmark_path] = published
        return published_by_local_path[benchmark_path]

    counts = {"remote": 0, "inPersonHybrid": 0, "remoteUnknown": 0,
              "fiscalSponsor": 0, "notFiscalSponsor": 0, "fiscalSponsorUnknown": 0}
    counted_organizations: set[str] = set()
    for row in app_rows:
        organization = text(row.get("organization"))
        metadata = by_organization[organization]
        remote = tristate(metadata["is_remote"])
        remote_category = text(metadata["remote_category"]).casefold()
        expected_remote_category = "remote" if remote is True else "in-person / hybrid" if remote is False else "unknown"
        if remote_category != expected_remote_category:
            raise ValueError(
                f"Remote flag/category mismatch for {row['organization']}: "
                f"{metadata['is_remote']!r}/{metadata['remote_category']!r}"
            )
        sponsor = tristate(metadata["serves_as_fiscal_sponsor"])
        row["isRemote"] = remote
        row["remoteCategory"] = remote_category.title() if remote is not False else "In-person / hybrid"
        row["servesAsFiscalSponsor"] = sponsor
        row["fiscalSponsorCategory"] = "Yes" if sponsor is True else "No" if sponsor is False else "Unknown"
        remote_cached_source = published_claim_source(organization, "work_model", metadata)
        fiscal_sponsor_cached_source = published_claim_source(organization, "fiscal_sponsor", metadata)
        row["operatingMetadata"] = {
            "remoteEvidence": text(metadata["remote_evidence"]),
            "remoteSourceUrl": text(metadata["remote_source_url"]),
            "remoteLocalPath": remote_cached_source,
            "fiscalSponsorEvidence": text(metadata["fiscal_sponsor_evidence"]),
            "fiscalSponsorSourceUrl": text(metadata["fiscal_sponsor_source_url"]),
            "fiscalSponsorLocalPath": fiscal_sponsor_cached_source,
            "confidence": text(metadata["confidence"]),
            "caveats": text(metadata["caveats"]),
            "retrievedAt": text(metadata["retrieved_at"]),
        }
        if organization not in counted_organizations:
            counted_organizations.add(organization)
            counts["remote" if remote is True else "inPersonHybrid" if remote is False else "remoteUnknown"] += 1
            counts["fiscalSponsor" if sponsor is True else "notFiscalSponsor" if sponsor is False else "fiscalSponsorUnknown"] += 1
    return counts


def require_finite_number(value: object, label: str, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"Predictive-model {label} is not finite")
    if positive and value <= 0:
        raise ValueError(f"Predictive-model {label} must be positive")
    return float(value)


def require_finite_vector(value: object, length: int, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) != length:
        raise ValueError(f"Predictive-model {label} has the wrong length")
    return [require_finite_number(item, f"{label}[{index}]") for index, item in enumerate(value)]


def require_finite_matrix(value: object, rows: int, columns: int, label: str) -> None:
    if not isinstance(value, list) or len(value) != rows:
        raise ValueError(f"Predictive-model {label} has the wrong row count")
    for index, row in enumerate(value):
        require_finite_vector(row, columns, f"{label}[{index}]")


def load_predictive_model_artifact(
    expected_exact: int,
    expected_cash_proxy: int,
    expected_ads: int,
    training_inputs: dict,
) -> dict:
    if not PREDICTIVE_MODEL_ARTIFACT.is_file():
        raise FileNotFoundError(f"Missing predictive-model artifact: {PREDICTIVE_MODEL_ARTIFACT}")
    artifact = json.loads(PREDICTIVE_MODEL_ARTIFACT.read_text(encoding="utf-8"))
    if artifact.get("schemaVersion") != 2:
        raise ValueError("Unsupported predictive-model artifact schema")
    if artifact.get("production") is not True:
        raise ValueError("Predictive-model artifact is a quick/smoke-test fit, not a production fit")
    fit_configuration = artifact.get("fitConfiguration") or {}
    if fit_configuration != {
        "cvChains": 4,
        "cvWarmupPerChain": 400,
        "cvSamplingPerChain": 500,
        "fullChains": 4,
        "fullWarmupPerChain": 800,
        "fullSamplingPerChain": 1000,
        "exportedPosteriorDraws": 512,
    }:
        raise ValueError("Predictive-model artifact has an unsupported production fit configuration")
    training = artifact.get("training") or {}
    if training.get("rpExcluded") is not True:
        raise ValueError("Predictive-model artifact does not prove RP was excluded from training")
    if training.get("exactFilings") != expected_exact:
        raise ValueError("Predictive-model exact-filing cohort is stale")
    if training.get("cashProxyFilings") != expected_cash_proxy:
        raise ValueError("Predictive-model cash-proxy cohort is stale")
    if training.get("advertisedRecords") != expected_ads:
        raise ValueError("Predictive-model recruitment cohort is stale")
    records = training.get("records")
    expected_record_count = expected_exact + expected_cash_proxy + expected_ads
    if not isinstance(records, list) or len(records) != expected_record_count:
        raise ValueError("Predictive-model training-record provenance is incomplete")
    record_ids = [text(record.get("id")) for record in records if isinstance(record, dict)]
    if len(record_ids) != expected_record_count or any(not record_id for record_id in record_ids):
        raise ValueError("Predictive-model training-record provenance contains an invalid ID")
    if len(set(record_ids)) != len(record_ids):
        raise ValueError("Predictive-model training-record provenance contains duplicate IDs")
    app_ids = {
        text(row.get("id"))
        for row in [*training_inputs.get("incumbents", []), *training_inputs.get("jobAds", [])]
    }
    if not set(record_ids).issubset(app_ids):
        raise ValueError("Predictive-model training-record provenance references an unknown app row")
    for index, record in enumerate(records):
        if record.get("source") not in {"filing", "job_ad"}:
            raise ValueError(f"Predictive-model training record {index} has an invalid source")
        if record.get("observation") not in {"exact_base", "cash_proxy", "interval", "advertised_point"}:
            raise ValueError(f"Predictive-model training record {index} has an invalid observation type")
    provenance = artifact.get("provenance") or {}
    if provenance.get("trainingInputSha256") != predictive_model_input_sha256(training_inputs):
        raise ValueError("Predictive-model input values are stale")
    model_dir = PREDICTIVE_MODEL_ARTIFACT.parent
    expected_scripts = {
        "prepareScriptSha256": model_dir / "prepare_model_data.py",
        "fitScriptSha256": model_dir / "fit_salary_models.R",
        "stanModelSha256": model_dir / "ceo_salary_model.stan",
        "utilsScriptSha256": model_dir / "model_utils.R",
        "contractScriptSha256": ROOT / "scripts" / "predictive_model_contract.py",
    }
    for key, path in expected_scripts.items():
        if provenance.get(key) != hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError(f"Predictive-model artifact was not generated by the current {path.name}")
    training_csv = PREDICTIVE_MODEL_ARTIFACT.parent / "training_data.csv"
    if provenance.get("trainingCsvSha256") != hashlib.sha256(training_csv.read_bytes()).hexdigest():
        raise ValueError("Predictive-model artifact does not match the archived training cohort")
    archived_records = [
        {
            "id": text(row.get("id")),
            "organization": text(row.get("organization")),
            "source": text(row.get("source")),
            "observation": text(row.get("observation")),
        }
        for row in rows(training_csv)
    ]
    artifact_records = [
        {
            "id": text(record.get("id")),
            "organization": text(record.get("organization")),
            "source": text(record.get("source")),
            "observation": text(record.get("observation")),
        }
        for record in records
    ]
    if artifact_records != archived_records:
        raise ValueError("Predictive-model training-record labels do not match the archived training cohort")
    if set((artifact.get("models") or {})) != {
        "bayesian", "bayesianNoHighest", "bayesianRanges", "bayesianRangesNoHighest",
        "gam", "gamNoHighest", "intercept", "linear", "linearNoHighest",
    }:
        raise ValueError("Predictive-model artifact is missing a required model")
    rp_profile = artifact.get("rpProfile") or {}
    for key in ("expenses", "revenue", "staff", "highest_other_base", "reference_salary"):
        require_finite_number(rp_profile.get(key), f"RP profile {key}", positive=True)
    continuous_features = artifact.get("continuousFeatures") or []
    continuous_feature_keys = [
        feature.get("key") for feature in continuous_features if isinstance(feature, dict)
    ]
    if continuous_feature_keys != ["expenses", "revenue", "staff", "highest_other_base"]:
        raise ValueError("Predictive-model continuous feature schema is malformed")
    if "compensation_year" in rp_profile:
        raise ValueError("Predictive-model RP profile must not include a pay-year predictor")

    categorical_features = artifact.get("categoricalFeatures") or []
    expected_categorical_keys = {
        "focus_area", "organization_type", "title_group", "location_scope",
        "remote_category", "fiscal_sponsor_category",
    }
    categorical_by_key = {
        feature.get("key"): feature for feature in categorical_features if isinstance(feature, dict)
    }
    if set(categorical_by_key) != expected_categorical_keys or len(categorical_by_key) != len(categorical_features):
        raise ValueError("Predictive-model categorical feature schema is malformed")
    category_widths: dict[str, int] = {}
    expected_count_totals = {
        "counts": expected_record_count,
        "filingCounts": expected_exact + expected_cash_proxy,
        "exactCounts": expected_exact,
    }
    for key, feature in categorical_by_key.items():
        levels = feature.get("levels")
        if not isinstance(levels, list) or not levels or len(set(levels)) != len(levels) or any(not text(level) for level in levels):
            raise ValueError(f"Predictive-model {key} levels are malformed")
        category_widths[key] = len(levels)
        for count_key, expected_total in expected_count_totals.items():
            counts = feature.get(count_key)
            if not isinstance(counts, list) or len(counts) != len(levels) or any(
                isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in counts
            ):
                raise ValueError(f"Predictive-model {key} {count_key} are malformed")
            if sum(counts) != expected_total:
                raise ValueError(f"Predictive-model {key} {count_key} total is stale")

    ea_levels = artifact.get("eaLevels")
    if ea_levels != ["Functional overlap", "EA-adjacent"]:
        raise ValueError("Predictive-model EA relationship levels are malformed")
    for count_key, expected_total in {
        "eaCounts": expected_record_count,
        "eaFilingCounts": expected_exact + expected_cash_proxy,
        "eaExactCounts": expected_exact,
    }.items():
        counts = artifact.get(count_key)
        if not isinstance(counts, list) or len(counts) != len(ea_levels) or any(
            isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in counts
        ):
            raise ValueError(f"Predictive-model {count_key} are malformed")
        if sum(counts) != expected_total:
            raise ValueError(f"Predictive-model {count_key} total is stale")

    comparison = artifact.get("comparison") or []
    expected_comparison = {
        "intercept": (False, False),
        "linear_no_highest": (False, False),
        "linear": (True, False),
        "gam_no_highest": (False, False),
        "gam": (True, False),
        "bayesian_no_highest": (False, False),
        "bayesian": (True, False),
        "bayesian_ranges_no_highest": (False, True),
        "bayesian_ranges": (True, True),
    }
    if (
        [row.get("key") for row in comparison if isinstance(row, dict)]
        != list(expected_comparison)
    ):
        raise ValueError("Predictive-model comparison table is incomplete")
    for row in comparison:
        expected_highest, expected_ranges = expected_comparison[row["key"]]
        if row.get("includeHighestOtherPay") is not expected_highest:
            raise ValueError(f"comparison {row['key']} has the wrong non-CEO-pay specification")
        if row.get("includeAdvertisedRanges") is not expected_ranges:
            raise ValueError(f"comparison {row['key']} has the wrong advertised-range specification")
        for metric in (
            "logRmse", "logMae", "oosR2", "medianAbsPercentError", "coverage80",
            "coverage90", "cvElpd", "meanLogPredictiveDensity",
        ):
            require_finite_number(row.get(metric), f"comparison {row.get('key')} {metric}")
        if row.get("key") in {"bayesian_ranges", "bayesian_ranges_no_highest"}:
            require_finite_number(row.get("advertisedIntervalMeanLogScore"), "range-model interval log score")
            require_finite_number(row.get("advertisedPointMeanLogScore"), "range-model point log score")
        if row.get("key") in {
            "bayesian", "bayesian_no_highest", "bayesian_ranges",
            "bayesian_ranges_no_highest",
        }:
            require_finite_number(row.get("cashProxyMeanLogScore"), f"{row.get('key')} cash-proxy log score")

    full_preprocessing = ["expenses", "revenue", "staff", "highest_other_base"]
    reduced_preprocessing = ["expenses", "revenue", "staff"]

    def validate_preprocessing(
        model_key: str, model: dict, expected_keys: list[str]
    ) -> dict[str, dict]:
        preprocessing = model.get("preprocessing") or []
        preprocessing_by_key = {
            item.get("key"): item for item in preprocessing if isinstance(item, dict)
        }
        if (
            list(preprocessing_by_key) != expected_keys
            or len(preprocessing_by_key) != len(preprocessing)
        ):
            raise ValueError(f"Predictive-model {model_key} preprocessing is malformed")
        for key, item in preprocessing_by_key.items():
            for field in ("center", "scale", "impute", "minimum", "maximum"):
                require_finite_number(
                    item.get(field), f"{model_key} {key} {field}", positive=field == "scale"
                )
            if item.get("minimum") > item.get("maximum"):
                raise ValueError(f"Predictive-model {model_key} {key} support is reversed")
            if item.get("transform") != "log":
                raise ValueError(f"Predictive-model {model_key} {key} transform is invalid")
        return preprocessing_by_key

    draw_count = fit_configuration["exportedPosteriorDraws"]
    category_draw_keys = {
        "focus": "focus_area", "organizationType": "organization_type", "title": "title_group",
        "location": "location_scope", "remote": "remote_category",
        "fiscalSponsor": "fiscal_sponsor_category",
    }
    bayesian_configurations = {
        "bayesian": (True, False),
        "bayesianNoHighest": (False, False),
        "bayesianRanges": (True, True),
        "bayesianRangesNoHighest": (False, True),
    }
    for model_key, (include_highest, include_ranges) in bayesian_configurations.items():
        model = artifact["models"][model_key]
        expected_keys = full_preprocessing if include_highest else reduced_preprocessing
        validate_preprocessing(model_key, model, expected_keys)
        if model.get("includeHighestOtherPay") is not include_highest:
            raise ValueError(f"Predictive-model {model_key} has the wrong non-CEO-pay specification")
        if model.get("includeAdvertisedRanges") is not include_ranges:
            raise ValueError(f"Predictive-model {model_key} has the wrong advertised-range specification")
        expected_design = [
            *(f"log_{key}" for key in expected_keys),
            *(f"{key}_missing" for key in expected_keys),
        ]
        if model.get("designColumns") != expected_design:
            raise ValueError(f"Predictive-model {model_key} design columns are malformed")
        draws = model.get("draws") or {}
        for key in ("alpha", "adOffset", "residualZ"):
            require_finite_vector(draws.get(key), draw_count, f"{model_key} draws {key}")
        require_finite_matrix(
            draws.get("beta"), draw_count, len(expected_design), f"{model_key} draws beta"
        )
        require_finite_matrix(draws.get("sigma"), draw_count, 2, f"{model_key} draws sigma")
        for row_index, row in enumerate(draws["sigma"]):
            if any(value <= 0 for value in row):
                raise ValueError(f"Predictive-model {model_key} draws sigma[{row_index}] is not positive")
        for draw_key, category_key in category_draw_keys.items():
            require_finite_matrix(
                draws.get(draw_key), draw_count, category_widths[category_key],
                f"{model_key} draws {draw_key}",
            )
        require_finite_matrix(
            draws.get("ea"), draw_count, len(ea_levels), f"{model_key} draws ea"
        )

    for model_key, include_highest in {"gam": True, "gamNoHighest": False}.items():
        gam = artifact["models"][model_key]
        expected_keys = full_preprocessing if include_highest else reduced_preprocessing
        gam_preprocessing = validate_preprocessing(model_key, gam, expected_keys)
        if gam.get("includeHighestOtherPay") is not include_highest:
            raise ValueError(f"Predictive-model {model_key} has the wrong non-CEO-pay specification")
        expected_effects = {
            "expenses": "expenses", "revenue": "revenue", "staff": "staff"
        }
        if include_highest:
            expected_effects["highestOther"] = "highest_other_base"
        if set(gam.get("effects") or {}) != set(expected_effects):
            raise ValueError(f"Predictive-model {model_key} effects are malformed")
        for effect_key, preprocessing_key in expected_effects.items():
            preprocessing = gam_preprocessing.get(preprocessing_key) or {}
            effect = (gam.get("effects") or {}).get(effect_key) or {}
            grid = effect.get("z") or []
            values = effect.get("effect") or []
            if len(grid) < 2 or len(grid) != len(values):
                raise ValueError(f"Predictive-model {model_key} {effect_key} grid is malformed")
            if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in grid + values):
                raise ValueError(f"Predictive-model {model_key} {effect_key} grid contains non-finite values")
            if any(right <= left for left, right in zip(grid, grid[1:])):
                raise ValueError(f"Predictive-model {model_key} {effect_key} grid is not strictly increasing")
            required = []
            for bound in (preprocessing.get("minimum"), preprocessing.get("maximum")):
                if not isinstance(bound, (int, float)) or not math.isfinite(bound):
                    raise ValueError(f"Predictive-model {model_key} {effect_key} support is missing")
                transformed = math.log(bound) if preprocessing.get("transform") == "log" else bound
                required.append((transformed - preprocessing["center"]) / preprocessing["scale"])
            if grid[0] > min(required) + 1e-7 or grid[-1] < max(required) - 1e-7:
                raise ValueError(f"Predictive-model {model_key} {effect_key} grid does not cover observed support")
        require_finite_number(gam.get("baseline"), f"{model_key} baseline")
        require_finite_vector(gam.get("residuals"), expected_exact, f"{model_key} residuals")

    exact_record_ids = [
        text(record.get("id"))
        for record in records
        if isinstance(record, dict) and record.get("observation") == "exact_base"
    ]
    def expected_design_columns(include_highest: bool) -> list[str]:
        keys = full_preprocessing if include_highest else reduced_preprocessing
        return [*(f"log_{key}" for key in keys), *(f"{key}_missing" for key in keys)]

    def validate_deterministic_model(
        model_key: str, include_highest: bool, require_rank: bool = True
    ) -> dict:
        model = artifact["models"][model_key]
        if model.get("includeAdvertisedRanges") is not False:
            raise ValueError(f"Predictive-model {model_key} must use exact filings only")
        if model.get("includeHighestOtherPay") is not include_highest:
            raise ValueError(f"Predictive-model {model_key} has the wrong non-CEO-pay specification")
        require_finite_number(model.get("baseline"), f"{model_key} baseline")
        require_finite_vector(model.get("residuals"), expected_exact, f"{model_key} residuals")
        residual_ids = model.get("residualRecordIds")
        if (
            not isinstance(residual_ids, list)
            or len(residual_ids) != expected_exact
            or any(not isinstance(record_id, str) or not record_id for record_id in residual_ids)
            or len(set(residual_ids)) != expected_exact
            or set(residual_ids) != set(exact_record_ids)
        ):
            raise ValueError(f"Predictive-model {model_key} residual IDs are malformed")
        if model.get("trainingRecordIds") != exact_record_ids:
            raise ValueError(f"Predictive-model {model_key} training IDs are stale")
        diagnostics = model.get("diagnostics") or {}
        if diagnostics.get("trainingN") != expected_exact:
            raise ValueError(f"Predictive-model {model_key} training count is stale")
        require_finite_number(
            diagnostics.get("residualScale"), f"{model_key} residual scale", positive=True
        )
        if model.get("intervalCalibration") != "nested organization-fold residual KDE":
            raise ValueError(f"Predictive-model {model_key} interval calibration is malformed")
        if require_rank:
            rank = diagnostics.get("rank")
            if isinstance(rank, bool) or not isinstance(rank, int) or rank < 1:
                raise ValueError(f"Predictive-model {model_key} rank is malformed")
        return model

    validate_deterministic_model("intercept", False)

    def validate_design_partition(model_key: str, model: dict, include_highest: bool) -> None:
        candidate = expected_design_columns(include_highest)
        active = model.get("activeDesignColumns")
        dropped = model.get("droppedDesignColumns")
        if model.get("candidateDesignColumns") != candidate:
            raise ValueError(f"Predictive-model {model_key} candidate columns are malformed")
        if (
            not isinstance(active, list) or not isinstance(dropped, list)
            or len(set(active)) != len(active) or len(set(dropped)) != len(dropped)
            or any(column not in candidate for column in [*active, *dropped])
            or set(active).intersection(dropped)
            or set(active).union(dropped) != set(candidate)
        ):
            raise ValueError(f"Predictive-model {model_key} active/dropped columns are malformed")

    for model_key, include_highest in {"linear": True, "linearNoHighest": False}.items():
        linear = validate_deterministic_model(model_key, include_highest)
        expected_keys = full_preprocessing if include_highest else reduced_preprocessing
        validate_preprocessing(model_key, linear, expected_keys)
        validate_design_partition(model_key, linear, include_highest)
        if linear.get("designColumns") != linear.get("activeDesignColumns"):
            raise ValueError(f"Predictive-model {model_key} design columns are not the active columns")
        require_finite_vector(
            linear.get("coefficients"), len(linear["designColumns"]),
            f"{model_key} coefficients",
        )

    for model_key, include_highest in {"gam": True, "gamNoHighest": False}.items():
        gam = validate_deterministic_model(model_key, include_highest, require_rank=False)
        validate_design_partition(model_key, gam, include_highest)

    method = artifact.get("method") or {}
    for method_key in (
        "intercept", "linear", "linearNoHighest", "bayesian", "bayesianNoHighest",
        "bayesianRanges", "bayesianRangesNoHighest", "gam", "gamNoHighest",
        "validation",
    ):
        if not text(method.get(method_key)):
            raise ValueError(f"Predictive-model {method_key} method description is missing")

    validation = artifact.get("validationDiagnostics") or {}
    if validation.get("crossValidationFits") != 40:
        raise ValueError("Predictive-model artifact lacks all 40 Bayesian CV fit diagnostics")
    if validation.get("crossValidationDivergences") or validation.get("crossValidationMaxTreedepthHits"):
        raise ValueError("Predictive-model cross-validation contains sampler failures")
    if not isinstance(validation.get("crossValidationMinEbfmi"), (int, float)) or validation["crossValidationMinEbfmi"] < 0.2:
        raise ValueError("Predictive-model cross-validation has inadequate energy diagnostics")
    if not isinstance(validation.get("crossValidationMaxRhat"), (int, float)) or validation["crossValidationMaxRhat"] > 1.05:
        raise ValueError("Predictive-model cross-validation has inadequate R-hat convergence")
    if not isinstance(validation.get("crossValidationMinBulkEss"), (int, float)) or validation["crossValidationMinBulkEss"] < 100:
        raise ValueError("Predictive-model cross-validation has inadequate bulk ESS")
    if not isinstance(validation.get("crossValidationMinTailEss"), (int, float)) or validation["crossValidationMinTailEss"] < 100:
        raise ValueError("Predictive-model cross-validation has inadequate tail ESS")
    for key in (
        "bayesian", "bayesianNoHighest", "bayesianRanges", "bayesianRangesNoHighest"
    ):
        diagnostics = artifact["models"][key].get("diagnostics") or {}
        if diagnostics.get("chains") != 4 or diagnostics.get("drawsPerChain") != 1000:
            raise ValueError(f"Predictive-model full fit {key} lacks the required four-chain run")
        if diagnostics.get("posteriorDraws") != 512:
            raise ValueError(f"Predictive-model full fit {key} lacks the required exported draws")
        if not isinstance(diagnostics.get("maxRhat"), (int, float)) or diagnostics["maxRhat"] > 1.01:
            raise ValueError(f"Predictive-model full fit {key} has inadequate R-hat convergence")
        if not isinstance(diagnostics.get("minBulkEss"), (int, float)) or diagnostics["minBulkEss"] < 400:
            raise ValueError(f"Predictive-model full fit {key} has inadequate bulk ESS")
        if not isinstance(diagnostics.get("minTailEss"), (int, float)) or diagnostics["minTailEss"] < 400:
            raise ValueError(f"Predictive-model full fit {key} has inadequate tail ESS")
        if diagnostics.get("divergences") or diagnostics.get("maxTreedepthHits"):
            raise ValueError(f"Predictive-model full fit {key} contains sampler failures")
        if not isinstance(diagnostics.get("minEbfmi"), (int, float)) or diagnostics["minEbfmi"] < 0.2:
            raise ValueError(f"Predictive-model full fit {key} has inadequate energy diagnostics")
    return artifact


def text(value: object) -> str:
    value = "" if value is None else str(value).strip()
    return "" if value.lower() in {"", "nan", "none"} else value


EA_CORE_LABEL = re.compile(r"\bEA(?:-|\s+)core\b", re.IGNORECASE)


def normalize_ea_taxonomy(value: object) -> object:
    """Collapse the retired EA category in generated/displayed data only.

    Frozen CSVs and source-native evidence remain unchanged on disk. Applying
    the migration recursively here prevents historical provenance text or a
    future derived row from leaking the retired label back into app-data.js.
    """
    if isinstance(value, str):
        return EA_CORE_LABEL.sub("EA-adjacent", value)
    if isinstance(value, list):
        return [normalize_ea_taxonomy(item) for item in value]
    if isinstance(value, dict):
        result: dict = {}
        for key, item in value.items():
            normalized_key = normalize_ea_taxonomy(key)
            if normalized_key in result:
                raise ValueError(
                    f"EA taxonomy migration produced a duplicate key: {normalized_key!r}"
                )
            result[normalized_key] = normalize_ea_taxonomy(item)
        return result
    return value


def assert_no_retired_ea_label(value: object, path: str = "payload") -> None:
    if isinstance(value, str) and EA_CORE_LABEL.search(value):
        raise ValueError(f"Retired EA label leaked into {path}: {value!r}")
    if isinstance(value, list):
        for index, item in enumerate(value):
            assert_no_retired_ea_label(item, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            assert_no_retired_ea_label(key, f"{path}.<key>")
            assert_no_retired_ea_label(item, f"{path}.{key}")


def literal(value: object) -> str:
    """Preserve category strings such as the meaningful structure flag `none`."""
    return "" if value is None else str(value).strip()


def load_wikipedia_profiles(organizations: set[str]) -> dict[str, dict[str, str]]:
    profiles = rows(WIKIPEDIA_PROFILES)
    by_organization: dict[str, dict[str, str]] = {}
    for profile in profiles:
        organization = text(profile["organization"])
        if not organization or organization in by_organization:
            raise ValueError(f"Invalid or duplicate Wikipedia profile row: {organization!r}")
        method = text(profile["validation_method"])
        title = text(profile["wikipedia_title"])
        url = text(profile["wikipedia_url"])
        if bool(title) != bool(url):
            raise ValueError(f"Incomplete Wikipedia mapping for {organization}")
        if title and method not in {"exact_title_or_redirect", "reviewed_override"}:
            raise ValueError(f"Unverified Wikipedia mapping for {organization}: {method}")
        by_organization[organization] = profile
    missing = organizations - by_organization.keys()
    extra = by_organization.keys() - organizations
    if missing or extra:
        raise ValueError(
            f"Wikipedia profile coverage mismatch; missing={sorted(missing)}, extra={sorted(extra)}"
        )
    return by_organization


def verify_category_explainer_hashes() -> None:
    manifest = CATEGORY_EXPLAINERS / "CATEGORY_EXPLAINER_HASHES.sha256"
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, relative_path = line.split(maxsplit=1)
        path = BENCHMARK / relative_path.strip()
        if not path.is_file():
            raise FileNotFoundError(f"Missing hashed category-explainer file: {path}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Category-explainer hash mismatch: {path}")


def verify_preserved_paths(value: str, separator: str) -> None:
    for item in value.split(separator):
        path = item.split("#", 1)[0].strip()
        if path.startswith("benchmark/") and not (ROOT / path).is_file():
            raise FileNotFoundError(f"Category explainer cites a missing preserved file: {path}")


def number(value: object) -> float | None:
    value = text(value)
    if not value:
        return None
    parsed = float(value)
    return parsed if math.isfinite(parsed) else None


def boolean(value: object) -> bool:
    return text(value).lower() in {"true", "yes", "1"}


def reviewed_boolean(value: object) -> bool:
    normalized = text(value).lower()
    if normalized in {"true", "yes", "1"}:
        return True
    if normalized in {"false", "no", "0"}:
        return False
    raise ValueError(f"Expected an explicit reviewed boolean, got {value!r}")


def money(value: float | None) -> str:
    return "not reported" if value is None else f"${value:,.0f}"


def slug(source_id: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in source_id).strip("-")


def normalize_title(value: str) -> str:
    """Consolidate equivalent executive-title spellings without erasing role distinctions."""
    original = text(value)
    if not original:
        return "Not reported"
    normalized = re.sub(r"\s+", " ", original.replace("/", " & ")).strip()
    normalized = re.sub(r"\bChief Executive Officer\b", "CEO", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bChief Exec(?:utive)? Officer\b", "CEO", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bExecutive Director\b", "Executive Director", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bPresident\b", "President", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+(?:and|&)\s+", " & ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s*&\s*CEO\b", " & CEO", normalized, flags=re.IGNORECASE)
    return normalized


def title_group(value: str) -> str:
    """Group source-native executive titles without replacing their displayed wording."""
    normalized = normalize_title(value).lower()
    if normalized == "not reported":
        return "Not reported"
    if re.search(r"\bco[- ]?(?:ceo|executive director|director)\b", normalized):
        return "Co-leadership"
    if re.search(r"\bceo\b", normalized):
        return "CEO"
    if "executive director" in normalized:
        return "Executive Director"
    if "president" in normalized:
        return "President"
    return "Other executive titles"


def cache_source(source_id: str, local_path: str) -> str:
    source = BENCHMARK / local_path
    if not source.is_file():
        return ""
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = source.suffix.lower() or ".txt"
    destination = EVIDENCE_DIR / f"{slug(source_id)}{suffix}"
    if suffix in {".html", ".htm"}:
        content = source.read_bytes()
        content = re.sub(
            rb'("accessToken"\s*:\s*")pk\.[^"]+("\s*})',
            rb'\1[REDACTED_MAPBOX_ACCESS_TOKEN]\2',
            content,
        )
        if source_id in PUBLISHED_HTML_WHITESPACE_NORMALIZATION_SOURCE_IDS:
            content = content.replace(b"\t", b"  ")
            content = b"\n".join(line.rstrip(b" ") for line in content.split(b"\n"))
        destination.write_bytes(content)
        shutil.copystat(source, destination)
    else:
        shutil.copy2(source, destination)
    return str(destination.relative_to(ROOT))


def filing_homepage(local_path: str) -> str:
    source = BENCHMARK / local_path
    if not source.is_file() or source.suffix.lower() != ".xml":
        return ""
    try:
        root = ElementTree.parse(source).getroot()
    except ElementTree.ParseError:
        return ""
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == "WebsiteAddressTxt" and text(element.text):
            value = text(element.text)
            if value.lower() in {"n/a", "none", "not applicable"}:
                return ""
            return value if value.lower().startswith(("http://", "https://")) else f"https://{value}"
    return ""


def local_name(element: ElementTree.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def first_descendant(element: ElementTree.Element, name: str) -> str:
    for candidate in element.iter():
        if local_name(candidate) == name and text(candidate.text):
            return text(candidate.text)
    raise ValueError(f"Missing required Form 990 field: {name}")


def person_record(root: ElementTree.Element, group_name: str, person: str) -> ElementTree.Element:
    for group in root.iter():
        if local_name(group) != group_name:
            continue
        name = next(
            (text(element.text) for element in group.iter() if local_name(element) == "PersonNm" and text(element.text)),
            "",
        )
        if name.casefold() == person.casefold():
            return group
    raise ValueError(f"Missing {group_name} record for {person}")


def cpi_factor(year: int) -> float:
    cpi_rows = rows(BENCHMARK / "data" / "cpi_u.csv")
    target = [number(row["index_value"]) for row in cpi_rows if text(row["period"]) == "2026-07"]
    annual_average = [
        number(row["index_value"])
        for row in cpi_rows
        if text(row["period"]) == f"{year}-AVG"
    ]
    annual = [
        number(row["index_value"])
        for row in cpi_rows
        if re.fullmatch(fr"{year}-\d{{2}}", text(row["period"]))
    ]
    if len(target) != 1 or len(annual_average) > 1:
        raise ValueError(f"Incomplete CPI series for {year} annual-average adjustment")
    if annual_average:
        denominator = annual_average[0]
    elif len(annual) == 12 and not any(value is None for value in annual):
        denominator = sum(float(value) for value in annual) / 12
    else:
        raise ValueError(f"Incomplete CPI series for {year} annual-average adjustment")
    return float(target[0]) / float(denominator)


def monthly_cpi_factor(period: str) -> float:
    cpi_rows = rows(BENCHMARK / "data" / "cpi_u.csv")
    target = [number(row["index_value"]) for row in cpi_rows if text(row["period"]) == "2026-07"]
    source = [number(row["index_value"]) for row in cpi_rows if text(row["period"]) == period]
    if len(target) != 1 or len(source) != 1 or target[0] is None or source[0] is None:
        raise ValueError(f"Incomplete monthly CPI series for {period}")
    return float(target[0]) / float(source[0])


def build_rp_reference() -> dict:
    path = BENCHMARK / RP_REFERENCE_LOCAL_PATH
    root = ElementTree.parse(path).getroot()
    if first_descendant(root, "EIN") != "843896318":
        raise ValueError("RP reference filing EIN does not match 84-3896318")
    if first_descendant(root, "TaxPeriodBeginDt") != "2024-01-01" or first_descendant(root, "TaxPeriodEndDt") != "2024-12-31":
        raise ValueError("RP reference filing is not the expected calendar-year 2024 return")

    form990 = next((element for element in root.iter() if local_name(element) == "IRS990"), None)
    if form990 is None:
        raise ValueError("RP reference source does not contain Form 990")
    part_vii = person_record(form990, "Form990PartVIISectionAGrp", "Marcus Davis")
    schedule_j = person_record(root, "RltdOrgOfficerTrstKeyEmplGrp", "Marcus Davis")
    title = first_descendant(part_vii, "TitleTxt")
    if title.casefold() != "ceo":
        raise ValueError(f"Unexpected RP top-executive title: {title}")

    base = number(first_descendant(schedule_j, "BaseCompensationFilingOrgAmt"))
    cash = number(first_descendant(part_vii, "ReportableCompFromOrgAmt"))
    related = next((number(element.text) for element in part_vii.iter() if local_name(element) == "ReportableCompFromRltdOrgAmt"), 0) or 0
    other = number(first_descendant(part_vii, "OtherCompensationAmt"))
    schedule_total = number(first_descendant(schedule_j, "TotalCompensationFilingOrgAmt"))
    if any(value is None for value in (base, cash, other, schedule_total)):
        raise ValueError("RP reference filing lacks a required compensation field")
    total = float(cash) + float(related) + float(other)
    if schedule_total != total:
        raise ValueError(f"RP Schedule J total {schedule_total} does not match Part VII total {total}")

    expenses_group = next((element for element in form990.iter() if local_name(element) == "TotalFunctionalExpensesGrp"), None)
    if expenses_group is None:
        raise ValueError("RP reference filing lacks total functional expenses")
    expenses = number(first_descendant(expenses_group, "TotalAmt"))
    revenue = number(first_descendant(form990, "CYTotalRevenueAmt"))
    employees = number(first_descendant(form990, "TotalEmployeeCnt"))
    if (expenses, revenue, employees) != (20_378_936, 20_599_841, 0):
        raise ValueError(f"Unexpected RP filing scale fields: expenses={expenses}, revenue={revenue}, employees={employees}")

    staff_path = BENCHMARK / RP_STAFF_LOCAL_PATH
    if hashlib.sha256(staff_path.read_bytes()).hexdigest() != RP_STAFF_SHA256:
        raise ValueError("RP 2023 Form 990 PDF is missing or does not match the validated filing")

    factor = cpi_factor(2024)
    cached = cache_source(RP_REFERENCE_SOURCE_ID, RP_REFERENCE_LOCAL_PATH)
    cached_staff = cache_source(RP_STAFF_SOURCE_ID, RP_STAFF_LOCAL_PATH)
    return {
        "id": RP_REFERENCE_SOURCE_ID,
        "sourceId": RP_REFERENCE_SOURCE_ID,
        "organization": "Rethink Priorities",
        "executive": "Marcus Davis",
        "title": title,
        "titleGroup": title_group(title),
        "rawTitle": title,
        "tier": "Reference",
        "topic": "RP reference organization",
        "eaAffinity": "EA-adjacent",
        "location": "US",
        "remoteStatus": "Not reported in Form 990",
        "structure": "independent nonprofit",
        "revenue": revenue,
        "expenses": expenses,
        "staff": RP_STAFF_COUNT,
        "staffFte": None,
        "staffYear": RP_STAFF_YEAR,
        "filingStaff": RP_STAFF_COUNT,
        "currentFilingStaff": employees,
        "comparabilityScore": None,
        "compensationYear": 2024,
        "salary": {
            "base": round(float(base) * factor, 2),
            "cash": round(float(cash + related) * factor, 2),
            "total": round(total * factor, 2),
        },
        "nominalSalary": {"base": base, "cash": cash + related, "total": total},
        "cpiFactor": factor,
        "cpiPeriod": "2024 annual average",
        "defaultIncluded": False,
        "structurallyClean": False,
        "founder": False,
        "analysisStatus": "reference only; excluded from peer distribution",
        "auditStatus": "validated RP 2024 and 2023 Forms 990",
        "selectionNote": "",
        "evidenceText": (
            "IRS Form 990 for the period ending 2024-12-31. Marcus Davis, CEO. "
            f"Schedule J base: {money(base)}; Part VII cash/W-2 proxy: {money(cash + related)}; "
            f"Part VII other compensation: {money(other)}; filing total: {money(total)}. "
            f"The 2024 filing reports {money(expenses)} total functional expenses, {money(revenue)} total revenue, "
            "and zero employees on Form 990 Part I, line 5. Because that zero is not a usable scale measure, "
            f"the staff comparison uses the most recent nonzero value from the same filing field: {RP_STAFF_COUNT} "
            f"individuals employed on RP's {RP_STAFF_YEAR} Form 990, Part I, line 5."
        ),
        "sourceUrl": "https://projects.propublica.org/nonprofits/organizations/843896318",
        "canonicalUrl": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_11A.zip",
        "cachedSource": cached,
        "localPath": RP_REFERENCE_LOCAL_PATH,
        "secondarySourceLabel": "RP 2023 Form 990 staff filing",
        "secondarySourceUrl": RP_STAFF_SOURCE_URL,
        "secondaryCachedSource": cached_staff,
        "secondaryLocalPath": RP_STAFF_LOCAL_PATH,
        "sourceType": "Form 990",
        "evidenceStream": "incumbents",
        "homepageUrl": filing_homepage(RP_REFERENCE_LOCAL_PATH),
    }


def compact_category_rationale(row: dict[str, str]) -> dict:
    return {
        "recordId": literal(row["record_id"]),
        "stableIdType": literal(row["stable_id_type"]),
        "sourceWave": literal(row["source_wave"]),
        "tier": {
            "value": literal(row["tier"]),
            "label": literal(row["tier_label"]),
            "rationale": literal(row["tier_rationale"]),
            "citation": literal(row["tier_citation"]),
        },
        "ea": {
            "value": literal(row["ea_relationship"]),
            "sourceValue": literal(row["ea_relationship_source_value"]),
            "rationale": literal(row["ea_rationale"]),
            "citation": literal(row["ea_citation"]),
        },
        "structure": {
            "expected": literal(row["expected_structure"]),
            "observationFlag": literal(row["observation_structure_flag"]),
            "rationale": literal(row["structure_rationale"]),
            "citation": literal(row["structure_citation"]),
        },
        "topic": {
            "value": literal(row["topic_model"]),
            "sourceDescription": literal(row["source_native_topic_or_model_description"]),
            "rationale": literal(row["topic_model_rationale"]),
            "citation": literal(row["topic_model_citation"]),
        },
        "title": {
            "raw": literal(row["raw_title"]),
            "analysisGroup": literal(row["title_group"]),
            "rationale": literal(row["title_group_rationale"]),
            "citation": literal(row["title_group_citation"]),
        },
        "classificationTiming": literal(row["classification_timing"]),
        "provenanceType": literal(row["provenance_type"]),
        "confidence": literal(row["overall_confidence"]),
        "caveats": literal(row["caveats"]),
    }


def load_category_explainers() -> tuple[dict, dict, dict, dict[str, int]]:
    verify_category_explainer_hashes()
    dictionary_rows = rows(CATEGORY_EXPLAINERS / "category_dictionary.csv") + rows(
        ENRICHMENT / "job_ad_category_dictionary.csv"
    )
    rationale_rows = rows(CATEGORY_EXPLAINERS / "organization_category_rationale.csv")
    definitions: dict[str, dict[str, dict[str, str]]] = {}
    for row in dictionary_rows:
        field = literal(row["field"])
        value = literal(row["exact_category_value"])
        if not field or not value:
            raise ValueError("Category dictionary contains a blank field or exact category value")
        verify_preserved_paths(literal(row["source_path"]), ";")
        if EA_CORE_LABEL.fullmatch(value):
            continue
        if value in definitions.setdefault(field, {}):
            raise ValueError(f"Duplicate category definition: {field}={value}")
        definitions[field][value] = {
            "shortDefinition": literal(row["short_display_definition"]),
            "operationalRule": literal(row["detailed_operational_rule"]),
            "weightRationale": literal(row["default_weight_rationale"]),
            "provenanceType": literal(row["provenance_type"]),
            "sourcePath": literal(row["source_path"]),
            "sourceLocator": literal(row["source_locator"]),
            "confidence": literal(row["confidence"]),
            "caveats": literal(row["caveats"]),
        }

    for field in ("ea_affinity", "ea_affinity_precomp", "ea_relationship"):
        adjacent = definitions.get(field, {}).get("EA-adjacent")
        if adjacent:
            adjacent.update({
                "shortDefinition": "Documented connection to effective altruism",
                "operationalRule": (
                    "Organization or project with a documented connection to effective altruism. "
                    "The app intentionally uses one connected category rather than finer degrees of connection."
                ),
                "weightRationale": (
                    "Suggested weighting treats every documented effective-altruism connection equally."
                ),
                "caveats": (
                    "Historical source files preserve the finer taxonomy used when the peer set was assembled; "
                    "the generated app collapses those labels without changing the underlying evidence."
                ),
            })

    by_source: dict[tuple[str, str], dict] = {}
    references_by_organization: dict[str, dict] = {}
    rationale_counts: dict[str, int] = {}
    for row in rationale_rows:
        stream = literal(row["evidence_stream"])
        rationale_counts[stream] = rationale_counts.get(stream, 0) + 1
        source_id = literal(row["source_id"])
        organization = literal(row["organization"])
        compact = compact_category_rationale(row)
        for citation_field in ("tier_citation", "ea_citation", "structure_citation", "topic_model_citation", "title_group_citation"):
            verify_preserved_paths(literal(row[citation_field]), " | ")
        if source_id:
            key = (stream, source_id)
            if key in by_source:
                raise ValueError(f"Duplicate category rationale: {stream}/{source_id}")
            by_source[key] = compact
        if stream == "reference_selection":
            if organization in references_by_organization:
                raise ValueError(f"Duplicate reference-selection rationale: {organization}")
            references_by_organization[organization] = compact
    return (
        normalize_ea_taxonomy(definitions),
        normalize_ea_taxonomy(by_source),
        normalize_ea_taxonomy(references_by_organization),
        rationale_counts,
    )


def load_job_ad_enrichment(jobs: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    enrichment_rows = rows(ENRICHMENT / "job_ad_category_enrichment.csv")
    by_source: dict[str, dict[str, str]] = {}
    expected = {text(job["source_id"]): text(job["organization"]) for job in jobs}
    required = {
        "ea_relationship", "expected_structure", "topic_cluster", "ea_rationale",
        "structure_rationale", "topic_rationale", "source_citation", "classification_basis",
        "confidence",
    }
    for row in enrichment_rows:
        source_id = text(row["source_id"])
        organization = text(row["organization"])
        if source_id not in expected or organization != expected[source_id]:
            raise ValueError(f"Job-ad enrichment does not match validated posting: {source_id}/{organization}")
        if source_id in by_source:
            raise ValueError(f"Duplicate job-ad enrichment row: {source_id}")
        missing = sorted(field for field in required if not text(row[field]))
        if missing:
            raise ValueError(f"Job-ad enrichment {source_id} lacks required fields: {missing}")
        topic_cluster = text(row["topic_cluster"])
        if re.search(r"\$|\b(?:budget|staff|employees?|revenue|expenses?)\b", topic_cluster, re.IGNORECASE):
            raise ValueError(f"Job-ad enrichment {source_id} has scale metadata in topic_cluster: {topic_cluster}")
        verify_preserved_paths(text(row["source_citation"]), " | ")
        by_source[source_id] = row
    if by_source.keys() != expected.keys():
        missing = sorted(expected.keys() - by_source.keys())
        extra = sorted(by_source.keys() - expected.keys())
        raise ValueError(f"Job-ad enrichment coverage mismatch; missing={missing}, extra={extra}")
    return by_source


def load_job_ad_evidence_updates(jobs: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    job_by_source = {text(job["source_id"]): job for job in jobs}
    allowed_fields = set(jobs[0])
    updates: dict[str, dict[str, str]] = {}
    for row in rows(JOB_AD_EVIDENCE_UPDATES):
        source_id = text(row["source_id"])
        organization = text(row["organization"])
        if source_id not in job_by_source or organization != text(job_by_source[source_id]["organization"]):
            raise ValueError(f"Job-ad evidence update does not match validated posting: {source_id}/{organization}")
        if source_id in updates:
            raise ValueError(f"Duplicate job-ad evidence update: {source_id}")
        unknown = sorted(field for field in row if field not in allowed_fields | {"clear_fields"})
        if unknown:
            raise ValueError(f"Job-ad evidence update {source_id} has unknown fields: {unknown}")
        clear_fields = [field.strip() for field in text(row["clear_fields"]).split("|") if field.strip()]
        invalid_clear = sorted(set(clear_fields) - allowed_fields)
        if invalid_clear:
            raise ValueError(f"Job-ad evidence update {source_id} cannot clear fields: {invalid_clear}")
        local_path = text(row["local_path"])
        if not local_path or not (BENCHMARK / local_path).is_file():
            raise ValueError(f"Job-ad evidence update {source_id} lacks its archived source: {local_path}")
        updates[source_id] = {**row, "clear_fields": clear_fields}
    return updates


def enriched_job_provenance(
    historical: dict,
    enrichment: dict[str, str],
    job: dict[str, str],
    evidence_update: dict[str, str] | None,
) -> dict:
    provenance = copy.deepcopy(historical)
    citation = text(enrichment["source_citation"])
    provenance["ea"] = {
        "value": text(enrichment["ea_relationship"]),
        "sourceValue": historical["ea"].get("sourceValue", ""),
        "rationale": text(enrichment["ea_rationale"]),
        "citation": citation,
    }
    provenance["structure"] = {
        "expected": text(enrichment["expected_structure"]),
        "observationFlag": historical["structure"].get("observationFlag", ""),
        "rationale": text(enrichment["structure_rationale"]),
        "citation": citation,
    }
    provenance["topic"] = {
        "value": text(enrichment["topic_cluster"]),
        "sourceDescription": text(job["mission_operating_model"]),
        "rationale": text(enrichment["topic_rationale"]),
        "citation": citation,
    }
    if evidence_update:
        provenance["tier"] = {
            "value": text(job["tier"]),
            "label": text(job["tier"]),
            "rationale": text(job["inclusion_reason"]),
            "citation": (
                "benchmark/enrichment/job_ad_evidence_updates.csv"
                f" | benchmark/{text(job['local_path'])}"
            ),
        }
        provenance["classificationTiming"] = (
            "tier=post_freeze_archived_source_review; title=historical_nonpay_review; "
            "EA/structure/topic=post_freeze_app_enrichment"
        )
        provenance["provenanceType"] = (
            "post_freeze_archived_evidence_update + post_freeze_preserved_source_review"
        )
    else:
        provenance["classificationTiming"] = (
            "tier/title=historical_nonpay_review; EA/structure/topic=post_freeze_app_enrichment"
        )
        provenance["provenanceType"] = (
            "historical_nonpay_tiering + post_freeze_preserved_source_review"
        )
    provenance["confidence"] = text(enrichment["confidence"])
    provenance["caveats"] = text(enrichment["caveats"])
    return provenance


def added_job_provenance(job: dict[str, str], enrichment: dict[str, str]) -> dict:
    """Build an explicit non-pay provenance record for post-freeze job additions."""
    citation = text(enrichment["source_citation"])
    raw_title = text(job["role_title"])
    tier_value = text(job["tier"])
    return {
        "recordId": f"job_ad::{text(job['source_id'])}",
        "stableIdType": "source_id",
        "sourceWave": "authorized_job_board_addition",
        "tier": {
            "value": tier_value,
            "label": tier_value,
            "rationale": text(job["inclusion_reason"]) or text(job["exclusion_reason"]),
            "citation": citation,
        },
        "ea": {
            "value": text(enrichment["ea_relationship"]),
            "sourceValue": "",
            "rationale": text(enrichment["ea_rationale"]),
            "citation": citation,
        },
        "structure": {
            "expected": text(enrichment["expected_structure"]),
            "observationFlag": tier_value,
            "rationale": text(enrichment["structure_rationale"]),
            "citation": citation,
        },
        "topic": {
            "value": text(enrichment["topic_cluster"]),
            "sourceDescription": text(job["mission_operating_model"]),
            "rationale": text(enrichment["topic_rationale"]),
            "citation": citation,
        },
        "title": {
            "raw": raw_title,
            "analysisGroup": title_group(raw_title),
            "rationale": f'The source-native title "{raw_title}" is grouped without changing its displayed wording.',
            "citation": citation,
        },
        "classificationTiming": "post-freeze source review; compensation was not used to assign categories",
        "provenanceType": "authorized_scrape_discovery + preserved_original_source_review",
        "confidence": text(enrichment["confidence"]),
        "caveats": text(enrichment["caveats"]),
    }


def category_rationale(
    by_source: dict[tuple[str, str], dict],
    references_by_organization: dict[str, dict],
    stream: str,
    source_id: str,
    organization: str,
) -> dict:
    rationale = by_source.get((stream, source_id)) if source_id else None
    if rationale is None and stream == "form990":
        rationale = references_by_organization.get(organization)
    if rationale is None:
        raise ValueError(f"No category rationale for {stream}/{source_id or organization}")
    return rationale


def load_incumbent_compensation_updates(
    validated: list[dict[str, str]],
) -> tuple[list[dict[str, str]], dict[str, dict[str, str]]]:
    """Overlay audited current filings without rewriting the frozen benchmark output."""
    if not validated:
        raise ValueError("Validated Form 990 compensation data is empty")
    validated_fields = set(validated[0])
    by_source = {text(row["source_id"]): row for row in validated}
    if len(by_source) != len(validated):
        raise ValueError("Validated Form 990 compensation has duplicate source IDs")

    updates: dict[str, dict[str, str]] = {}
    for update in rows(INCUMBENT_COMPENSATION_UPDATES):
        source_id = text(update["source_id"])
        original = by_source.get(source_id)
        if original is None:
            raise ValueError(f"Incumbent update does not match a validated source: {source_id}")
        if source_id in updates:
            raise ValueError(f"Duplicate incumbent compensation update: {source_id}")
        organization = text(update["organization"])
        if organization != text(original["organization"]):
            raise ValueError(f"Incumbent update organization changed for {source_id}: {organization}")
        if text(update["ein"]).replace("-", "") != text(original["ein"]).replace("-", ""):
            raise ValueError(f"Incumbent update EIN changed for {source_id}")

        local_path = text(update["local_path"])
        source_path = BENCHMARK / local_path
        if not source_path.is_file():
            raise FileNotFoundError(f"Incumbent update lacks its source-native filing: {source_path}")
        if source_path.stat().st_size != int(update["source_byte_length"]):
            raise ValueError(f"Incumbent update byte length changed for {source_id}")
        if hashlib.sha256(source_path.read_bytes()).hexdigest() != text(update["source_sha256"]):
            raise ValueError(f"Incumbent update source hash changed for {source_id}")
        year = int(float(text(update["compensation_calendar_year"])))
        factor = number(update["cpi_factor"])
        if factor is None or not math.isclose(factor, cpi_factor(year), abs_tol=1e-12):
            raise ValueError(f"Incumbent update CPI mismatch for {source_id}")

        merged = dict(original)
        for field in validated_fields:
            value = text(update.get(field))
            if value:
                merged[field] = value
        by_source[source_id] = merged
        updates[source_id] = update

    return [by_source[text(row["source_id"])] for row in validated], updates


def build_incumbents(
    by_source: dict[tuple[str, str], dict],
    references_by_organization: dict[str, dict],
) -> list[dict]:
    validated = rows(DELIVERABLES / "validated_form990_compensation.csv")
    validated, compensation_updates = load_incumbent_compensation_updates(validated)
    by_ein = {text(row["ein"]).replace("-", ""): row for row in validated if text(row["ein"])}
    by_org = {text(row["organization"]): row for row in validated}
    reference = rows(DELIVERABLES / "expanded_reference_set.csv")
    output: list[dict] = []
    used_compensation_updates: set[str] = set()
    for peer in reference:
        filing = by_ein.get(text(peer["ein"]).replace("-", "")) or by_org.get(text(peer["organization"]))
        factor = number(filing.get("cpi_factor")) if filing else None
        factor = factor or 1.0
        base = number(filing.get("validated_schedule_j_base_total")) if filing else None
        cash = number(filing.get("validated_cash_proxy")) if filing else None
        total = number(filing.get("validated_total_proxy")) if filing else None
        source_id = text(filing.get("source_id")) if filing else ""
        compensation_update = compensation_updates.get(source_id)
        if compensation_update:
            used_compensation_updates.add(source_id)
        local_path = text(filing.get("local_path")) if filing else ""
        cached = cache_source(source_id, local_path) if source_id and local_path else ""
        observed_name = text(filing.get("observed_ceo_name")) if filing else ""
        observed_title = text(filing.get("observed_ceo_title")) if filing else ""
        raw_title = observed_title or (text(filing.get("ceo_title")) if filing else "")
        period_end = text(filing.get("tax_period_end")) if filing else ""
        evidence = "No clean compensation observation was retained for this selected reference organization."
        if filing:
            evidence = (
                f"IRS Form 990 for the period ending {period_end}. "
                f"{observed_name or text(filing.get('ceo_name'))}, "
                f"{observed_title or text(filing.get('ceo_title'))}. "
                f"Schedule J base: {money(base)}; Part VII cash/W-2 proxy: {money(cash)}; "
                f"Part VII other compensation: {money(number(filing.get('observed_part_vii_other')))}; "
                f"validated filing total: {money(total)}."
            )
        organization = text(peer["organization"])
        selection_rationale = references_by_organization.get(organization)
        if selection_rationale is None:
            raise ValueError(f"No reference-selection category rationale for {organization}")
        app_row = {
            "id": source_id or f"REF-{slug(text(peer['organization']))}",
            "sourceId": source_id,
            "organization": organization,
            "executive": observed_name or (text(filing.get("ceo_name")) if filing else ""),
            "title": raw_title or "Not reported",
            "titleGroup": title_group(raw_title),
            "rawTitle": raw_title,
            "tier": text(peer["reference_tier"]),
            "topic": text(peer["topic_cluster"]),
            "eaAffinity": text(peer["ea_affinity"]),
            "location": text(peer["country_or_region"]),
            "remoteStatus": "Not reported in Form 990",
            "structure": text(peer["expected_structure"]),
            "revenue": number(filing.get("observed_revenue")) if filing else number(peer["revenue"]),
            "expenses": number(filing.get("observed_expenses")) if filing else number(peer["expenses"]),
            "staff": number(filing.get("observed_employee_count")) if filing else number(peer["employee_count"]),
            "comparabilityScore": number(peer["comparability_score"]) or 0,
            "compensationYear": number(filing.get("compensation_calendar_year")) if filing else None,
            "salary": {
                "base": round(base * factor, 2) if base is not None else None,
                "cash": round(cash * factor, 2) if cash is not None else None,
                "total": round(total * factor, 2) if total is not None else None,
            },
            "nominalSalary": {"base": base, "cash": cash, "total": total},
            "cpiFactor": factor,
            "cpiPeriod": f"{int(number(filing.get('compensation_calendar_year')))} annual average" if filing and number(filing.get("compensation_calendar_year")) else "",
            "defaultIncluded": boolean(filing.get("primary_eligible")) if filing else False,
            "structurallyClean": boolean(filing.get("structurally_clean")) if filing else False,
            "founder": text(filing.get("founder_flag")).lower() == "yes" if filing else False,
            "analysisStatus": text(filing.get("analysis_status")) if filing else "selected; no clean observation",
            "auditStatus": text(filing.get("audit_status")) if filing else "no compensation observation",
            "selectionNote": text(peer["selection_note"]),
            "evidenceText": evidence,
            "sourceUrl": text(filing.get("propublica_url")) if filing else text(peer["propublica_url"]),
            "canonicalUrl": text(filing.get("official_irs_url")) if filing else text(peer["official_irs_url"]),
            "cachedSource": cached,
            "localPath": local_path,
            "sourceType": "Form 990",
            "evidenceStream": "incumbents",
            "homepageUrl": (
                text(compensation_update.get("homepage_url"))
                if compensation_update else filing_homepage(local_path) if local_path else ""
            ),
            "categoryProvenance": selection_rationale,
        }
        if source_id:
            observation_provenance = copy.deepcopy(category_rationale(
                by_source, {}, "form990", source_id, organization
            ))
            if compensation_update:
                update_citation = (
                    "benchmark/enrichment/incumbent_compensation_updates.csv | "
                    f"benchmark/{local_path}"
                )
                observation_provenance["title"] = {
                    "raw": raw_title,
                    "analysisGroup": title_group(raw_title),
                    "rationale": "The displayed title and compensation come from the newer source-native filing identified during the screened-roster entity review.",
                    "citation": update_citation,
                }
                app_row["incumbentCompensationUpdate"] = {
                    "reason": text(compensation_update["update_reason"]),
                    "locator": text(compensation_update["evidence_locator"]),
                    "auditPath": "benchmark/enrichment/ea_screened109_audit.md",
                    "dataPath": "benchmark/enrichment/incumbent_compensation_updates.csv",
                }
            app_row["observationCategoryProvenance"] = observation_provenance
        output.append(app_row)
    unused_updates = compensation_updates.keys() - used_compensation_updates
    if unused_updates:
        raise ValueError(f"Incumbent compensation updates were not used: {sorted(unused_updates)}")
    return output


def ea_roster_category_provenance(row: dict[str, str]) -> dict:
    citation = (
        f"benchmark/enrichment/ea_roster_validated_compensation.csv | "
        f"benchmark/{text(row['local_path'])}"
    )
    return {
        "sourceId": text(row["source_id"]),
        "referenceTier": text(row["reference_tier"]),
        "selectionWave": text(row["selection_wave"]),
        "tier": {
            "value": text(row["reference_tier"]),
            "label": text(row["tier_label"]),
            "rationale": text(row["selection_note"]),
            "citation": citation,
        },
        "ea": {
            "value": text(row["ea_affinity"]),
            "sourceValue": text(row["ea_affinity"]),
            "rationale": "The supplied roster package's provisional EA classification is retained and explicitly labeled post-freeze; it does not determine compensation inclusion.",
            "citation": "benchmark/enrichment/ea_roster_bundle_audit.md",
        },
        "structure": {
            "expected": text(row["expected_structure"]),
            "observationFlag": text(row["structure_flag"]),
            "rationale": text(row["selection_note"]),
            "citation": citation,
        },
        "topic": {
            "value": text(row["topic_cluster"]),
            "sourceDescription": text(row["topic_cluster"]),
            "rationale": "Provisional topic retained from the supplied non-pay roster classification.",
            "citation": "benchmark/enrichment/ea_roster_bundle_audit.md",
        },
        "title": {
            "raw": text(row["ceo_title"]),
            "analysisGroup": title_group(text(row["ceo_title"])),
            "rationale": "The organization-wide executive title is read directly from the preserved Form 990 Part VII row.",
            "citation": citation,
        },
        "classificationTiming": "post_freeze_roster_source_validation",
        "provenanceType": "provisional_nonpay_roster_classification + source_validated_form990_compensation",
        "confidence": "high for filing values; provisional for peer classification",
        "caveats": (
            "This is the roster package's historical post-freeze classification. "
            "The dated living peer-universe review controls current default inclusion."
        ),
    }


def build_ea_roster_incumbents() -> list[dict]:
    output: list[dict] = []
    for row in rows(EA_ROSTER_COMPENSATION):
        source_id = text(row["source_id"])
        local_path = text(row["local_path"])
        schedule_j_path = text(row["schedule_j_local_path"])
        year = int(float(text(row["compensation_calendar_year"])))
        factor = number(row["cpi_factor"])
        expected_factor = cpi_factor(year)
        if factor is None or not math.isclose(factor, expected_factor, abs_tol=1e-12):
            raise ValueError(f"EA roster CPI mismatch for {text(row['organization'])}")
        cash = number(row["validated_cash_proxy"])
        total = number(row["validated_total_proxy"])
        base = number(row["validated_schedule_j_base_total"])
        raw_title = text(row["ceo_title"])
        return_type = text(row["return_type"])
        average_hours = number(row["average_hours_per_week"])
        app_status = "sensitivity_only" if text(row["default_inclusion_status"]) == "sensitivity" else "excluded"
        evidence = (
            f"{return_type} for compensation calendar year {year}. {text(row['ceo_name'])}, "
            f"{raw_title}. Schedule J base: {money(base)}; Part VII cash/W-2 proxy: "
            f"{money(cash)}; Part VII other compensation: {money(number(row['part_vii_other']))}; "
            f"filing total: {money(total)}; reported weekly hours: "
            f"{average_hours:g}. {text(row['selection_note'])}"
        )
        schedule_source_id = f"{source_id}-SCHEDULE-J"
        output.append({
            "id": source_id,
            "sourceId": source_id,
            "organization": text(row["organization"]),
            "executive": text(row["ceo_name"]),
            "title": raw_title,
            "titleGroup": title_group(raw_title),
            "rawTitle": raw_title,
            "tier": text(row["reference_tier"]),
            "topic": text(row["topic_cluster"]),
            "eaAffinity": text(row["ea_affinity"]),
            "location": text(row["country_or_region"]),
            "remoteStatus": "Not reported in Form 990",
            "structure": text(row["expected_structure"]),
            "revenue": number(row["revenue"]),
            "expenses": number(row["expenses"]),
            "staff": number(row["employee_count"]),
            "comparabilityScore": number(row["comparability_score"]) or 0,
            "compensationYear": year,
            "averageHoursPerWeek": average_hours,
            "salary": {
                "base": round(base * factor, 2) if base is not None else None,
                "cash": round(cash * factor, 2) if cash is not None else None,
                "total": round(total * factor, 2) if total is not None else None,
            },
            "nominalSalary": {"base": base, "cash": cash, "total": total},
            "cpiFactor": factor,
            "cpiPeriod": f"{year} annual average",
            "defaultIncluded": False,
            "structurallyClean": boolean(row["structurally_clean"]),
            "founder": text(row["founder_flag"]).lower() == "yes",
            "analysisStatus": app_status,
            "auditStatus": text(row["audit_status"]),
            "selectionNote": text(row["selection_note"]),
            "evidenceText": evidence,
            "sourceUrl": text(row["canonical_url"]),
            "canonicalUrl": text(row["source_url"]),
            "cachedSource": cache_source(source_id, local_path),
            "secondaryCachedSource": cache_source(schedule_source_id, schedule_j_path) if schedule_j_path else "",
            "secondaryCachedLabel": "cached Schedule J" if schedule_j_path else "",
            "secondarySourceUrl": (
                f"https://projects.propublica.org/nonprofits/full_text/"
                f"{Path(schedule_j_path).name.split('_', 1)[0]}/IRS990ScheduleJ"
                if schedule_j_path else ""
            ),
            "secondarySourceLabel": "rendered Schedule J" if schedule_j_path else "",
            "localPath": local_path,
            "sourceType": return_type,
            "evidenceStream": "incumbents",
            "homepageUrl": text(row["homepage_url"]),
            "categoryProvenance": ea_roster_category_provenance(row),
            "rosterReview": {
                "status": text(row["selection_status"]),
                "auditPath": "benchmark/enrichment/ea_roster_bundle_audit.md",
                "reviewedDataPath": "benchmark/enrichment/ea_roster_validated_compensation.csv",
            },
        })
    return output


def build_lingering_org_app_additions() -> tuple[list[dict], dict[str, list[dict]]]:
    """Build the reviewed LEEP sensitivity addendum without changing frozen extracts."""
    reviewed = rows(LINGERING_ORG_APP_ADDITIONS)
    expected_people = {
        ("TOMOS DAVIES", "coo"),
        ("CLARE DONALDSON", "ceo"),
        ("LUCIA COULTER", "ceo"),
    }
    if {
        (text(row["person_name"]), text(row["standardized_position"]))
        for row in reviewed
    } != expected_people:
        raise ValueError("LEEP app addendum must contain exactly the reviewed COO and two co-ED rows")
    if len({text(row["app_observation_id"]) for row in reviewed}) != len(reviewed):
        raise ValueError("Duplicate LEEP app observation ID")

    recovered_by_person = {
        text(row["person_name"]): row
        for row in rows(LINGERING_ORG_RECOVERED_POSITIONS)
        if text(row["source_id"]) == "SRC-990-RECOVERY-LEAD-EXPOSURE-ELIMINATION-PROJECT"
    }
    if set(recovered_by_person) != {
        "TOMOS DAVIES",
        "CLARE DONALDSON",
        "LUCIA COULTER",
        "ANNA CHRISTINA THORSHEIM",
        "DANIEL WAHL",
        "ANDREW PLAYER",
    }:
        raise ValueError("Recovered LEEP Part VII roster changed; re-review the addendum")

    peer_rows = [
        row for row in rows(LINGERING_ORG_PEER_REVIEW)
        if text(row["candidate"]) == "Lead Exposure Elimination Project"
    ]
    if len(peer_rows) != 1 or text(peer_rows[0]["recommended_peer_disposition"]) != "sensitivity":
        raise ValueError("LEEP peer-eligibility review is missing or no longer sensitivity-only")
    peer_review = peer_rows[0]
    required_review_phrases = {
        "ceo_role_treatment": ["Clare Donaldson", "Lucia Coulter", "sensitivity-only", "never", "summed or averaged"],
        "non_ceo_role_treatment": ["Tomos Davies", "COO", "sensitivity-only", "no Schedule J base"],
    }
    for field, phrases in required_review_phrases.items():
        value = text(peer_review[field])
        if any(phrase not in value for phrase in phrases):
            raise ValueError(f"LEEP peer-review rule changed: {field}")

    candidate_rows = [
        row for row in rows(EA_ROSTER_CANDIDATE_REVIEW)
        if text(row["organization"]) == "Lead Exposure Elimination Project"
    ]
    if len(candidate_rows) != 1:
        raise ValueError("LEEP frozen pay-blind candidate row is missing or duplicated")
    candidate = candidate_rows[0]
    candidate_fields = {
        "reference_tier": "A",
        "tier_label": "Tier A directory addendum provisional",
        "selection_wave": "EA directory cross-check addendum",
        "topic_cluster": "global health policy and implementation",
        "ea_affinity": "EA-adjacent",
        "country_or_region": "International / United Kingdom",
        "expected_structure": "independent nonprofit",
    }
    if any(
        text(normalize_ea_taxonomy(candidate[field]) if field == "ea_affinity" else candidate[field])
        != expected
        for field, expected in candidate_fields.items()
    ):
        raise ValueError("LEEP frozen non-pay classification changed; re-review the addendum")
    if number(candidate["comparability_score"]) != 88:
        raise ValueError("LEEP pay-blind comparability score changed; re-review the addendum")

    xml_roots: dict[str, ElementTree.Element] = {}
    cached_sources: dict[str, str] = {}
    ceo_rows: list[dict] = []
    position_rows: dict[str, list[dict]] = {"coo": []}
    source_text_fields = {
        "source_id": "source_id",
        "candidate_organization": "candidate_organization",
        "legal_entity": "legal_entity",
        "ein": "ein",
        "irs_object_id": "irs_object_id",
        "return_type": "return_type",
        "reporting_period_start": "reporting_period_start",
        "reporting_period_end": "reporting_period_end",
        "compensation_calendar_year": "compensation_calendar_year",
        "person_name": "person_name",
        "source_title": "source_title",
        "staff_measure_definition": "staff_measure_definition",
        "evidence_locator": "evidence_locator",
        "source_sha256": "source_sha256",
    }
    source_number_fields = {
        "average_hours_per_week": "average_hours_per_week",
        "part_vii_organization": "part_vii_organization",
        "part_vii_related": "part_vii_related",
        "part_vii_other": "part_vii_other",
        "part_vii_cash_proxy": "part_vii_cash_proxy",
        "part_vii_total_proxy": "part_vii_total_proxy",
        "revenue": "revenue",
        "expenses": "expenses",
        "filing_staff": "staff",
    }

    for row in reviewed:
        person = text(row["person_name"])
        recovered = recovered_by_person[person]
        for reviewed_field, recovered_field in source_text_fields.items():
            if text(row[reviewed_field]) != text(recovered[recovered_field]):
                raise ValueError(
                    f"LEEP reviewed/recovered text mismatch for {person}: {reviewed_field}"
                )
        for reviewed_field, recovered_field in source_number_fields.items():
            if number(row[reviewed_field]) != number(recovered[recovered_field]):
                raise ValueError(
                    f"LEEP reviewed/recovered number mismatch for {person}: {reviewed_field}"
                )
        if text(recovered["outcome"]) != "validated_positive_exact" or not boolean(recovered["usable_point_observation"]):
            raise ValueError(f"LEEP recovered row is no longer a usable exact observation: {person}")
        expected_recovered_path = f"benchmark/{text(row['local_path'])}"
        if text(recovered["local_path"]) != expected_recovered_path:
            raise ValueError(f"LEEP source path changed for {person}")
        if text(row["canonical_url"]) != text(recovered["source_url"]):
            raise ValueError(f"LEEP official source URL changed for {person}")

        factor = number(row["cpi_factor"])
        if factor is None or not math.isclose(factor, cpi_factor(2024), abs_tol=1e-12):
            raise ValueError(f"LEEP CPI factor mismatch for {person}")
        if text(row["schedule_j_base_total"]):
            raise ValueError(f"LEEP Schedule J base must remain null for {person}")
        if text(row["default_inclusion_status"]) != "sensitivity" or boolean(row["structurally_clean"]):
            raise ValueError(f"LEEP row must remain structurally flagged and sensitivity-only: {person}")
        if text(row["analysis_status"]) != "sensitivity_only":
            raise ValueError(f"LEEP analysis status changed for {person}")

        local_path = text(row["local_path"])
        source_path = BENCHMARK / local_path
        expected_hash = text(row["source_sha256"])
        if not source_path.is_file() or hashlib.sha256(source_path.read_bytes()).hexdigest() != expected_hash:
            raise ValueError(f"LEEP native filing is missing or changed: {source_path}")
        if local_path not in xml_roots:
            root = ElementTree.parse(source_path).getroot()
            if first_descendant(root, "ReturnTs") != text(row["return_timestamp"]):
                raise ValueError("LEEP filing timestamp changed")
            if first_descendant(root, "EIN") != text(row["ein"]).replace("-", ""):
                raise ValueError("LEEP filing EIN changed")
            if first_descendant(root, "TaxPeriodBeginDt") != text(row["reporting_period_start"]):
                raise ValueError("LEEP filing period start changed")
            if first_descendant(root, "TaxPeriodEndDt") != text(row["reporting_period_end"]):
                raise ValueError("LEEP filing period end changed")
            form990 = next((element for element in root.iter() if local_name(element) == "IRS990"), None)
            if form990 is None:
                raise ValueError("LEEP native source no longer contains Form 990")
            if first_descendant(form990, "TotalEmployeeCnt") != text(row["filing_staff"]):
                raise ValueError("LEEP filing-comparable staff count changed")
            if first_descendant(form990, "CYTotalRevenueAmt") != text(row["revenue"]):
                raise ValueError("LEEP filing revenue changed")
            if first_descendant(form990, "CYTotalExpensesAmt") != text(row["expenses"]):
                raise ValueError("LEEP filing expenses changed")
            xml_roots[local_path] = form990
            cached_sources[local_path] = cache_source(text(row["source_id"]), local_path)
        part_vii = person_record(xml_roots[local_path], "Form990PartVIISectionAGrp", person)
        xml_fields = {
            "TitleTxt": "source_title",
            "AverageHoursPerWeekRt": "average_hours_per_week",
            "ReportableCompFromOrgAmt": "part_vii_organization",
            "ReportableCompFromRltdOrgAmt": "part_vii_related",
            "OtherCompensationAmt": "part_vii_other",
        }
        for xml_field, reviewed_field in xml_fields.items():
            source_value = first_descendant(part_vii, xml_field)
            if xml_field == "TitleTxt":
                matches = source_value == text(row[reviewed_field])
            else:
                matches = number(source_value) == number(row[reviewed_field])
            if not matches:
                raise ValueError(f"LEEP native filing row changed for {person}: {xml_field}")

        cash = number(row["part_vii_cash_proxy"])
        total = number(row["part_vii_total_proxy"])
        if cash is None or total is None:
            raise ValueError(f"LEEP reviewed pay unexpectedly missing for {person}")
        raw_title = text(row["source_title"])
        evidence = (
            f"Form 990 for compensation calendar year 2024 reports {person}, {raw_title}, "
            f"at {number(row['average_hours_per_week']):g} average weekly hours. "
            f"Part VII organization-plus-related reportable compensation: {money(cash)}; "
            f"other compensation: {money(number(row['part_vii_other']))}; filing total: "
            f"{money(total)}. No Schedule J base row is disclosed, so base remains unavailable. "
            f"{text(row['selection_note'])}"
        )
        provenance = {
            "tier": {
                "value": text(row["reference_tier"]),
                "label": text(row["tier_label"]),
                "rationale": text(peer_review["nonpay_rationale"]),
                "citation": "benchmark/enrichment/lingering_org_peer_eligibility_review.csv#candidate_id=4",
            },
            "ea": {
                "value": text(row["ea_affinity"]),
                "sourceValue": text(row["ea_affinity"]),
                "rationale": "Pay-blind provisional EA relationship retained from the screened roster and reviewed separately from compensation.",
                "citation": "benchmark/enrichment/ea_roster_candidate_review.csv#organization=Lead Exposure Elimination Project",
            },
            "structure": {
                "expected": text(row["expected_structure"]),
                "observationFlag": "filing_period_co_executive_leadership",
                "rationale": text(peer_review["unresolved_blocker"]),
                "citation": "benchmark/enrichment/lingering_org_peer_eligibility_review.csv#candidate_id=4",
            },
            "topic": {
                "value": text(row["topic_cluster"]),
                "sourceDescription": text(row["topic_cluster"]),
                "rationale": "Pay-blind provisional topic retained from the screened roster candidate review.",
                "citation": "benchmark/enrichment/ea_roster_candidate_review.csv#organization=Lead Exposure Elimination Project",
            },
            "title": {
                "raw": raw_title,
                "analysisGroup": text(row["title_group"]),
                "rationale": "Exact title and hours are read directly from the preserved Form 990 Part VII row.",
                "citation": f"benchmark/{local_path}#{text(row['evidence_locator'])}",
            },
            "classificationTiming": "post_freeze_source_recovery_and_pay_blind_peer_review",
            "provenanceType": "source_native_form990 + reviewed_pay_blind_candidate_metadata",
            "confidence": "high for filing values; provisional for peer classification",
            "caveats": (
                "Sensitivity-only. The filing-period co-executive structure and discrepancy between "
                "Form 990 Part I line 5 employment and the current global-workforce narrative limit comparability."
            ),
        }
        common = {
            "id": text(row["app_observation_id"]),
            "sourceId": text(row["source_id"]),
            "organization": text(row["candidate_organization"]),
            "executive": person,
            "rawExecutive": person,
            "title": raw_title,
            "titleGroup": text(row["title_group"]),
            "rawTitle": raw_title,
            "tier": text(row["reference_tier"]),
            "topic": text(row["topic_cluster"]),
            "eaAffinity": text(row["ea_affinity"]),
            "location": text(row["country_or_region"]),
            "remoteStatus": "Not reported in Form 990",
            "structure": text(row["expected_structure"]),
            "revenue": number(row["revenue"]),
            "expenses": number(row["expenses"]),
            "staff": number(row["filing_staff"]),
            "contextualScale": {
                "staff": number(row["contextual_staff"]),
                "staffDefinition": text(row["contextual_staff_definition"]),
                "filingComparable": False,
                "evidenceId": "S014",
            },
            "comparabilityScore": number(row["comparability_score"]),
            "compensationYear": int(text(row["compensation_calendar_year"])),
            "averageHoursPerWeek": number(row["average_hours_per_week"]),
            "salary": {
                "base": None,
                "cash": round(cash * factor, 2),
                "total": round(total * factor, 2),
            },
            "nominalSalary": {"base": None, "cash": cash, "total": total},
            "cpiFactor": factor,
            "cpiPeriod": "2024 annual average",
            "defaultIncluded": False,
            "structurallyClean": False,
            "founder": False,
            "analysisStatus": "sensitivity_only",
            "auditStatus": "verified source-native Form 990 · sensitivity-only peer review",
            "selectionNote": text(row["selection_note"]),
            "evidenceText": evidence,
            "sourceUrl": text(row["source_url"]),
            "canonicalUrl": text(row["canonical_url"]),
            "cachedSource": cached_sources[local_path],
            "localPath": local_path,
            "sourceType": text(row["return_type"]),
            "evidenceStream": "incumbents",
            "homepageUrl": text(row["homepage_url"]),
            "evidenceLocator": text(row["evidence_locator"]),
            "organizationBalanceGroup": text(row["organization_balance_group"]),
            "filingLeadershipStructure": "co-executive directors",
            "categoryProvenance": provenance,
            "lingeringOrgReview": {
                "recoveredDataPath": text(row["recovered_data_path"]),
                "reviewedDataPath": "benchmark/enrichment/lingering_org_app_position_additions.csv",
                "peerReviewPath": text(row["peer_review_path"]),
                "sourceSha256": expected_hash,
                "filingReturnTimestamp": text(row["return_timestamp"]),
            },
        }
        if text(row["standardized_position"]) == "ceo":
            ceo_rows.append(common)
            continue

        position_row = {
            **common,
            "positionFamily": text(row["position_family"]),
            "positionKey": "coo",
            "secondaryRoleTags": [],
            "seniorityGroup": "Executive",
            "roleScope": "functional",
            "incumbencyStatus": "current",
            "compensationYearRoleStatus": "no_transition_indicated",
            "compensationYearRoleRule": "No transition language appears in the source-native filing row.",
            "averageHoursRelatedOrgs": 0,
            "totalReportedHours": number(row["average_hours_per_week"]),
            "defaultHoursEligible": True,
            "sensitivityOnlyReason": text(row["selection_note"]),
            "positionTaxonomy": {
                "taxonomyId": "LINGERING-LEEP-COO",
                "classificationRule": "Exact source-native COO title maps directly to the COO benchmark.",
                "effectiveTitleSource": "source_native_form990",
                "effectiveTitleRule": "Preserve exact Form 990 title.",
                "standardizedPositionRule": "Exact COO alias.",
                "standardizedPositionAliasQuality": "exact",
                "confidence": "high",
                "roleScope": "functional",
                "incumbencyStatus": "current",
                "compensationYearRoleStatus": "no_transition_indicated",
                "compensationYearRoleRule": "No transition language appears in the source-native filing row.",
                "sensitivityOnlyReason": text(row["selection_note"]),
                "partViiLocator": text(row["evidence_locator"]),
                "scheduleJLocator": "",
                "methodologyPath": "benchmark/enrichment/form990_position_methodology.md",
                "classificationSource": None,
            },
        }
        position_rows["coo"].append(position_row)

    if {row["organizationBalanceGroup"] for row in ceo_rows} != {"leep-co-executive-directors-2024"}:
        raise ValueError("LEEP co-executive observations must share one organization-balance group")
    return ceo_rows, position_rows


def display_category(value: str) -> str:
    return " ".join(word.upper() if word in {"hr", "vp"} else word.capitalize() for word in text(value).split("_"))


def build_position_data(
    by_source: dict[tuple[str, str], dict],
    references_by_organization: dict[str, dict],
) -> tuple[list[dict], dict[str, list[dict]], dict[str, list[dict]]]:
    source_rows = rows(FORM990_POSITION_OBSERVATIONS)
    catalog_source_rows = rows(FORM990_BENCHMARK_POSITION_CATALOG)
    public_catalog_source_rows = [
        row for row in catalog_source_rows if text(row["support_level"]) == "primary"
    ]
    supporting_source_rows = rows(FORM990_POSITION_SUPPORTING_SOURCES)
    supporting_sources_by_id = {
        text(row["source_id"]): row for row in supporting_source_rows
    }
    if len(supporting_sources_by_id) != len(supporting_source_rows):
        raise ValueError("Duplicate Form 990 position supporting-source IDs")
    observed_supporting_source_ids = {
        text(row["classification_source_id"])
        for row in source_rows
        if text(row["classification_source_id"])
    }
    if observed_supporting_source_ids != supporting_sources_by_id.keys():
        raise ValueError(
            "Form 990 position supporting-source manifest coverage mismatch: "
            f"observed={sorted(observed_supporting_source_ids)}, "
            f"manifested={sorted(supporting_sources_by_id)}"
        )
    for supporting_source in supporting_source_rows:
        local_path = text(supporting_source["local_path"]).removeprefix("benchmark/")
        path = BENCHMARK / local_path
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != text(supporting_source["sha256"]):
            raise ValueError(
                f"Position-classification source is missing or changed: {text(supporting_source['source_id'])}"
            )
        cache_source(text(supporting_source["source_id"]), local_path)
    used_supporting_source_ids: set[str] = set()
    position_keys = {text(row["position_key"]) for row in public_catalog_source_rows}
    if not position_keys or len(position_keys) != len(public_catalog_source_rows):
        raise ValueError("Invalid or duplicate standardized-position catalog keys")
    catalog_counts: dict[str, dict[str, int]] = {
        key: {"catalog": 0, "roleEligible": 0, "defaultIncluded": 0, "organizations": 0}
        for key in position_keys
    }
    position_organizations: dict[str, set[str]] = {key: set() for key in position_keys}
    position_rows: dict[str, list[dict]] = {key: [] for key in position_keys}
    rp_references: dict[str, list[dict]] = {key: [] for key in position_keys}
    cached_by_source: dict[str, tuple[str, str]] = {}

    for row in source_rows:
        position_key = text(row["benchmark_position"])
        if position_key not in position_keys:
            continue
        effective_person = text(row["effective_person_name"]) or text(row["person_name"])
        effective_title = text(row["effective_title"]) or text(row["native_title"])
        family = text(row["position_family"])
        organization = text(row["organization"])
        source_id = text(row["source_id"])
        local_path = text(row["source_local_path"]).removeprefix("benchmark/")
        if source_id not in cached_by_source:
            cached_by_source[source_id] = (cache_source(source_id, local_path), filing_homepage(local_path))
        cached, homepage = cached_by_source[source_id]
        classification_source_id = text(row["classification_source_id"])
        classification_source_url = text(row["classification_source_url"])
        classification_source_local_path = text(
            row["classification_source_local_path"]
        ).removeprefix("benchmark/")
        classification_source_sha256 = text(row["classification_source_sha256"])
        classification_source = None
        if any((
            classification_source_id,
            classification_source_url,
            classification_source_local_path,
            classification_source_sha256,
        )):
            if not all((
                classification_source_id,
                classification_source_url,
                classification_source_local_path,
                classification_source_sha256,
            )):
                raise ValueError(
                    f"Incomplete position-classification source fields: {text(row['observation_id'])}"
                )
            supporting_manifest = supporting_sources_by_id.get(classification_source_id)
            if supporting_manifest is None:
                raise ValueError(
                    f"Unmanifested position-classification source: {classification_source_id}"
                )
            if (
                text(supporting_manifest["observation_id"]) != text(row["observation_id"])
                or text(supporting_manifest["canonical_url"]) != classification_source_url
                or text(supporting_manifest["local_path"]) != f"benchmark/{classification_source_local_path}"
                or text(supporting_manifest["sha256"]) != classification_source_sha256
            ):
                raise ValueError(
                    f"Position-classification source does not match its manifest: "
                    f"{classification_source_id}"
                )
            classification_source_path = BENCHMARK / classification_source_local_path
            if not classification_source_path.is_file():
                raise FileNotFoundError(
                    f"Missing position-classification source: {classification_source_path}"
                )
            if hashlib.sha256(classification_source_path.read_bytes()).hexdigest() != classification_source_sha256:
                raise ValueError(
                    f"Position-classification source hash mismatch: {classification_source_id}"
                )
            classification_source = {
                "id": classification_source_id,
                "url": classification_source_url,
                "evidenceUse": text(supporting_manifest["evidence_use"]),
                "cachedSource": cache_source(
                    classification_source_id, classification_source_local_path
                ),
                "localPath": f"benchmark/{classification_source_local_path}",
                "sha256": classification_source_sha256,
            }
            used_supporting_source_ids.add(classification_source_id)
        base_nominal = number(row["schedule_j_base_total_nominal"])
        cash_nominal = number(row["part_vii_cash_nominal"])
        total_nominal = number(row["part_vii_total_nominal"])
        base_adjusted = number(row["schedule_j_base_total_july_2026"])
        cash_adjusted = number(row["part_vii_cash_july_2026"])
        total_adjusted = number(row["part_vii_total_july_2026"])
        role_eligible = boolean(row["benchmark_position_eligible"])
        default_included = boolean(row["benchmark_position_default_included"])
        default_hours_eligible = boolean(row["default_hours_eligible"])
        sensitivity_only_reason = text(row["sensitivity_only_reason"])
        compensation_year_role_status = text(row["compensation_year_role_status"])
        is_rp = boolean(row["is_rp_reference"])
        if default_included and (not role_eligible or is_rp):
            raise ValueError(f"Invalid default position inclusion: {text(row['observation_id'])}")
        if default_included and not default_hours_eligible:
            raise ValueError(f"Sub-30-hour position leaked into default inclusion: {text(row['observation_id'])}")
        if sensitivity_only_reason and (default_included or not role_eligible):
            raise ValueError(
                f"Invalid sensitivity-only position status: {text(row['observation_id'])}"
            )
        organization_provenance = references_by_organization.get(organization) or by_source.get(("form990", source_id))
        if organization_provenance is None and not is_rp:
            raise ValueError(f"No organization provenance for position row: {organization}/{source_id}")

        provenance = copy.deepcopy(
            organization_provenance
            or {
                "tier": {"value": "Reference", "label": "RP reference", "rationale": "Display-only RP filing reference.", "citation": text(row["source_local_path"])},
                "ea": {"value": "EA-adjacent", "sourceValue": "EA-adjacent", "rationale": "Rethink Priorities reference row.", "citation": text(row["source_local_path"])},
                "structure": {"expected": "independent nonprofit", "observationFlag": "reference_not_analyzed", "rationale": "Display-only RP filing reference.", "citation": text(row["source_local_path"])},
                "topic": {"value": "research and evidence", "sourceDescription": "research and evidence", "rationale": "Rethink Priorities reference row.", "citation": text(row["source_local_path"])},
            }
        )
        provenance["title"] = {
            "raw": text(row["native_title"]),
            "effective": effective_title,
            "effectiveSource": text(row["effective_title_source"]),
            "effectiveRule": text(row["effective_title_rule"]),
            "analysisGroup": text(row["title_group"]),
            "rationale": (
                f"Reviewed Form 990 position taxonomy: {text(row['classification_rule'])}; "
                f"family={family}; scope={text(row['role_scope'])}; "
                f"filing incumbency={text(row['incumbency_status'])}; "
                f"compensation-year role={compensation_year_role_status}."
            ),
            "citation": (
                "benchmark/enrichment/form990_position_taxonomy.csv#"
                f"taxonomy_id={text(row['taxonomy_id'])} | {text(row['source_local_path'])}#"
                f"{text(row['part_vii_xml_locator'])}"
            ),
        }
        if classification_source:
            provenance["title"]["classificationSource"] = classification_source
            provenance["title"]["rationale"] += (
                f" Supporting evidence: {classification_source['evidenceUse']}"
            )
            provenance["title"]["citation"] += (
                f" | {classification_source['cachedSource']}"
                f" | {classification_source['url']}"
            )
        provenance["classificationTiming"] = "post_freeze_form990_position_enrichment"
        provenance["provenanceType"] = "source_native_form990 + reviewed_position_taxonomy + preserved_nonpay_organization_metadata"
        provenance["confidence"] = text(row["classification_confidence"])
        provenance["caveats"] = (
            "Form 990 non-CEO reporting is threshold-selected; this is not a complete employee salary census. "
            + text(row["default_exclusion_reason"])
        ).strip()
        year = number(row["compensation_calendar_year"])
        filing_hours = number(row["average_hours_per_week"])
        related_hours = number(row["average_hours_related_orgs"])
        total_hours = number(row["total_reported_hours"])
        evidence_identity = (
            f"Form 990 Part VII source fields report {text(row['person_name'])}, "
            f"{text(row['native_title'])}; reviewed display/classification: "
            f"{effective_person}, {effective_title}. "
            if (
                effective_person != text(row["person_name"])
                or effective_title != text(row["native_title"])
            )
            else f"Form 990 Part VII reports {effective_person}, {effective_title}, "
        )
        evidence = (
            evidence_identity + f"at {filing_hours:g} filing-organization"
            if filing_hours is not None else
            evidence_identity + "with unreported filing-organization"
        )
        evidence += (
            f" plus {related_hours:g} related-organization average weekly hours "
            f"({total_hours:g} combined). "
            if related_hours is not None and total_hours is not None else
            f" average weekly hours ({total_hours:g} combined). "
            if total_hours is not None else
            " average weekly hours. "
        )
        evidence += (
            f"Part VII organization-plus-related reportable compensation: {money(cash_nominal)}; "
            f"estimated other compensation: {money(number(row['part_vii_other_nominal']))}; "
            f"Schedule J base: {money(base_nominal)}. Form 990 reporting thresholds make this a "
            "selected public-compensation observation, not a complete workforce salary record."
        )
        app_row = {
            "id": text(row["observation_id"]),
            "sourceId": source_id,
            "organization": organization,
            "executive": effective_person,
            "rawExecutive": text(row["person_name"]),
            "title": effective_title,
            "titleGroup": display_category(text(row["title_group"])),
            "rawTitle": text(row["native_title"]),
            "positionFamily": family,
            "positionKey": position_key,
            "secondaryRoleTags": [display_category(value) for value in text(row["secondary_role_tags"]).split(";") if value],
            "seniorityGroup": display_category(text(row["seniority_group"])),
            "roleScope": text(row["role_scope"]),
            "incumbencyStatus": text(row["incumbency_status"]),
            "compensationYearRoleStatus": compensation_year_role_status,
            "compensationYearRoleRule": text(row["compensation_year_role_rule"]),
            "averageHoursPerWeek": filing_hours,
            "averageHoursRelatedOrgs": related_hours,
            "totalReportedHours": total_hours,
            "defaultHoursEligible": default_hours_eligible,
            "sensitivityOnlyReason": sensitivity_only_reason,
            "tier": text(row["reference_tier"]) or text(row["peer_tier"]) or ("RP" if is_rp else ""),
            "topic": text(row["topic_cluster"]),
            "eaAffinity": text(row["ea_affinity"]),
            "location": text(row["country_or_region"]),
            "remoteStatus": "Not reported in Form 990",
            "structure": text(row["expected_structure"]),
            "revenue": number(row["organization_revenue"]),
            "expenses": number(row["organization_expenses"]),
            "staff": number(row["organization_staff"]),
            "comparabilityScore": number(row["comparability_score"]) or 0,
            "compensationYear": int(year) if year is not None else None,
            "salary": {"base": base_adjusted, "cash": cash_adjusted, "total": total_adjusted},
            "nominalSalary": {"base": base_nominal, "cash": cash_nominal, "total": total_nominal},
            "cpiFactor": number(row["cpi_factor_to_july_2026"]) or 1,
            "cpiPeriod": f"{int(year)} annual average" if year is not None else "",
            "defaultIncluded": default_included,
            "structurallyClean": role_eligible and not sensitivity_only_reason and text(row["role_scope"]) == "functional" and compensation_year_role_status in {"no_transition_indicated", "verified_full_year"},
            "founder": False,
            "analysisStatus": "reference_not_analyzed" if is_rp else "primary" if default_included else "sensitivity_only" if role_eligible else "excluded",
            "auditStatus": f"{text(row['classification_confidence'])} confidence · {text(row['classification_rule'])}",
            "selectionNote": text(row["default_exclusion_reason"]) or (
                "Paid role independently verified to cover the compensation calendar year with reviewed functional scope."
                if compensation_year_role_status == "verified_full_year"
                else "Paid role with no source-indicated compensation-year transition and reviewed functional scope."
            ),
            "evidenceText": evidence,
            "sourceUrl": text(row["propublica_url"]),
            "canonicalUrl": text(row["official_irs_url"]),
            "cachedSource": cached,
            "localPath": local_path,
            "sourceType": "Form 990",
            "evidenceStream": "incumbents",
            "homepageUrl": homepage,
            "categoryProvenance": provenance,
            "positionTaxonomy": {
                "taxonomyId": text(row["taxonomy_id"]),
                "classificationRule": text(row["classification_rule"]),
                "effectiveTitleSource": text(row["effective_title_source"]),
                "effectiveTitleRule": text(row["effective_title_rule"]),
                "standardizedPositionRule": text(row["benchmark_position_rule"]),
                "standardizedPositionAliasQuality": text(row["benchmark_position_alias_quality"]),
                "confidence": text(row["classification_confidence"]),
                "roleScope": text(row["role_scope"]),
                "incumbencyStatus": text(row["incumbency_status"]),
                "compensationYearRoleStatus": compensation_year_role_status,
                "compensationYearRoleRule": text(row["compensation_year_role_rule"]),
                "sensitivityOnlyReason": sensitivity_only_reason,
                "partViiLocator": text(row["part_vii_xml_locator"]),
                "scheduleJLocator": text(row["schedule_j_xml_locator"]),
                "methodologyPath": "benchmark/enrichment/form990_position_methodology.md",
                "classificationSource": classification_source,
            },
        }
        if is_rp:
            if role_eligible:
                rp_references[position_key].append(app_row)
        else:
            catalog_counts[position_key]["catalog"] += 1
            catalog_counts[position_key]["roleEligible"] += int(role_eligible)
            catalog_counts[position_key]["defaultIncluded"] += int(default_included)
            if default_included:
                position_organizations[position_key].add(organization)
            position_rows[position_key].append(app_row)

    seen_ids: set[str] = set()
    for row in [item for family in position_rows.values() for item in family] + [item for family in rp_references.values() for item in family]:
        if row["id"] in seen_ids:
            raise ValueError(f"Duplicate generated position observation ID: {row['id']}")
        seen_ids.add(row["id"])
    if not used_supporting_source_ids <= supporting_sources_by_id.keys():
        raise ValueError("Unmanifested supporting source entered a public position row")

    catalog = [{
        "key": "ceo",
        "label": "CEO",
        "pageLabel": "CEO",
        "menuGroup": "Chief executive",
        "defaultMeasure": "base",
        "description": "Reviewed CEO pay records from Form 990 filings and job postings.",
    }]
    for catalog_source in public_catalog_source_rows:
        key = text(catalog_source["position_key"])
        counts = catalog_counts[key]
        counts["organizations"] = len(position_organizations[key])
        expected_counts = {
            "catalog": int(catalog_source["catalog_rows"]),
            "roleEligible": int(catalog_source["role_eligible_rows"]),
            "defaultIncluded": int(catalog_source["default_rows"]),
            "organizations": int(catalog_source["default_organizations"]),
        }
        if counts != expected_counts:
            raise ValueError(
                f"Generated standardized-position counts changed for {key}: "
                f"generated={counts}, extracted={expected_counts}"
            )
        catalog.append({
            "key": key,
            "label": text(catalog_source["label"]),
            "pageLabel": text(catalog_source["page_label"]),
            "menuGroup": text(catalog_source["menu_group"]),
            "supportLevel": text(catalog_source["support_level"]),
            "defaultMeasure": "cash",
            "description": (
                f"{text(catalog_source['description'])} {counts['defaultIncluded']} usable pay records "
                f"from {counts['organizations']} selected peer organizations. "
                "Reported cash pay from Part VII gives the broadest available coverage. "
                "Because Form 990 only requires some employees' pay to be reported, these records may overrepresent higher-paid roles."
            ),
            "counts": counts,
            "methodologyPath": "benchmark/enrichment/form990_position_methodology.md",
        })
    return catalog, position_rows, rp_references


def build_job_ads(by_source: dict[tuple[str, str], dict]) -> list[dict]:
    jobs = rows(DELIVERABLES / "validated_job_ad_compensation.csv")
    evidence_updates = load_job_ad_evidence_updates(jobs)
    enrichment_by_source = load_job_ad_enrichment(jobs)
    output: list[dict] = []
    for original_job in jobs:
        job = dict(original_job)
        evidence_update = evidence_updates.get(text(job["source_id"]))
        if evidence_update:
            for field in evidence_update["clear_fields"]:
                job[field] = ""
            for field, value in evidence_update.items():
                if field not in {"source_id", "organization", "clear_fields"} and text(value):
                    job[field] = value
        source_id = text(job["source_id"])
        local_path = text(job["local_path"])
        cached = cache_source(source_id, local_path) if local_path else ""
        secondary = JOB_AD_SECONDARY_SOURCES.get(source_id)
        secondary_cached = cache_source(
            secondary["source_id"], secondary["local_path"]
        ) if secondary else ""
        low = number(job["adjusted_min_jul2026"])
        high = number(job["adjusted_max_jul2026"])
        midpoint = number(job["adjusted_midpoint_jul2026"])
        nominal_low = number(job["salary_min"])
        nominal_high = number(job["salary_max"])
        nominal_midpoint = (nominal_low + nominal_high) / 2 if nominal_low is not None and nominal_high is not None else None
        included = text(job["included_in_quantitative_analysis"])
        reported_low = number(job.get("reported_salary_min"))
        reported_high = number(job.get("reported_salary_max"))
        has_source_native_range = reported_low is not None or reported_high is not None
        reported_pay = ((text(job.get("salary_text")) if has_source_native_range else "") or (
            f"{money(number(job['salary_min']))}–{money(number(job['salary_max']))}"
        )).rstrip(".")
        adjusted_note = (
            f" July 2026-adjusted USD midpoint: {money(midpoint)}."
            if midpoint is not None else " No annual USD point estimate is used."
        )
        evidence = (
            f"Recruitment posting for {text(job['role_title'])}. "
            f"Reported pay: {reported_pay}.{adjusted_note} "
            f"Location: {text(job['location'])}; work arrangement: {text(job['remote_status']) or 'not reported'}."
        )
        source_url = text(job["resolved_url"]) or text(job["fallback_url_1"]) or text(job["canonical_url"])
        raw_title = text(job["role_title"])
        enrichment = enrichment_by_source[source_id]
        historical_provenance = by_source.get(("job_ad", source_id))
        base_provenance = historical_provenance or added_job_provenance(job, enrichment)
        if reported_low is None:
            reported_low = nominal_low
        if reported_high is None:
            reported_high = nominal_high
        output.append({
            "id": source_id,
            "sourceId": source_id,
            "organization": text(job["organization"]),
            "executive": "",
            "title": raw_title or "Not reported",
            "titleGroup": title_group(raw_title),
            "rawTitle": raw_title,
            "tier": text(job["tier"]),
            "topic": text(enrichment["topic_cluster"]),
            "eaAffinity": text(enrichment["ea_relationship"]),
            "location": text(job["location"]),
            "remoteStatus": text(job["remote_status"]),
            "structure": text(enrichment["expected_structure"]),
            "sourceMissionOperatingModel": text(job["mission_operating_model"]),
            "sourceReportingRelationship": text(job["reporting_relationship"]),
            "revenue": None,
            "expenses": number(job["annual_budget_or_expense"]),
            "staff": number(job["staff_count"]),
            "comparabilityScore": 100 if text(job["tier"]) == "strict_primary" else 70,
            "compensationYear": number(text(job["posting_date"])[:4]),
            "salary": {"base": midpoint, "cash": midpoint, "total": midpoint},
            "range": {"low": low, "high": high},
            "nominalSalary": {"base": nominal_midpoint, "cash": nominal_midpoint, "total": nominal_midpoint},
            "nominalRange": {"low": nominal_low, "high": nominal_high},
            "reportedRange": {"low": reported_low, "high": reported_high},
            "reportedCurrency": text(job.get("reported_currency")) or text(job.get("currency")) or "USD",
            "reportedPayPeriod": text(job.get("reported_pay_period")) or "year",
            "reportedSalaryText": text(job.get("salary_text")),
            "cpiFactor": number(job["cpi_factor"]) or 1.0,
            "cpiPeriod": text(job["cpi_period"]),
            "defaultIncluded": included == "yes",
            "structurallyClean": text(job["tier"]) == "strict_primary",
            "founder": False,
            "analysisStatus": "included" if included == "yes" else included or "excluded",
            "auditStatus": text(job["audit_status"]),
            "selectionNote": text(job["inclusion_reason"]) or text(job["exclusion_reason"]),
            "evidenceText": evidence,
            "sourceUrl": source_url,
            "canonicalUrl": text(job["original_url"]) or text(job["canonical_url"]),
            "cachedSource": cached,
            "secondaryCachedSource": secondary_cached,
            "secondaryCachedLabel": secondary["cached_label"] if secondary else "",
            "secondarySourceUrl": secondary["source_url"] if secondary else "",
            "secondarySourceLabel": secondary["label"] if secondary else "",
            "localPath": local_path,
            "sourceType": "Job posting",
            "evidenceStream": "jobAds",
            "homepageUrl": text(job.get("homepage_url")),
            "categoryProvenance": enriched_job_provenance(
                base_provenance, enrichment, job, evidence_update
            ),
            "historicalCategoryProvenance": historical_provenance,
            "categoryEnrichment": {
                "classificationBasis": text(enrichment["classification_basis"]),
                "confidence": text(enrichment["confidence"]),
                "caveats": text(enrichment["caveats"]),
                "sourceCitation": text(enrichment["source_citation"]),
            },
            "evidenceUpdate": ({
                "status": "post-freeze archived-source verification",
                "updatePath": "benchmark/enrichment/job_ad_evidence_updates.csv",
                "sourceCitation": f"benchmark/{text(job['local_path'])}",
            } if evidence_update else None),
        })
    return output


def build_position_job_ads(
    position_catalog: list[dict],
    incumbents: list[dict],
) -> dict[str, list[dict]]:
    position_keys = {position["key"] for position in position_catalog if position["key"] != "ceo"}
    output: dict[str, list[dict]] = {key: [] for key in position_keys}
    profiles: dict[str, dict] = {}
    for incumbent in incumbents:
        profiles.setdefault(incumbent["organization"], incumbent)
    seen_ids: set[str] = set()
    for reviewed in rows(GOODSTRUCTURES_POSITION_JOB_AD_REVIEW):
        source_id = text(reviewed["source_id"])
        if not source_id or source_id in seen_ids:
            raise ValueError(f"Missing or duplicate reviewed position-posting ID: {source_id!r}")
        seen_ids.add(source_id)
        position_key = text(reviewed["position_key"])
        if position_key not in position_keys:
            raise ValueError(f"Unknown reviewed position-posting key: {position_key}")
        source_path = BENCHMARK / text(reviewed["local_path"])
        if not source_path.is_file():
            raise FileNotFoundError(f"Missing reviewed position posting: {source_path}")
        source_bytes = source_path.read_bytes()
        observed_hash = hashlib.sha256(source_bytes).hexdigest()
        if observed_hash != text(reviewed["sha256"]):
            raise ValueError(f"Reviewed position-posting hash mismatch: {source_id}")
        source_text = source_bytes.decode("utf-8", errors="ignore").casefold()
        missing_markers = [
            marker for marker in text(reviewed["required_text"]).split("|")
            if marker and marker.casefold() not in source_text
        ]
        if missing_markers:
            raise ValueError(f"Reviewed position posting is missing source markers {missing_markers}: {source_id}")
        cached = cache_source(source_id, text(reviewed["local_path"]))
        included = boolean(reviewed["included_in_app"])
        low = number(reviewed["salary_min_usd"])
        high = number(reviewed["salary_max_usd"])
        if not included:
            if low is not None or high is not None:
                raise ValueError(f"Rejected position posting retained an analytical USD range: {source_id}")
            continue
        if low is None or high is None or low <= 0 or high < low:
            raise ValueError(f"Invalid reviewed position-posting range: {source_id}")
        organization = text(reviewed["organization"])
        profile = profiles.get(organization)
        if profile is None:
            raise ValueError(f"Reviewed position posting has no existing organization profile: {organization}")
        date = text(reviewed["posting_date"])
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            raise ValueError(f"Invalid position-posting date: {source_id}")
        period = date[:7]
        factor = monthly_cpi_factor(period)
        midpoint = (low + high) / 2
        adjusted_low = round(low * factor, 2)
        adjusted_high = round(high * factor, 2)
        adjusted_midpoint = round(midpoint * factor, 2)
        role_title = text(reviewed["role_title"])
        position_label = next(
            position["label"] for position in position_catalog if position["key"] == position_key
        )
        provenance = copy.deepcopy(profile["categoryProvenance"])
        provenance["title"] = {
            "raw": role_title,
            "effective": role_title,
            "analysisGroup": position_label,
            "rationale": (
                f"The preserved employer posting uses an exact {position_label} title or a reviewed direct alias. "
                f"{text(reviewed['review_reason'])}"
            ),
            "citation": (
                "benchmark/enrichment/goodstructures_position_job_ad_review.csv | "
                f"benchmark/{text(reviewed['local_path'])}#{text(reviewed['evidence_locator'])}"
            ),
        }
        provenance["classificationTiming"] = "post_freeze_goodstructures_position_enrichment"
        provenance["provenanceType"] = "source_native_job_posting + reviewed_position_mapping + preserved_nonpay_organization_metadata"
        evidence = (
            f"Employer recruitment posting for {role_title}. Source-year USD range: "
            f"{money(low)}–{money(high)}; midpoint: {money(midpoint)}. "
            f"Location: {text(reviewed['location'])}; work arrangement: {text(reviewed['remote_status'])}."
        )
        output[position_key].append({
            "id": source_id,
            "sourceId": source_id,
            "organization": organization,
            "executive": "",
            "rawExecutive": "",
            "title": role_title,
            "titleGroup": position_label,
            "rawTitle": role_title,
            "positionFamily": position_label,
            "positionKey": position_key,
            "secondaryRoleTags": [],
            "seniorityGroup": "Executive" if position_key in {"coo", "chief_of_staff"} else "Director / senior specialist",
            "roleScope": "functional",
            "incumbencyStatus": "recruitment posting",
            "compensationYearRoleStatus": "prospective_full_time",
            "compensationYearRoleRule": "The employer posting explicitly describes a full-time role.",
            "averageHoursPerWeek": None,
            "averageHoursRelatedOrgs": None,
            "totalReportedHours": None,
            "defaultHoursEligible": True,
            "sensitivityOnlyReason": "",
            "tier": profile["tier"],
            "topic": profile["topic"],
            "eaAffinity": profile["eaAffinity"],
            "location": text(reviewed["location"]),
            "remoteStatus": text(reviewed["remote_status"]),
            "structure": profile["structure"],
            "revenue": None,
            "expenses": None,
            "staff": None,
            "comparabilityScore": profile["comparabilityScore"],
            "compensationYear": int(date[:4]),
            "salary": {"base": adjusted_midpoint, "cash": adjusted_midpoint, "total": adjusted_midpoint},
            "range": {"low": adjusted_low, "high": adjusted_high},
            "nominalSalary": {"base": midpoint, "cash": midpoint, "total": midpoint},
            "nominalRange": {"low": low, "high": high},
            "reportedRange": {
                "low": number(reviewed["reported_salary_min"]),
                "high": number(reviewed["reported_salary_max"]),
            },
            "reportedCurrency": text(reviewed["reported_currency"]),
            "reportedPayPeriod": "year",
            "reportedSalaryText": f"{money(low)}–{money(high)} per year",
            "cpiFactor": factor,
            "cpiPeriod": period,
            "defaultIncluded": True,
            "structurallyClean": True,
            "founder": False,
            "analysisStatus": "primary",
            "auditStatus": "source-validated employer job posting",
            "selectionNote": text(reviewed["review_reason"]),
            "evidenceText": evidence,
            "sourceUrl": text(reviewed["original_url"]),
            "canonicalUrl": text(reviewed["archive_url"]),
            "cachedSource": cached,
            "localPath": text(reviewed["local_path"]),
            "sourceType": "Job posting",
            "evidenceStream": "jobAds",
            "homepageUrl": text(reviewed["homepage_url"]) or profile.get("homepageUrl", ""),
            "categoryProvenance": provenance,
            "positionTaxonomy": {
                "taxonomyId": f"JOB-AD-{position_key.upper().replace('_', '-')}",
                "classificationRule": "Exact source-native position title or reviewed direct alias.",
                "effectiveTitleSource": "source_native_job_posting",
                "effectiveTitleRule": "Preserve the employer's title.",
                "standardizedPositionRule": f"Reviewed mapping to {position_label}.",
                "standardizedPositionAliasQuality": "exact",
                "confidence": "high",
                "roleScope": "functional",
                "incumbencyStatus": "recruitment posting",
                "compensationYearRoleStatus": "prospective_full_time",
                "compensationYearRoleRule": "The employer posting explicitly describes a full-time role.",
                "sensitivityOnlyReason": "",
                "partViiLocator": "",
                "scheduleJLocator": "",
                "methodologyPath": "benchmark/enrichment/goodstructures_position_job_ad_integration.md",
                "classificationSource": None,
            },
            "goodStructuresReview": {
                "reviewPath": "benchmark/enrichment/goodstructures_position_job_ad_review.csv",
                "methodologyPath": "benchmark/enrichment/goodstructures_position_job_ad_integration.md",
                "archiveSha256": observed_hash,
                "evidenceLocator": text(reviewed["evidence_locator"]),
            },
        })
    return output


def normalized_person_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", text(value).casefold())


def eligible_disclosed_pay_by_source() -> dict[str, dict[str, list[dict]]]:
    measures = {
        "base": ("schedule_j_base_total_nominal", "schedule_j_base_total_july_2026"),
        "cash": ("part_vii_cash_nominal", "part_vii_cash_july_2026"),
        "total": ("part_vii_total_nominal", "part_vii_total_july_2026"),
    }
    source_rows: dict[str, list[dict[str, str]]] = {}
    for row in rows(FORM990_POSITION_OBSERVATIONS):
        if not (
            boolean(row["default_hours_eligible"])
            and text(row["role_scope"]) in {"functional", "organization_wide"}
            and text(row["compensation_year_role_status"]) in {"no_transition_indicated", "verified_full_year"}
            and not boolean(row["former_officer_director_trustee"])
        ):
            continue
        source_rows.setdefault(text(row["source_id"]), []).append(row)

    output: dict[str, dict[str, list[dict]]] = {}
    for source_id, candidates in source_rows.items():
        source_result: dict[str, list[dict]] = {}
        for measure, (nominal_field, adjusted_field) in measures.items():
            by_person: dict[str, dict] = {}
            for candidate in candidates:
                nominal = number(candidate[nominal_field])
                adjusted = number(candidate[adjusted_field])
                if nominal is None or adjusted is None or nominal <= 0 or adjusted <= 0:
                    continue
                person_key = text(candidate["person_key"]) or text(candidate["person_name"]).casefold()
                existing = by_person.get(person_key)
                if existing is None or nominal > existing["nominal"]:
                    by_person[person_key] = {
                        "personKey": person_key,
                        "person": text(candidate["effective_person_name"]) or text(candidate["person_name"]),
                        "title": text(candidate["effective_title"]) or text(candidate["native_title"]),
                        "benchmarkPosition": text(candidate["benchmark_position"]),
                        "roleScope": text(candidate["role_scope"]),
                        "nominal": nominal,
                        "adjusted": adjusted,
                    }
            ranked = sorted(by_person.values(), key=lambda item: (-item["nominal"], item["person"].casefold()))
            source_result[measure] = [
                {**candidate, "sourceRank": rank, "eligibleDisclosures": len(ranked)}
                for rank, candidate in enumerate(ranked, start=1)
            ]
        if source_result:
            output[source_id] = source_result
    return output


def attach_highest_paid_other_employee(app_rows: list[dict]) -> int:
    by_source = eligible_disclosed_pay_by_source()
    attached = 0
    for row in app_rows:
        source_result = by_source.get(text(row.get("sourceId")))
        if not source_result:
            continue
        row_person_keys = {
            normalized_person_key(row.get("executive")),
            normalized_person_key(row.get("rawExecutive")),
            normalized_person_key(text(row.get("id")).rsplit("::", 1)[-1]),
        } - {""}
        selected_position = text(row.get("positionKey")) or "ceo"
        result: dict[str, dict] = {}
        for measure, candidates in source_result.items():
            matched_keys = {
                candidate["personKey"] for candidate in candidates
                if candidate["personKey"] in row_person_keys
                or normalized_person_key(candidate["person"]) in row_person_keys
            }
            if not matched_keys:
                continue
            def is_selected_position(candidate: dict) -> bool:
                if candidate["personKey"] in matched_keys:
                    return True
                if selected_position == "ceo":
                    return candidate["roleScope"] == "organization_wide"
                return candidate["benchmarkPosition"] == selected_position

            other = next(
                (candidate for candidate in candidates if not is_selected_position(candidate)),
                None,
            )
            if other:
                result[measure] = copy.deepcopy(other)
        if result:
            row["highestPaidOtherEmployee"] = result
            attached += 1
    return attached


def apply_living_peer_review(incumbents: list[dict], jobs: list[dict]) -> dict[str, int]:
    """Apply a dated, pay-blind admission review without rewriting frozen inputs."""
    review_rows = rows(LIVING_PEER_REVIEW)
    review_ids = {text(row["observation_id"]) for row in review_rows}
    if review_ids != EXPECTED_LIVING_PEER_REVIEW_IDS or len(review_rows) != len(review_ids):
        missing = sorted(EXPECTED_LIVING_PEER_REVIEW_IDS - review_ids)
        extra = sorted(review_ids - EXPECTED_LIVING_PEER_REVIEW_IDS)
        raise ValueError(
            f"Living peer review boundary changed; missing={missing}, extra={extra}"
        )

    app_rows = incumbents + jobs
    by_id = {row["id"]: row for row in app_rows}
    if len(by_id) != len(app_rows):
        raise ValueError("App observations contain duplicate IDs before the living peer review")
    missing_app_rows = sorted(review_ids - by_id.keys())
    if missing_app_rows:
        raise ValueError(f"Living peer review cites missing app observations: {missing_app_rows}")

    allowed_dispositions = {"default", "sensitivity", "observed_only"}
    allowed_score_statuses = {"verified", "provisional", "unavailable"}
    promoted = 0
    retained_default = 0
    for review in review_rows:
        observation_id = text(review["observation_id"])
        row = by_id[observation_id]
        stream = text(review["evidence_stream"])
        organization = text(review["organization"])
        if stream != row["evidenceStream"] or organization != row["organization"]:
            raise ValueError(
                f"Living peer review identity mismatch for {observation_id}: "
                f"{stream}/{organization}"
            )

        legacy_default = reviewed_boolean(review["legacy_default_included"])
        living_default = reviewed_boolean(review["living_default_included"])
        if legacy_default is not bool(row["defaultIncluded"]):
            raise ValueError(f"Living peer review has a stale legacy default for {observation_id}")
        disposition = text(review["observation_disposition"])
        if disposition not in allowed_dispositions:
            raise ValueError(f"Invalid living disposition for {observation_id}: {disposition}")
        if living_default != (disposition == "default"):
            raise ValueError(f"Living default/disposition conflict for {observation_id}")
        score_status = text(review["score_status"])
        if score_status not in allowed_score_statuses:
            raise ValueError(f"Invalid score status for {observation_id}: {score_status}")
        status = text(review["living_analysis_status"])
        tier = text(review["living_tier"])
        reason = text(review["nonpay_reason"])
        weight_treatment = text(review["weight_treatment"])
        review_date = text(review["review_date"])
        if not all((status, tier, reason, weight_treatment, review_date)):
            raise ValueError(f"Living peer review is incomplete for {observation_id}")
        if living_default:
            cash = row.get("salary", {}).get("cash")
            if cash is None or cash <= 0:
                raise ValueError(f"Living default lacks a positive compensation point: {observation_id}")

        row["legacyDefaultIncluded"] = legacy_default
        row["legacyAnalysisStatus"] = row["analysisStatus"]
        row["legacyTier"] = row["tier"]
        row["defaultIncluded"] = living_default
        row["analysisStatus"] = status
        row["tier"] = tier
        row["selectionNote"] = reason
        row["livingPeerReview"] = {
            "disposition": disposition,
            "scoreStatus": score_status,
            "reason": reason,
            "weightTreatment": weight_treatment,
            "reviewDate": review_date,
            "reviewPath": "benchmark/enrichment/living_peer_universe_review.csv",
            "methodologyPath": LIVING_PEER_METHODOLOGY,
        }

        provenance = row.get("categoryProvenance")
        if provenance:
            row["preLivingCategoryProvenance"] = copy.deepcopy(provenance)
            provenance = copy.deepcopy(provenance)
            provenance["tier"] = {
                **provenance.get("tier", {}),
                "value": tier,
                "label": f"Tier {tier} · living review" if tier in {"A", "B", "C"} else tier,
                "rationale": reason,
                "citation": "benchmark/enrichment/living_peer_universe_review.csv",
            }
            provenance["classificationTiming"] = (
                f"{text(provenance.get('classificationTiming'))} + living_peer_review_2026-08-30"
            ).strip(" +")
            provenance["caveats"] = (
                f"{text(provenance.get('caveats'))} Current disposition: {disposition}; "
                f"score status: {score_status}."
            ).strip()
            row["categoryProvenance"] = provenance

        promoted += int(living_default and not legacy_default)
        retained_default += int(living_default and legacy_default)

    if promoted != 6 or retained_default != 2:
        raise ValueError(
            f"Unexpected living-review disposition counts: promoted={promoted}, "
            f"retained_default={retained_default}"
        )
    return {
        "reviewedObservations": len(review_rows),
        "promotedObservations": promoted,
        "retainedDefaultObservations": retained_default,
    }


def main() -> None:
    if EVIDENCE_DIR.exists():
        shutil.rmtree(EVIDENCE_DIR)
    definitions, rationales_by_source, reference_rationales, rationale_counts = load_category_explainers()
    incumbents = build_incumbents(rationales_by_source, reference_rationales)
    roster_incumbents = build_ea_roster_incumbents()
    lingering_ceo_rows, lingering_position_rows = build_lingering_org_app_additions()
    incumbent_ids = {row["id"] for row in incumbents}
    duplicate_roster_ids = incumbent_ids & {row["id"] for row in roster_incumbents}
    if duplicate_roster_ids:
        raise ValueError(f"Duplicate EA-roster incumbent IDs: {sorted(duplicate_roster_ids)}")
    incumbents.extend(roster_incumbents)
    incumbent_ids = {row["id"] for row in incumbents}
    duplicate_lingering_ids = incumbent_ids & {row["id"] for row in lingering_ceo_rows}
    if duplicate_lingering_ids:
        raise ValueError(f"Duplicate lingering-organization incumbent IDs: {sorted(duplicate_lingering_ids)}")
    incumbents.extend(lingering_ceo_rows)
    jobs = build_job_ads(rationales_by_source)
    living_review_summary = apply_living_peer_review(incumbents, jobs)
    rp_reference = build_rp_reference()
    position_catalog, position_observations, rp_references_by_position = build_position_data(
        rationales_by_source, reference_rationales
    )
    position_job_ads = build_position_job_ads(position_catalog, incumbents)
    for position_key, additions in lingering_position_rows.items():
        if position_key not in position_observations:
            raise ValueError(f"Unknown lingering-organization position key: {position_key}")
        existing_ids = {
            row["id"] for family_rows in position_observations.values() for row in family_rows
        }
        duplicate_ids = existing_ids & {row["id"] for row in additions}
        if duplicate_ids:
            raise ValueError(f"Duplicate lingering-organization position IDs: {sorted(duplicate_ids)}")
        position_observations[position_key].extend(additions)
        catalog_entry = next(
            position for position in position_catalog if position["key"] == position_key
        )
        catalog_entry["counts"]["catalog"] += len(additions)
        catalog_entry["counts"]["roleEligible"] += len(additions)
    for position_key, additions in position_job_ads.items():
        if not additions:
            continue
        catalog_entry = next(
            position for position in position_catalog if position["key"] == position_key
        )
        catalog_entry["counts"]["catalog"] += len(additions)
        catalog_entry["counts"]["roleEligible"] += len(additions)
        catalog_entry["counts"]["defaultIncluded"] += sum(
            row["defaultIncluded"] for row in additions
        )
        catalog_entry["description"] += (
            f" Includes {len(additions)} source-validated recruitment "
            f"posting{'s' if len(additions) != 1 else ''}."
        )
    for catalog_entry in position_catalog:
        position_key = catalog_entry["key"]
        if position_key == "ceo":
            continue
        default_rows = [
            row for row in position_observations[position_key] + position_job_ads[position_key]
            if row["defaultIncluded"]
            and row["salary"][
                "base" if row["evidenceStream"] == "jobAds" else "cash"
            ] is not None
        ]
        catalog_entry["counts"]["defaultAvailable"] = len(default_rows)
        catalog_entry["counts"]["organizations"] = len({row["organization"] for row in default_rows})
        catalog_entry["description"] = re.sub(
            r"\d+ usable pay records from \d+ selected peer organizations\.",
            (
                f"{len(default_rows)} usable pay records from "
                f"{catalog_entry['counts']['organizations']} selected peer organizations."
            ),
            catalog_entry["description"],
            count=1,
        )
    # Historical source and frozen classification files keep their original
    # labels. Everything emitted to the application uses the current collapsed
    # taxonomy, including copied provenance attached to CEO and non-CEO rows.
    incumbents = normalize_ea_taxonomy(incumbents)
    jobs = normalize_ea_taxonomy(jobs)
    rp_reference = normalize_ea_taxonomy(rp_reference)
    position_observations = normalize_ea_taxonomy(position_observations)
    position_job_ads = normalize_ea_taxonomy(position_job_ads)
    rp_references_by_position = normalize_ea_taxonomy(rp_references_by_position)
    definitions = normalize_ea_taxonomy(definitions)
    ceo_catalog = next(position for position in position_catalog if position["key"] == "ceo")
    ceo_rows = incumbents + jobs
    ceo_catalog["counts"] = {
        "catalog": len(ceo_rows),
        "roleEligible": sum(row["salary"]["base"] is not None for row in ceo_rows),
        "defaultIncluded": sum(row["defaultIncluded"] for row in ceo_rows),
        "defaultAvailable": sum(
            row["defaultIncluded"] and row["salary"]["base"] is not None for row in ceo_rows
        ),
        "organizations": len({
            row["organization"] for row in ceo_rows
            if row["defaultIncluded"] and row["salary"]["base"] is not None
        }),
    }
    # Preserve the operating-headcount page used by the UI's editable staff-similarity
    # target. The comparable RP table field remains filing-derived in build_rp_reference().
    cache_source(RP_FUNDING_SOURCE_ID, RP_FUNDING_LOCAL_PATH)
    position_app_rows = [row for family_rows in position_observations.values() for row in family_rows]
    position_job_rows = [row for family_rows in position_job_ads.values() for row in family_rows]
    position_rp_rows = [row for family_rows in rp_references_by_position.values() for row in family_rows]
    highest_paid_other_attachments = attach_highest_paid_other_employee(
        incumbents + position_app_rows + position_rp_rows + [rp_reference]
    )
    app_rows = incumbents + jobs + position_app_rows + position_job_rows
    operating_metadata_summary = attach_organization_operating_metadata(
        app_rows + position_rp_rows + [rp_reference]
    )
    wikipedia_profiles = load_wikipedia_profiles({row["organization"] for row in app_rows})
    for row in app_rows:
        profile = wikipedia_profiles[row["organization"]]
        row["wikipediaTitle"] = text(profile["wikipedia_title"])
        row["wikipediaUrl"] = text(profile["wikipedia_url"])
    for row in position_rp_rows:
        row["wikipediaTitle"] = ""
        row["wikipediaUrl"] = ""
    predictive_model = load_predictive_model_artifact(
        expected_exact=sum(
            predictive_training_eligible("filing", row) and row["salary"]["base"] is not None
            for row in incumbents
        ),
        expected_cash_proxy=sum(
            predictive_training_eligible("filing", row) and row["salary"]["base"] is None
            and row["salary"]["cash"] is not None
            for row in incumbents
        ),
        expected_ads=sum(
            predictive_training_eligible("job_ad", row)
            and row["salary"]["base"] is not None
            for row in jobs
        ),
        training_inputs={"incumbents": incumbents, "jobAds": jobs, "rpReference": rp_reference},
    )
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "priceBasis": "July 2026 USD",
        "cpi": {
            "seriesId": "CUUR0000SA0",
            "seriesTitle": "CPI-U, U.S. city average, all items, not seasonally adjusted",
            "targetPeriod": "July 2026",
            "targetIndex": 333.918,
            "sourceUrl": "https://www.bls.gov/cpi/data.htm",
            "localDataPath": "benchmark/data/cpi_u.csv",
        },
        "incumbents": incumbents,
        "jobAds": jobs,
        "rpReference": rp_reference,
        "positionCatalog": position_catalog,
        "positionObservations": position_observations,
        "positionJobAds": position_job_ads,
        "rpReferencesByPosition": rp_references_by_position,
        "predictiveModel": predictive_model,
        "categoryExplainers": {
            "definitions": definitions,
            "definitionCount": sum(len(field) for field in definitions.values()),
            "rationaleCounts": rationale_counts,
            "dictionaryPath": "benchmark/deliverables/category_explainers/category_dictionary.csv",
            "rationalesPath": "benchmark/deliverables/category_explainers/organization_category_rationale.csv",
            "methodologyPath": "benchmark/deliverables/category_explainers/methodology_notes.md",
            "validationPath": "benchmark/deliverables/category_explainers/validation_report.txt",
            "jobAdEnrichmentPath": "benchmark/enrichment/job_ad_category_enrichment.csv",
            "jobAdEnrichmentDictionaryPath": "benchmark/enrichment/job_ad_category_dictionary.csv",
            "jobAdEnrichmentMethodologyPath": "benchmark/enrichment/job_ad_category_methodology.md",
            "jobAdEvidenceUpdatesPath": "benchmark/enrichment/job_ad_evidence_updates.csv",
            "goodStructuresJobAdIntegrationPath": "benchmark/enrichment/goodstructures_job_ad_integration.md",
            "goodStructuresPositionJobAdReviewPath": "benchmark/enrichment/goodstructures_position_job_ad_review.csv",
            "goodStructuresPositionJobAdIntegrationPath": "benchmark/enrichment/goodstructures_position_job_ad_integration.md",
            "eaRosterAuditPath": "benchmark/enrichment/ea_roster_bundle_audit.md",
            "eaRosterReviewedCompensationPath": "benchmark/enrichment/ea_roster_validated_compensation.csv",
            "lingeringOrgRecoveredPositionsPath": "benchmark/enrichment/lingering_org_recovered_us_positions.csv",
            "lingeringOrgPeerReviewPath": "benchmark/enrichment/lingering_org_peer_eligibility_review.csv",
            "lingeringOrgAppAdditionsPath": "benchmark/enrichment/lingering_org_app_position_additions.csv",
            "lingeringOrgSourceManifestPath": "benchmark/enrichment/lingering_org_original_source_manifest.csv",
            "operatingMetadataPath": "benchmark/enrichment/organization_operating_metadata.csv",
            "operatingMetadataMethodologyPath": "benchmark/enrichment/organization_operating_metadata_methodology.md",
            "operatingMetadataSourceManifestPath": "benchmark/enrichment/organization_operating_metadata_source_manifest.csv",
            "operatingMetadataManualRequestsPath": "benchmark/enrichment/organization_operating_metadata_manual_requests.csv",
            "lingeringOrgManualRequestsPath": "benchmark/enrichment/lingering_org_remaining_manual_save_requests.csv",
            "eaScreened109AuditPath": "benchmark/enrichment/ea_screened109_audit.md",
            "eaScreened109CandidateReviewPath": "benchmark/enrichment/ea_screened109_candidate_review.csv",
            "eaScreened109FollowupPromptPath": "benchmark/enrichment/ea_screened109_followup_prompt.md",
            "incumbentCompensationUpdatesPath": "benchmark/enrichment/incumbent_compensation_updates.csv",
            "livingPeerReviewPath": "benchmark/enrichment/living_peer_universe_review.csv",
            "livingPeerMethodologyPath": LIVING_PEER_METHODOLOGY,
            "positionMethodologyPath": "benchmark/enrichment/form990_position_methodology.md",
            "positionCatalogPath": "benchmark/enrichment/form990_benchmark_position_catalog.csv",
            "positionObservationsPath": "benchmark/enrichment/form990_position_observations.csv",
            "positionTaxonomyPath": "benchmark/enrichment/form990_position_taxonomy.csv",
            "positionSupportingSourcesPath": "benchmark/enrichment/form990_position_supporting_sources.csv",
            "autoWeightAnalysisPath": "benchmark/analysis/auto_weight_models/README.md",
            "organizationOperatingMetadataPath": "benchmark/enrichment/organization_operating_metadata.csv",
        },
        "summary": {
            "selectedReferenceOrganizations": len({row["organization"] for row in incumbents}),
            "incumbentObservationRows": len(incumbents),
            "primaryIncumbentObservations": sum(row["defaultIncluded"] for row in incumbents),
            "validatedBaseObservations": sum(
                row["defaultIncluded"] and row["salary"]["base"] is not None for row in incumbents
            ),
            "quantitativeJobAds": sum(row["defaultIncluded"] for row in jobs),
            "retrievedManifestRecords": len(rows(DELIVERABLES / "source_acquisition_manifest.csv")),
            "verifiedWikipediaProfiles": sum(
                bool(profile["wikipedia_title"]) for profile in wikipedia_profiles.values()
            ),
            "eaRosterValidatedObservations": len(roster_incumbents),
            "lingeringOrgSensitivityObservations": len(lingering_ceo_rows) + sum(
                len(family_rows) for family_rows in lingering_position_rows.values()
            ),
            "livingPeerReviewedObservations": living_review_summary["reviewedObservations"],
            "organizationOperatingMetadata": operating_metadata_summary,
            "livingPeerPromotedObservations": living_review_summary["promotedObservations"],
            "positionCatalogSize": len(position_catalog),
            "positionCatalogObservations": len(position_app_rows),
            "positionJobAdObservations": len(position_job_rows),
            "positionDefaultIncluded": sum(
                row["defaultIncluded"] for row in position_app_rows + position_job_rows
            ),
            "positionRpReferences": len(position_rp_rows),
            "highestPaidOtherEmployeeAttachments": highest_paid_other_attachments,
        },
    }
    payload = normalize_ea_taxonomy(payload)
    assert_no_retired_ea_label(payload)
    OUTPUT.write_text(
        "window.CEO_BENCHMARK_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
    print(f"cached original sources: {len(list(EVIDENCE_DIR.iterdir()))}")


if __name__ == "__main__":
    main()
