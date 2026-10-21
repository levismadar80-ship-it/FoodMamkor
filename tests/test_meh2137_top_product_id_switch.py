"""
Module:   test_meh2137_top_product_id_switch
Purpose:  Lock the switch from name-based to identity-based featured-product
          voting. Two products legitimately named «לחם» both carried the badge
          because the vote was a String(200); the vote is a FK now, and this
          file asserts the BEHAVIOUR that change buys — not that the diff was
          applied.
Does NOT: test the migration or the backfill (chunk 1, revision f4b1c8e0a297,
          covered by its own probe) · the frontend badge render (chunk 3,
          vitest) · the column drop (a separate RED PR).
Related:  backend/app/routers/producer_me.py::_resolve_top_product ·
          backend/app/routers/admin.py (create + update, the popped key) ·
          backend/app/services/producer_queries.py::attach_badge_fields
History:  MEH-2137 chunk 2 (creation); MEH-2137 writers-closed (the
          "free text is ignored" block at the end — the admin path used to be
          listed under Does NOT because it still wrote the name; it no longer
          does, and is asserted here).
"""

import uuid

import pytest

from app.models import Product
from tests.conftest import auth_header, make_category, make_producer, make_user


@pytest.fixture
def owner_with_products(db):
    """A producer owning TWO products with the SAME name — the ticket's case."""
    user = make_user(db, role="producer")
    producer = make_producer(db)
    user.producer_id = producer.id
    cheap = Product(producer_id=producer.id, name="לחם", price_min=44)
    dear = Product(producer_id=producer.id, name="לחם", price_min=57)
    db.add_all([cheap, dear])
    db.commit()
    for obj in (producer, cheap, dear):
        db.refresh(obj)
    return user, producer, cheap, dear


# ── the control, and it runs first ──────────────────────────────────────────
#
# Everything below reads `top_product_id` off the response or the row. If the
# ordinary happy path does not set it, every "rejected" and "unchanged" result
# after this is indistinguishable from an endpoint that ignores the field
# entirely — which is exactly what the PREVIOUS version of this endpoint did.
def test_control_owner_can_set_the_vote_to_own_product(
    client, db, owner_with_products
):
    user, producer, cheap, _dear = owner_with_products

    resp = client.put(
        "/producers/me",
        json={"top_product_id": str(cheap.id)},
        headers=auth_header(user),
    )

    assert resp.status_code == 200, (
        f"⛔ CONTROL FAILED ({resp.status_code}): the happy path does not write "
        f"top_product_id, so every assertion in this file is void. {resp.text}"
    )
    db.refresh(producer)
    assert producer.top_product_id == cheap.id


def test_the_ticket_exactly_two_same_named_products_only_one_wins(
    client, db, owner_with_products
):
    """The bug, stated as behaviour: pick the ₪57 one, the ₪44 one must lose.

    Under the old string vote this was IMPOSSIBLE to express — both products
    matched `top_product_name == "לחם"`, so the assertion below could not have
    been written, let alone passed.
    """
    user, producer, cheap, dear = owner_with_products

    resp = client.put(
        "/producers/me",
        json={"top_product_id": str(dear.id)},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.top_product_id == dear.id
    assert producer.top_product_id != cheap.id
    # Same name on both, so the name alone can never separate them — which is
    # the whole reason the id exists.
    assert cheap.name == dear.name == "לחם"


def test_writing_the_id_syncs_the_legacy_name(client, db, owner_with_products):
    """The legacy column stays truthful, so every un-switched reader is fine."""
    user, producer, cheap, _dear = owner_with_products
    producer.top_product_name = "משהו ישן לגמרי"
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"top_product_id": str(cheap.id)},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.top_product_name == "לחם"


def test_another_producers_product_is_rejected_422(client, db, owner_with_products):
    """IDOR: the vote is an id, and an id from someone else must not stick."""
    user, producer, _cheap, _dear = owner_with_products
    stranger = make_producer(db)
    theirs = Product(producer_id=stranger.id, name="לחם של מישהו אחר", price_min=30)
    db.add(theirs)
    db.commit()
    db.refresh(theirs)

    resp = client.put(
        "/producers/me",
        json={"top_product_id": str(theirs.id)},
        headers=auth_header(user),
    )

    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.top_product_id is None, "a rejected id must not have landed"


def test_nonexistent_product_is_rejected_422(client, db, owner_with_products):
    user, producer, _cheap, _dear = owner_with_products

    resp = client.put(
        "/producers/me",
        json={"top_product_id": str(uuid.uuid4())},
        headers=auth_header(user),
    )

    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.top_product_id is None


