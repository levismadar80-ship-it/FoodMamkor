"""MEH-1399 Phase 2 — the review checklist as data, and its audit trail.

Phase 1 (MEH-1396) shipped the checklist as a frozen frontend constant with
session-local ticks. Two things were missing and are what this suite guards:
editing an item required a deploy, and the ticks evaporated, so nothing
recorded WHAT was verified before a business went live.

The properties worth a test are the ones a plausible implementation gets wrong:

  * `label_snapshot` freezes at TICK time — editing an item later must not
    retroactively change what a past admin attested to.
  * re-saving an unchanged checklist must NOT restamp `checked_at`, or every
    autosave rewrites the audit trail to the latest page load.
  * an item absent from a save is RETIRED (`active=false`), never deleted —
    the DB's ON DELETE RESTRICT makes deletion impossible anyway.
  * ticks never gate approval; the hard 422 gates are untouched.

REUSES: tests/test_admin_approval_transitions.py:29 (`_admin`),
tests/test_producer_me_delivery_fields.py:27 (owner wiring).
"""

from conftest import auth_header, make_producer, make_user

ITEMS = "/admin/checklist-items"


def _admin(db):
    return make_user(db, role="admin")


def _checks_url(producer_id):
    return f"/admin/producers/{producer_id}/review-checks"


