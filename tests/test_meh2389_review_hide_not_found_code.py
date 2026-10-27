"""MEH-2389 — the hide/unhide 404 carries a machine-readable code.

/admin/reviews treats this 404 as "deleted elsewhere" and drops the row. It
used to recognise it by the Hebrew letters in ``detail``, so rewording the
message (or writing it in English) would silently turn it into a generic
error with the stale row left on screen. ``code`` is the contract now
({code, message} — MEH-1943); ``message`` keeps today's sentence.
"""

import uuid

import pytest

from conftest import auth_header, make_user


@pytest.mark.parametrize("action", ["hide", "unhide"])
def test_unknown_review_404_carries_code(client, db, action):
    admin = make_user(db, role="admin", email=f"admin-{action}@example.com")
    r = client.put(
        f"/admin/reviews/{uuid.uuid4()}/{action}", headers=auth_header(admin)
    )
    assert r.status_code == 404, r.text
    detail = r.json()["detail"]
    assert isinstance(detail, dict), detail
    assert detail["code"] == "review_not_found"
    assert detail["message"] == "ביקורת לא נמצאה"
