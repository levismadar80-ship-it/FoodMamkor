"""MEH-305 — Password policy validation service.

Stateless, async. Returns a structured PolicyResult so callers (MEH-306
wire-up) can render per-failure errors. NIST SP 800-63B Rev 4 aligned:
no composition rules, no forced rotation; only length floor + breach
check + reuse check.

Layered checks (cheapest first):
  1. length      — local, instant
  2. deny-list   — local frozenset (~10k SecLists top common credentials)
  3. HIBP range  — k-anonymity, 5-char SHA-1 prefix only; FAIL-OPEN
  4. reuse       — bcrypt verify against current_hash (only if provided)

HIBP fail-open mirrors the AI-feature pattern in the codebase: missing
network / timeout / 5xx must never block a user from signing up or
changing their password. The deny-list is the local backstop so a
common credential is still rejected when HIBP is unreachable.
"""

import asyncio
import hashlib
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import httpx
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

PolicyFailure = Literal["too_short", "too_common", "same_as_current"]

MIN_LENGTH = 12
HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/{prefix}"
_DENY_LIST_PATH = Path(__file__).parent / "deny_list_10k.txt"

# bcrypt context shared with auth.py (single-wrapper invariant — see auth.py:20).
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _load_deny_list(path: Path) -> frozenset[str]:
    with path.open("r", encoding="utf-8") as fp:
        return frozenset(line.strip().lower() for line in fp if line.strip())


_DENY_LIST: frozenset[str] = _load_deny_list(_DENY_LIST_PATH)


@dataclass
class PolicyResult:
    ok: bool
    failures: list[PolicyFailure] = field(default_factory=list)


async def _check_hibp(candidate: str, timeout_seconds: float) -> bool:
    """Return True iff HIBP reports a match. FAIL-OPEN on any error."""
    sha1_hex = hashlib.sha1(candidate.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1_hex[:5], sha1_hex[5:]
    url = HIBP_RANGE_URL.format(prefix=prefix)
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.get(url, headers={"Add-Padding": "true"})
        if resp.status_code >= 500:
            logger.warning("hibp_5xx_fail_open status=%s", resp.status_code)
            return False
        if resp.status_code != 200:
            logger.warning("hibp_unexpected_status_fail_open status=%s", resp.status_code)
            return False
        for line in resp.text.splitlines():
            row_suffix, _, count = line.partition(":")
            if row_suffix.strip().upper() == suffix and count.strip() not in ("", "0"):
                return True
        return False
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        logger.warning("hibp_network_fail_open err=%s", type(exc).__name__)
        return False


def _check_reuse_sync(candidate: str, current_hash: str) -> bool:
    """passlib verify is sync; wrapped via asyncio.to_thread by caller."""
    try:
        return _pwd_context.verify(candidate, current_hash)
    except Exception as exc:
        logger.warning("reuse_check_error err=%s", type(exc).__name__)
        return False


async def validate_password(
    candidate: str,
    *,
    current_hash: str | None = None,
    hibp_timeout_seconds: float = 2.0,
) -> PolicyResult:
    """Validate a password against length, deny-list, HIBP, and (optional) reuse.

    Returns a PolicyResult — never raises. Caller decides whether to
    render failures or accept a degraded check (e.g., HIBP fail-open
    is not a failure; only confirmed matches are).
    """
    failures: list[PolicyFailure] = []

    if len(candidate) < MIN_LENGTH:
        failures.append("too_short")

    # MEH-395: strip whitespace before deny-list lookup. Without strip, a user
    # could pad a common credential ("password" → "password    ") to clear the
    # 12-char floor while still hitting a value that should be deny-listed.
    # Length check above intentionally uses the raw candidate.
    deny_listed = candidate.strip().lower() in _DENY_LIST
    if deny_listed:
        failures.append("too_common")

    hibp_task: asyncio.Task[bool] | None = None
    reuse_task: asyncio.Task[bool] | None = None

    # Concurrent execution: HIBP + bcrypt verify run in parallel via create_task.
    # Conditional shape (Optional[Task]) keeps deny-listed candidates from
    # hitting HIBP and password-only flows from running bcrypt.
    if not deny_listed:
        hibp_task = asyncio.create_task(_check_hibp(candidate, hibp_timeout_seconds))
    if current_hash is not None:
        reuse_task = asyncio.create_task(
            asyncio.to_thread(_check_reuse_sync, candidate, current_hash)
        )

    if hibp_task is not None:
        if await hibp_task:
            failures.append("too_common")
    if reuse_task is not None:
        if await reuse_task:
            failures.append("same_as_current")

    return PolicyResult(ok=not failures, failures=failures)
