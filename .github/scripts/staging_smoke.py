#!/usr/bin/env python3
"""
Module:   staging_smoke
Purpose:  Post-deploy staging smoke. Drives the producer-signup pipeline
          end-to-end (auth -> admin row -> WhatsApp welcome -> Anthropic
          risk score -> admin badge) so a broken integration is caught
          minutes after a staging deploy, not during a manual smoke. Catches
          the bug class transport-mocked unit tests miss: template-signature
          mismatch, missing background tasks, broken Meta/Anthropic calls.
Touches:  staging backend HTTP API (/health, /auth/login,
          /auth/register/producer, /admin/producers); Railway CLI
          (`railway logs`) for the WhatsApp + Anthropic log signals.
Does NOT: send any WhatsApp/email itself (V1 alerting = GitHub Actions
          failure email, see MEH-671 revised scope); own DB cleanup (that is
          a separate always() step in staging-smoke.yml); gate merge
          (advisory post-deploy signal only).
Related:  .github/workflows/staging-smoke.yml (wiring + cleanup CTE),
          backend/app/routers/auth.py:508 (anonymous register/producer path),
          backend/app/services/auth_notifications.py:86 (welcome log line),
          backend/app/services/producer_risk.py:289 (risk-score log line),
          backend/app/auth.py:183 (fingerprint binding -> we log in fresh).
History:  MEH-671 (creation).

Run manually:
    STAGING_URL=https://foodmamkor-staging.up.railway.app \
    SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... \
    RAILWAY_TOKEN=... RAILWAY_ENVIRONMENT=staging \
    GITHUB_RUN_ID=manual-$(date +%s) \
    python .github/scripts/staging_smoke.py

Exit code 0 = all five steps passed. Non-zero = the printed step failed;
GitHub Actions emails the watcher on the failed run.
"""
from __future__ import annotations

import os
import re
import secrets
import subprocess
import sys
import time

import httpx

# ── Tunables ────────────────────────────────────────────────────────────────
HTTP_TIMEOUT = 15.0
HEALTH_DEADLINE_S = 120  # belt-and-suspenders with the YAML `sleep 90`
ADMIN_ROW_DEADLINE_S = 30
WHATSAPP_LOG_DEADLINE_S = 30
RISK_LOG_DEADLINE_S = 60
BADGE_DEADLINE_S = 20
LOG_WINDOW_S = 15  # how long each `railway logs` snapshot is captured
POLL_GAP_S = 3
SERVICE_NAME = os.getenv("RAILWAY_SERVICE_NAME", "FoodMamkor")

# Log signals (exact strings live in the backend — see module docstring).
WELCOME_OK = [r"\[WHATSAPP\] Producer welcome template sent"]
WELCOME_FAIL = [
    r"\[WHATSAPP\] Producer welcome FAILED",
    r"\[WHATSAPP\] .* send failed",
]
RISK_OK = [r"\[RISK\] scored producer="]
RISK_FAIL = [
    r"\[RISK\] ANTHROPIC_API_KEY not set",
    r"\[RISK\] anthropic call failed",
    r"\[RISK\] anthropic response unparseable",
    r"\[RISK\] score_producer crashed",
]


class SmokeFailure(Exception):
    """Raised with a 1-based step number so main() can report it."""

    def __init__(self, step: int, message: str):
        self.step = step
        super().__init__(message)


def _env(name: str) -> str:
    val = os.getenv(name, "").strip()
    if not val:
        print(f"[smoke] missing required env var: {name}", file=sys.stderr)
        sys.exit(2)
    return val


def _run_id() -> str:
    # Unique per run -> unique smoke email + producer name -> no collisions
    # and no rate-limit bucket sharing on the per-email key.
    return (os.getenv("GITHUB_RUN_ID") or f"manual{int(time.time())}").strip()


def _smoke_password() -> str:
    # >=12 chars, mixed classes, random -> HIBP-clean and deny-list-safe.
    return f"Smk9!{secrets.token_urlsafe(16)}"


