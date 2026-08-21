"""MEH-2072 — licence expiry capture + the 30-day admin reminder list.

`producer_license_number` records THAT a licence was seen, never UNTIL WHEN.
So the "licensed businesses only" promise is verified once, at approval, and
never again. `license_expires_at` stores the missing half, and
`GET /admin/license-expiry-reminders` surfaces the businesses about to lapse.

The exposure rules are the interesting part, and they are what most of this
module asserts:

  * admin PUT writes it            (it is the admin's record of a document)
  * owner PUT must NOT write it    (otherwise it is self-certification)
  * public serializers must NOT carry it (MEH-530 privacy precedent)

Note the file lives in `tests/`, not `backend/tests/` as MEH-2072's
`<file_locations>` says — `backend/tests/` does not exist in this repo; all 220
suites are here.

REUSES: tests/test_producer_me_delivery_fields.py:27 (`_producer_user` owner
wiring) and tests/test_admin_approval_transitions.py:29 (`_admin`).

## On the window-boundary cases below

The reminder query has four clauses and each excludes a real row, so each gets
a case that fails if the clause is dropped rather than a single happy-path row
that would pass with any three of them:

  IS NOT NULL      -> `test_null_expiry_never_reminded`
  >= today         -> `test_already_lapsed_is_excluded`
  <= today+30      -> `test_beyond_window_is_excluded`
  status approved  -> `test_pending_producer_is_excluded`

`test_reminder_window_boundaries_are_inclusive` pins the two endpoints (day 0
and day 30) that an off-by-one would silently drop.
"""

from datetime import timedelta

from app.utils.clock import israel_today
from conftest import auth_header, make_producer, make_user

REMINDERS = "/admin/license-expiry-reminders"


def _admin(db):
    return make_user(db, role="admin")


def _producer_user(db, **kwargs):
    producer = make_producer(db, **kwargs)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _with_expiry(db, days_out, *, status="approved", name="חוות הרישיון"):
    """A producer whose licence expires `days_out` days from Israel's today."""
    producer = make_producer(db, name=name, status=status)
    producer.license_expires_at = israel_today() + timedelta(days=days_out)
    producer.phone = "0501234567"
    producer.producer_license_number = "12345"
    db.commit()
    return producer


def _ids(resp):
    return {row["producer_id"] for row in resp.json()["rows"]}


# --- the column exists and the admin can write it -------------------------


def test_admin_put_persists_license_expires_at(client, db):
    producer = make_producer(db)
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"license_expires_at": "2027-03-15"},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["license_expires_at"] == "2027-03-15"
    db.refresh(producer)
    assert producer.license_expires_at.isoformat() == "2027-03-15"


def test_admin_put_accepts_a_past_expiry(client, db):
    """Capturing an ALREADY-lapsed licence during review must be possible.

    This is why `license_expires_at` ships with no validator while its sibling
    `vacation_until` has a not-in-the-past rule. An admin reviewing a business
    whose paperwork has already expired needs to record what the document says;
    rejecting it would force her to either lie or leave the field empty, and an
    empty field is indistinguishable from "not captured yet".
    """
    producer = make_producer(db)
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"license_expires_at": "2020-01-01"},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.license_expires_at.isoformat() == "2020-01-01"


# --- exposure: owner cannot write, public cannot read ---------------------


def test_owner_put_cannot_write_license_expires_at(client, db):
    """The AC's central guard: this is the admin's record, not the owner's.

    Asserts BEHAVIOUR, not that the field is absent from a set — per
    workflow.md §3.6, a test that checks the prescribed change was applied
    passes an inert fix by construction. Re-adding `license_expires_at` to
    `_PRODUCER_WRITABLE_FIELDS` turns this red.

    200-and-ignored rather than 422, matching how the endpoint treats every
    other non-writable field (see test_producer_me_delivery_fields.py on
    `opening_hours`): an older client submitting a stale field should not break.
    """
    user, producer = _producer_user(db)
    producer.license_expires_at = None
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"license_expires_at": "2027-03-15", "description": "עודכן"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.license_expires_at is None, (
        "license_expires_at is admin-owned — the owner PUT must ignore it, or "
        "a business can certify its own licence validity"
    )
    # Control: the SAME request did persist a genuinely owner-writable field.
    # Without this, a PUT that silently 200s while writing nothing at all would
    # satisfy the assertion above and prove nothing.
    assert producer.description == "עודכן"


