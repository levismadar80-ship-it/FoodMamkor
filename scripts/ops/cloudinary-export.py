#!/usr/bin/env python3
"""
Module:   cloudinary-export
Purpose:  Get every ORIGINAL asset out of the Cloudinary account, with a
          manifest that makes the pile restorable. For the "export before
          the quota situation resolves itself badly" case, not routine sync.
Touches:  Cloudinary Admin API (read-only: GET /resources/<type>) and the
          CDN for the media bytes. Writes only under --out. No DB, no network
          egress anywhere else.
Does NOT: delete anything (on Cloudinary or disk) · upload anywhere — restore
          is docs/runbooks/MEDIA-RESTORE.md · read the database, so it cannot
          say which producer references which asset · pull DERIVED resources.
Related:  docs/runbooks/MEDIA-RESTORE.md (the three restore paths);
          scripts/backup_production_db.py (house style + the independent
          failure-modes reasoning this follows); backend/app/config.py:46-48
          (the three env vars, reused verbatim — none are new).
History:  MEH-1976 (creation; part 3, the frontend fallback, shipped in #2757).

MEH-1976 — Cloudinary media export (originals only, resumable, rate-limited).

Usage:
  python scripts/ops/cloudinary-export.py --dry-run --out ./media-export
  python scripts/ops/cloudinary-export.py --out ./media-export
  python scripts/ops/cloudinary-export.py --self-test

Required env (ALREADY SET — these are the same three the app reads at
backend/app/config.py:46-48; this script introduces NO new variables):
  CLOUDINARY_CLOUD_NAME
  CLOUDINARY_API_KEY
  CLOUDINARY_API_SECRET

Exit codes — keep stable, they get grepped:
  0 — export complete (or dry-run produced a full plan)
  1 — one or more downloads failed after retries (manifest still written)
  2 — Admin API listing failed
  3 — config error (missing env var, unwritable --out)

WHY THIS IS SHAPED THE WAY IT IS
--------------------------------
Measured against the live account on 2026-08-11:

    credits    111.4 / 25   ->  445.6% of plan
    bandwidth  119 GB  = 110.92 credits   <- 99.6% of the overage
    storage    301 MB  =   0.28 credits
    resources  113  (109 image + 4 video)
    derived    198

**The overage is bandwidth, and downloading is bandwidth.** That is the
central design constraint and the reason for every throttle below. The full
pull is ~301 MB against 119 GB already spent — 0.25%, negligible in
absolute terms — but the account is already 4.5x over, so this script
refuses to be careless about the one metric that is actually blown.

Consequences, each of which shows up as a flag or a default:

  * ORIGINALS ONLY. The account carries 198 derived resources against 113
    originals. Derived assets are regenerable from the originals by
    definition, so pulling them would roughly double the bandwidth for
    zero recovery value. We request the plain `secure_url` and never a
    transformation URL.
  * RATE LIMITED, default 2 requests/sec with a hard floor. Cloudinary's
    Admin API allows far more; the limit here is about bandwidth pacing
    and about not tripping any protective throttle while the account is
    over quota.
  * RESUMABLE, with the DISK as the authority — not the manifest. A file
    present at the byte count Cloudinary reports is skipped, whether or not
    a manifest exists. That distinction is the whole feature: the manifest
    is written once, at the END of a run, so an interrupted FIRST run leaves
    none, and a manifest-keyed resume would re-pull everything it had just
    fetched. The manifest is a checksum cache, nothing more.
  * IDEMPOTENT. Re-running against a complete export downloads nothing and
    rewrites an identical manifest.

WHAT THIS SCRIPT DOES NOT DO
----------------------------
  * It does not delete anything, on Cloudinary or on disk.
  * It does not touch the database, so it cannot tell you which producer
    references which asset. The manifest is media-only; joining it to
    producer records needs an authed data read this script has no business
    doing.
  * It does not upload anywhere. Where the export goes afterwards is
    docs/runbooks/MEDIA-RESTORE.md's problem.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterator

EXIT_OK = 0
EXIT_DOWNLOAD_FAILED = 1
EXIT_LIST_FAILED = 2
EXIT_CONFIG_ERROR = 3

API_BASE = "https://api.cloudinary.com/v1_1"
RESOURCE_TYPES = ("image", "video", "raw")
PAGE_SIZE = 100
DEFAULT_RPS = 2.0
DOWNLOAD_RETRIES = 3
MANIFEST_NAME = "manifest.json"
MANIFEST_VERSION = 1


# ---------------------------------------------------------------- utilities


class RateLimiter:
    """Wall-clock spacing between calls. Deliberately dumb — a token bucket
    would allow bursts, and a burst is exactly what we are avoiding."""

    def __init__(self, rps: float) -> None:
        self.min_interval = 1.0 / rps if rps > 0 else 0.0
        self._last = 0.0

    def wait(self) -> None:
        if self.min_interval <= 0:
            return
        elapsed = time.monotonic() - self._last
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last = time.monotonic()


def _log(msg: str) -> None:
    print(msg, flush=True)


def write_manifest_atomically(path: Path, payload: dict[str, Any]) -> None:
    """Serialise, write to a sibling .tmp, then rename.

    A torn manifest is not a cosmetic problem: the resume path keys off it, so a
    half-written file makes the next run treat every asset as un-fetched and
    re-download the whole library — on an account whose overage is bandwidth.
    Same tmp-then-rename shape `download()` uses for its .part files.
    """
    # `path.parent / (name + ext)` rather than with_suffix(): appending to an
    # existing suffix means a multi-dot argument, whose handling has shifted
    # across Python versions. This form has no version dependency.
    tmp = path.parent / (path.name + ".tmp")
    # encoding is explicit because ensure_ascii=False emits real non-ASCII
    # bytes, and the runbook has this running from Git Bash on Windows where
    # the platform default is not UTF-8. Locale-dependent I/O here would
    # corrupt any non-Latin public_id.
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _auth_header(api_key: str, api_secret: str) -> str:
    raw = f"{api_key}:{api_secret}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def is_derived(resource: dict[str, Any]) -> bool:
    """True when the resource is NOT an original upload.

    Cloudinary marks originals with type 'upload' (and 'authenticated' /
    'private' for restricted originals). Anything else — 'fetch', 'facebook',
    'twitter', and friends — is a remote-sourced or generated variant we do
    not own and should not spend bandwidth on. A resource carrying a
    `derived_resource_id` is a transformation of another asset, never an
    original.
    """
    if resource.get("derived_resource_id"):
        return True
    return resource.get("type") not in ("upload", "authenticated", "private")


def manifest_entry(resource: dict[str, Any], rel_path: str) -> dict[str, Any]:
    """One manifest row. Checksum is filled in after download; `null` here
    means 'not fetched yet', which is what makes resume decidable."""
    return {
        "public_id": resource.get("public_id"),
        "resource_type": resource.get("resource_type"),
        "type": resource.get("type"),
        "format": resource.get("format"),
        "url": resource.get("secure_url") or resource.get("url"),
        "bytes": resource.get("bytes"),
        "created_at": resource.get("created_at"),
        "version": resource.get("version"),
        "etag": resource.get("etag"),
        "path": rel_path,
        "checksum_sha256": None,
        "downloaded": False,
    }


def local_path_for(resource: dict[str, Any]) -> str:
    """Mirror Cloudinary's public_id as a directory path, with the format as
    the extension. public_id already encodes folders ('mehamakor/avatars/x')."""
    public_id = str(resource.get("public_id") or "unknown")
    fmt = resource.get("format")
    rtype = str(resource.get("resource_type") or "image")
    # Guard against a public_id trying to escape the output directory.
    parts = [p for p in public_id.split("/") if p not in ("", ".", "..")]
    if not parts:
        parts = ["unknown"]
    name = "/".join(parts)
    return f"{rtype}/{name}.{fmt}" if fmt else f"{rtype}/{name}"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


# ------------------------------------------------------------------ listing


def list_resources(
    cloud: str, auth: str, limiter: RateLimiter, resource_type: str
) -> Iterator[dict[str, Any]]:
    """Paginate GET /resources/<type>. Yields raw resource dicts."""
    cursor: str | None = None
    while True:
        limiter.wait()
        params = f"max_results={PAGE_SIZE}"
        if cursor:
            params += f"&next_cursor={cursor}"
        url = f"{API_BASE}/{cloud}/resources/{resource_type}?{params}"
        req = urllib.request.Request(url, headers={"Authorization": auth})
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
        for res in payload.get("resources", []):
            yield res
        cursor = payload.get("next_cursor")
        if not cursor:
            return


# ----------------------------------------------------------------- download


def download(url: str, dest: Path, limiter: RateLimiter) -> tuple[bool, str]:
    """Fetch to a .part file then rename. A half-written file must never be
    mistaken for a complete one on the next resume — that is the whole point
    of the temp name."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.parent / (dest.name + ".part")
    last_err = ""
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        limiter.wait()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mehamakor-export/1"})
            with urllib.request.urlopen(req, timeout=120) as resp, tmp.open("wb") as out:
                while True:
                    chunk = resp.read(1024 * 256)
                    if not chunk:
                        break
                    out.write(chunk)
            tmp.replace(dest)
            return True, ""
        except (urllib.error.URLError, OSError) as exc:
            last_err = f"{type(exc).__name__}: {exc}"
            if tmp.exists():
                tmp.unlink()
            if attempt < DOWNLOAD_RETRIES:
                time.sleep(2**attempt)
    return False, last_err


