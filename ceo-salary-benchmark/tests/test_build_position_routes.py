import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts/build_position_routes.py"
SPEC = importlib.util.spec_from_file_location("build_position_routes", SCRIPT_PATH)
assert SPEC and SPEC.loader
ROUTES = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ROUTES
SPEC.loader.exec_module(ROUTES)


class PositionRouteBuildTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.site_root = Path(self.temp_dir.name)
        self.app_root = self.site_root / "ceo-salary-benchmark"
        self.app_root.mkdir()
        self.source_html = (
            "<!doctype html>\n"
            '<html><head><meta id="app-description" name="description" content="CEO benchmark">'
            "<title>Benchmark</title></head><body>"
            '<h1 id="app-title">CEO salary benchmark</h1></body></html>\n'
        )
        (self.app_root / "index.html").write_text(self.source_html, encoding="utf-8")
        self.catalog = self.app_root / "catalog.csv"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def write_catalog(self, rows: list[dict[str, str]]) -> None:
        fieldnames = ["position_key", "label", "page_label", "support_level", "route_slug"]
        with self.catalog.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    def test_generates_primary_siblings_only(self) -> None:
        self.write_catalog(
            [
                {"position_key": "coo", "label": "COO", "support_level": "primary"},
                {
                    "position_key": "policy_director",
                    "label": "Policy Director",
                    "support_level": "Primary",
                },
                {
                    "position_key": "finance_director",
                    "label": "Finance Director",
                    "support_level": "exploratory",
                },
            ]
        )

        targets = ROUTES.build_routes(self.app_root, self.site_root, self.catalog)

        self.assertEqual(
            {path.parent.name for path in targets},
            {"coo-salary-benchmark", "policy-director-salary-benchmark"},
        )
        generated = (self.site_root / "coo-salary-benchmark/index.html").read_text(
            encoding="utf-8"
        )
        self.assertIn('<base href="/ceo-salary-benchmark/">', generated)
        self.assertIn(ROUTES.GENERATED_MARKER, generated)
        self.assertIn("<title>COO Salary Benchmark · vetr.dev</title>", generated)
        self.assertIn('content="Interactive Rethink Priorities COO salary benchmark explorer"', generated)
        self.assertIn('<h1 id="app-title">COO salary benchmark</h1>', generated)
        self.assertEqual((self.app_root / "index.html").read_text(encoding="utf-8"), self.source_html)
        self.assertFalse((self.site_root / "finance-director-salary-benchmark").exists())

    def test_rejects_duplicate_slugs_even_when_one_position_is_not_public(self) -> None:
        self.write_catalog(
            [
                {
                    "position_key": "coo",
                    "label": "COO",
                    "support_level": "primary",
                    "route_slug": "operations",
                },
                {
                    "position_key": "finance_director",
                    "label": "Finance",
                    "support_level": "exploratory",
                    "route_slug": "operations",
                },
            ]
        )

        with self.assertRaisesRegex(ValueError, "Duplicate route slug"):
            ROUTES.load_public_routes(self.catalog)

    def test_rejects_invalid_slug(self) -> None:
        self.write_catalog(
            [
                {
                    "position_key": "coo",
                    "label": "COO",
                    "support_level": "primary",
                    "route_slug": "COO salary",
                },
            ]
        )

        with self.assertRaisesRegex(ValueError, "invalid route slug"):
            ROUTES.load_public_routes(self.catalog)


if __name__ == "__main__":
    unittest.main()
