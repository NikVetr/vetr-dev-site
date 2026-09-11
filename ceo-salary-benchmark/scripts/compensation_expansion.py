"""Apply independently reviewed empirical additions after the frozen CEO model check."""

from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPANSION = ROOT / "benchmark/enrichment/compensation_expansion.json"
AUDIT_PATH = "benchmark/enrichment/compensation_expansion_audit.md"


def load_expansion(path: Path = EXPANSION) -> dict:
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != 1:
        raise ValueError("Unsupported compensation expansion schema")
    return data


def validate_addition(row: dict, sources: dict, position_keys: set[str]) -> None:
    if row["positionKey"] not in position_keys:
        raise ValueError(f"Unknown expansion position: {row['positionKey']}")
    audit = row["expansionReview"]
    if audit.get("sourceVerified") is not True or audit.get("quarantined") is not False:
        raise ValueError(f"Unverified or quarantined expansion observation: {row['id']}")
    if audit.get("isRpReference") or row["organization"].casefold() == "rethink priorities":
        raise ValueError("RP cannot be an expansion peer")
    if audit["sourceKey"] not in sources:
        raise ValueError(f"Missing expansion source: {row['id']}")
    if audit.get("secondarySourceKey") and audit["secondarySourceKey"] not in sources:
        raise ValueError(f"Missing expansion secondary source: {row['id']}")
    if row["positionKey"] == "ceo" and row["defaultIncluded"]:
        raise ValueError("New CEO disclosures require a separate default-cohort review")
    if row["evidenceStream"] not in {"incumbents", "jobAds"}:
        raise ValueError(f"Unknown evidence stream: {row['id']}")
    factor = row["cpiFactor"]
    if factor is not None and (not isinstance(factor, (int, float)) or factor <= 0):
        raise ValueError(f"Missing price conversion: {row['id']}")
    for measure in ("base", "cash", "total"):
        nominal, adjusted = row["nominalSalary"][measure], row["salary"][measure]
        if factor is None:
            if adjusted is not None:
                raise ValueError(f"Undated pay was normalized: {row['id']}")
            continue
        if (nominal is None) != (adjusted is None):
            raise ValueError(f"Missing pay was imputed: {row['id']}/{measure}")
        if nominal is not None and (nominal <= 0 or abs(adjusted - nominal * factor) > 0.02):
            raise ValueError(f"Invalid pay conversion: {row['id']}/{measure}")
    if row["evidenceStream"] == "jobAds":
        low, high = row["nominalRange"]["low"], row["nominalRange"]["high"]
        if not 0 < low <= high or abs(row["nominalSalary"]["base"] - (low + high) / 2) > 0.01:
            raise ValueError(f"Invalid advertised range: {row['id']}")
        if any(row["nominalSalary"][key] is not None for key in ("cash", "total")):
            raise ValueError(f"Advertisement masquerades as cash/total disclosure: {row['id']}")


