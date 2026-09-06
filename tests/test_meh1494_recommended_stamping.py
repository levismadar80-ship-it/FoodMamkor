"""
Module:   test_meh1494_recommended_stamping
Purpose:  Chunk B — the admin PUT stamps `recommended_at` on the TRANSITION of
          `is_recommended`, clears it on an un-pick, and leaves it alone
          otherwise. Plus the admin-only write path for `recommended_note`.
Touches:  The test DB via `db`; HTTP through `client`, admin-authenticated.
Does NOT: assert the column shapes or the public-serializer exclusion — that is
          chunk A, in `test_meh1494_recommended_at_note.py`. Does not cover the
          annual-review listing or the ProducerForm field.
Related:  backend/app/routers/admin.py::_apply_recommended_pick /
          admin_update_producer; backend/app/schemas/schemas.py::ProducerUpdate;
          backend/app/routers/producer_me.py::_PRODUCER_WRITABLE_FIELDS.
History:  MEH-1494 chunk B (creation, 06/09).

Two of these cases pass against the pre-change code as well, and that is on
purpose — they do not discriminate against "no stamping at all", they
discriminate against the plausible WRONG implementation: one that stamps from
the VALUE rather than from the transition. That version resets the clock on
every unrelated admin edit, which silently disarms the annual review the column
exists for. Each such case says which world it separates.
"""

from datetime import datetime, timedelta, timezone

from conftest import auth_header, make_producer, make_user

from app.models.models import Producer

OLD_PICK = datetime(2026, 1, 15, 9, 0, tzinfo=timezone.utc)


def _admin(db):
    return make_user(db, email="rec-stamp-admin@example.com", role="admin")


def _picked(db, *, at=OLD_PICK, note=None):
    """A producer already carrying the pick and a stamp."""
    p = make_producer(db, name="עסק שכבר נבחר")
    p.is_recommended = True
    p.recommended_at = at
    p.recommended_note = note
    db.commit()
    db.refresh(p)
    return p


def _reload(db, producer_id) -> Producer:
    db.expire_all()
    return db.query(Producer).filter(Producer.id == producer_id).first()


# ── the transition ────────────────────────────────────────────────────────
def test_picking_stamps_the_date(db, client):
    """False → True. Pre-change this stayed NULL and the review clock never
    started."""
    admin = _admin(db)
    p = make_producer(db, name="עסק שנבחר עכשיו")
    assert p.recommended_at is None

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"is_recommended": True},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    row = _reload(db, p.id)
    assert row.is_recommended is True
    assert row.recommended_at is not None, "the pick did not start the clock"
    # Sanity on the value rather than on its mere presence: a stamp that is not
    # roughly now is a stamp from the wrong clock.
    delta = abs(datetime.now(timezone.utc) - row.recommended_at)
    assert delta < timedelta(minutes=5), f"stamped {row.recommended_at}"


def test_unpicking_clears_the_date(db, client):
    """True → False. Pre-change the old date survived and the row sat in the
    review list forever as overdue."""
    admin = _admin(db)
    p = _picked(db)

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"is_recommended": False},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    row = _reload(db, p.id)
    assert row.is_recommended is False
    assert row.recommended_at is None, "the clock kept running after the un-pick"


def test_explicit_null_counts_as_an_unpick(db, client):
    """`is_recommended` is a nullable column and the schema is `bool | None`,
    so an explicit null reaches the handler. A NULL flag is not a pick."""
    admin = _admin(db)
    p = _picked(db)

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"is_recommended": None},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    row = _reload(db, p.id)
    assert row.recommended_at is None


# ── the non-transitions (both-worlds; they separate a VALUE-driven stamp) ──
def test_resaving_a_picked_row_keeps_the_original_date(db, client):
    """True → True. Passes against the pre-change code too — what it rejects is
    a stamp driven by the value, which would move the date to now and hand the
    row a fresh 12 months on every re-save."""
    admin = _admin(db)
    p = _picked(db)

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"is_recommended": True},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    row = _reload(db, p.id)
    assert row.recommended_at == OLD_PICK, "the re-save reset the review window"


def test_an_edit_that_does_not_mention_the_pick_leaves_the_date(db, client):
    """An unrelated admin edit. Rejects a stamp that reads the resulting value
    instead of the payload: with `exclude_unset`, an absent `is_recommended`
    reads as falsy, so such a version would clear the date on a name change."""
    admin = _admin(db)
    p = _picked(db)

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"name": "שם חדש לגמרי"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    row = _reload(db, p.id)
    assert row.name == "שם חדש לגמרי"
    assert row.is_recommended is True
    assert row.recommended_at == OLD_PICK, "an unrelated edit moved the clock"


