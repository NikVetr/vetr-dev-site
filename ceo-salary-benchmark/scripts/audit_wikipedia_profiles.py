#!/usr/bin/env python3
"""Resolve organization previews to Wikipedia pages using conservative checks.

The audit only accepts an exact Wikipedia title (including a Wikipedia-managed
redirect) whose lead describes an organization. Non-exact search results are
never guessed: ambiguous organizations remain intentionally unmapped until a
human adds a reviewed override below.
"""
from __future__ import annotations

import csv
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "app-data.js"
OUTPUT = ROOT / "data" / "organization_wikipedia_profiles.csv"
API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "vetr.dev-ceo-benchmark/1.0 (organization profile validation)"
BATCH_SIZE = 20

# Add only mappings that have been manually checked against the organization's
# official identity. Exact-title pages do not need to be listed here.
REVIEWED_OVERRIDES: dict[str, str] = {
    "Demos": "Demos (U.S. think tank)",
    "Public Library of Science": "PLOS",
    "Reach Out and Read (regional executive role)": "Reach Out and Read",
    "Williams Institute at UCLA": "Williams Institute",
}

ORGANIZATION_TERMS = re.compile(
    r"\b(organization|nonprofit|non-profit|charity|charitable|foundation|fund|"
    r"institute|institution|association|alliance|coalition|council|center|centre|"
    r"think tank|advocacy|initiative|project|network|museum|society|research|"
    r"publisher|publication|group|company|laboratory|programme|program|journal|"
    r"campaign)\b",
    re.IGNORECASE,
)


def load_app_rows() -> list[dict]:
    raw = APP_DATA.read_text(encoding="utf-8")
    prefix = "window.CEO_BENCHMARK_DATA = "
    if not raw.startswith(prefix) or not raw.rstrip().endswith(";"):
        raise ValueError(f"Unexpected app-data.js wrapper: {APP_DATA}")
    payload = json.loads(raw[len(prefix):].rstrip()[:-1])
    return payload["incumbents"] + payload["jobAds"]


def normalized_title(value: str) -> str:
    return value.replace("_", " ").strip().casefold()


def entity_key(value: str) -> str:
    value = re.sub(r"\s*\(regional executive role\)\s*$", "", value, flags=re.I)
    value = value.casefold().replace("&", "and").replace("’", "'")
    value = re.sub(r"^the\s+", "", value)
    return re.sub(r"[^a-z0-9]+", "", value)


def requested_title(organization: str) -> str:
    return REVIEWED_OVERRIDES.get(
        organization,
        re.sub(r"\s*\(regional executive role\)\s*$", "", organization, flags=re.I),
    )


def query_batch(titles: list[str]) -> tuple[dict[str, dict], dict[str, str]]:
    parameters = urllib.parse.urlencode({
        "action": "query",
        "titles": "|".join(titles),
        "prop": "extracts|info|pageprops",
        "exintro": "1",
        "explaintext": "1",
        "exsentences": "2",
        "inprop": "url",
        "redirects": "1",
        "format": "json",
        "formatversion": "2",
    })
    request = urllib.request.Request(f"{API}?{parameters}", headers={"User-Agent": USER_AGENT})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 5:
                raise
            time.sleep(2 ** attempt)
    query = payload.get("query", {})
    redirects = {
        normalized_title(item["from"]): item["to"]
        for item in query.get("redirects", [])
    }
    normalizations = {
        normalized_title(item["from"]): item["to"]
        for item in query.get("normalized", [])
    }
    pages = {
        normalized_title(page.get("title", "")): page
        for page in query.get("pages", [])
        if not page.get("missing")
    }
    return pages, {**normalizations, **redirects}


def page_for(title: str, pages: dict[str, dict], aliases: dict[str, str]) -> dict | None:
    current = title
    seen = set()
    while normalized_title(current) in aliases and normalized_title(current) not in seen:
        seen.add(normalized_title(current))
        current = aliases[normalized_title(current)]
    return pages.get(normalized_title(current))


def organization_page(page: dict) -> bool:
    description = page.get("pageprops", {}).get("wikibase-shortdesc", "")
    if "disambiguation" in description.casefold():
        return False
    return bool(ORGANIZATION_TERMS.search(f"{description} {page.get('extract', '')}"))


def main() -> None:
    organizations = sorted({row["organization"] for row in load_app_rows()})
    requested = {organization: requested_title(organization) for organization in organizations}
    resolved: dict[str, tuple[dict, str]] = {}

    titles = list(dict.fromkeys(requested.values()))
    for offset in range(0, len(titles), BATCH_SIZE):
        batch = titles[offset:offset + BATCH_SIZE]
        pages, aliases = query_batch(batch)
        for organization, title in requested.items():
            if title not in batch:
                continue
            page = page_for(title, pages, aliases)
            same_entity_name = page and entity_key(organization) == entity_key(page.get("title", ""))
            reviewed_override = organization in REVIEWED_OVERRIDES
            if page and organization_page(page) and (same_entity_name or reviewed_override):
                method = "reviewed_override" if organization in REVIEWED_OVERRIDES else "exact_title_or_redirect"
                resolved[organization] = (page, method)
        print(f"checked {min(offset + len(batch), len(titles))}/{len(titles)} exact titles")
        time.sleep(0.5)

    records = []
    for organization in organizations:
        match = resolved.get(organization)
        page, method = match if match else ({}, "unmapped")
        records.append({
            "organization": organization,
            "wikipedia_title": page.get("title", ""),
            "wikipedia_url": page.get("fullurl", ""),
            "validation_method": method,
            "validation_note": (
                "manually reviewed non-exact title" if method == "reviewed_override"
                else "exact title/redirect with organization-like lead" if match
                else "no exact organization page; search results intentionally not guessed"
            ),
        })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=records[0].keys())
        writer.writeheader()
        writer.writerows(records)
    mapped = sum(bool(record["wikipedia_title"]) for record in records)
    print(f"wrote {OUTPUT}: {mapped} verified, {len(records) - mapped} intentionally unmapped")


if __name__ == "__main__":
    main()
