"""
Module:   test_meh2911_last_photo_guard
Purpose:  An APPROVED business cannot remove its last gallery photo through
          PUT /producers/me. The request is refused and the gallery is left
          exactly as it was.
Touches:  producers rows via the standard test session. No outbound calls —
          the refusal happens before the commit, so the Cloudinary cleanup
          at producer_me.py:932 (`destroy_removed_images`) is never reached
          on the refused path.
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

WHAT THE GUARD IS AND IS NOT. It fires only when ALL of these hold: the
business's status is in `LAST_PHOTO_GUARDED_STATUSES`, the payload would
leave the gallery empty, and the gallery is not already empty. A `draft`,
`pending` or `rejected` business can still empty its gallery — the submit
gate and the approve gate are where that is caught, and widening the rule
to them would change behaviour Sapir did not ask about. A legacy approved
business that ALREADY has no photos is not blocked from saving other
fields, because there is no last photo to remove; that case is asserted
below rather than left to chance.

`inactive` IS guarded, and that is one status wider than the ruling's
word "approved". The reviewer measured why: `toggle_producer_status`
(`admin.py`) flips `inactive → approved` with no `_assert_approvable`
call, so guarding `approved` alone leaves the invariant violable in three
admin clicks — pause, owner empties the gallery, un-pause — and the first
revision of this very file *blessed* the middle step. The deliberately
narrow reading of the ruling would have shipped a guard that cannot hold.
The test below asserts the block; the one after it asserts the three
unguarded statuses still pass, so the widening cannot creep further
without a red.
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
# The machine-readable half of the MEH-1943 envelope. The frontend branches
# on this, never on the sentence: a Hebrew-string comparison is false on
# /en, which is how the card's own save-path branch was dead on arrival.
LAST_PHOTO_CODE = "last_photo_required"


def _assert_refused(resp) -> None:
    """The refusal, asserted as a shape and not as a status code alone.

    A 422 by itself does not distinguish this guard from a schema
    rejection (regression rule 6 is the same point from the other
    side), so every refusal here is checked down to the code AND the
    sentence the owner reads.
    """
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert isinstance(detail, dict), f"expected the MEH-1943 envelope, got {detail!r}"
    assert detail["code"] == LAST_PHOTO_CODE, resp.text
    assert detail["message"] == LAST_PHOTO_MESSAGE, resp.text
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

    _assert_refused(resp)

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

    _assert_refused(resp)
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


def test_a_paused_business_cannot_remove_its_last_photo_either(client, db):
    """`inactive` is guarded too, and this is the test that says why.

    An earlier revision of this file asserted the opposite — that a
    paused business MAY empty its gallery — reading Sapir's ruling as
    the single word "approved". A reviewer measured the hole that
    reading leaves: `toggle_producer_status` in `admin.py` moves a row
    between `approved` and `inactive` WITHOUT calling
    `_assert_approvable`, so an admin can pause a business, the owner can
    empty the gallery under the old rule, and the admin can un-pause it
    back to live with no photo. Three clicks, no concurrency, and the
    invariant the card exists to establish is gone.

    So the guard covers `inactive`, and the ruling's intent ("an approved
    business keeps a photo") survives the pause/un-pause round trip. The
    missing `_assert_approvable` on the toggle is MEH-2945 — fixing
    it there would ALSO close this path, but the guard here does not
    depend on that fix landing.
    """
    producer, owner = _owner_with_gallery(db, status="inactive")
    producer_id = producer.id
    before = list(producer.images)

    resp = client.put(
        "/producers/me", json={"images": []}, headers=auth_header(owner)
    )

    _assert_refused(resp)
    db.expire_all()
    after = db.get(Producer, producer_id)
    assert after.images == before, "the paused gallery must be left as it was"
    assert after.status == "inactive", "no status change on the refused path"


@pytest.mark.parametrize("status", ["draft", "pending", "rejected"])
def test_a_business_that_was_never_live_may_still_empty_its_gallery(
    client, db, status
):
    """Unchanged behaviour for every status that is not live, deliberately.

    A business that has never been published has nothing to protect: the
    submit gate (`submission_gate.py`) and the approve gate (`admin.py`,
    MEH-799) are where an empty gallery is caught for those. Widening the
    rule to them would change behaviour Sapir did not ask about, and this
    test is what would notice if a later edit did widen it.

    The pair matters in both directions: the test above fails if
    `inactive` is dropped from the guard, this one fails if the guard
    grows to cover every status. Neither alone pins the boundary.
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

    # The English half is approved copy too (Sapir, 11/11), and it is NOT
    # compared with the backend constant: the 422 carries one sentence and
    # the card renders the locale's own, which is exactly why the card
    # branches on the code. Pinned here so an /en owner cannot be shown a
    # paraphrase — or the raw Hebrew — without a red.
    messages_en = json.loads(
        (repo_root / "frontend" / "messages" / "en.json").read_text(encoding="utf-8")
    )
    assert messages_en["dashboard"]["producer"]["images"]["last_photo"] == (
        "You can't remove the last photo. Add another photo first, "
        "then remove this one."
    ), "the approved English sentence drifted (rule 22)"


def test_the_client_pre_check_guards_exactly_the_same_statuses():
    """One status set, two surfaces, enforced rather than asked for.

    `cards.jsx` refuses the removal at click time so the owner is told
    before a round trip; `producer_me.py` refuses it again for a client
    that skipped the pre-check. Neither can be deleted in favour of the
    other, so the duplication stays — and a comment saying "keep in sync"
    is the exact thing workflow.md calls a docs patch over missing
    enforcement. This is the enforcement.

    It reds in both directions: adding a status to one side only, or
    dropping one. The reviewer's measurement is why it exists — with the
    status condition removed from the card entirely, the whole 21-test
    frontend suite stayed green.
    """
    import pathlib
    import re

    from app.routers.producer_me import LAST_PHOTO_GUARDED_STATUSES

    repo_root = pathlib.Path(__file__).resolve().parent.parent
    card = (
        repo_root
        / "frontend"
        / "app"
        / "[locale]"
        / "producer"
        / "dashboard"
        / "edit"
        / "cards.jsx"
    )
    source = card.read_text(encoding="utf-8")

    # Container-agnostic on purpose: the declaration is a `new Set([...])`
    # today and was a bare array yesterday (eslint's prefer-set-has). What
    # the guard needs is the member list, not the wrapper.
    match = re.search(
        r"const LAST_PHOTO_GUARDED_STATUSES\s*=[^\[]*\[([^\]]*)\]", source
    )
    assert match, (
        "cards.jsx no longer declares LAST_PHOTO_GUARDED_STATUSES with a "
        "bracketed member list — either it was renamed (then the card may "
        "have lost the status condition entirely) or reformatted (then fix "
        "this regex)"
    )
    from_card = set(re.findall(r'"([^"]+)"', match.group(1)))
    assert from_card, "the card's guarded-status array is empty"

    assert from_card == set(LAST_PHOTO_GUARDED_STATUSES), (
        "the click-time guard and the API guard cover different statuses:\n"
        f"  cards.jsx:      {sorted(from_card)}\n"
        f"  producer_me.py: {sorted(LAST_PHOTO_GUARDED_STATUSES)}"
    )
