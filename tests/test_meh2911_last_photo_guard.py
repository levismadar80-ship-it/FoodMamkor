"""
Module:   test_meh2911_last_photo_guard
Purpose:  An APPROVED business cannot remove its last gallery photo through
          PUT /producers/me. The request is refused and the gallery is left
          exactly as it was.
Touches:  producers rows via the standard test session. No outbound calls —
          the refusal happens before the commit, so the Cloudinary cleanup
          at producer_me.py:850 is never reached on the refused path.
Does NOT: change the business's status. Sapir's ruling (10/11) rejected
          sending an emptied-gallery business back to `pending`; the row's
          `status` must be untouched, which the tests assert.
          Also does not cover the admin PUT (admin.py) or the import path —
          this guard is on the OWNER route only, matching where the hole was
          measured.
Related:  backend/app/routers/producer_me.py::update_my_producer;
          backend/app/routers/admin.py::_assert_approvable (the approve-time
          half of the same invariant, MEH-799);
          tests/test_meh2907_approve_vs_owner_edit.py (where this hole was
          found, and whose sequential test pinned the old behaviour).
History:  MEH-2911 (creation).

WHY THIS EXISTS. MEH-2907's reviewer measured that an already-approved
business could PUT `{"images": []}`, get 200, and stay live with an empty
gallery — no concurrency involved. `ProducerUpdate._validate_images`
checks URL shape only, never non-emptiness, and `images` is in
`_PRODUCER_WRITABLE_FIELDS`. The approve-time gate (MEH-799) deliberately
"lives at the moment of approval" (`admin.py`), so nothing re-checked
afterwards.

Sapir's ruling: refuse the removal, keep the gallery, do NOT demote the
business. The copy is hers, verbatim.

WHAT THE GUARD IS AND IS NOT. It fires only when ALL of these hold:
the business is `approved`, the payload would leave the gallery empty,
and the gallery is not already empty. A `draft` or `pending` business can
still empty its gallery — the submit gate and the approve gate are where
that is caught, and widening the rule to them would change behaviour
Sapir did not ask about. A legacy approved business that ALREADY has no
photos is not blocked from saving other fields, because there is no last
photo to remove; that case is asserted below rather than left to chance.
"""

from __future__ import annotations

import pytest

from app.models.models import Producer

from conftest import auth_header, make_submit_ready_producer

# Sapir-approved, verbatim (10/11). Compared character for character —
# this is the string the owner reads, and rule 22 makes it hers, not the
# test's to paraphrase.
LAST_PHOTO_MESSAGE = (
    "אי אפשר להסיר את התמונה האחרונה. הוסיפו תמונה אחרת, ואז הסירו את זו."
)
_SECOND = "https://res.cloudinary.com/demo/image/upload/v1/second.jpg"


def _owner_with_gallery(db, *, status: str, images: list[str] | None = None):
    producer, owner = make_submit_ready_producer(db, status=status)
    if images is not None:
        producer.images = images
    db.commit()
    return producer, owner


def test_approved_business_cannot_remove_its_last_photo(client, db):
    """The ruling, end to end: refused, and the gallery is untouched."""
    producer, owner = _owner_with_gallery(db, status="approved")
    producer_id = producer.id
    before = list(producer.images)
    assert len(before) == 1, "setup: exactly one photo, so removing it is the case"

    resp = client.put(
        "/producers/me", json={"images": []}, headers=auth_header(owner)
    )

    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == LAST_PHOTO_MESSAGE, resp.text

    db.expire_all()
    after = db.get(Producer, producer_id)
    assert after.images == before, "the gallery must be left exactly as it was"
    # Sapir rejected option (ג) explicitly: no demotion.
    assert after.status == "approved", (
        "the business was demoted — the ruling was to refuse the removal, "
        "NOT to send the business back to the review queue"
    )


def test_the_refusal_does_not_discard_the_rest_of_the_payload(client, db):
    """A refused save must not half-apply: the whole PUT is rejected.

    The guard raises before the mutation loop, so a `description` sent in
    the same body is not written either. Asserted because the opposite —
    writing the other fields and refusing only the gallery — is the
    plausible alternative implementation, and it would leave the owner
    looking at an error next to changes that silently took effect.
    """
    producer, owner = _owner_with_gallery(db, status="approved")
    producer_id = producer.id
    description_before = producer.description

    resp = client.put(
        "/producers/me",
        json={"images": [], "description": "תיאור חדש שלא אמור להישמר"},
        headers=auth_header(owner),
    )

    assert resp.status_code == 422, resp.text
    db.expire_all()
    after = db.get(Producer, producer_id)
    assert after.description == description_before, (
        "the refused PUT applied another field from the same body"
    )


