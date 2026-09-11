import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from position_families import FAMILIES, family_rows


class PositionFamiliesTest(unittest.TestCase):
    def test_views_do_not_duplicate_observations_or_promote_exclusions(self):
        data = json.loads((ROOT / "app-data.js").read_text().split("=", 1)[1].strip().rstrip(";"))
        catalog = {p["key"]: p for p in data["positionCatalog"]}
        canonical = data["incumbents"] + data["jobAds"] + [r for group in ("positionObservations", "positionJobAds") for rows in data[group].values() for r in rows]
        self.assertEqual(len(canonical), 956)
        self.assertEqual(len({r["id"] for r in canonical}), 956)
        self.assertEqual(len(data["predictiveModel"]["training"]["records"]), 151)
        for key, _label, members in FAMILIES:
            self.assertEqual(data["positionObservations"][key], [])
            self.assertEqual(data["positionJobAds"][key], [])
            rows = family_rows(data, members, "incumbents") + family_rows(data, members, "jobAds")
            self.assertEqual(len(rows), len({r["id"] for r in rows}))
            self.assertEqual(len(rows), catalog[key]["counts"]["catalog"])
            self.assertNotIn("ceo", members)
        operations = family_rows(data, catalog["operations_leadership"]["memberPositionKeys"], "incumbents")
        self.assertTrue(any(r["positionKey"] == "coo" for r in operations))
        self.assertTrue(any(r["positionKey"] == "operations_director" for r in operations))
        research = family_rows(data, catalog["research_leadership"]["memberPositionKeys"], "incumbents")
        urban = next(r for r in research if r["organization"] == "Urban Institute" and "PROGRAM" in r["title"].upper())
        self.assertFalse(urban["defaultIncluded"])

    def test_shared_observation_counts_once_with_conservative_eligibility(self):
        payload = {"positionObservations": {"a": [{"id": "same", "defaultIncluded": True}], "b": []},
                   "positionMemberships": {"b": [{"observationId": "same", "defaultIncluded": False}]}}
        self.assertEqual(family_rows(payload, ["a", "b"], "incumbents"), [{"id": "same", "defaultIncluded": False}])


if __name__ == "__main__":
    unittest.main()
