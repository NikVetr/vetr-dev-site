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
            '<link rel="canonical" href="https://vetr.dev/ceo-salary-benchmark/">'
            "<title>Benchmark</title></head><body>"
            '<h1 id="app-title" aria-label="CEO salary benchmark">'
            '<span class="title-position-select"><span id="position-selected-label" '
            'aria-hidden="true">CEO</span><select id="position-select">'
            '<option value="ceo">CEO</option></select></span>'
            '<span aria-hidden="true"> salary benchmark</span></h1></body></html>\n'
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

        targets = ROUTES.build_routes(self.app_root, self.catalog)

        self.assertEqual(
            {path.name for path in targets},
            {"coo-salary-benchmark.html", "policy-director-salary-benchmark.html"},
        )
        self.assertEqual(
            {path.parent for path in targets},
            {self.app_root / ROUTES.ROUTE_SOURCE_DIRECTORY},
        )
        generated = (self.app_root / "position-routes/coo-salary-benchmark.html").read_text(
            encoding="utf-8"
        )
        self.assertTrue(
            generated.startswith(
                "---\npermalink: /coo-salary-benchmark/\nlayout: null\n---\n"
            )
        )
        self.assertIn('<base href="/ceo-salary-benchmark/">', generated)
        self.assertIn(
            '<link rel="canonical" href="https://vetr.dev/coo-salary-benchmark/">',
            generated,
        )
        self.assertEqual(generated.count('rel="canonical"'), 1)
        self.assertIn(ROUTES.GENERATED_MARKER, generated)
        self.assertIn("<title>COO Salary Benchmark · vetr.dev</title>", generated)
        self.assertIn('content="Interactive Rethink Priorities COO salary benchmark explorer"', generated)
        self.assertIn('<h1 id="app-title" aria-label="COO salary benchmark">', generated)
        self.assertIn('<span id="position-selected-label" aria-hidden="true">COO</span>', generated)
        self.assertEqual((self.app_root / "index.html").read_text(encoding="utf-8"), self.source_html)
        self.assertFalse((self.site_root / "finance-director-salary-benchmark").exists())
        self.assertFalse((self.site_root / "coo-salary-benchmark").exists())
        self.assertEqual(ROUTES.build_routes(self.app_root, self.catalog, check=True), targets)

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

    def test_removes_only_stale_generated_contained_routes(self) -> None:
        self.write_catalog(
            [{"position_key": "coo", "label": "COO", "support_level": "primary"}]
        )
        ROUTES.build_routes(self.app_root, self.catalog)
        stale = self.app_root / "position-routes/retired-salary-benchmark.html"
        stale.write_text(
            "---\npermalink: /retired-salary-benchmark/\n---\n" + ROUTES.GENERATED_MARKER,
            encoding="utf-8",
        )

        with self.assertRaisesRegex(RuntimeError, "Stale generated position route"):
            ROUTES.build_routes(self.app_root, self.catalog, check=True)

        ROUTES.build_routes(self.app_root, self.catalog)
        self.assertFalse(stale.exists())

    def test_refuses_to_overwrite_or_remove_non_generated_route_sources(self) -> None:
        self.write_catalog(
            [{"position_key": "coo", "label": "COO", "support_level": "primary"}]
        )
        routes_root = self.app_root / ROUTES.ROUTE_SOURCE_DIRECTORY
        routes_root.mkdir()
        expected = routes_root / "coo-salary-benchmark.html"
        expected.write_text("hand-authored", encoding="utf-8")

        with self.assertRaisesRegex(FileExistsError, "Refusing to overwrite"):
            ROUTES.build_routes(self.app_root, self.catalog)

        expected.unlink()
        extra = routes_root / "notes.html"
        extra.write_text("hand-authored", encoding="utf-8")
        with self.assertRaisesRegex(FileExistsError, "Refusing to remove"):
            ROUTES.build_routes(self.app_root, self.catalog)


if __name__ == "__main__":
    unittest.main()
