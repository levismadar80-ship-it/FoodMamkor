#!/usr/bin/env python3
"""MEH-259 — post-deploy security-posture smoke test.

Seven assertions against a running backend. Designed to be run
immediately after every production deploy and to fail loudly with an
actionable message when a security primitive is wrong.

Usage:
  python scripts/smoke_test.py https://mehamakor.online
  python scripts/smoke_test.py https://foodmamkor-staging.up.railway.app

Exit codes:
  0 — all 7 checks passed
  1 — one or more checks failed (details printed to stdout)
  2 — configuration error (missing required env var, unreachable host)

Environment:
  PENDING_PRODUCER_UUID    Required for check 3 (IDOR regression).
                           A producer row in status=pending/rejected.
                           Unset → check is SKIPPED (not failed).

No new dependencies. Uses only `requests` which is already installed
for scripts/check_api_contract.py. No destructive operations — every
assertion expects an error response, so we never actually create,
login, or delete anything.
"""
from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass, field
from typing import Callable

import requests

# Per-check HTTP timeout. The total script budget is ~60s.
TIMEOUT = 5.0
# Distinct "public" IPs used to prove rate-limit isolation. Addresses
# are RFC 5737 documentation space — never resolve to real hosts.
BOGUS_IP_A = "192.0.2.10"
BOGUS_IP_B = "192.0.2.20"
BOGUS_IP_C = "192.0.2.30"
BOGUS_IP_D = "192.0.2.40"
BOGUS_IP_E = "192.0.2.50"


@dataclass
class Check:
    name: str
    passed: bool
    reason: str = ""
    cause: str = ""
    fix: str = ""


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)

    def record(self, check: Check) -> None:
        self.checks.append(check)

    @property
    def pass_count(self) -> int:
        return sum(1 for c in self.checks if c.passed)

    @property
    def fail_count(self) -> int:
        return sum(1 for c in self.checks if not c.passed)

    @property
    def all_passed(self) -> bool:
        return self.fail_count == 0

    def print_summary(self) -> None:
        print()
        print("=" * 72)
        print(f"Smoke test: {self.pass_count}/{len(self.checks)} passed")
        print("=" * 72)
        for c in self.checks:
            marker = "✅" if c.passed else "❌"
            print(f"{marker} {'PASS' if c.passed else 'FAIL'}: {c.name}")
            if not c.passed:
                if c.reason:
                    print(f"     Reason: {c.reason}")
                if c.cause:
                    print(f"     Likely cause: {c.cause}")
                if c.fix:
                    print(f"     How to fix: {c.fix}")
        print()


# ─────────────────────────────────────────────────────────────────────
# Check 1 — rate-limit enforcement (6th attempt from same IP → 429)
# ─────────────────────────────────────────────────────────────────────


def check_rate_limit_enforcement(base_url: str) -> Check:
    name = "check_rate_limit_enforcement"
    url = f"{base_url.rstrip('/')}/auth/login"
    headers = {"Content-Type": "application/json", "X-Forwarded-For": BOGUS_IP_A}
    body = {"email": "smoke-rate@invalid.test", "password": "wrong"}

    codes: list[int] = []
    for _ in range(6):
        try:
            r = requests.post(url, json=body, headers=headers, timeout=TIMEOUT)
            codes.append(r.status_code)
        except requests.RequestException as e:
            return Check(
                name=name,
                passed=False,
                reason=f"request failed: {e}",
                cause="backend unreachable or very slow",
                fix="check Railway deploy status + /health",
            )

    if codes[-1] == 429:
        return Check(name=name, passed=True)
    return Check(
        name=name,
        passed=False,
        reason=f"6 attempts produced status codes {codes}; expected the 6th to be 429",
        cause="rate limiter not enforcing — /auth/login missing @limiter.limit, "
              "OR limiter keying on something that isn't stable across 6 calls",
        fix="verify @limiter.limit(\"5/minute\") on login route; "
            "verify get_real_client_ip (MEH-256) honors X-Forwarded-For when TRUSTED_PROXY=1",
    )


# ─────────────────────────────────────────────────────────────────────
# Check 2 — rate-limit isolation (5 distinct XFF IPs → none 429)
# ─────────────────────────────────────────────────────────────────────