def test_owner_put_cannot_overwrite_an_existing_expiry(client, db):
    """The destructive direction of the same guard.

    Ignoring a write into an empty column and ignoring a write over the admin's
    captured date are different failures; the second one destroys review
    evidence. Asserted separately because a naive implementation could pass the
    first (e.g. by only setting the field when currently NULL).
    """
    user, producer = _producer_user(db)
    producer.license_expires_at = israel_today() + timedelta(days=200)
    db.commit()
    original = producer.license_expires_at

    resp = client.put(
        "/producers/me",
        json={"license_expires_at": "2099-12-31"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.license_expires_at == original


def test_public_serializers_never_expose_license_expires_at(client, db):
    """MEH-530 privacy precedent — the licence number is admin-only, so is this.

    Covers BOTH public shapes (detail + list). The list is checked because it is
    a different serializer, and MEH-530's own history is a field that was
    correctly withheld from one and leaked through the other.
    """
    producer = _with_expiry(db, 10, name="חוות ציבורית")

    detail = client.get(f"/producers/{producer.id}")
    assert detail.status_code == 200, detail.text
    assert "license_expires_at" not in detail.json()
    # Control: the request really did serialise THIS producer, so the absence
    # above is a real absence and not an empty/error body.
    assert detail.json()["name"] == "חוות ציבורית"

    listing = client.get("/producers")
    assert listing.status_code == 200, listing.text
    rows = listing.json()
    assert any(row["name"] == "חוות ציבורית" for row in rows), (
        "the producer must be IN the listing — otherwise the absence assertion "
        "below is vacuous"
    )
    for row in rows:
        assert "license_expires_at" not in row


def test_admin_serializer_does_expose_license_expires_at(client, db):
    """The mirror of the test above: withheld publicly, PRESENT for the admin.

    Without this pair, deleting the field everywhere would leave the privacy
    tests green while the feature does nothing.
    """
    producer = _with_expiry(db, 10, name="חוות אדמין")
    # The LIST serializer specifically, deliberately — `ProducerAdminOut` is
    # returned by more than one route and they are separate exposure surfaces.
    # `test_admin_get_producer_returns_admin_shape` covers the per-id route this
    # PR adds; this one covers the list, so removing the field from either is
    # caught by a named test rather than by whichever happened to be checked.
    #
    # (This comment previously read "there is no per-id admin GET", which was
    # true when it was written and stopped being true inside this same PR — the
    # scope extension added `GET /admin/producers/{id}`. Caught by the CI
    # reviewer. Same defect class as the ProducerForm comment that hid the
    # original bug: a comment describing a world the code no longer lives in.)
    resp = client.get("/admin/producers", headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    row = next(r for r in resp.json() if r["name"] == "חוות אדמין")
    assert row["license_expires_at"] == producer.license_expires_at.isoformat()


# --- the reminder list ----------------------------------------------------


def test_reminder_lists_producer_inside_window(client, db):
    producer = _with_expiry(db, 20)
    resp = client.get(REMINDERS, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["window_days"] == 30
    assert body["total"] == 1
    row = body["rows"][0]
    assert row["producer_id"] == str(producer.id)
    assert row["days_remaining"] == 20
    assert row["producer_license_number"] == "12345"
    # Full number must never leave the backend (mirrors the kashrut row).
    assert row["phone_masked"] == "***4567"
    assert "phone" not in row


def test_null_expiry_never_reminded(client, db):
    """NULL means "not captured yet", never "expired".

    Drop the `IS NOT NULL` clause and every producer predating MEH-2072 floods
    this list — the failure that would get the feature switched off.
    """
    make_producer(db, name="חווה בלי תאריך", status="approved")
    resp = client.get(REMINDERS, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 0


def test_already_lapsed_is_excluded(client, db):
    """A licence that expired yesterday is a different problem, not this list."""
    _with_expiry(db, -1)
    resp = client.get(REMINDERS, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 0


def test_beyond_window_is_excluded(client, db):
    _with_expiry(db, 31)
    resp = client.get(REMINDERS, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 0


def test_pending_producer_is_excluded(client, db):
    """A pending business is already in the review queue, licence in hand."""
    _with_expiry(db, 10, status="pending")
    resp = client.get(REMINDERS, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 0


def test_reminder_window_boundaries_are_inclusive(client, db):
    """Day 0 and day 30 are both IN. An off-by-one drops them silently.

    Day 0 is the one that matters operationally: a licence expiring today is the
    most urgent row there is, and `> today` instead of `>= today` would hide
    exactly it while every other case stayed green.
    """
    today_row = _with_expiry(db, 0, name="פג היום")
    edge_row = _with_expiry(db, 30, name="פג בעוד 30")
    _with_expiry(db, 31, name="פג בעוד 31")

    resp = client.get(REMINDERS, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    ids = _ids(resp)
    assert str(today_row.id) in ids
    assert str(edge_row.id) in ids
    # Count, not a sum of literals: adding a fourth in-window row must move it.
    assert resp.json()["total"] == 2


def test_reminder_rows_are_ordered_soonest_first(client, db):
    later = _with_expiry(db, 25, name="מאוחר")
    sooner = _with_expiry(db, 3, name="מוקדם")
    middle = _with_expiry(db, 14, name="אמצע")

    resp = client.get(REMINDERS, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    assert [row["producer_id"] for row in resp.json()["rows"]] == [
        str(sooner.id),
        str(middle.id),
        str(later.id),
    ]


def test_producer_without_phone_is_still_reminded(client, db):
    """Deliberate divergence from the kashrut endpoint, which requires a phone.

    That one FILTERS on phone because it sends WhatsApp — no number, no send.
    This one only lists, and a business with no phone on file still needs its
    licence chased; the admin just reaches it another way. Filtering here would
    hide the row entirely, which is the opposite of the point.
    """
    producer = _with_expiry(db, 5)
    producer.phone = None
    db.commit()

    resp = client.get(REMINDERS, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 1
    assert resp.json()["rows"][0]["phone_masked"] == "<missing>"


def test_reminder_requires_admin(client, db):
    """require_admin, not merely authenticated — the list is internal review data."""
    user, _ = _producer_user(db, name="חוות לא-אדמין")
    resp = client.get(REMINDERS, headers=auth_header(user))
    assert resp.status_code == 403, resp.text

    anon = client.get(REMINDERS)
    assert anon.status_code in (401, 403), anon.text


# --- the admin edit page's read path (MEH-2072 scope extension) ------------
#
# These do not test license_expires_at specifically; they test the ROUTE the
# admin edit page loads, because that route is what decides whether ANY
# admin-only field survives a save. Found while wiring the form field: the page
# was loading the PUBLIC serializer, so the form hydrated every admin-only
# field as "" and wrote the blanks back. Three fields were already being wiped
# this way before this ticket existed.


def test_admin_get_producer_returns_admin_shape(client, db):
    """The route the edit page loads must carry the admin-only fields.

    Before MEH-2072 this route did not exist at all — `GET /admin/producers/{id}`
    returned **405**, while ProducerForm's own comment claimed the page used it.
    """
    producer = _with_expiry(db, 10)
    producer.address = "הרצל 1"
    db.commit()

    resp = client.get(
        f"/admin/producers/{producer.id}", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["producer_license_number"] == "12345"
    assert body["address"] == "הרצל 1"
    assert body["license_expires_at"] == producer.license_expires_at.isoformat()


def test_admin_get_producer_requires_admin_and_404s_cleanly(client, db):
    user, producer = _producer_user(db, name="חוות לא-אדמין")
    assert (
        client.get(
            f"/admin/producers/{producer.id}", headers=auth_header(user)
        ).status_code
        == 403
    )
    missing = client.get(
        "/admin/producers/00000000-0000-0000-0000-000000000000",
        headers=auth_header(_admin(db)),
    )
    assert missing.status_code == 404, missing.text


def test_admin_edit_roundtrip_does_not_wipe_admin_only_fields(client, db):
    """The regression that motivated the route — a save must not blank them.

    Simulates the real edit flow end to end: load what the page loads, hydrate
    the way ProducerForm hydrates (`initial.X ?? ""`), submit what it submits.
    Renaming the business must leave the licence untouched.

    Against the old read path (`GET /producers/{id}`) this fails on the first
    assertion, because the hydration produces `""` — which is exactly how the
    bug was measured.
    """
    producer = _with_expiry(db, 10, name="לפני")
    producer.address = "הרצל 1"
    db.commit()
    expiry_before = producer.license_expires_at
    admin = _admin(db)

    loaded = client.get(
        f"/admin/producers/{producer.id}", headers=auth_header(admin)
    ).json()
    # ProducerForm's hydration idiom, verbatim.
    payload = {
        "name": "אחרי",
        "producer_license_number": loaded.get("producer_license_number") or "",
        "address": loaded.get("address") or "",
        "license_expires_at": loaded.get("license_expires_at") or None,
    }
    resp = client.put(
        f"/admin/producers/{producer.id}", json=payload, headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.name == "אחרי", "the edit itself must still apply"
    assert producer.producer_license_number == "12345"
    assert producer.address == "הרצל 1"
    assert producer.license_expires_at == expiry_before
