#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import struct
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

try:
    import zipfile64.zipfile as zipfile
except ImportError:  # pragma: no cover - requirements-source-archive.txt provides it
    import zipfile


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "deliverables/source_acquisition_manifest.csv"
LOG_PATH = ROOT / "analysis/source_completeness/fetch_log.jsonl"
INDEX_URL = "https://apps.irs.gov/pub/epostcard/990/xml/{year}/index_{year}.csv"
BULK_URL = "https://apps.irs.gov/pub/epostcard/990/xml/{year}/{batch}.zip"
USER_AGENT = (
    "Mozilla/5.0 (compatible; RP-CEO-Compensation-Research/1.0; "
    "+public-record archival; contact=research@example.invalid)"
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def digest_bytes(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def request_with_retries(
    session: requests.Session,
    method: str,
    url: str,
    *,
    timeout: int,
    retries: int,
    **kwargs,
) -> requests.Response:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            response = session.request(method, url, timeout=timeout, **kwargs)
            response.raise_for_status()
            return response
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(min(2 ** (attempt - 1), 8))
    assert last_error is not None
    raise last_error


class HTTPRangeReader(io.RawIOBase):
    """Seekable, read-only view of a remote file using HTTP Range requests."""

    def __init__(
        self,
        session: requests.Session,
        url: str,
        *,
        timeout: int,
        retries: int,
    ) -> None:
        self.session = session
        self.url = url
        self.timeout = timeout
        self.retries = retries
        response = request_with_retries(
            session, "HEAD", url, timeout=timeout, retries=retries, allow_redirects=True
        )
        self.resolved_url = str(response.url)
        self.response_headers = dict(response.headers)
        try:
            self.length = int(response.headers["Content-Length"])
        except (KeyError, ValueError) as exc:
            raise RuntimeError(f"Missing valid Content-Length for {url}") from exc
        if "bytes" not in response.headers.get("Accept-Ranges", "").lower():
            raise RuntimeError(f"Server does not advertise byte ranges for {url}")
        self.position = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.position

    def seek(self, offset: int, whence: int = os.SEEK_SET) -> int:
        if whence == os.SEEK_SET:
            position = offset
        elif whence == os.SEEK_CUR:
            position = self.position + offset
        elif whence == os.SEEK_END:
            position = self.length + offset
        else:
            raise ValueError(f"Unsupported whence: {whence}")
        if position < 0:
            raise ValueError("Negative seek position")
        self.position = min(position, self.length)
        return self.position

    def read(self, size: int = -1) -> bytes:
        if self.position >= self.length:
            return b""
        if size is None or size < 0:
            end = self.length - 1
        else:
            end = min(self.position + size - 1, self.length - 1)
        if end < self.position:
            return b""
        start = self.position
        response = request_with_retries(
            self.session,
            "GET",
            self.url,
            timeout=self.timeout,
            retries=self.retries,
            headers={"Range": f"bytes={start}-{end}"},
            allow_redirects=True,
        )
        if response.status_code != 206:
            raise RuntimeError(
                f"Expected HTTP 206 for {self.url} bytes {start}-{end}; "
                f"received {response.status_code}"
            )
        expected = end - start + 1
        if len(response.content) != expected:
            raise RuntimeError(
                f"Short range response for {self.url}: {len(response.content)} != {expected}"
            )
        self.position = end + 1
        return response.content


def download_index(
    session: requests.Session,
    year: str,
    cache_dir: Path,
    *,
    timeout: int,
    retries: int,
) -> tuple[Path, str]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"index_{year}.csv"
    url = INDEX_URL.format(year=year)
    if path.is_file() and path.stat().st_size > 1_000:
        return path, url
    response = request_with_retries(
        session, "GET", url, timeout=timeout, retries=retries, allow_redirects=True
    )
    part = path.with_suffix(".csv.part")
    part.write_bytes(response.content)
    part.replace(path)
    return path, url


def map_objects_to_batches(index_path: Path, wanted: set[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    with index_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"OBJECT_ID", "XML_BATCH_ID"}
        if not required.issubset(reader.fieldnames or []):
            raise RuntimeError(f"Index lacks {sorted(required)}: {index_path}")
        for row in reader:
            object_id = row["OBJECT_ID"].strip()
            if object_id not in wanted:
                continue
            batch = row["XML_BATCH_ID"].strip()
            if not batch:
                raise RuntimeError(f"Blank XML_BATCH_ID for {object_id}")
            if object_id in found and found[object_id] != batch:
                raise RuntimeError(f"Conflicting batches for {object_id}")
            found[object_id] = batch
    missing = wanted - found.keys()
    if missing:
        raise RuntimeError(
            f"IRS index {index_path.name} lacks {len(missing)} object IDs: "
            + ", ".join(sorted(missing)[:10])
        )
    return found


def discover_legacy_batches(
    session: requests.Session,
    year: str,
    wanted: set[str],
    *,
    timeout: int,
    retries: int,
) -> dict[str, str]:
    """Locate members in pre-2024 monthly archives whose indexes omit batch IDs."""
    found: dict[str, str] = {}
    for month in range(1, 13):
        batch = f"{year}_TEOS_XML_{month:02d}A"
        url = BULK_URL.format(year=year, batch=batch)
        remote = HTTPRangeReader(
            session, url, timeout=timeout, retries=retries
        )
        with zipfile.ZipFile(remote) as archive:
            basenames = {Path(name).name for name in archive.namelist()}
        for object_id in wanted - found.keys():
            if f"{object_id}_public.xml" in basenames:
                found[object_id] = batch
        if found.keys() >= wanted:
            break
    missing = wanted - found.keys()
    if missing:
        raise RuntimeError(
            f"IRS {year} monthly archives lack {len(missing)} object IDs: "
            + ", ".join(sorted(missing)[:10])
        )
    return found


def member_for_object(names: list[str], object_id: str) -> str:
    expected = f"{object_id}_public.xml"
    matches = [name for name in names if Path(name).name == expected]
    if not matches:
        matches = [
            name
            for name in names
            if object_id in Path(name).name and name.lower().endswith(".xml")
        ]
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected one member named {expected}; found {len(matches)}"
        )
    return matches[0]


def read_member(
    archive: zipfile.ZipFile, remote: HTTPRangeReader, member: str
) -> bytes:
    """Read ZIP members, including IRS archives compressed with Zstandard."""
    info = archive.getinfo(member)
    try:
        return archive.read(info)
    except NotImplementedError as exc:
        if info.compress_type not in {20, 93}:
            raise RuntimeError(
                f"Unsupported ZIP compression method {info.compress_type} for {member}"
            ) from exc
    remote.seek(info.header_offset)
    header = remote.read(30)
    if len(header) != 30 or header[:4] != b"PK\x03\x04":
        raise RuntimeError(f"Invalid local ZIP header for {member}")
    fields = struct.unpack("<4s5H3I2H", header)
    filename_length = fields[-2]
    extra_length = fields[-1]
    remote.seek(info.header_offset + 30 + filename_length + extra_length)
    compressed = remote.read(info.compress_size)
    if len(compressed) != info.compress_size:
        raise RuntimeError(f"Short compressed member for {member}")
    try:
        import zstandard
    except ImportError as exc:
        raise RuntimeError(
            "zstandard is required for IRS ZIP compression methods 20/93"
        ) from exc
    body = zstandard.ZstdDecompressor().decompress(
        compressed, max_output_size=info.file_size
    )
    if len(body) != info.file_size:
        raise RuntimeError(f"Unexpected uncompressed size for {member}")
    return body


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Retrieve selected official IRS XML returns from TEOS bulk ZIPs."
    )
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument(
        "--index-cache",
        type=Path,
        default=Path("/tmp/rp-ceo-benchmark-irs-indexes"),
    )
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    manifest = pd.read_csv(MANIFEST_PATH, dtype=str).fillna("")
    filing_indices = [
        idx
        for idx, row in manifest.iterrows()
        if row.evidence_stream == "form990"
        and row.required_for_source_complete_release == "yes"
        and (
            args.overwrite
            or not row.current_local_path
            or not (ROOT / row.current_local_path).is_file()
        )
    ]
    if args.limit:
        filing_indices = filing_indices[: args.limit]
    if not filing_indices:
        print("No Form 990 XML files require retrieval.")
        return 0

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "*/*"})
    rows_by_year: dict[str, list[int]] = defaultdict(list)
    for idx in filing_indices:
        object_id = manifest.at[idx, "irs_object_id"]
        if len(object_id) < 4 or not object_id[:4].isdigit():
            raise RuntimeError(f"Invalid IRS object ID: {object_id!r}")
        rows_by_year[object_id[:4]].append(idx)

    batch_by_index: dict[int, tuple[str, str, str]] = {}
    for year, indices in sorted(rows_by_year.items()):
        index_path, index_url = download_index(
            session,
            year,
            args.index_cache,
            timeout=args.timeout,
            retries=args.retries,
        )
        wanted = {manifest.at[idx, "irs_object_id"] for idx in indices}
        with index_path.open("r", encoding="utf-8-sig", newline="") as handle:
            fieldnames = csv.DictReader(handle).fieldnames or []
        if "XML_BATCH_ID" in fieldnames:
            object_batches = map_objects_to_batches(index_path, wanted)
        else:
            object_batches = discover_legacy_batches(
                session,
                year,
                wanted,
                timeout=args.timeout,
                retries=args.retries,
            )
        # The current 2026 IRS index labels overflow members as 05A even when
        # they are physically stored in the separately published 05B archive.
        if year == "2026" and any(
            batch == "2026_TEOS_XML_05A" for batch in object_batches.values()
        ):
            overflow_batch = "2026_TEOS_XML_05B"
            overflow_url = BULK_URL.format(year=year, batch=overflow_batch)
            overflow_remote = HTTPRangeReader(
                session,
                overflow_url,
                timeout=args.timeout,
                retries=args.retries,
            )
            with zipfile.ZipFile(overflow_remote) as overflow_archive:
                overflow_names = {
                    Path(name).name for name in overflow_archive.namelist()
                }
            for object_id, batch in list(object_batches.items()):
                if (
                    batch == "2026_TEOS_XML_05A"
                    and f"{object_id}_public.xml" in overflow_names
                ):
                    object_batches[object_id] = overflow_batch
        for idx in indices:
            object_id = manifest.at[idx, "irs_object_id"]
            batch_by_index[idx] = (year, object_batches[object_id], index_url)

    indices_by_archive: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for idx, archive_key in batch_by_index.items():
        indices_by_archive[archive_key].append(idx)

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    failures = 0
    completed = 0
    with LOG_PATH.open("a", encoding="utf-8") as log:
        for archive_number, ((year, batch, index_url), indices) in enumerate(
            sorted(indices_by_archive.items()), 1
        ):
            bulk_url = BULK_URL.format(year=year, batch=batch)
            print(
                f"[{archive_number}/{len(indices_by_archive)}] {batch}: "
                f"{len(indices)} selected return(s)",
                flush=True,
            )
            try:
                remote = HTTPRangeReader(
                    session,
                    bulk_url,
                    timeout=args.timeout,
                    retries=args.retries,
                )
                with zipfile.ZipFile(remote) as archive:
                    names = archive.namelist()
                    # Process present members before any stale IRS-index entries so
                    # a single missing member does not prevent the rest of a batch.
                    indices = sorted(
                        indices,
                        key=lambda idx: not any(
                            manifest.at[idx, "irs_object_id"] in Path(name).name
                            and name.lower().endswith(".xml")
                            for name in names
                        ),
                    )
                    for idx in indices:
                        row = manifest.loc[idx]
                        object_id = row.irs_object_id
                        member = member_for_object(names, object_id)
                        body = read_member(archive, remote, member)
                        minimum = int(float(row.minimum_bytes or 1))
                        if len(body) < minimum:
                            raise RuntimeError(
                                f"{member} is too small: {len(body)} < {minimum}"
                            )
                        destination = ROOT / row.expected_local_path
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        part = destination.with_suffix(destination.suffix + ".part")
                        part.write_bytes(body)
                        part.replace(destination)
                        digest = digest_bytes(body)
                        metadata = {
                            "source_id": row.source_id,
                            "requested_url": row.canonical_url,
                            "resolved_url": remote.resolved_url,
                            "retrieval_timestamp_utc": now_iso(),
                            "http_status": 206,
                            "content_type": "application/xml",
                            "byte_length": len(body),
                            "sha256": digest,
                            "local_path": str(destination.relative_to(ROOT)),
                            "provenance": "official IRS TEOS bulk XML archive",
                            "irs_index_url": index_url,
                            "irs_bulk_archive_url": remote.resolved_url,
                            "irs_bulk_archive_member": member,
                            "archive_response_headers": remote.response_headers,
                        }
                        metadata_path = destination.with_suffix(
                            destination.suffix + ".metadata.json"
                        )
                        metadata_path.write_text(
                            json.dumps(metadata, indent=2, sort_keys=True) + "\n",
                            encoding="utf-8",
                        )
                        manifest.at[idx, "current_status"] = (
                            "present_downloaded_unvalidated"
                        )
                        manifest.at[idx, "current_local_path"] = str(
                            destination.relative_to(ROOT)
                        )
                        manifest.at[idx, "current_sha256"] = digest
                        manifest.at[idx, "current_byte_length"] = str(len(body))
                        manifest.at[idx, "last_attempt_timestamp"] = metadata[
                            "retrieval_timestamp_utc"
                        ]
                        manifest.at[idx, "last_attempt_result"] = (
                            f"extracted {member} from {remote.resolved_url}"
                        )
                        log.write(json.dumps(metadata, sort_keys=True) + "\n")
                        log.flush()
                        completed += 1
                        print(f"  {object_id}: {len(body):,} bytes", flush=True)
            except Exception as exc:
                failures += len(indices)
                timestamp = now_iso()
                error = f"{type(exc).__name__}: {exc}"
                print(f"  FAILED: {error}", flush=True)
                for idx in indices:
                    manifest.at[idx, "current_status"] = "download_failed"
                    manifest.at[idx, "last_attempt_timestamp"] = timestamp
                    manifest.at[idx, "last_attempt_result"] = error
                    log.write(
                        json.dumps(
                            {
                                "source_id": manifest.at[idx, "source_id"],
                                "retrieval_timestamp_utc": timestamp,
                                "error": error,
                                "irs_bulk_archive_url": bulk_url,
                            },
                            sort_keys=True,
                        )
                        + "\n"
                    )
                log.flush()
            manifest.to_csv(MANIFEST_PATH, index=False)

    print(f"downloaded={completed} failed={failures} attempted={len(filing_indices)}")
    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
