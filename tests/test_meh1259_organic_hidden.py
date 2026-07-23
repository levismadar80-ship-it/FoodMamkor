"""MEH-1259 — the self-declared organic badge/filter is removed from public surfaces.

P0 legal (חוק להסדרת תוצרת אורגנית, התשס"ה-2005). The public `?organic` filter
matched the self-declared `organic_certified` boolean, and the "אורגני" badge lit
on the same field while claiming a certificate — presenting an unverified
self-declaration as certified. Same risk family as MEH-986 (free-text kosher).

Hide-only: the `organic_certified` column, the owner toggle (producer_me
whitelist), and the admin checkbox are KEPT — only the public badge/chip/filter
surfaces are gone. Re-add behind an admin-verified flow (post-launch, Option B).
"""

from app.schemas.schemas import ProducerAdminOut, ProducerListOut, ProducerOwnerOut

from tests.conftest import make_producer


def test_organic_query_param_no_longer_filters(client, db):
    # The public ?organic=true filter is removed: a NON-organic producer must
    # still be returned when ?organic=true is passed (the param is ignored),
    # proving the filter no longer narrows the public listing.
    plain = make_producer(db, name="חוות ללא אורגני")
    plain.organic_certified = False
    db.commit()

    names = {p["name"] for p in client.get("/producers?organic=true").json()}
    assert "חוות ללא אורגני" in names


def test_organic_and_non_organic_both_returned(client, db):
    # Both organic and non-organic producers appear under ?organic=true —
    # the filter is a no-op, so the two are indistinguishable in the listing.
    organic = make_producer(db, name="חוות מוצהרת אורגנית")
    organic.organic_certified = True
    plain = make_producer(db, name="חוות רגילה")
    plain.organic_certified = False
    db.commit()

    names = {p["name"] for p in client.get("/producers?organic=true").json()}
    assert {"חוות מוצהרת אורגנית", "חוות רגילה"} <= names


def test_organic_certified_kept_on_owner_and_admin_output():
    # Hide-only: the field stays on the owner's own view + admin view so the
    # owner toggle and admin checkbox keep working (data preserved).
    assert "organic_certified" in ProducerOwnerOut.model_fields
    assert "organic_certified" in ProducerAdminOut.model_fields
    # It remains on the public list shape too (inert — no public renderer reads
    # it after MEH-1259; a full MEH-986-style output strip is a possible
    # follow-up, out of this issue's hide-the-display scope).
    assert "organic_certified" in ProducerListOut.model_fields
