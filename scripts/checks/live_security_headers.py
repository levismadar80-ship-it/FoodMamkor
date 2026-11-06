#!/usr/bin/env python3
"""
Module:   live_security_headers
Purpose:  After a deploy, confirm the LIVE site still sends the security
          headers frontend/next.config.js sets (CSP, HSTS, frame, sniff,
          referrer) on the HTML and that the API answers with the backend set
          too. tests/test_meh2750_security_headers.py pins the backend in CI;
          nothing pinned the frontend headers as actually served by Vercel —
          a vercel.json or middleware change could drop them silently.
Touches:  Nothing. Two GET requests.
Related:  frontend/next.config.js securityHeaders ·
          backend/app/middleware.py::add_security_headers ·
          .github/workflows/post-deploy-checks.yml (the caller, MEH-2749).
History:  MEH-2749 (creation, 06/11).

Exit codes: 0 all present · 1 something missing · 2 the control failed.
`--self-test` runs the evaluator against synthetic header maps (no network).

Control: before any check, the home page must answer 200 and must NOT carry
a header name no layer ever sets. That catches a fetch layer that echoes every
asked-for name back; it does not by itself prove the header checks run —
`--self-test` does that, against the same `missing()` evaluator.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow a redirect. urllib copies request headers onto the next
    hop, so following a 3xx off-origin (vercel.com/sso-api when protection
    rejects the header) would send the bypass secret to that host. A 3xx is
    reported as its own status instead."""

    def redirect_request(self, *args, **kwargs):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)

DEFAULT_BASE_URL = "https://mehamakor.co.il"

# name -> substring that must appear in the value
HTML_HEADERS = {
    "content-security-policy": "object-src 'none'",
    "strict-transport-security": "preload",
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
}
API_HEADERS = {
    "strict-transport-security": "preload",
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
}
NEVER_SET = "x-mehamakor-header-check-never-set"


def fetch_headers(url: str) -> tuple[int, dict]:
    headers = {"User-Agent": "mehamakor-header-check/1.0"}
    secret = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET", "").strip()
    if secret:
        headers["x-vercel-protection-bypass"] = secret
    req = urllib.request.Request(url, headers=headers)
    try:
        with _OPENER.open(req, timeout=25) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}
    except Exception as e:  # transport failure
        print(f"transport error for {url}: {type(e).__name__}: {e}")
        return 0, {}


def missing(url: str, status: int, headers: dict, required: dict) -> list[str]:
    """Pure evaluation — what --self-test exercises, and what check() uses."""
    if status != 200:
        return [f"{url}: HTTP {status}, expected 200"]
    out = []
    for name, needle in required.items():
        value = headers.get(name, "")
        if needle not in value:
            out.append(f"{url}: {name} should contain {needle!r}, got {value[:80]!r}")
    return out


def check(url: str, required: dict) -> list[str]:
    status, headers = fetch_headers(url)
    return missing(url, status, headers, required)


def self_test() -> int:
    """Shows the evaluator can go red (MEH-1619): the full set passes, and
    dropping or weakening any one header, or a non-200, is reported."""
    full = {
        "content-security-policy": "default-src 'self'; object-src 'none'",
        "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
    }
    failures = []
    if missing("u", 200, full, HTML_HEADERS):
        failures.append("the complete header set was reported as missing something")
    for name in HTML_HEADERS:
        dropped = {k: v for k, v in full.items() if k != name}
        if not missing("u", 200, dropped, HTML_HEADERS):
            failures.append(f"dropping {name} was not reported")
    weakened = dict(full, **{"strict-transport-security": "max-age=63072000"})
    if not missing("u", 200, weakened, HTML_HEADERS):
        failures.append("HSTS without preload was not reported")
    if not missing("u", 302, full, HTML_HEADERS):
        failures.append("a 302 was not reported")
    for f in failures:
        print(f"SELF-TEST FAIL {f}")
    print(
        f"self-test: {len(HTML_HEADERS) + 3 - len(failures)}/{len(HTML_HEADERS) + 3} cases behaved"
    )
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    base = args.base_url.rstrip("/")

    status, h = fetch_headers(f"{base}/")
    if status != 200 or not h or NEVER_SET in h:
        print(
            f"CONTROL FAILED: {base}/ -> {status}, {len(h)} headers, never-set present={NEVER_SET in h}"
        )
        return 2
    print(f"control ok: {base}/ -> 200 with {len(h)} headers, never-set header absent")

    problems = check(f"{base}/", HTML_HEADERS) + check(
        f"{base}/api/health/liveness", API_HEADERS
    )
    for p in problems:
        print(f"FAIL {p}")
    if problems:
        return 1
    print(f"security headers present on {base}/ and {base}/api/health/liveness")
    return 0


if __name__ == "__main__":
    sys.exit(main())