# ── Railway log polling (steps 3 + 4 share this) ──────────────────────────────
def _capture_logs() -> str:
    cmd = ["railway", "logs", "--service", SERVICE_NAME]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=LOG_WINDOW_S)
        return (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired as exc:
        # `railway logs` follows the stream; the timeout is the snapshot edge.
        out = exc.stdout or ""
        err = exc.stderr or ""
        out = out.decode() if isinstance(out, bytes) else out
        err = err.decode() if isinstance(err, bytes) else err
        return out + err
    except FileNotFoundError:
        raise SmokeFailure(0, "railway CLI not found on PATH")


def poll_logs(step: int, ok: list[str], fail: list[str], deadline_s: int) -> None:
    deadline = time.time() + deadline_s
    seen = ""
    while time.time() < deadline:
        seen += _capture_logs()
        for pat in fail:
            if re.search(pat, seen):
                raise SmokeFailure(step, f"failure log matched /{pat}/")
        for pat in ok:
            if re.search(pat, seen):
                return
        time.sleep(POLL_GAP_S)
    raise SmokeFailure(step, f"no success log within {deadline_s}s (expected {ok})")


# ── HTTP steps ────────────────────────────────────────────────────────────────
def wait_for_health(client: httpx.Client) -> None:
    deadline = time.time() + HEALTH_DEADLINE_S
    last = "no response"
    while time.time() < deadline:
        try:
            r = client.get("/health")
            if r.status_code == 200:
                return
            last = f"HTTP {r.status_code}"
        except httpx.HTTPError as exc:
            last = str(exc)
        time.sleep(POLL_GAP_S)
    raise SmokeFailure(0, f"/health not 200 within {HEALTH_DEADLINE_S}s ({last})")


def login_admin(client: httpx.Client) -> None:
    # Fresh token every run: access tokens are 15-min TTL and fingerprint-
    # bound (auth.py:183) — a stored JWT secret would expire and/or be
    # rejected without its __Secure-Fgp cookie. The client's cookie jar
    # retains that cookie so subsequent admin calls pass _check_fingerprint.
    r = client.post(
        "/auth/login",
        json={"email": _env("SMOKE_ADMIN_EMAIL"), "password": _env("SMOKE_ADMIN_PASSWORD")},
    )
    if r.status_code != 200:
        raise SmokeFailure(0, f"admin login failed: HTTP {r.status_code} {r.text[:200]}")
    token = r.json().get("access_token")
    if not token:
        raise SmokeFailure(0, "admin login returned no access_token")
    client.headers["Authorization"] = f"Bearer {token}"


def step1_register(client: httpx.Client, run_id: str, email: str) -> None:
    # MUST be anonymous: an authenticated admin token takes the upgrade path
    # and is rejected with 403 (MEH-669 admin-cannot-self-register). So this
    # runs on a separate, header-free client — see main().
    payload = {
        "email": email,
        "name": f"Smoke {run_id}",
        "password": _smoke_password(),
        "producer_name": f"Smoke Producer {run_id}",
        "city": "תל אביב",
        "phone": "972546077823",
        "primary_contact_method": "whatsapp",
        "category_ids": [],
    }
    r = client.post("/auth/register/producer", json=payload)
    if r.status_code != 200:
        raise SmokeFailure(1, f"register/producer HTTP {r.status_code}: {r.text[:200]}")


def _find_producer(client: httpx.Client, run_id: str) -> dict | None:
    r = client.get("/admin/producers", params={"search": run_id})
    if r.status_code != 200:
        raise SmokeFailure(2, f"GET /admin/producers HTTP {r.status_code}: {r.text[:200]}")
    for row in r.json():
        if run_id in (row.get("name") or ""):
            return row
    return None


def step2_poll_admin(client: httpx.Client, run_id: str) -> dict:
    deadline = time.time() + ADMIN_ROW_DEADLINE_S
    while time.time() < deadline:
        row = _find_producer(client, run_id)
        if row is not None:
            return row
        time.sleep(POLL_GAP_S)
    raise SmokeFailure(2, f"producer row for run {run_id} not visible in {ADMIN_ROW_DEADLINE_S}s")


def step5_assert_badge(client: httpx.Client, run_id: str) -> int:
    deadline = time.time() + BADGE_DEADLINE_S
    last = None
    while time.time() < deadline:
        row = _find_producer(client, run_id)
        score = (row or {}).get("risk_score")
        if isinstance(score, int):
            if 0 <= score <= 100:
                return score
            raise SmokeFailure(5, f"risk_score out of range: {score}")
        last = score
        time.sleep(POLL_GAP_S)
    raise SmokeFailure(5, f"risk_score still NULL after {BADGE_DEADLINE_S}s (last={last!r})")


def main() -> int:
    base = _env("STAGING_URL").rstrip("/")
    run_id = _run_id()
    email = f"smoke+{run_id}@mehamakor.online"
    print(f"[smoke] start run_id={run_id} email={email} base={base}")
    opts = {"base_url": base, "timeout": HTTP_TIMEOUT, "follow_redirects": True}
    try:
        # Anonymous client for health + signup (an admin bearer would trip the
        # MEH-669 upgrade-path 403). Authed client for the admin-API steps.
        with httpx.Client(**opts) as anon:
            wait_for_health(anon)
            step1_register(anon, run_id, email)
            print("[smoke] step 1 OK — register/producer 200")
        with httpx.Client(**opts) as admin:
            login_admin(admin)
            step2_poll_admin(admin, run_id)
            print("[smoke] step 2 OK — producer row visible in /admin/producers")
            poll_logs(3, WELCOME_OK, WELCOME_FAIL, WHATSAPP_LOG_DEADLINE_S)
            print("[smoke] step 3 OK — WhatsApp welcome template sent (log)")
            poll_logs(4, RISK_OK, RISK_FAIL, RISK_LOG_DEADLINE_S)
            print("[smoke] step 4 OK — Anthropic risk score computed (log)")
            score = step5_assert_badge(admin, run_id)
            print(f"[smoke] step 5 OK — admin badge risk_score={score} (0-100)")
        print(f"[smoke] PASS — producer signup pipeline healthy (run_id={run_id})")
        return 0
    except SmokeFailure as exc:
        step = exc.step if exc.step else "0 (setup)"
        print(f"סמוק staging נכשל בשלב {step}: {exc}", file=sys.stderr)
        print(f"[smoke] FAIL step={exc.step} run_id={run_id}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