def _seed_items(client, db, admin, labels=("סעיף א", "סעיף ב")):
    """Create items through the real endpoint, returning the created rows.

    Goes through the API rather than inserting ORM rows directly so the tests
    exercise the same position-assignment path the settings screen uses.
    """
    resp = client.put(
        ITEMS,
        json={"items": [{"label": label} for label in labels]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- the item list --------------------------------------------------------


def test_put_creates_items_and_assigns_positions_from_order(client, db):
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("ראשון", "שני", "שלישי"))

    assert [r["label"] for r in rows] == ["ראשון", "שני", "שלישי"]
    # Spaced, not 0/1/2 — the migration's convention, so a later insert between
    # two items needs no renumbering.
    assert [r["position"] for r in rows] == [0, 10, 20]


def test_reorder_follows_array_order_not_client_positions(client, db):
    """Order is taken from the array index; the payload carries no position.

    Discriminates against an implementation that trusts a client-sent
    `position` — two items could then claim the same slot.
    """
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("א", "ב"))

    resp = client.put(
        ITEMS,
        json={
            "items": [
                {"id": rows[1]["id"], "label": "ב"},
                {"id": rows[0]["id"], "label": "א"},
            ]
        },
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert [r["label"] for r in resp.json()] == ["ב", "א"]


def test_inactive_items_hidden_by_default_and_shown_on_request(client, db):
    """The review flow must not offer a retired item; settings must still edit it."""
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("חי", "פורש"))

    resp = client.put(
        ITEMS,
        json={
            "items": [
                {"id": rows[0]["id"], "label": "חי", "active": True},
                {"id": rows[1]["id"], "label": "פורש", "active": False},
            ]
        },
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    default = client.get(ITEMS, headers=auth_header(admin))
    assert [r["label"] for r in default.json()] == ["חי"]

    full = client.get(f"{ITEMS}?include_inactive=true", headers=auth_header(admin))
    assert [r["label"] for r in full.json()] == ["חי", "פורש"]


def test_unknown_item_id_is_rejected_not_silently_created(client, db):
    """A stale tab saving against a vanished id is told, not quietly re-inserted."""
    admin = _admin(db)
    resp = client.put(
        ITEMS,
        json={
            "items": [{"id": "00000000-0000-0000-0000-000000000000", "label": "רפאים"}]
        },
        headers=auth_header(admin),
    )
    assert resp.status_code == 404, resp.text


def test_blank_label_is_rejected(client, db):
    admin = _admin(db)
    resp = client.put(
        ITEMS, json={"items": [{"label": "   "}]}, headers=auth_header(admin)
    )
    assert resp.status_code == 422, resp.text


# --- the audit trail ------------------------------------------------------


def test_ticks_persist_with_actor_and_timestamp(client, db):
    admin = _admin(db)
    items = _seed_items(client, db, admin)
    producer = make_producer(db, status="pending")

    resp = client.put(
        _checks_url(producer.id),
        json={"item_ids": [items[0]["id"]]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    checks = resp.json()["checks"]
    assert len(checks) == 1
    assert checks[0]["item_id"] == items[0]["id"]
    assert checks[0]["label_snapshot"] == "סעיף א"
    assert checks[0]["checked_by_name"] == admin.name
    assert checks[0]["checked_at"]

    # Survives a reload — the whole point of Phase 2 over Phase 1.
    reread = client.get(_checks_url(producer.id), headers=auth_header(admin))
    assert reread.status_code == 200, reread.text
    assert len(reread.json()["checks"]) == 1


def test_label_snapshot_freezes_at_tick_time(client, db):
    """THE audit property: editing an item must not rewrite past attestations.

    Discriminates against the obvious implementation — joining to the item and
    rendering its CURRENT label — which would make this assertion read the new
    wording and silently change what a past admin is recorded as having
    verified.
    """
    admin = _admin(db)
    items = _seed_items(client, db, admin)
    producer = make_producer(db, status="pending")

    client.put(
        _checks_url(producer.id),
        json={"item_ids": [items[0]["id"]]},
        headers=auth_header(admin),
    )

    # The admin rewords the item afterwards.
    edited = client.put(
        ITEMS,
        json={
            "items": [
                {"id": items[0]["id"], "label": "נוסח חדש לגמרי"},
                {"id": items[1]["id"], "label": items[1]["label"]},
            ]
        },
        headers=auth_header(admin),
    )
    assert edited.status_code == 200, edited.text

    resp = client.get(_checks_url(producer.id), headers=auth_header(admin))
    assert resp.json()["checks"][0]["label_snapshot"] == "סעיף א", (
        "the recorded attestation must keep the wording the admin actually saw; "
        "reading the item's current label would rewrite history"
    )
    # Control: the item itself really did change, so the assertion above is
    # about the snapshot and not about an edit that never landed.
    current = client.get(ITEMS, headers=auth_header(admin))
    assert current.json()[0]["label"] == "נוסח חדש לגמרי"


def test_resaving_an_unchanged_tick_does_not_restamp(client, db):
    """Re-saving must keep the FIRST attestation.

    The UI saves on every toggle, so a naive delete-all-then-reinsert would
    move `checked_at` to the latest page load and lose when the check actually
    happened. Discriminates against exactly that implementation.
    """
    admin = _admin(db)
    items = _seed_items(client, db, admin)
    producer = make_producer(db, status="pending")

    first = client.put(
        _checks_url(producer.id),
        json={"item_ids": [items[0]["id"]]},
        headers=auth_header(admin),
    )
    original_at = first.json()["checks"][0]["checked_at"]

    again = client.put(
        _checks_url(producer.id),
        json={"item_ids": [items[0]["id"]]},
        headers=auth_header(admin),
    )
    assert again.status_code == 200, again.text
    assert again.json()["checks"][0]["checked_at"] == original_at


def test_unticking_removes_the_row(client, db):
    """Set semantics: absent means unticked, and an unticked item is no row.

    "Never ticked" and "ticked then unticked" are deliberately the same state —
    the trail records what was verified, not a keystroke log.
    """
    admin = _admin(db)
    items = _seed_items(client, db, admin)
    producer = make_producer(db, status="pending")

    client.put(
        _checks_url(producer.id),
        json={"item_ids": [items[0]["id"], items[1]["id"]]},
        headers=auth_header(admin),
    )
    resp = client.put(
        _checks_url(producer.id),
        json={"item_ids": [items[1]["id"]]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert [c["item_id"] for c in resp.json()["checks"]] == [items[1]["id"]]


def test_checks_are_scoped_per_producer(client, db):
    """A tick on one business must not appear on another.

    Cheap, and it is the assertion that fails if the query ever loses its
    producer filter — which would silently mark every business as reviewed.
    """
    admin = _admin(db)
    items = _seed_items(client, db, admin)
    reviewed = make_producer(db, name="נבדק", status="pending")
    untouched = make_producer(db, name="לא נבדק", status="pending")

    client.put(
        _checks_url(reviewed.id),
        json={"item_ids": [items[0]["id"]]},
        headers=auth_header(admin),
    )
    resp = client.get(_checks_url(untouched.id), headers=auth_header(admin))
    assert resp.status_code == 200, resp.text
    assert resp.json()["checks"] == []


def test_unknown_producer_404s_rather_than_returning_empty(client, db):
    """ "No ticks" and "no such business" are different facts."""
    admin = _admin(db)
    missing = "00000000-0000-0000-0000-000000000000"
    assert (
        client.get(_checks_url(missing), headers=auth_header(admin)).status_code == 404
    )
    assert (
        client.put(
            _checks_url(missing), json={"item_ids": []}, headers=auth_header(admin)
        ).status_code
        == 404
    )


def test_ticks_do_not_gate_approval(client, db):
    """Phase 1's contract, still true: the checklist is a soft aid.

    An approval with ZERO ticks recorded must still succeed. If this ever goes
    red, the checklist has silently become a hard gate — the one regression
    that would change how the admin queue behaves under load.
    """
    admin = _admin(db)
    _seed_items(client, db, admin)
    producer = make_producer(
        db,
        status="pending",
        images=["https://res.cloudinary.com/demo/image/upload/v1/test.jpg"],
        phone_verified=True,
    )

    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"


# --- auth ----------------------------------------------------------------


def test_all_routes_require_admin(client, db):
    owner_producer = make_producer(db, name="לא אדמין")
    owner = make_user(db, role="producer")
    owner.producer_id = owner_producer.id
    db.commit()

    assert client.get(ITEMS, headers=auth_header(owner)).status_code == 403
    assert (
        client.put(ITEMS, json={"items": []}, headers=auth_header(owner)).status_code
        == 403
    )
    assert (
        client.get(
            _checks_url(owner_producer.id), headers=auth_header(owner)
        ).status_code
        == 403
    )
    assert client.get(ITEMS).status_code in (401, 403)
