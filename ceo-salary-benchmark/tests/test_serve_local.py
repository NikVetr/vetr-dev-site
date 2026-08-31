import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts/serve_local.py"
SPEC = importlib.util.spec_from_file_location("serve_local", SCRIPT_PATH)
assert SPEC and SPEC.loader
SERVER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SERVER
SPEC.loader.exec_module(SERVER)


class LocalServerRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.routes_root = Path(self.temp_dir.name)
        self.route = self.routes_root / "coo-salary-benchmark.html"
        self.route.write_text(
            "---\n"
            "permalink: /coo-salary-benchmark/\n"
            "layout: null\n"
            "---\n"
            "<!doctype html><title>COO benchmark</title>\n",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_resolves_semantic_route_variants_and_ignores_query(self) -> None:
        for path in (
            "/coo-salary-benchmark",
            "/coo-salary-benchmark/",
            "/coo-salary-benchmark/index.html",
            "/coo-salary-benchmark/?s=encoded",
        ):
            with self.subTest(path=path):
                self.assertEqual(
                    SERVER.route_source_for_path(path, self.routes_root),
                    self.route,
                )

        self.assertIsNone(SERVER.route_source_for_path("/ceo-salary-benchmark/app.js", self.routes_root))
        self.assertIsNone(SERVER.route_source_for_path("/unknown-salary-benchmark/", self.routes_root))

    def test_strips_front_matter_without_modifying_html(self) -> None:
        self.assertEqual(
            SERVER.rendered_route_bytes(self.route),
            b"<!doctype html><title>COO benchmark</title>\n",
        )

    def test_rejects_route_without_front_matter(self) -> None:
        self.route.write_text("<!doctype html>", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "missing Jekyll front matter"):
            SERVER.rendered_route_bytes(self.route)


if __name__ == "__main__":
    unittest.main()
