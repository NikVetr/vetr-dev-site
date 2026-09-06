import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from other_employee_pay import attach_highest_paid_other_employee, MEASURES


class OtherEmployeePayTest(unittest.TestCase):
    def attach(self, specifications):
        candidates = []
        for name, base, hours, related_hours, status in specifications:
            row = dict(source_id="test", person_key=name.lower(), person_name=name,
                       effective_person_name=name, native_title=name, effective_title=name,
                       benchmark_position="", role_scope="organization_wide" if name == "CEO" else "functional",
                       compensation_year_role_status=status, former_officer_director_trustee="no",
                       default_hours_eligible="yes" if hours + related_hours >= 30 else "no",
                       average_hours_per_week=hours, average_hours_related_orgs=related_hours,
                       part_vii_org_nominal=base, part_vii_related_nominal=0,
                       total_reported_hours=hours + related_hours, observation_id="test::" + name.lower())
            for nominal, adjusted in MEASURES.values():
                row[nominal] = base
                row[adjusted] = base * 1.1
            candidates.append(row)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "positions.csv"
            with path.open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=candidates[0])
                writer.writeheader()
                writer.writerows(candidates)
            row = dict(sourceId="test", executive="CEO", id="test")
            attach_highest_paid_other_employee([row], path)
            return row

    def test_standardize_before_ranking_and_keep_reported_amount(self):
        row = self.attach([("CEO", 300, 40, 0, "verified_full_year"),
                           ("A", 120, 40, 0, "verified_full_year"),
                           ("B", 100, 30, 0, "verified_full_year")])
        self.assertEqual(row["highestPaidOtherEmployee"]["base"]["person"], "A")
        other = row["highestPaidOtherEmployee40h"]["base"]
        self.assertEqual(other["person"], "B")
        self.assertEqual(other["reportedNominal"], 100)
        self.assertAlmostEqual(other["nominal"], 100 * 40 / 30)
        self.assertAlmostEqual(other["adjusted"], 110 * 40 / 30)

    def test_combined_hours_and_part_year_exclusion(self):
        row = self.attach([("CEO", 300, 40, 0, "verified_full_year"),
                           ("A", 120, 32, 8, "verified_full_year"),
                           ("B", 500, 40, 0, "partial_year")])
        self.assertEqual(row["highestPaidOtherEmployee40h"]["base"]["nominal"], 120)

    def test_reliable_part_time_role_is_standardized(self):
        row = self.attach([("CEO", 300, 40, 0, "verified_full_year"),
                           ("A", 80, 20, 0, "verified_full_year")])
        self.assertEqual(row["highestPaidOtherEmployee40h"]["base"]["nominal"], 160)

    def test_literal_equivalent_scales_reported_overtime_down(self):
        row = self.attach([("CEO", 300, 40, 0, "verified_full_year"),
                           ("A", 120, 50, 0, "verified_full_year")])
        self.assertEqual(row["highestPaidOtherEmployee40h"]["base"]["nominal"], 96)

    def test_orcid_sources_and_disclosure_limit(self):
        raw = (ROOT / "app-data.js").read_text().split(" = ", 1)[1].strip().removesuffix(";")
        data = json.loads(raw)
        row = next(row for row in data["incumbents"] if row["organization"] == "ORCID")
        attach_highest_paid_other_employee([row])
        other = row["highestPaidOtherEmployee40h"]["base"]
        self.assertEqual(other["weeklyHours"], 30)
        self.assertEqual(other["reportedNominal"], 98827)
        self.assertAlmostEqual(other["nominal"], 131769.33333333333)
        self.assertFalse(row["otherPayDisclosure"]["maximumBaseIdentifiedAmongDisclosures"])


if __name__ == "__main__":
    unittest.main()