def test_unpicking_keeps_the_note(db, client):
    """The note is the editor's record of a decision that was made; ADR-030
    makes it the thing that has to be defensible, so an un-pick does not erase
    it. Stated as a test because it is a decision, not an oversight."""
    admin = _admin(db)
    p = _picked(db, note="בחירה על סמך ביקור באוגוסט")

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"is_recommended": False},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    row = _reload(db, p.id)
    assert row.recommended_at is None
    assert row.recommended_note == "בחירה על סמך ביקור באוגוסט"


# ── the note's write path ─────────────────────────────────────────────────
def test_admin_can_write_the_note(db, client):
    admin = _admin(db)
    p = make_producer(db, name="עסק לנימוק")

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"is_recommended": True, "recommended_note": "חלב כבשים, ביקור 09/26"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    row = _reload(db, p.id)
    assert row.recommended_note == "חלב כבשים, ביקור 09/26"
    assert row.recommended_at is not None


def test_the_owner_cannot_write_the_note_or_the_pick(db, client):
    """`ProducerUpdate` is shared by both PUTs; only the admin one bulk-setattrs
    it. The owner's handler filters through `_PRODUCER_WRITABLE_FIELDS`, and
    neither field is in it — so a business cannot cite itself as the editor's
    pick."""
    owner = make_user(db, email="rec-stamp-owner@example.com", role="producer")
    p = make_producer(db, name="עסק של הבעלים")
    # The link is `User.producer_id` — `producer_me` loads by it, not by an
    # owner column on the producer (`update_my_producer`, producer_me.py).
    owner.producer_id = p.id
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"recommended_note": "אנחנו הכי טובים", "is_recommended": True},
        headers=auth_header(owner),
    )

    assert resp.status_code in (200, 422), resp.text
    row = _reload(db, p.id)
    assert row.recommended_note is None, "the owner wrote the editor's citation"
    assert not row.is_recommended, "the owner picked herself"
    assert row.recommended_at is None


# ── the annual-review view ────────────────────────────────────────────────
# `GET /admin/producers?recommended_review_due=true`. The window is 365 days;
# a NULL stamp is DUE, because chunk A deliberately did not invent a date for
# rows picked before the column existed.
def _due_names(client, admin) -> set[str]:
    resp = client.get(
        "/admin/producers?recommended_review_due=true", headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text
    return {row["name"] for row in resp.json()}


def test_the_review_view_selects_unstamped_and_expired_picks(db, client):
    admin = _admin(db)
    now = datetime.now(timezone.utc)

    never = make_producer(db, name="נבחרה לפני שהיה שעון")
    never.is_recommended = True  # recommended_at stays NULL
    expired = make_producer(db, name="נבחרה לפני 13 חודשים")
    expired.is_recommended = True
    expired.recommended_at = now - timedelta(days=396)
    fresh = make_producer(db, name="נבחרה בשבוע שעבר")
    fresh.is_recommended = True
    fresh.recommended_at = now - timedelta(days=7)
    # Not picked, but carrying an old date — the filter must gate on the PICK,
    # not on the date alone, or an un-picked row would haunt the review list.
    stale_unpicked = make_producer(db, name="לא נבחרה, תאריך ישן")
    stale_unpicked.is_recommended = False
    stale_unpicked.recommended_at = now - timedelta(days=400)
    plain = make_producer(db, name="עסק רגיל")
    db.commit()

    due = _due_names(client, admin)

    assert never.name in due, "a pick with no clock is not being reviewed"
    assert expired.name in due
    assert fresh.name not in due, "a recent pick is due for review"
    assert stale_unpicked.name not in due, "the filter keyed on the date, not the pick"
    assert plain.name not in due
    # Count, not a membership spot-check: exactly the two, nothing else swept in.
    assert len(due) == 2, due


def test_the_boundary_is_the_window_not_a_guess(db, client):
    """Just inside and just outside 365 days, so an off-by-a-lot cannot pass."""
    admin = _admin(db)
    now = datetime.now(timezone.utc)

    inside = make_producer(db, name="יום לפני הגבול")
    inside.is_recommended = True
    inside.recommended_at = now - timedelta(days=364)
    outside = make_producer(db, name="יום אחרי הגבול")
    outside.is_recommended = True
    outside.recommended_at = now - timedelta(days=366)
    db.commit()

    due = _due_names(client, admin)
    assert outside.name in due
    assert inside.name not in due


def test_the_default_listing_is_unchanged(db, client):
    """The param defaults to False, so the queue the admin actually opens is
    byte-identical to before this chunk."""
    admin = _admin(db)
    picked = make_producer(db, name="נבחרה, בלי שעון")
    picked.is_recommended = True
    make_producer(db, name="עסק רגיל שני")
    db.commit()

    resp = client.get("/admin/producers", headers=auth_header(admin))
    assert resp.status_code == 200, resp.text
    names = {row["name"] for row in resp.json()}
    assert picked.name in names, "the default listing dropped rows"
    assert "עסק רגיל שני" in names
