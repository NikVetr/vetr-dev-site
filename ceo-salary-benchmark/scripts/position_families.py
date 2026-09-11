"""Pooled functional views over existing observations; never new salary records."""

FAMILIES = [
    ("operations_leadership", "COO / Operations leadership", ["coo", "operations_executive", "operations_director"]),
    ("finance_leadership", "CFO / Finance leadership", ["cfo", "finance_executive", "finance_director"]),
    ("legal_leadership", "General Counsel / Legal leadership", ["general_counsel", "legal_director"]),
    ("people_leadership", "People / HR leadership", ["people_executive", "people_director"]),
    ("research_leadership", "Research leadership", ["research_executive", "research_director"]),
    ("program_leadership", "Program leadership", ["program_executive", "program_director"]),
    ("development_leadership", "Development / Fundraising leadership", ["development_executive", "development_director"]),
    ("communications_leadership", "Communications leadership", ["communications_executive", "communications_director"]),
    ("policy_leadership", "Policy / Advocacy leadership", ["policy_executive", "policy_director"]),
]


def family_rows(payload, members, stream):
    canonical = {row["id"]: row for rows in payload["positionObservations"].values() for row in rows}
    pooled = {}
    for key in members:
        rows = list(payload["positionObservations" if stream == "incumbents" else "positionJobAds"][key])
        if stream == "incumbents":
            rows += [{**canonical[m["observationId"]], "defaultIncluded": m["defaultIncluded"]}
                     for m in payload.get("positionMemberships", {}).get(key, [])]
        for row in rows:
            previous = pooled.get(row["id"])
            pooled[row["id"]] = {**row, "defaultIncluded": row["defaultIncluded"] and (previous is None or previous["defaultIncluded"])}
    return list(pooled.values())


def apply_position_families(payload):
    catalog = {p["key"]: p for p in payload["positionCatalog"]}
    for key, label, members in FAMILIES:
        if key in catalog or any(member not in catalog for member in members):
            raise ValueError(f"Invalid pooled position definition: {key}")
        rows = family_rows(payload, members, "incumbents") + family_rows(payload, members, "jobAds")
        defaults = [r for r in rows if r["defaultIncluded"]]
        available = [r for r in defaults if r["salary"]["base" if r["evidenceStream"] == "jobAds" else "cash"] is not None]
        organizations = len({r["organization"] for r in available})
        payload["positionCatalog"].append({
            "key": key, "label": label, "pageLabel": label, "menuGroup": "Executive leadership",
            "pooled": True, "memberPositionKeys": members,
            "subtitle": " · ".join(catalog[m]["label"] for m in members),
            "defaultMeasure": "cash", "defaultSample": "primary", "defaultInflationAdjusted": True,
            "supportLevel": "primary" if len(available) >= 15 and organizations >= 12 else "exploratory",
            "description": "Pooled functional leadership: " + "; ".join(catalog[m]["label"] for m in members)
                + ". Titles can differ in scope; use a title subgroup for a narrower comparison. Existing eligibility restrictions are retained; each observation is counted once.",
            "counts": {"catalog": len(rows), "defaultIncluded": len(defaults), "defaultAvailable": len(available), "organizations": organizations},
        })
        # Views carry membership metadata, not duplicate canonical observations.
        payload["positionObservations"][key] = []
        payload["positionJobAds"][key] = []
        payload["rpReferencesByPosition"][key] = []
    payload["summary"]["positionCatalogSize"] = len(payload["positionCatalog"])
