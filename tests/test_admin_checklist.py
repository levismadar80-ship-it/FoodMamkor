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

from uuid import UUID

from app.models.models import AdminChecklistItem, ProducerReviewCheck
from app.routers.admin_checklist import router as admin_checklist_router
from conftest import auth_header, make_producer, make_user

ITEMS = "/admin/checklist-items"


def _admin(db):
    return make_user(db, role="admin")


def _checks_url(producer_id):
    return f"/admin/producers/{producer_id}/review-checks"


def _item_row(db, item_id):
    """Read an item straight from the DB, bypassing the session's cache.

    `expire_all()` matters: the request handler committed through a different
    session, so a cached instance here would answer with the pre-edit value and
    the assertion would fail for a reason that has nothing to do with the
    column.
    """
    db.expire_all()
    return (
        db.query(AdminChecklistItem)
        .filter(AdminChecklistItem.id == UUID(item_id))
        .one()
    )


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
    rows = _seed_items(client, db, admin, labels=("ראשון", "שני"))

    resp = client.put(
        ITEMS,
        json={
            "items": [
                {"id": rows[1]["id"], "label": "שני"},
                {"id": rows[0]["id"], "label": "ראשון"},
            ]
        },
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert [r["label"] for r in resp.json()] == ["שני", "ראשון"]


def test_partial_payload_cannot_collide_with_an_omitted_row(client, db):
    """MEH-2176: an item left out of the payload keeps its position.

    A(0) B(10) C(20) saved as [C, A] used to assign A the index-derived 10 —
    the slot B still occupied — so two rows shared a position and the rendered
    order fell back to a tiebreak nobody specified.

    The assertion is on the COUNT of distinct positions across the whole table,
    not on a literal list: a hardcoded expectation would be re-derivable from
    the fix and would pass on any implementation that happened to produce those
    numbers. `len(set(...)) == len(...)` is falsifiable by the bug and by any
    future change that reintroduces it.
    """
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("אלף", "בית", "גימל"))
    assert [r["position"] for r in rows] == [0, 10, 20]

    # B is omitted. The settings UI always sends the full list, so this is the
    # defensive path — reachable by any other client, and by a future partial
    # save.
    resp = client.put(
        ITEMS,
        json={
            "items": [
                {"id": rows[2]["id"], "label": "גימל"},
                {"id": rows[0]["id"], "label": "אלף"},
            ]
        },
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    positions = [r["position"] for r in resp.json()]
    assert len(set(positions)) == len(positions), (
        f"two rows share a position: {positions}"
    )

    # The omitted row is still there and still untouched — the fix must not
    # renumber a row this request never mentioned.
    omitted = _item_row(db, rows[1]["id"])
    assert omitted.position == 10
    assert omitted.label == "בית"

    # …and the two submitted items keep the order the admin sent them in.
    submitted = {r["id"]: r["position"] for r in resp.json()}
    assert submitted[rows[2]["id"]] < submitted[rows[0]["id"]]


def test_full_payload_still_numbers_from_zero(client, db):
    """The common path is unchanged: nothing omitted, nothing to skip.

    Without this, the collision fix could have silently pushed every save's
    numbering past a phantom `taken` set and no test would have noticed.
    """
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("אלף", "בית", "גימל"))

    resp = client.put(
        ITEMS,
        json={"items": [{"id": r["id"], "label": r["label"]} for r in rows]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert [r["position"] for r in resp.json()] == [0, 10, 20]


def test_updated_at_advances_when_an_item_is_edited(client, db):
    """`updated_at` tracks the last EDIT, not the insert.

    The migration gives the column `server_default=now()`, which fires on
    INSERT only — Postgres will not refresh it on its own. What refreshes it is
    the ORM's `onupdate=func.now()`, and a claim that a column has an onupdate
    is worth exactly as much as a run that shows the value moving. This asserts
    the observable behaviour rather than the presence of the clause, so it
    still holds if the mechanism is later swapped for a trigger.
    """
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("לפני",))
    item_id = rows[0]["id"]
    before = _item_row(db, item_id).updated_at

    resp = client.put(
        ITEMS,
        json={"items": [{"id": item_id, "label": "אחרי"}]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    after = _item_row(db, item_id).updated_at
    assert after > before, f"{before} -> {after}"


def test_inactive_items_hidden_by_default_and_shown_on_request(client, db):
    """The review flow must not offer a retired item; settings must still edit it."""
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("פעיל", "פורש"))

    resp = client.put(
        ITEMS,
        json={
            "items": [
                {"id": rows[0]["id"], "label": "פעיל", "active": True},
                {"id": rows[1]["id"], "label": "פורש", "active": False},
            ]
        },
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    default = client.get(ITEMS, headers=auth_header(admin))
    assert [r["label"] for r in default.json()] == ["פעיל"]

    full = client.get(f"{ITEMS}?include_inactive=true", headers=auth_header(admin))
    assert [r["label"] for r in full.json()] == ["פעיל", "פורש"]


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


def test_punctuation_only_label_is_rejected(client, db):
    """MEH-555: a label needs >=3 letters, not merely a non-empty string.

    This one is not cosmetic. The label is copied into
    `producer_review_checks.label_snapshot` at tick time, so "???" would become
    a permanent audit record of an admin attesting to nothing — and unlike a
    display string, an audit row cannot be corrected later without destroying
    the thing it records.
    """
    admin = _admin(db)

    for bad in ("???", "!!!", "   ", "..."):
        resp = client.put(
            ITEMS,
            json={"items": [{"label": bad}]},
            headers=auth_header(admin),
        )
        assert resp.status_code == 422, f"{bad!r} -> {resp.status_code}"

    # Control: the guard rejects punctuation, not everything. Without this the
    # test above passes just as well against a validator that refuses all input.
    ok = client.put(
        ITEMS,
        json={"items": [{"label": "רישיון תקף"}]},
        headers=auth_header(admin),
    )
    assert ok.status_code == 200, ok.text

    # And `hint` is deliberately NOT gated — optional, and a terse legitimate
    # hint can fall under three letters. Asserted so the asymmetry is a decision
    # on the record rather than an oversight someone later "fixes".
    hint_ok = client.put(
        ITEMS,
        json={"items": [{"label": "רישיון תקף", "hint": "ר'"}]},
        headers=auth_header(admin),
    )
    assert hint_ok.status_code == 200, hint_ok.text


def test_item_payload_exposes_updated_at(client, db):
    """ADR-006 R2 — every non-internal column reaches the matching `*Out`.

    Nothing in this repo mechanically enforces R2 (there is no general parity
    test), so an omission is indistinguishable from drift to the next reader.
    This is that enforcement for this one schema.
    """
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("סעיף א",))
    assert "updated_at" in rows[0], rows[0]
    assert rows[0]["updated_at"], "present but empty is not exposure"


def test_save_returns_the_full_list_including_a_concurrent_addition(client, db):
    """A racing admin's new item must appear in this admin's save response.

    The handler used to return only the rows the request submitted, so an item
    added between page load and save was silently missing from the response —
    the saving admin's UI would then be confidently short one row that exists
    in the database. Injected rather than raced: the "other admin's" item is
    committed directly, then a save is sent that does not mention it.
    """
    admin = _admin(db)
    rows = _seed_items(client, db, admin, labels=("שלי",))

    other = AdminChecklistItem(position=999, label="של מישהי אחרת", active=True)
    db.add(other)
    db.commit()

    resp = client.put(
        ITEMS,
        json={"items": [{"id": rows[0]["id"], "label": "שלי, נערך"}]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    labels = [r["label"] for r in resp.json()]
    assert "של מישהי אחרת" in labels, labels
    assert "שלי, נערך" in labels, labels


# --- concurrency ---------------------------------------------------------
#
# Two admins on the same business is the ordinary case, and the handler's read
# of "what is already ticked" is a check-then-act. Racing two real sessions is
# non-deterministic, so both tests below INJECT the end state instead: they make
# that read return a deliberately stale answer while the database holds the
# state a competing session would have committed. Deterministic, and it drives
# the exact branch the race would.


def test_concurrent_tick_of_same_item_does_not_500(client, db, monkeypatch):
    """A racing session already ticked this item -> still 200, still one row.

    Against a plain INSERT this is an unhandled IntegrityError on the unique
    constraint, i.e. a 500 on a request whose desired end state had already
    been reached. It also pins the no-restamp rule across the race: the FIRST
    attestation survives.
    """
    admin = _admin(db)
    items = _seed_items(client, db, admin)
    producer = make_producer(db, status="pending")

    first = client.put(
        _checks_url(producer.id),
        json={"item_ids": [items[0]["id"]]},
        headers=auth_header(admin),
    )
    assert first.status_code == 200, first.text
    original_checked_at = first.json()["checks"][0]["checked_at"]

    # The competing session's row is already committed; this one's read predates
    # it and therefore sees nothing ticked.
    monkeypatch.setattr(
        "app.routers.admin_checklist._ticked_item_ids",
        lambda db, producer_id: set(),
    )

    resp = client.put(
        _checks_url(producer.id),
        json={"item_ids": [items[0]["id"], items[1]["id"]]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    checks = {c["item_id"]: c for c in resp.json()["checks"]}
    assert len(checks) == 2, checks
    assert checks[items[0]["id"]]["checked_at"] == original_checked_at


def test_untick_of_row_another_session_removed_does_not_500(client, db, monkeypatch):
    """A racing session already removed the row this one is un-ticking.

    An ORM `db.delete(row)` on a row that is gone raises StaleDataError
    ("expected to delete 1 row(s); 0 were matched"); a DELETE ... WHERE that
    matches nothing is a no-op, which is the right answer — the end state the
    request asked for is the end state that already holds.
    """
    admin = _admin(db)
    items = _seed_items(client, db, admin)
    producer = make_producer(db, status="pending")
    item_id = items[0]["id"]

    assert (
        client.put(
            _checks_url(producer.id),
            json={"item_ids": [item_id]},
            headers=auth_header(admin),
        ).status_code
        == 200
    )

    # The competing session's untick, already committed.
    db.query(ProducerReviewCheck).filter(
        ProducerReviewCheck.producer_id == producer.id
    ).delete(synchronize_session=False)
    db.commit()

    # ...while this session still believes the row is there.
    monkeypatch.setattr(
        "app.routers.admin_checklist._ticked_item_ids",
        lambda db, producer_id: {UUID(item_id)},
    )

    resp = client.put(
        _checks_url(producer.id),
        json={"item_ids": []},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["checks"] == []


# --- auth ----------------------------------------------------------------


def test_all_routes_require_admin(client, db):
    """Every route this router declares rejects a non-admin.

    The count is DERIVED from the router, not stated: a fifth route added to
    admin_checklist.py without a line here reds this test rather than silently
    shrinking the coverage the name claims. An earlier version asserted 3 of 4
    and left the WRITE path — the one that creates audit rows — unguarded.
    """
    owner_producer = make_producer(db, name="לא אדמין")
    owner = make_user(db, role="producer")
    owner.producer_id = owner_producer.id
    db.commit()

    checks = _checks_url(owner_producer.id)
    cases = [
        ("get", ITEMS, None),
        ("put", ITEMS, {"items": []}),
        ("get", checks, None),
        ("put", checks, {"item_ids": []}),
    ]

    for method, url, payload in cases:
        call = getattr(client, method)
        resp = (
            call(url, headers=auth_header(owner))
            if payload is None
            else call(url, json=payload, headers=auth_header(owner))
        )
        assert resp.status_code == 403, f"{method.upper()} {url} -> {resp.status_code}"

    # Anonymous, not merely under-privileged.
    assert client.get(ITEMS).status_code in (401, 403)

    # The completeness half. `covered` is what the loop above actually
    # exercised; `declared` is read off the router, so the two cannot drift.
    covered = {(method.upper(), url) for method, url, _ in cases}
    declared = {
        (verb, route.path.replace("{producer_id}", str(owner_producer.id)))
        for route in admin_checklist_router.routes
        for verb in route.methods
        if verb != "HEAD"
    }
    assert covered == declared, f"uncovered: {declared - covered}"
