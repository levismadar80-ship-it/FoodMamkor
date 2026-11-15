"""MEH-2916 (C4) — the contract the owner preview rests on, both directions.

The pilot's A4 finding: «צפייה בדף» sent an unapproved owner to a page that
said her business «לא נמצא». The cause is NOT the backend. `GET /producers/{id}`
already serves the owner a 200 and 404s everyone else
(`routers/producers.py`, the MEH-254 / MEH-2459 carve-out); what regressed is
that MEH-2101 moved the producer page's fetch to anonymous SSR, so the page
asks as a stranger and gets the stranger's answer.

Sapir's ruling (11/11) keeps MEH-2101's real 404 exactly as it is and adds an
owner-only preview inside the dashboard, fetched client-side with the token.

THESE TWO CELLS ARE GREEN BEFORE THE FIX AND MUST STAY GREEN AFTER IT. They
are not the red — the red is the missing route, in
`frontend/__tests__/OwnerPagePreviewRoute.test.jsx`. They are here because the
fix depends on the first one being true and must not disturb the second:

  · the owner direction is the mechanism the preview uses. If it ever stopped
    being true the preview would silently show «לא נמצא» again, and no
    frontend test would explain why.
  · the anonymous direction is the SEO contract Sapir explicitly declined to
    reopen. A change that "fixed" the preview by relaxing it would pass every
    frontend test in this card and go unnoticed here without this cell.
"""

import pytest

from conftest import auth_header, make_producer, make_user


def _owner_of(db, producer):
    """A `producer`-role user wired to `producer` — i.e. its owner.

    REUSES: tests/test_analytics.py:260 — same shape, same reason.
    """
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


@pytest.mark.parametrize("status", ["pending", "rejected"])
def test_owner_gets_her_own_unapproved_business(client, db, status):
    """The mechanism the preview is built on, pinned at the endpoint it uses."""
    p = make_producer(db, name="הבית של דנה", status=status)
    owner = _owner_of(db, p)

    r = client.get(f"/producers/{p.id}", headers=auth_header(owner))

    assert r.status_code == 200, (
        f"the owner of a {status} business must reach her own page — this is "
        "what the dashboard preview fetches with her token"
    )
    assert r.json()["name"] == "הבית של דנה"


@pytest.mark.parametrize("status", ["pending", "rejected"])
def test_a_stranger_still_gets_a_real_404(client, db, status):
    """MEH-2101's contract, which the preview must not reopen.

    Anonymous AND a signed-in someone-else: the second is the one a change
    could break while the first keeps passing, because "no token" and "a token
    that isn't the owner's" take different branches.
    """
    p = make_producer(db, name="הבית של דנה", status=status)
    other = make_user(db, email="not-the-owner@example.com", role="producer")

    anon = client.get(f"/producers/{p.id}")
    assert anon.status_code == 404, "an anonymous caller must still get a real 404"

    stranger = client.get(f"/producers/{p.id}", headers=auth_header(other))
    assert stranger.status_code == 404, (
        "a signed-in user who is not the owner must get the same 404 — "
        "otherwise any account could read the approval queue by UUID"
    )
    assert "הבית של דנה" not in anon.text


def test_an_approved_business_is_public_to_everyone(client, db):
    """Control. Without it the cell above passes against a server that 404s
    every producer, which would make the preview the only way to see any
    business at all."""
    p = make_producer(db, name="הבית של דנה", status="approved")

    r = client.get(f"/producers/{p.id}")

    assert r.status_code == 200
    assert r.json()["name"] == "הבית של דנה"
