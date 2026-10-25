import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DECISION_DIR = ROOT / "benchmark/analysis/decision_ranges"


class DecisionRangesTest(unittest.TestCase):
    def test_committed_ranges_match_current_app_data(self):
        committed = json.loads((DECISION_DIR / "decision_ranges.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(
                [sys.executable, str(DECISION_DIR / "compute_decision_ranges.py"), "--output-dir", directory],
                check=True, capture_output=True,
            )
            current = json.loads((Path(directory) / "decision_ranges.json").read_text(encoding="utf-8"))
        self.assertEqual(committed["computed"], current["computed"], "Rerun compute_decision_ranges.py after rebuilding app data")
        self.assertEqual(committed["views"], current["views"])

    def test_ranges_bracket_their_centers(self):
        computed = json.loads((DECISION_DIR / "decision_ranges.json").read_text(encoding="utf-8"))["computed"]
        for key in ("incumbent_base", "recurring_total", "external_posting"):
            self.assertLessEqual(computed[key]["low"], computed[key]["center"], key)
            self.assertLessEqual(computed[key]["center"], computed[key]["high"], key)


if __name__ == "__main__":
    unittest.main()