def check_rate_limit_isolation(base_url: str) -> Check:
    name = "check_rate_limit_isolation"
    url = f"{base_url.rstrip('/')}/auth/login"
    body = {"email": "smoke-iso@invalid.test", "password": "wrong"}

    codes: list[tuple[str, int]] = []
    for ip in (BOGUS_IP_A, BOGUS_IP_B, BOGUS_IP_C, BOGUS_IP_D, BOGUS_IP_E):
        try:
            r = requests.post(
                url,
                json=body,
                headers={"Content-Type": "application/json", "X-Forwarded-For": ip},
                timeout=TIMEOUT,
            )
            codes.append((ip, r.status_code))
        except requests.RequestException as e:
            return Check(
                name=name,
                passed=False,
                reason=f"request failed: {e}",
                cause="backend unreachable or very slow",
                fix="check Railway deploy status + /health",
            )

    throttled = [(ip, code) for ip, code in codes if code == 429]
    if not throttled:
        return Check(name=name, passed=True)
    return Check(
        name=name,
        passed=False,
        reason=f"distinct XFF IPs should each start fresh, but got 429 on {throttled}",
        cause="MEH-256 regression — rate limit keyed on proxy IP, all users share one bucket",
        fix=(
            "(1) set TRUSTED_PROXY=1 on Railway staging + production; "
            "(2) verify backend/app/rate_limit.py uses get_real_client_ip "
            "(X-Real-IP primary, XFF[-2] fallback); "
            "(3) confirm deploy is running the latest code"
        ),
    )


# ─────────────────────────────────────────────────────────────────────
# Check 3 — IDOR on pending producer (regression for MEH-254)
# ─────────────────────────────────────────────────────────────────────


def check_idor_pending_producer(base_url: str) -> Check:
    name = "check_idor_pending_producer"
    pending_uuid = os.getenv("PENDING_PRODUCER_UUID", "").strip()
    if not pending_uuid:
        return Check(
            name=name,
            passed=True,
            reason="SKIPPED — PENDING_PRODUCER_UUID env var not set",
        )

    url = f"{base_url.rstrip('/')}/producers/{pending_uuid}"
    try:
        r = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        return Check(
            name=name,
            passed=False,
            reason=f"request failed: {e}",
            cause="backend unreachable",
            fix="check Railway deploy status + /health",
        )

    if r.status_code == 404:
        return Check(name=name, passed=True)
    return Check(
        name=name,
        passed=False,
        reason=f"pending producer UUID returned {r.status_code}; expected 404",
        cause="MEH-254 regression — anonymous caller can see pending/rejected producers",
        fix="verify backend/app/routers/producers.py::get_producer has the status filter "
            "(admin+owner exception only); deploy may be running pre-MEH-254 code",
    )


# ─────────────────────────────────────────────────────────────────────
# Check 4 — auth required (401 without token)
# ─────────────────────────────────────────────────────────────────────


def check_auth_required(base_url: str) -> Check:
    name = "check_auth_required"
    url = f"{base_url.rstrip('/')}/auth/me"
    try:
        r = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        return Check(
            name=name,
            passed=False,
            reason=f"request failed: {e}",
            cause="backend unreachable",
            fix="check Railway deploy status + /health",
        )

    if r.status_code == 401:
        return Check(name=name, passed=True)
    return Check(
        name=name,
        passed=False,
        reason=f"/auth/me without token returned {r.status_code}; expected 401",
        cause="auth dependency removed or mis-configured on /auth/me",
        fix="verify get_current_user dependency is still required on the /auth/me route",
    )


# ─────────────────────────────────────────────────────────────────────
# Check 5 — security headers
# ─────────────────────────────────────────────────────────────────────


def check_security_headers(base_url: str) -> Check:
    name = "check_security_headers"
    url = f"{base_url.rstrip('/')}/producers"
    try:
        r = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        return Check(
            name=name,
            passed=False,
            reason=f"request failed: {e}",
            cause="backend unreachable",
            fix="check Railway deploy status + /health",
        )

    required = {
        "x-frame-options": lambda v: v.lower() == "deny",
        "x-content-type-options": lambda v: v.lower() == "nosniff",
        "referrer-policy": lambda v: bool(v),
    }
    missing: list[str] = []
    for header, check_val in required.items():
        val = r.headers.get(header, "")
        if not val or not check_val(val):
            missing.append(f"{header}={val!r}")
    if missing:
        return Check(
            name=name,
            passed=False,
            reason=f"missing/wrong headers: {', '.join(missing)}",
            cause="security header middleware removed or mis-ordered",
            fix="verify backend/app/main.py add_security_headers middleware is still registered",
        )
    return Check(name=name, passed=True)