# --------------------------------------------------------------- self-test


def _self_test() -> int:
    """Validate the two decision functions against inputs whose answers are
    known in advance — including one lifted verbatim from the real account,
    because synthetic fixtures only prove the probe works on shapes I
    invented (.claude/rules/testing.md).
    """
    failures: list[str] = []

    def check(name: str, got: Any, want: Any) -> None:
        if got != want:
            failures.append(f"  {name}: got {got!r}, want {want!r}")

    # --- REAL case, copied from the live Admin API response 2026-08-11.
    # This is the anchor: it proves the classifier recognises the shape the
    # account actually returns, not just the shape I imagined.
    real = {
        "asset_id": "4967a49185b6b5ddfd1c09affda9d6f9",
        "public_id": "mehamakor/79cd766d534f4d3e96c8d8e8cb49441a",
        "format": "png",
        "version": 1783153683,
        "resource_type": "image",
        "type": "upload",
        "bytes": 20809,
        "secure_url": (
            "https://res.cloudinary.com/dfzpscjks/image/upload/"
            "v1783153683/mehamakor/79cd766d534f4d3e96c8d8e8cb49441a.png"
        ),
        "etag": "2681cfcadc779dcec5f6bab5334ae6a9",
    }
    check("real/is_derived", is_derived(real), False)
    check(
        "real/local_path",
        local_path_for(real),
        "image/mehamakor/79cd766d534f4d3e96c8d8e8cb49441a.png",
    )
    entry = manifest_entry(real, local_path_for(real))
    check("real/manifest.bytes", entry["bytes"], 20809)
    check("real/manifest.checksum_is_null", entry["checksum_sha256"], None)
    check("real/manifest.downloaded", entry["downloaded"], False)

    # --- REAL case 2: a video from the account (samples/*, Cloudinary's own
    # demo content). Still an original by type, so it must NOT be filtered —
    # deciding whether to keep it is Sapir's, not this script's.
    real_video = {
        "public_id": "samples/sea-turtle",
        "format": "mp4",
        "resource_type": "video",
        "type": "upload",
        "bytes": 27932506,
    }
    check("real_video/is_derived", is_derived(real_video), False)
    check("real_video/local_path", local_path_for(real_video), "video/samples/sea-turtle.mp4")

    # --- Synthetic edges. These cover shapes the real corpus does not
    # currently contain, which is the legitimate use for a fixture.
    check("derived/by_id", is_derived({"type": "upload", "derived_resource_id": "d1"}), True)
    check("derived/by_type_fetch", is_derived({"type": "fetch"}), True)
    check("original/authenticated", is_derived({"type": "authenticated"}), False)
    check("original/private", is_derived({"type": "private"}), False)
    check("missing_type", is_derived({}), True)

    # Path traversal must not escape --out.
    check(
        "traversal",
        local_path_for({"public_id": "../../etc/passwd", "format": "png", "resource_type": "image"}),
        "image/etc/passwd.png",
    )
    check(
        "no_format",
        local_path_for({"public_id": "raw/thing", "resource_type": "raw"}),
        "raw/raw/thing",
    )

    # Rate limiter actually spaces calls. Asserted, not assumed.
    limiter = RateLimiter(rps=20.0)
    t0 = time.monotonic()
    for _ in range(3):
        limiter.wait()
    elapsed = time.monotonic() - t0
    # 3 calls at 20 rps = 2 enforced gaps of 50 ms. Assert the floor the maths
    # actually gives, and state the same number in the message — a threshold and
    # a description that disagree is a check nobody can act on.
    MIN_ELAPSED = 0.09
    if elapsed < MIN_ELAPSED:
        failures.append(
            f"  ratelimit: 3 calls at 20rps took {elapsed:.3f}s, expected >={MIN_ELAPSED:.2f}s"
        )

    if failures:
        _log("SELF-TEST FAILED:")
        for f in failures:
            _log(f)
        return 1
    _log("self-test OK — 14 assertions, 7 of them against real account data")
    return EXIT_OK


