"""Shared helpers, constants and fixtures of `tests/test_producer_owner_invite.py`.

Moved here verbatim by the MEH-3540 mechanical split. Not collected by
pytest (no `test_` prefix); `tests/test_producer_owner_invite.py` is the module pytest runs.
"""

import ast
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import pytest
from sqlalchemy import DateTime, String, Text

from conftest import auth_header, israel_days_ago, make_producer, make_user
from app.models import Producer, User
from app.routers import producer_owner_invite as poi

VERSIONS = Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions"
REVISION = "a7f3c2e94d18"
# A real, known revision with a shape we can state independently — the control
# for the `ast` reader below (testing.md: validate the instrument first).
PRECEDENT = "8600916f1942"  # MEH-2496 claim_link_sent_at: 1 add_column / 1 drop_column

INVITE_EMAIL = "owner-invite-target@example.com"
# Spelled with "example" on purpose: `scripts/checks/secrets-scan-guard.sh`
# reds a added line that looks like a credential, and an obvious
# placeholder is also what the next reader wants to see. Long enough for
# the 12-character floor, and nothing like a real password.
GOOD_PASSWORD = "example-pw-meh2974"
CONSENT_NOTE = "אישור בוואטסאפ, 12/11"

# The eleven columns the feature owns (eight, plus the three the v3 email
# code added). Named once, because several tests below assert over the whole
# set and a list per test is how one gets forgotten.
INVITE_COLUMNS = (
    "owner_invite_email",
    "owner_invite_name",
    "owner_invite_token_hash",
    "owner_invite_expires_at",
    "owner_invite_sent_at",
    "owner_invite_accepted_at",
    "owner_invite_consent_note",
    "owner_invite_created_by",
    "owner_invite_code_hash",
    "owner_invite_code_expires_at",
    "owner_invite_code_attempts",
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _admin_url(pid, suffix=""):
    return f"/admin/producers/{pid}/owner-invite{suffix}"


def _lookup_url(token):
    return f"/auth/owner-invite/{token}"


_ACCEPT_URL = "/auth/owner-invite/accept"
_CODE_URL = "/auth/owner-invite/email-code"
# Any six digits. Used where the request must be schema-valid but is expected
# to die BEFORE the code is checked (a dead token, a missing consent), so the
# status proves which guard fired. Regression rule 6.
DUMMY_CODE = "123456"


def valid_invite_payload(**over) -> dict:
    """Regression rule 6: a guard test (403 / 409) must send a schema-VALID
    body, or a 422 from the parser hides whether the guard fired at all."""
    return {
        "email": INVITE_EMAIL,
        "name": "דנה כהן",
        "consent_confirmed": True,
        "consent_note": CONSENT_NOTE,
    } | over


def valid_accept_payload(token, code=DUMMY_CODE, email=INVITE_EMAIL, **over) -> dict:
    return {
        "token": token,
        "email": email,
        "code": code,
        "password": GOOD_PASSWORD,
        "terms_accepted": True,
        "declaration_accepted": True,
    } | over


def arm_code(client, token, email=INVITE_EMAIL) -> str:
    """Ask for a code through the real endpoint and read the plaintext out of
    the mail it queued.

    That mail is the ONLY place the code exists — the row holds a sha256 — so
    this is the only way a test can know it without writing the hash itself,
    which would assert the test's arithmetic rather than the endpoint's.
    """
    seen = []
    with mock.patch.object(
        poi, "send_owner_invite_code_email", side_effect=lambda *a, **k: seen.append(a)
    ):
        r = client.post(_CODE_URL, json={"token": token, "email": email})
    assert r.status_code == 200, r.text
    assert len(seen) == 1, f"the endpoint queued {len(seen)} code emails, wanted 1"
    return seen[0][2]


def accept_invite(client, token, email=INVITE_EMAIL, **over):
    """The whole v3 acceptance in one call: ask for a code, then accept with
    it. Returns the acceptance response."""
    code = arm_code(client, token, email)
    return client.post(
        _ACCEPT_URL, json=valid_accept_payload(token, code, email, **over)
    )


# MEH-3246: an invite needs a photo (and a licence where the category needs
# one), so the invitable factories carry one photo unless a test says otherwise.
_PHOTO = ["https://res.cloudinary.com/demo/image/upload/v1/invite.jpg"]


def approved(db, **kw):
    """An approved business with no owner — the only shape invitable."""
    kw.setdefault("images", _PHOTO)
    return make_producer(db, status="approved", **kw)


def own(db, producer, **kw):
    """Give `producer` a linked owner (the 409 the invite refuses)."""
    u = make_user(db, role="producer", **kw)
    u.producer_id = producer.id
    db.commit()
    return u


def invite(client, db, producer, admin=None, **over):
    """Create an invite and return (response, raw_token_or_None)."""
    admin = admin or make_user(db, role="admin")
    r = client.post(
        _admin_url(producer.id),
        json=valid_invite_payload(**over),
        headers=auth_header(admin),
    )
    return r, _token_of(r)


def _token_of(response):
    if response.status_code != 200:
        return None
    url = response.json().get("invite_url") or ""
    return url.rsplit("/", 1)[-1] or None


def _row(db, producer):
    db.expire_all()
    return db.get(Producer, producer.id)


def _sha(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _snapshot(db, producer) -> dict:
    """Every invite column plus the two declaration stamps — what a
    "zero writes" assertion has to compare, rather than one column."""
    p = _row(db, producer)
    return {c: getattr(p, c) for c in INVITE_COLUMNS} | {
        "declared_at": p.declared_at,
        "declaration_version": p.declaration_version,
        "status": p.status,
    }


# ---------------------------------------------------------------------------
# the revision, read with ast
# ---------------------------------------------------------------------------


def _revision_file(rev):
    hits = [p for p in VERSIONS.glob("*.py") if _module_str(p, "revision") == rev]
    assert len(hits) == 1, f"{rev}: {hits}"
    return hits[0]


def _module_str(path, name):
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        target = (
            node.target
            if isinstance(node, ast.AnnAssign)
            else node.targets[0]
            if isinstance(node, ast.Assign)
            else None
        )
        if isinstance(target, ast.Name) and target.id == name:
            return ast.literal_eval(node.value) if node.value is not None else None
    return None


def _op_calls(path, func_name):
    """Every `op.<x>(...)` lexically inside the top-level `func_name`."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    fn = next(
        n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == func_name
    )
    return [
        n
        for n in ast.walk(fn)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and isinstance(n.func.value, ast.Name)
        and n.func.value.id == "op"
    ]
