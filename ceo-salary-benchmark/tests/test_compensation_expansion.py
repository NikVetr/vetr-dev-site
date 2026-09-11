import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from compensation_expansion import load_expansion, validate_addition
from import_compensation_expansion import canonical_ad_url, native_xml_check, normalized, recover_missing_base, scope_exclusion, scope_sensitivity


class CompensationExpansionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.expansion = load_expansion()
        cls.sources = {s["key"]: s for s in cls.expansion["sources"]}
        cls.data = json.loads((ROOT / "app-data.js").read_text().split("=", 1)[1].strip().rstrip(";"))
        cls.keys = {p["key"] for p in cls.data["positionCatalog"]}

    def test_reviewed_originals_and_pay_channels(self):
        for source in self.sources.values():
            path = ROOT / source["localPath"]
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), source["sha256"])
        identities, person_years = set(), set()
        for row in self.expansion["observations"]:
            validate_addition(row, self.sources, self.keys)
            identity = row["expansionReview"]["identity"]
            self.assertNotIn(identity, identities)
            identities.add(identity)
            self.assertNotIn("hybrid", row["positionFamily"])
            self.assertNotIn("MIRI", row["id"])
            if row["evidenceStream"] == "incumbents":
                person_year = (row["entityId"], row["compensationYear"], normalized(row["executive"]))
                self.assertNotIn(person_year, person_years)
                person_years.add(person_year)
            if row["evidenceStream"] == "jobAds":
                self.assertIsNone(row["salary"]["cash"])
                self.assertIsNone(row["salary"]["total"])
                if row["compensationYear"] is None:
                    self.assertIsNone(row["salary"]["base"])
                    self.assertGreater(row["nominalSalary"]["base"], 0)

    def test_quarantine_reference_and_price_corruption_fail_loudly(self):
        original = next(r for r in self.expansion["observations"] if r["salary"]["base"])
        for change in ("quarantine", "reference", "price", "source"):
            row = copy.deepcopy(original)
            if change == "quarantine": row["expansionReview"]["quarantined"] = True
            if change == "reference": row["expansionReview"]["isRpReference"] = True
            if change == "price": row["salary"]["base"] += 100
            if change == "source": row["expansionReview"]["sourceKey"] = "missing"
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_addition(row, self.sources, self.keys)

    def test_expansion_does_not_enter_frozen_ceo_training(self):
        training_ids = {r["id"] for r in self.data["predictiveModel"]["training"]["records"]}
        for row in self.expansion["observations"]:
            self.assertNotIn(row["id"], training_ids)
            if row["positionKey"] == "ceo":
                self.assertFalse(row["defaultIncluded"])
        self.assertEqual(len(training_ids), 151)

    def test_functional_views_share_canonical_observation_identity(self):
        canonical = [r for rows in self.data["positionObservations"].values() for r in rows]
        by_id = {r["id"]: r for r in canonical}
        self.assertEqual(len(canonical), len(by_id))
        self.assertEqual(len(self.expansion["memberships"]), 46)
        for position in self.expansion["positions"]:
            key = position["key"]
            members = self.data["positionMemberships"].get(key, [])
            direct = self.data["positionObservations"][key] + self.data["positionJobAds"][key]
            ids = [r["id"] for r in direct] + [m["observationId"] for m in members]
            self.assertEqual(len(ids), len(set(ids)))
            for member in members:
                row = by_id[member["observationId"]]
                self.assertNotEqual(row["positionKey"], key)
                self.assertTrue(member["sourceVerified"])
                self.assertIn(member["sourceKey"], self.sources)
                self.assertFalse(member["defaultIncluded"] and not row["defaultIncluded"])
            catalog = next(p for p in self.data["positionCatalog"] if p["key"] == key)
            self.assertEqual(catalog["counts"]["catalog"], len(ids))

    def test_verified_examples_and_scope_boundaries(self):
        rows = {r["id"]: r for r in self.expansion["observations"]}
        woodwell = rows["r8:Woodwell:2024::corriemartin"]
        self.assertEqual(woodwell["positionKey"], "coo")
        self.assertEqual(woodwell["nominalSalary"], {"base": 299903, "cash": 320816, "total": 354212})
        wikimedia = rows["v4:WIKIMEDIA:FY2025::jaimevillagomez"]
        self.assertEqual(wikimedia["positionKey"], "cfo")
        self.assertEqual(wikimedia["nominalSalary"]["base"], 408761)
        wvr = rows["AD::r12:WVRIVERS:operations-manager-undated"]
        sfp = rows["AD::r12:SFP:WeCount-research-manager-2026"]
        self.assertEqual(wvr["positionKey"], "operations_staff")
        self.assertEqual(sfp["positionKey"], "research_program_manager")
        self.assertFalse(sfp["defaultIncluded"])
        self.assertIn("employment fraction", sfp["sensitivityOnlyReason"])
        self.assertNotIn("AD::r6:GIVEWELL-SENIOR::other_US", rows)
        self.assertNotIn("AD::r6:GIVEWELL-SENIOR::NYC_SF", rows)
        givewell = self.data["compensationSourceUpdates"]["SRC-AD-GIVEWELL-SENIOR-RESEARCHER-2026"]
        self.assertIn("20260511112328", givewell["secondarySourceUrl"])
        self.assertTrue((ROOT / givewell["secondaryCachedSource"]).is_file())
        self.assertEqual(canonical_ad_url(givewell["secondarySourceUrl"]), canonical_ad_url("https://job-boards.greenhouse.io/givewell/jobs/4253692008?gh_src=tracked"))
        self.assertNotEqual(canonical_ad_url("https://example.org/jobs?id=1"), canonical_ad_url("https://example.org/jobs?id=2"))
        self.assertNotIn("AD::v3:FP-climate-2024::Senior_Researcher_USD", rows)
        self.assertNotIn("v4:INDEPENDENT:FY2025::marylgtheroux", rows)
        self.assertTrue(scope_exclusion({"native_title": "ASSISTANT MANAGING DIRECTOR"}, "managing_director"))
        self.assertTrue(scope_exclusion({"native_title": "President and COO", "is_hybrid": True}, "coo"))
        self.assertFalse(scope_exclusion({"native_title": "Chief Operating Officer"}, "coo"))
        self.assertTrue(scope_sensitivity({"native_title": "VP Research and Programs"}, "research_executive"))
        self.assertTrue(scope_sensitivity({"native_title": "MG DIR. RESEARCH & POLICY"}, "research_executive"))
        self.assertFalse(scope_sensitivity({"native_title": "SVP Research Programs"}, "research_executive"))

    def test_exact_xml_columns_and_compensation_year(self):
        # A fiscal return ending in June 2025 reports calendar-2024 compensation.
        xml = '''<Return><ReturnHeader><Filer><EIN>123456789</EIN></Filer>
        <TaxPeriodBeginDt>2024-07-01</TaxPeriodBeginDt><TaxPeriodEndDt>2025-06-30</TaxPeriodEndDt></ReturnHeader><ReturnData><IRS990>
        <CYTotalRevenueAmt>1000000</CYTotalRevenueAmt><CYTotalExpensesAmt>900000</CYTotalExpensesAmt>
        <Form990PartVIISectionAGrp><PersonNm>Test Person</PersonNm><TitleTxt>CFO</TitleTxt>
        <AverageHoursPerWeekRt>40</AverageHoursPerWeekRt><ReportableCompFromOrgAmt>120000</ReportableCompFromOrgAmt>
        <OtherCompensationAmt>10000</OtherCompensationAmt></Form990PartVIISectionAGrp></IRS990>
        <IRS990ScheduleJ><RltdOrgOfficerTrstKeyEmplGrp><PersonNm>Test Person</PersonNm>
        <BaseCompensationFilingOrgAmt>100000</BaseCompensationFilingOrgAmt><BonusFilingOrganizationAmount>20000</BonusFilingOrganizationAmount>
        <TotalCompensationFilingOrgAmt>130000</TotalCompensationFilingOrgAmt></RltdOrgOfficerTrstKeyEmplGrp></IRS990ScheduleJ></ReturnData></Return>'''
        row = {"part_vii_locator": "Return/ReturnData/IRS990/Form990PartVIISectionAGrp[1]",
               "schedule_j_locator": "Return/ReturnData/IRS990ScheduleJ/RltdOrgOfficerTrstKeyEmplGrp[1]",
               "person_name": "Test Person", "native_title": "CFO", "weekly_hours_filer": 40,
               "entity_id": "US-EIN-123456789", "tax_period_end": "2025-06-30", "compensation_year": 2024,
               "tax_period_begin": "2024-07-01", "financial_year_end": 2025,
               "revenue_nominal_usd": 1000000, "expenses_nominal_usd": 900000,
               "base_nominal": 100000, "cash_nominal": 120000, "total_nominal": 130000, "total_basis": "Schedule J E"}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "filing.xml"
            path.write_text(xml)
            self.assertTrue(native_xml_check(row, path)[0])
            recovery = {"recoveredBase": {"locator": row["schedule_j_locator"], "filer": 100000, "related": 0}}
            restored = recover_missing_base({**row, "base_nominal": None}, recovery, path)
            self.assertEqual(restored["base_nominal"], 100000)
            with self.assertRaises(ValueError):
                recover_missing_base({**row, "base_nominal": None, "cash_nominal": 130000}, recovery, path)
            for field, wrong in (("base_nominal", 20000), ("person_name", "Someone Else"), ("compensation_year", 2025),
                                 ("cash_nominal", 130000), ("tax_period_begin", "2025-01-01"), ("financial_year_end", 2024),
                                 ("revenue_nominal_usd", 900000), ("expenses_nominal_usd", 1000000), ("filing_employees", 0)):
                with self.subTest(field=field):
                    self.assertFalse(native_xml_check({**row, field: wrong}, path)[0])

    def test_recovered_filing_provenance_and_context_boundaries(self):
        rows = {r["id"]: r for r in self.expansion["observations"]}
        brookings = rows["new:Brookings:FY2025::ceciliarouse"]
        self.assertEqual(brookings["nominalSalary"]["base"], 977657)
        self.assertIsNone(brookings["expansionReview"]["baseRecovery"]["originalBaseNominal"])
        self.assertEqual(brookings["revenue"], 115659701)
        self.assertEqual(brookings["expenses"], 107734507)
        self.assertEqual(brookings["staff"], 603)
        self.assertEqual(brookings["expansionReview"]["taxPeriodEnd"], "2025-06-30")
        self.assertEqual(brookings["compensationYear"], 2024)
        self.assertEqual(brookings["positionTaxonomy"]["partViiLocator"], "Return/ReturnData/IRS990/Form990PartVIISectionAGrp[1]")
        cato = rows["v4:CATO:FY2025::petergoettler"]
        self.assertEqual((cato["revenue"], cato["expenses"], cato["staff"]), (62821387, 47370866, 317))
        self.assertTrue(all(rows[r["id"]]["revenue"] is None for r in self.expansion["observations"]
                            if r["id"].startswith("new:CGD:")))
        self.assertTrue(brookings["sourceUrl"].endswith("202601359349300310_public.xml"))
        foresight = rows["r6:FORE:2024::beatriceerkers"]
        self.assertEqual(foresight["nominalSalary"]["base"], 160721)
        secondary = self.sources[foresight["expansionReview"]["secondarySourceKey"]]
        self.assertTrue(secondary["url"].endswith("/IRS990ScheduleJ"))
        published = next(r for r in self.data["positionObservations"]["coo"] if r["id"] == foresight["id"])
        self.assertTrue((ROOT / published["secondaryCachedSource"]).is_file())
        self.assertEqual(published["secondarySourceUrl"], secondary["url"])


if __name__ == "__main__":
    unittest.main()
