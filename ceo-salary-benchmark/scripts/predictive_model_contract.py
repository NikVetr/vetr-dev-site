"""Stable input contract shared by the salary-model preparation and app build."""

from __future__ import annotations

import hashlib
import json


ROW_FIELDS = (
    "id", "organization", "defaultIncluded", "analysisStatus", "titleGroup",
    "topic", "eaAffinity", "structure", "location", "expenses", "revenue",
    "staff", "compensationYear", "salary", "range",
)
RP_FIELDS = (
    "id", "organization", "expenses", "revenue", "staff", "compensationYear",
    "salary",
)


def _project(row: dict, fields: tuple[str, ...]) -> dict:
    return {field: row.get(field) for field in fields}


def predictive_model_input_payload(data: dict) -> dict:
    """Return only source fields that can change training rows or RP defaults."""
    return {
        "incumbents": sorted(
            (_project(row, ROW_FIELDS) for row in data["incumbents"]),
            key=lambda row: str(row.get("id") or ""),
        ),
        "jobAds": sorted(
            (_project(row, ROW_FIELDS) for row in data["jobAds"]),
            key=lambda row: str(row.get("id") or ""),
        ),
        "rpReference": _project(data["rpReference"], RP_FIELDS),
    }


def predictive_model_input_sha256(data: dict) -> str:
    payload = json.dumps(
        predictive_model_input_payload(data),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
