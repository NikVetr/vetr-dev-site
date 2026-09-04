"""Stable input contract shared by the salary-model preparation and app build."""

from __future__ import annotations

import hashlib
import json


# Nondefault records admitted after an explicit target-compatibility review.
# These broaden the prediction cohort without treating every app sensitivity
# row (for example, a partial-year leader or subordinate regional role) as an
# annual organization-head salary.
EXTRA_TRAINING_ROWS = {
    "SRC-990-EXT-ANIMAL-EQUALITY": "Organization-wide head of the U.S. legal entity; cash proxy only.",
    "SRC-990-EXT-COMPASSION-IN-WORLD-FARMING-USA": "Organization-wide head of the U.S. affiliate; cash proxy only.",
    "SRC-990-RECOVERY-LEEP::clare-donaldson": "Organization-wide co-executive; retained as a separate cash-proxy observation.",
    "SRC-990-RECOVERY-LEEP::lucia-coulter": "Organization-wide co-executive; retained as a separate cash-proxy observation.",
    "SRC-AD-MOST-2025": "Organization-wide Executive Director posting; excluded from the default peer set for scale, not role validity.",
    "SRC-AD-MSI": "Organization-wide Executive Director posting; operating-model difference is represented in model inputs.",
    "SRC-AD-CFL-2026": "Organization-wide CEO posting; grantmaking structure is represented in model inputs.",
    "SRC-AD-CHF-2026": "Organization-wide CEO posting; private-foundation structure is represented in model inputs.",
    "SRC-AD-OVERZERO-2025": "Organization-wide Executive Director posting for a sponsored project; organization type is represented in model inputs.",
    "SRC-AD-SEATTLEBG": "Organization-wide President/CEO posting; organization type is represented in model inputs.",
    "SRC-AD-CHAPA-AMBIG": "Organization-wide CEO posting; retained with its documented posting-date caveat.",
    "SRC-AD-TAIMAKA-2025": "Organization-wide Executive Director posting; older source date is represented in the pay-year input.",
    "SRC-AD-SCREWWORM-2025": "Organization-wide founding Director posting; pre-operational structure is represented in model inputs.",
    "SRC-AD-JOYCEIVY-2026": "Full-time organization-wide Executive Director posting; the wide range and optional fractional alternative remain documented caveats.",
}


ROW_FIELDS = (
    "id", "organization", "defaultIncluded", "analysisStatus", "titleGroup",
    "topic", "eaAffinity", "structure", "location", "expenses", "revenue",
    "staff", "compensationYear", "salary", "range", "highestPaidOtherEmployee", "auditStatus",
    "remoteCategory", "servesAsFiscalSponsor",
)
RP_FIELDS = (
    "id", "organization", "expenses", "revenue", "staff", "compensationYear",
    "salary", "highestPaidOtherEmployee", "remoteCategory", "servesAsFiscalSponsor",
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


def predictive_training_eligible(source: str, row: dict) -> bool:
    """Return the reviewed target-compatibility decision for one CEO record."""
    if source == "job_ad" and row.get("auditStatus") != "verified":
        return False
    if row.get("defaultIncluded"):
        return True
    return str(row.get("id") or "") in EXTRA_TRAINING_ROWS
