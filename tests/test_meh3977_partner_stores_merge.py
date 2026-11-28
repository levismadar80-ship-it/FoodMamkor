"""MEH-3977 review: a draft-twin merge with partner stores.

Delivery and pickup settings move as two groups, so an owner who is
partner-only (no place, no delivery) could land «no place» beside the draft's
«no delivery» with no store either: CHECK producer_location_mode → 500.
Her store list also has to survive the merge.
"""

from tests.conftest import make_submit_ready_producer, make_user
from tests.test_meh3865_draft_twin_merge import _merge, _ownerless_draft, no_emails  # noqa: F401


def test_partner_only_owner_merges_and_keeps_her_stores(client, db, no_emails):  # noqa: F811
    admin = make_user(db, role="admin")
    draft = _ownerless_draft(db, name="מאפיית ארז")
    owned, _ = make_submit_ready_producer(db, status="pending", name="ארז אופה בבית")
    owned.has_physical_location = False
    owned.offers_delivery = False
    owned.partner_stores = ["פארמרים"]
    db.commit()
    resp = _merge(client, admin, draft, owned)
    assert resp.status_code == 200, resp.text
    db.refresh(draft)
    assert draft.partner_stores == ["פארמרים"]
    assert draft.has_physical_location is False


def test_owner_with_a_place_keeps_her_stores(client, db, no_emails):  # noqa: F811
    admin = make_user(db, role="admin")
    draft = _ownerless_draft(db, name="מאפיית ארז")
    owned, _ = make_submit_ready_producer(db, status="pending", name="ארז אופה בבית")
    owned.partner_stores = ["פארמרים"]
    db.commit()
    resp = _merge(client, admin, draft, owned)
    assert resp.status_code == 200, resp.text
    db.refresh(draft)
    assert draft.partner_stores == ["פארמרים"]


def test_no_place_no_delivery_no_store_keeps_the_drafts_place(client, db, no_emails):  # noqa: F811
    """Her place is off and her delivery flag has no areas (MEH-3972's
    «בתיאום מראש»), so the delivery group stays the draft's (off)."""
    admin = make_user(db, role="admin")
    draft = _ownerless_draft(db, name="מאפיית ארז")
    owned, _ = make_submit_ready_producer(db, status="pending", name="ארז אופה בבית")
    owned.has_physical_location = False
    owned.offers_delivery = True
    db.commit()
    resp = _merge(client, admin, draft, owned)
    assert resp.status_code == 200, resp.text
    db.refresh(draft)
    assert draft.has_physical_location or draft.offers_delivery or draft.partner_stores