# --------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description="Export Cloudinary originals + manifest.")
    ap.add_argument("--out", default="./media-export", help="output directory")
    ap.add_argument("--dry-run", action="store_true", help="list and plan; download nothing")
    ap.add_argument("--rps", type=float, default=DEFAULT_RPS, help=f"requests/sec (default {DEFAULT_RPS})")
    ap.add_argument("--self-test", action="store_true", help="validate the classifiers and exit")
    ap.add_argument(
        "--fixture",
        help="read the listing from a JSON file instead of the Admin API. "
        "Requires --dry-run: a fixture names assets but cannot authorise downloading them.",
    )
    args = ap.parse_args()

    if args.self_test:
        return _self_test()

    if args.fixture and not args.dry_run:
        _log("config error: --fixture requires --dry-run (a fixture cannot authorise real downloads)")
        return EXIT_CONFIG_ERROR

    cloud = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    key = os.environ.get("CLOUDINARY_API_KEY", "")
    secret = os.environ.get("CLOUDINARY_API_SECRET", "")
    if not args.fixture and not (cloud and key and secret):
        _log("config error: CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET must all be set")
        return EXIT_CONFIG_ERROR

    out = Path(args.out)
    try:
        out.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        _log(f"config error: cannot create --out {out}: {exc}")
        return EXIT_CONFIG_ERROR

    auth = _auth_header(key, secret) if not args.fixture else ""
    limiter = RateLimiter(args.rps)
    manifest_path = out / MANIFEST_NAME

    prior: dict[str, dict[str, Any]] = {}
    if manifest_path.exists():
        try:
            prior = {
                e["public_id"]: e
                for e in json.loads(manifest_path.read_text(encoding="utf-8"))["assets"]
            }
            _log(f"resuming — prior manifest has {len(prior)} entries")
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            _log(f"warning: prior manifest unreadable ({exc}); starting fresh")

    entries: list[dict[str, Any]] = []
    skipped_derived = 0
    try:
        if args.fixture:
            fixture = json.loads(Path(args.fixture).read_text())
            _log(f"fixture mode — listing read from {args.fixture} (captured {fixture.get('captured_at', '?')})")
            source: Iterator[dict[str, Any]] = iter(fixture["resources"])
        else:
            source = (
                res for rtype in RESOURCE_TYPES for res in list_resources(cloud, auth, limiter, rtype)
            )
        for res in source:
            if is_derived(res):
                skipped_derived += 1
                continue
            entries.append(manifest_entry(res, local_path_for(res)))
    except (urllib.error.URLError, OSError, json.JSONDecodeError, KeyError) as exc:
        _log(f"listing failed: {type(exc).__name__}: {exc}")
        return EXIT_LIST_FAILED

    total_bytes = sum(e["bytes"] or 0 for e in entries)
    _log(f"originals: {len(entries)}  ·  skipped as derived/non-original: {skipped_derived}")
    _log(f"total bytes: {total_bytes:,} ({total_bytes / 1_048_576:.1f} MiB)")

    if args.dry_run:
        for e in entries:
            _log(f"  PLAN {e['bytes'] or 0:>10,}  {e['path']}")
        write_manifest_atomically(
            manifest_path,
            {"version": MANIFEST_VERSION, "dry_run": True, "count": len(entries), "total_bytes": total_bytes, "assets": entries},
        )
        _log(f"dry-run — nothing downloaded. Plan written to {manifest_path}")
        return EXIT_OK

    failed = 0
    for i, e in enumerate(entries, 1):
        dest = out / e["path"]
        was = prior.get(e["public_id"])
        # The DISK is the authority for "already fetched", not the manifest.
        #
        # This used to require a prior manifest entry (`and was`), which quietly
        # broke the case resume exists for: the manifest is written once, at the
        # END of a run, so an interrupted FIRST run leaves none — and every file
        # it had already pulled was re-downloaded next time. On an account whose
        # overage is bandwidth, that is the exact cost this script is built to
        # avoid, and the docstring claimed the opposite.
        #
        # A complete file is one that exists at the byte count Cloudinary
        # reports. The manifest is now only a checksum CACHE: reuse the recorded
        # hash when we have it, otherwise compute it from the file on disk.
        if (
            dest.exists()
            and e["bytes"] is not None
            and dest.stat().st_size == e["bytes"]
        ):
            cached = was.get("checksum_sha256") if was else None
            e["checksum_sha256"] = cached or sha256_file(dest)
            e["downloaded"] = True
            _log(f"[{i}/{len(entries)}] skip (present) {e['path']}")
            continue

        # A missing URL must not escape as an uncaught exception: manifest_entry
        # falls back to None when neither secure_url nor url is present, and
        # urllib.request.Request(None) raises ValueError — which is outside
        # download()'s (URLError, OSError) handler. That would abort the loop
        # mid-run and skip the manifest write entirely, losing the record of
        # everything already fetched. Treat it as a per-asset failure instead.
        if not e["url"]:
            failed += 1
            _log(f"[{i}/{len(entries)}] FAIL {e['path']} — no URL on the resource")
            continue

        ok, err = download(e["url"], dest, limiter)
        if ok:
            e["checksum_sha256"] = sha256_file(dest)
            e["downloaded"] = True
            _log(f"[{i}/{len(entries)}] ok   {e['path']}")
        else:
            failed += 1
            _log(f"[{i}/{len(entries)}] FAIL {e['path']} — {err}")

    write_manifest_atomically(
        manifest_path,
        {
            "version": MANIFEST_VERSION,
            "dry_run": False,
            "count": len(entries),
            "total_bytes": total_bytes,
            "failed": failed,
            "assets": entries,
        },
    )
    _log(f"manifest written: {manifest_path}")
    if failed:
        _log(f"{failed} download(s) failed — re-run to resume; completed files are skipped")
        return EXIT_DOWNLOAD_FAILED
    _log("export complete")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
