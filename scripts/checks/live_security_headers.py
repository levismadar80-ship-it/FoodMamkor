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

Control: the run first asks for a header no layer ever sets and requires it
ABSENT, so a fetch layer that returns a fake header map cannot pass.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request

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
        with urllib.request.urlopen(req, timeout=25) as r:  # noqa: S310
            return r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}
    except Exception as e:  # transport failure
        print(f"transport error for {url}: {type(e).__name__}: {e}")
        return 0, {}


def check(url: str, required: dict) -> list[str]:
    status, h = fetch_headers(url)
    if status != 200:
        return [f"{url}: HTTP {status}, expected 200"]
    out = []
    for name, needle in required.items():
        if needle not in h.get(name, ""):
            out.append(
                f"{url}: {name} should contain {needle!r}, got {h.get(name, '')[:80]!r}"
            )
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    base = ap.parse_args().base_url.rstrip("/")

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