def apply_expansion(payload: dict, cache_source, *, expansion_path: Path = EXPANSION) -> None:
    """Append reviewed rows without changing existing observations or predictive fits."""
    expansion = load_expansion(expansion_path)
    sources = {row["key"]: row for row in expansion["sources"]}
    if len(sources) != len(expansion["sources"]):
        raise ValueError("Duplicate expansion source keys")
    cached = {}
    for key, source in sources.items():
        path = (ROOT / source["localPath"]).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise ValueError(f"Missing expansion original: {source['localPath']}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"Expansion original hash mismatch: {key}")
        cached[key] = cache_source(key, source["localPath"].removeprefix("benchmark/"))

    catalog = {row["key"]: row for row in payload["positionCatalog"]}
    for definition in expansion["positions"]:
        if definition["key"] in catalog:
            raise ValueError(f"Expansion repeats an existing public position: {definition['key']}")
        entry = copy.deepcopy(definition)
        payload["positionCatalog"].append(entry)
        catalog[entry["key"]] = entry
        payload["positionObservations"][entry["key"]] = []
        payload["positionJobAds"][entry["key"]] = []
        payload["rpReferencesByPosition"][entry["key"]] = []

    all_existing = payload["incumbents"] + payload["jobAds"] + [
        row for group in ("positionObservations", "positionJobAds")
        for rows in payload[group].values() for row in rows
    ]
    ids = {row["id"] for row in all_existing}
    payload["compensationSourceUpdates"] = {}
    for source in expansion.get("corroboratingSources", []):
        key, identifier = source["sourceKey"], source["observationId"]
        if identifier not in ids or key not in sources or identifier in payload["compensationSourceUpdates"]:
            raise ValueError("Invalid or repeated corroborating source")
        payload["compensationSourceUpdates"][identifier] = {
            "secondarySourceUrl": sources[key]["url"], "secondaryCachedSource": cached[key],
            "secondarySourceLabel": source["label"], "secondaryCachedLabel": "saved " + source["label"],
        }
    identities = set()
    for original in expansion["observations"]:
        row = copy.deepcopy(original)
        validate_addition(row, sources, set(catalog))
        identity = row["expansionReview"]["identity"]
        if row["id"] in ids or identity in identities:
            raise ValueError(f"Duplicate expansion person/filing or campaign: {row['id']}")
        ids.add(row["id"])
        identities.add(identity)
        row["cachedSource"] = cached[row["expansionReview"]["sourceKey"]]
        secondary_key = row["expansionReview"].get("secondarySourceKey")
        if secondary_key:
            row["secondaryCachedSource"] = cached[secondary_key]
            row["secondarySourceUrl"] = sources[secondary_key]["url"]
        key = row["positionKey"]
        if key == "ceo":
            destination = payload[row["evidenceStream"]]
        else:
            destination = payload["positionJobAds" if row["evidenceStream"] == "jobAds" else "positionObservations"][key]
        destination.append(row)

    canonical = {r["id"]: r for r in all_existing}
    membership_views = {}
    payload["positionMemberships"] = {}
    for member in expansion.get("memberships", []):
        key, identifier = member["positionKey"], member["observationId"]
        row = canonical.get(identifier)
        if (not row or key not in catalog or not catalog[key].get("expansion")
                or row["evidenceStream"] != "incumbents" or row.get("positionKey") in {key, "ceo"}
                or row["organization"].casefold() == "rethink priorities"
                or member.get("sourceVerified") is not True or member["sourceKey"] not in sources
                or member["defaultIncluded"] and not row["defaultIncluded"]):
            raise ValueError(f"Invalid functional cross-listing: {identifier}/{key}")
        existing_ids = {r["id"] for r in payload["positionObservations"][key] + membership_views.get(key, [])}
        if identifier in existing_ids:
            raise ValueError(f"Duplicate functional cross-listing: {identifier}/{key}")
        payload["positionMemberships"].setdefault(key, []).append(copy.deepcopy(member))
        membership_views.setdefault(key, []).append({**row, "defaultIncluded": member["defaultIncluded"]})

    for key, definition in catalog.items():
        rows = (payload["incumbents"] + payload["jobAds"] if key == "ceo" else
                payload["positionObservations"][key] + payload["positionJobAds"][key] + membership_views.get(key, []))
        defaults = [r for r in rows if r["defaultIncluded"]]
        available = [r for r in defaults if r["salary"]["base" if key == "ceo" or r["evidenceStream"] == "jobAds" else "cash"] is not None]
        counts = definition.setdefault("counts", {})
        counts.update(catalog=len(rows), defaultIncluded=len(defaults), defaultAvailable=len(available),
                      organizations=len({r["organization"] for r in available}))
        counts["roleEligible"] = sum(r["analysisStatus"] != "excluded" for r in rows)
        if definition.get("defaultSample") == "observed":
            initial = [r for r in rows if r["nominalSalary"]["base"] is not None]
            counts["initialAvailable"] = len(initial)
            counts["initialOrganizations"] = len({r["organization"] for r in initial})
            definition["description"] = re.sub(
                r"\d+ usable pay records from \d+ selected peer organizations\.",
                f"{len(initial)} nominal-only pay record(s) from {counts['initialOrganizations']} organization(s); no reviewed inflation conversion.",
                definition["description"],
            )
        definition["description"] = re.sub(
            r"\d+ usable pay records from \d+ selected peer organizations\.",
            f"{len(available)} usable pay records from {counts['organizations']} selected peer organizations.",
            definition["description"],
        )
    summary = payload["summary"]
    summary.update(
        incumbentObservationRows=len(payload["incumbents"]),
        selectedReferenceOrganizations=len({r["organization"] for r in payload["incumbents"]}),
        positionCatalogSize=len(catalog),
        positionCatalogObservations=sum(map(len, payload["positionObservations"].values())),
        positionJobAdObservations=sum(map(len, payload["positionJobAds"].values())),
        positionDefaultIncluded=sum(r["defaultIncluded"] for group in ("positionObservations", "positionJobAds") for rows in payload[group].values() for r in rows),
        compensationExpansion=expansion["summary"],
    )
    payload["categoryExplainers"]["compensationExpansionAuditPath"] = AUDIT_PATH