def test_explicit_null_clears_both_columns(client, db, owner_with_products):
    """«No featured product» is ONE state, not two.

    Clearing the id while leaving the name behind would keep every un-switched
    reader rendering a badge the owner just removed.
    """
    user, producer, cheap, _dear = owner_with_products
    client.put(
        "/producers/me",
        json={"top_product_id": str(cheap.id)},
        headers=auth_header(user),
    )
    db.refresh(producer)
    assert producer.top_product_id is not None, "precondition: a vote exists"

    resp = client.put(
        "/producers/me", json={"top_product_id": None}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.top_product_id is None
    assert producer.top_product_name is None


def test_an_unrelated_save_does_not_clear_the_vote(client, db, owner_with_products):
    """`exclude_unset` semantics, asserted as behaviour rather than trusted.

    This is the failure that would be invisible in review: the guard keying on
    truthiness instead of key-presence turns every dashboard save of any other
    field into a silent un-vote.
    """
    user, producer, cheap, _dear = owner_with_products
    client.put(
        "/producers/me",
        json={"top_product_id": str(cheap.id)},
        headers=auth_header(user),
    )
    db.refresh(producer)
    assert producer.top_product_id == cheap.id

    resp = client.put(
        "/producers/me",
        json={"short_description": "תיאור חדש שאין לו קשר למוצר המוביל"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.top_product_id == cheap.id, "an unrelated save cleared the vote"
    assert producer.top_product_name == "לחם"


def test_serializer_derives_the_name_from_the_fk_after_a_rename(
    client, db, owner_with_products
):
    """A product renamed AFTER the vote: the public name follows the id.

    Staleness here is the original bug wearing a different hat — the whole
    point of an identity vote is that a rename cannot break it.
    """
    user, producer, cheap, _dear = owner_with_products
    client.put(
        "/producers/me",
        json={"top_product_id": str(cheap.id)},
        headers=auth_header(user),
    )
    db.refresh(producer)
    assert producer.top_product_name == "לחם"

    # Rename the product directly, leaving the legacy column stale on purpose.
    cheap.name = "לחם מחמצת כוסמין"
    db.commit()
    db.refresh(producer)
    assert producer.top_product_name == "לחם", "fixture: the column IS stale now"

    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["top_product_id"] == str(cheap.id)
    assert body["top_product_name"] == "לחם מחמצת כוסמין", (
        "the serializer served the stale column instead of deriving from the FK"
    )


# ── MEH-2137 writers closed: free text in, free text IGNORED ────────────────
#
# The column stays (drop = separate RED PR) and the SCHEMA field stays — the
# input schemas still declare `top_product_name` so backend/openapi.json and
# the generated Zod do not move. What changed is that no code path writes a
# name that did not come from a product row: the owner PUT pops it, the admin
# PUT pops it, the admin create never assigns it. "Ignored", not 422, on
# purpose — a 422 would break every client that still sends the key (the
# dashboard's ProductsSection sends BOTH, by design), for no safety gain:
# the value simply does not land.
#
# Each case below pins the column BEFORE and AFTER, so a pass means "the write
# did not happen", not "the request did not 500".


def test_owner_put_with_free_text_name_alone_leaves_the_column_unchanged(
    client, db, owner_with_products
):
    user, producer, _cheap, _dear = owner_with_products
    producer.top_product_name = "הערך שהיה שם קודם"
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"top_product_name": "שם חופשי שאף מוצר לא נושא"},
        headers=auth_header(user),
    )

    # Not rejected: the key is still in the contract. Just inert.
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.top_product_name == "הערך שהיה שם קודם", (
        "a free-text top_product_name reached the column — the writer is open"
    )
    assert producer.top_product_id is None, "no id was sent; none may appear"


def test_owner_put_with_name_beside_an_id_takes_the_name_from_the_product(
    client, db, owner_with_products
):
    """Both keys in one body (what ProductsSection sends): the id decides, and
    the column gets the PRODUCT's name — the client's string is discarded even
    when it disagrees."""
    user, producer, cheap, _dear = owner_with_products

    resp = client.put(
        "/producers/me",
        json={"top_product_id": str(cheap.id), "top_product_name": "שם אחר לגמרי"},
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.top_product_id == cheap.id
    assert producer.top_product_name == "לחם", (
        "the column must mirror the product row, never the client's free text"
    )


def test_admin_create_ignores_the_free_text_name(client, db):
    admin = make_user(db, role="admin")
    cat = make_category(db, name="קטגוריה לבדיקת מוצר מוביל")

    resp = client.post(
        "/admin/producers",
        json={
            "name": "עסק שנוצר על ידי אדמין",
            "city": "תל אביב",
            "lat": 32.0853,
            "lng": 34.7818,
            "phone": "0501234567",
            "category_ids": [cat.id],
            # Still schema-valid (SanitizedLabelField), still accepted — and
            # it must not land: a new producer owns no product this could name.
            "top_product_name": "מוצר שעוד לא קיים",
        },
        headers=auth_header(admin),
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["top_product_name"] is None, (
        "admin create wrote the free-text name onto the new row"
    )
    assert body["top_product_id"] is None


def test_admin_put_with_free_text_name_leaves_the_column_unchanged(client, db):
    admin = make_user(db, role="admin")
    producer = make_producer(db)
    producer.top_product_name = "הערך שהיה שם קודם"
    db.commit()

    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"top_product_name": "שם חופשי מהטופס של האדמין"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.top_product_name == "הערך שהיה שם קודם", (
        "the admin bulk setattr loop wrote the free-text name — the pop is missing"
    )