def test_approved_business_can_still_remove_a_photo_it_is_not_the_last_of(
    client, db
):
    """The guard is about the LAST photo, not about removal.

    Without this, a guard that refused every gallery shrink — or every
    gallery write — would satisfy the test above and break the editor.
    """
    producer, owner = _owner_with_gallery(
        db, status="approved", images=[_SECOND, "https://res.cloudinary.com/demo/image/upload/v1/x.jpg"]
    )
    producer_id = producer.id

    resp = client.put(
        "/producers/me", json={"images": [_SECOND]}, headers=auth_header(owner)
    )

    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(Producer, producer_id).images == [_SECOND]


def test_approved_business_can_still_replace_its_only_photo(client, db):
    """Swapping one photo for another is not removing the last one.

    This is the path the approved copy tells the owner to take — "add a
    different photo, then remove this one" — so it has to work in one
    save as well as two.
    """
    producer, owner = _owner_with_gallery(db, status="approved")
    producer_id = producer.id

    resp = client.put(
        "/producers/me", json={"images": [_SECOND]}, headers=auth_header(owner)
    )

    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(Producer, producer_id).images == [_SECOND]


@pytest.mark.parametrize("status", ["draft", "pending", "rejected", "inactive"])
def test_a_business_that_is_not_approved_may_still_empty_its_gallery(
    client, db, status
):
    """Unchanged behaviour for every other status, deliberately.

    A business that is not live has nothing to protect: the submit gate
    (`submission_gate.py`) and the approve gate (`admin.py`, MEH-799)
    are where an empty gallery is caught for those. Widening the rule to
    them would change behaviour Sapir did not ask about, and this test is
    what would notice if a later edit did widen it.
    """
    producer, owner = _owner_with_gallery(db, status=status)
    producer_id = producer.id

    resp = client.put(
        "/producers/me", json={"images": []}, headers=auth_header(owner)
    )

    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(Producer, producer_id).images == []


def test_an_approved_business_with_no_photos_is_not_locked_out(client, db):
    """No last photo to remove, so nothing to refuse.

    A legacy approved row with an empty gallery must still be able to
    save. A guard written as "approved and the new list is empty" without
    the second half would 422 here and leave such an owner unable to edit
    anything at all.
    """
    producer, owner = _owner_with_gallery(db, status="approved", images=[])
    producer_id = producer.id

    resp = client.put(
        "/producers/me",
        json={"images": [], "description": "עריכה שצריכה לעבוד"},
        headers=auth_header(owner),
    )

    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(Producer, producer_id).description == "עריכה שצריכה לעבוד"


def test_the_server_string_and_the_ui_string_are_the_same_sentence():
    """One approved sentence, two surfaces, no drift.

    The owner can meet this copy two ways: the inline note the card shows
    when she clicks remove on her only photo (`he.json`
    `dashboard.producer.images.last_photo`), and the 422 detail if a
    client reaches the API anyway. Two owners for one fact is exactly the
    smell workflow.md names, and the usual answer — one authority, the
    other deleted — is not available here: the pre-check has to work
    before any request is sent, and the backend has to answer a client
    that skipped it.

    So the duplication stays and this test is the enforcement. It reads
    the shipped `he.json`, not a copy, and compares against the module
    constant the route raises.
    """
    import json
    import pathlib

    from app.routers.producer_me import LAST_PHOTO_REMOVAL_MESSAGE

    repo_root = pathlib.Path(__file__).resolve().parent.parent
    messages = json.loads(
        (repo_root / "frontend" / "messages" / "he.json").read_text(encoding="utf-8")
    )
    ui = messages["dashboard"]["producer"]["images"]["last_photo"]

    assert ui == LAST_PHOTO_REMOVAL_MESSAGE, (
        "the inline note and the API refusal say different things:\n"
        f"  he.json: {ui!r}\n"
        f"  backend: {LAST_PHOTO_REMOVAL_MESSAGE!r}"
    )
    # And both are the sentence Sapir approved, which is the point of the
    # pair being identical rather than merely consistent.
    assert ui == LAST_PHOTO_MESSAGE, (
        "the shipped copy drifted from the approved sentence (rule 22)"
    )
