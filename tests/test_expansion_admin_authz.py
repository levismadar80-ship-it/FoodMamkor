"""Mutation-guided test expansion (2026-06, Refs MEH-214) — domain B2.

Per-endpoint require_admin regression coverage. The existing suite tests
the guard only on /admin/dashboard (TestAdminGuard) plus grant/revoke
(test_meh_762). ~50 other mutating admin endpoints have NO 403-without-admin
test, so a mutant that drops `Depends(require_admin)` on any one of them
(AD-1..N) survives — and the inverted-guard mutant (AD-GUARD,
auth.py:261 `!=` → `==`) is caught by every row here.

Each endpoint below is path-param-only (no request body) so a non-admin
caller yields a clean 403, never a 422 from body validation first
(regression rule 6). Path params are typed correctly (UUID / int) so the
guard — not path coercion — is what's exercised.
"""
import pytest

from tests.conftest import auth_header, make_user

# A well-formed UUID and int id. The resources don't exist, but require_admin
# runs as a dependency BEFORE the handler's 404 lookup, so a non-admin gets
# 403 regardless (confirmed by test_meh_762 grant-404-for-admin vs
# grant-403-for-consumer).
_U = "11111111-1111-1111-1111-111111111111"

# (method, path) — one row per distinct require_admin guard.
ADMIN_MUTATING_ENDPOINTS = [
    ("post", f"/admin/producers/{_U}/approve"),
    ("post", f"/admin/producers/{_U}/reject"),
    ("post", f"/admin/producers/{_U}/toggle-status"),
    ("delete", f"/admin/producers/{_U}"),
    ("post", f"/admin/producers/{_U}/set-ambassador"),
    ("post", f"/admin/home-products/{_U}/approve"),
    ("post", f"/admin/home-products/{_U}/remove"),
    ("post", f"/admin/home-products/{_U}/restore"),
    ("delete", f"/admin/home-products/{_U}"),
    ("post", f"/admin/kashrut/{_U}/approve"),
    ("post", f"/admin/kashrut/{_U}/reject"),
    ("post", f"/admin/experiences/{_U}/approve"),
    ("post", f"/admin/experiences/{_U}/reject"),
    ("post", f"/admin/recipes/{_U}/approve"),
    ("post", f"/admin/recipes/{_U}/reject"),
    ("delete", f"/admin/outreach/{_U}"),
    ("post", f"/admin/users/{_U}/block"),
    ("delete", "/admin/categories/1"),
]


def _call(client, method, path, headers=None):
    return getattr(client, method)(path, headers=headers or {})


@pytest.mark.parametrize("method,path", ADMIN_MUTATING_ENDPOINTS)
def test_consumer_cannot_reach_admin_endpoint(client, db, method, path):
    """A logged-in consumer is rejected with 403 by require_admin.

    Kills AD-1..N (guard dropped on this endpoint) and AD-GUARD
    (auth.py:261 condition inverted — a consumer would slip through).
    """
    consumer = make_user(db, role="consumer")
    resp = _call(client, method, path, headers=auth_header(consumer))
    assert resp.status_code == 403, f"{method.upper()} {path} -> {resp.status_code}"


@pytest.mark.parametrize("method,path", ADMIN_MUTATING_ENDPOINTS)
def test_unauthenticated_cannot_reach_admin_endpoint(client, method, path):
    """No token → 401 from get_current_user (require_admin's parent dep)."""
    resp = _call(client, method, path)
    assert resp.status_code == 401, f"{method.upper()} {path} -> {resp.status_code}"


def test_producer_role_also_blocked_from_admin(client, db):
    """A producer (also role != admin) is blocked. Documents that the guard
    keys on role == 'admin', not merely on "is authenticated"."""
    producer = make_user(db, role="producer")
    resp = client.post(
        f"/admin/producers/{_U}/approve", headers=auth_header(producer)
    )
    assert resp.status_code == 403
