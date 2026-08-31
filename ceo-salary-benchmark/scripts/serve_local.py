#!/usr/bin/env python3
"""Serve the site locally while resolving contained Jekyll permalink pages."""

from __future__ import annotations

import argparse
import io
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


APP_ROOT = Path(__file__).resolve().parents[1]
SITE_ROOT = APP_ROOT.parent
ROUTES_ROOT = APP_ROOT / "position-routes"
ROUTE_PATH_PATTERN = re.compile(
    r"^/(?P<route>[a-z0-9]+(?:-[a-z0-9]+)*-salary-benchmark)(?:/index\.html|/)?$"
)
FRONT_MATTER_PATTERN = re.compile(br"\A---\r?\n.*?\r?\n---\r?\n", re.DOTALL)


def route_source_for_path(path: str, routes_root: Path = ROUTES_ROOT) -> Path | None:
    """Resolve a public semantic route to its contained Jekyll source page."""
    request_path = unquote(urlsplit(path).path)
    match = ROUTE_PATH_PATTERN.fullmatch(request_path)
    if not match:
        return None
    candidate = routes_root / f"{match.group('route')}.html"
    return candidate if candidate.is_file() else None


def rendered_route_bytes(source: Path) -> bytes:
    """Strip Jekyll front matter for the dependency-free local server."""
    content = source.read_bytes()
    match = FRONT_MATTER_PATTERN.match(content)
    if not match:
        raise ValueError(f"Generated route is missing Jekyll front matter: {source}")
    return content[match.end() :]


class BenchmarkRequestHandler(SimpleHTTPRequestHandler):
    """Serve normal files plus semantic routes generated inside the app tree."""

    def send_head(self):  # type: ignore[override]
        route_source = route_source_for_path(self.path)
        if route_source is None:
            return super().send_head()

        try:
            content = rendered_route_bytes(route_source)
        except (OSError, ValueError) as error:
            self.send_error(500, str(error))
            return None

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Last-Modified", self.date_time_string(route_source.stat().st_mtime))
        self.end_headers()
        return io.BytesIO(content)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    handler = partial(BenchmarkRequestHandler, directory=str(SITE_ROOT))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Serving {SITE_ROOT} on http://{args.bind}:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