# ─────────────────────────────────────────────────────────────────────
# Check 6 — CORS strict (evil origin NOT echoed)
# ─────────────────────────────────────────────────────────────────────


def check_cors_strict(base_url: str) -> Check:
    name = "check_cors_strict"
    url = f"{base_url.rstrip('/')}/producers"
    evil_origin = "https://evil.example.com"
    try:
        r = requests.options(
            url,
            headers={
                "Origin": evil_origin,
                "Access-Control-Request-Method": "GET",
            },
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        return Check(
            name=name,
            passed=False,
            reason=f"request failed: {e}",
            cause="backend unreachable",
            fix="check Railway deploy status + /health",
        )

    echoed = r.headers.get("Access-Control-Allow-Origin", "")
    # Acceptable: no ACAO header at all, OR the value is "null" / the
    # configured production origin — but NEVER the evil origin, and
    # NEVER a wildcard "*" with credentials allowed.
    if echoed == evil_origin:
        return Check(
            name=name,
            passed=False,
            reason=f"server echoed Access-Control-Allow-Origin: {echoed}",
            cause="CORS_ORIGINS misconfigured — evil.example.com is on the allow list "
                  "OR allow_origins=['*'] was set",
            fix="verify CORS_ORIGINS env on Railway is a comma-separated list "
                "of exact hostnames (no wildcards)",
        )
    if echoed == "*" and r.headers.get("Access-Control-Allow-Credentials", "").lower() == "true":
        return Check(
            name=name,
            passed=False,
            reason="ACAO=* with Allow-Credentials=true — browser blocks this but it's a signal of misconfig",
            cause="allow_origins=['*'] AND allow_credentials=True in CORS middleware",
            fix="replace allow_origins=['*'] with specific hostnames",
        )
    return Check(name=name, passed=True)


# ─────────────────────────────────────────────────────────────────────
# Check 7 — password validation (422 on short password)
# ─────────────────────────────────────────────────────────────────────


def check_password_validation(base_url: str) -> Check:
    name = "check_password_validation"
    url = f"{base_url.rstrip('/')}/auth/register"
    # Payload shape: UserRegister requires email + name + password.
    # Password is the field under test; keep the others valid so the
    # 422 we get back is about password length, not a missing field.
    body = {
        "email": "smoke-pw@invalid.test",
        "name": "Smoke",
        "password": "ab",  # 2 chars — must be rejected
    }
    try:
        r = requests.post(url, json=body, timeout=TIMEOUT)
    except requests.RequestException as e:
        return Check(
            name=name,
            passed=False,
            reason=f"request failed: {e}",
            cause="backend unreachable",
            fix="check Railway deploy status + /health",
        )

    if r.status_code == 422:
        return Check(name=name, passed=True)
    return Check(
        name=name,
        passed=False,
        reason=f"/auth/register with password='ab' returned {r.status_code}; expected 422",
        cause="MEH-248 regression — backend password min_length removed or not deployed",
        fix="verify UserRegister.password has Field(min_length=8) in backend/app/schemas/schemas.py",
    )


# ─────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────


CHECKS: list[Callable[[str], Check]] = [
    check_rate_limit_enforcement,
    check_rate_limit_isolation,
    check_idor_pending_producer,
    check_auth_required,
    check_security_headers,
    check_cors_strict,
    check_password_validation,
]


def run_all(base_url: str) -> int:
    print(f"Smoke testing: {base_url}")
    print(f"Timeout per check: {TIMEOUT}s · {len(CHECKS)} checks queued")
    print()

    report = Report()
    for check_fn in CHECKS:
        start = time.monotonic()
        result = check_fn(base_url)
        elapsed = time.monotonic() - start
        marker = "✅" if result.passed else "❌"
        status = "PASS" if result.passed else "FAIL"
        print(f"{marker} {status:4s}  {result.name:36s}  ({elapsed:.2f}s)")
        if not result.passed and result.reason:
            print(f"        → {result.reason}")
        report.record(result)

    report.print_summary()
    return 0 if report.all_passed else 1


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    base_url = sys.argv[1].rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        print(f"error: base URL must start with http:// or https://", file=sys.stderr)
        return 2
    return run_all(base_url)


if __name__ == "__main__":
    sys.exit(main())
