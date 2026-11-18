"""MEH-3376 — an admin cannot demote a business owner to consumer while a
business is linked to her account (rulings 17/11 §א6 row 2).

Before: `role` changed, `producer_id` stayed, and the business stayed live
with no working owner. Now: 409 with the approved wording, nothing changes.
The way out is «ניתוק בעלים» (detach), after which the same request passes.
"""

from app.models import User

from tests.conftest import auth_header, make_producer, make_user

PROMOTE_DETAIL = "אי אפשר לתת הרשאת אדמין למי שמקושרת לבית עסק."
DETAIL = (
    "אי אפשר להוריד את ההרשאה כל עוד המשתמשת מקושרת לבית עסק. קודם מנתקים את הבעלות."
)


def _owner(db, role="producer", status="approved"):
    producer = make_producer(db, status=status)
    user = make_user(db, role=role)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user, producer


def _demote(client, admin, target, role="consumer"):
    return client.put(
        f"/admin/users/{target.id}/role",
        json={"role": role},
        headers=auth_header(admin),
    )


def _row(db, user_id):
    db.expire_all()
    return db.query(User).filter(User.id == user_id).one()


def test_control_consumer_demotion_of_an_admin_without_a_business_still_works(
    client, db
):
    """Control: the route, the payload and the auth are fine — without a
    linked business the same request is a 200."""
    admin = make_user(db, role="admin")
    other = make_user(db, role="admin")
    resp = _demote(client, admin, other)
    assert resp.status_code == 200
    assert _row(db, other.id).role == "consumer"


def test_owner_with_a_linked_business_is_409_with_the_approved_wording(client, db):
    admin = make_user(db, role="admin")
    owner, producer = _owner(db)
    resp = _demote(client, admin, owner)
    assert resp.status_code == 409
    assert resp.json()["detail"] == DETAIL
    row = _row(db, owner.id)
    assert row.role == "producer"
    assert row.producer_id == producer.id


def test_the_refusal_does_not_depend_on_the_business_being_live(client, db):
    """Pending, rejected or suspended: the link is what leaves a business
    without an owner, whatever its status."""
    admin = make_user(db, role="admin")
    for status in ("pending", "rejected", "suspended"):
        owner, _ = _owner(db, status=status)
        assert _demote(client, admin, owner).status_code == 409, status


def test_an_admin_who_also_has_a_linked_business_is_refused_too(client, db):
    admin = make_user(db, role="admin")
    owner_admin, producer = _owner(db, role="admin")
    resp = _demote(client, admin, owner_admin)
    assert resp.status_code == 409
    assert resp.json()["detail"] == DETAIL
    assert _row(db, owner_admin.id).role == "admin"


def test_after_the_business_is_unlinked_the_demotion_passes(client, db):
    admin = make_user(db, role="admin")
    owner, _ = _owner(db, role="admin")
    owner.producer_id = None  # what «ניתוק בעלים» does to the account
    db.commit()
    resp = _demote(client, admin, owner)
    assert resp.status_code == 200
    assert _row(db, owner.id).role == "consumer"


# ---------- the other direction: an owner never becomes an admin ----------
# Sapir, 17/11: «בעלת עסק לא יכולה להיות אדמינית». Registration and claim
# already refuse an admin account; this route was the one way in.


def test_an_owner_with_a_linked_business_cannot_be_made_admin(client, db):
    admin = make_user(db, role="admin")
    owner, producer = _owner(db)
    resp = _demote(client, admin, owner, role="admin")
    assert resp.status_code == 409
    assert resp.json()["detail"] == PROMOTE_DETAIL
    row = _row(db, owner.id)
    assert (row.role, row.producer_id) == ("producer", producer.id)


def test_the_promote_refusal_does_not_depend_on_the_business_status(client, db):
    admin = make_user(db, role="admin")
    for status in ("draft", "pending", "rejected", "inactive"):
        owner, _ = _owner(db, status=status)
        assert _demote(client, admin, owner, role="admin").status_code == 409, status


def test_control_a_consumer_can_still_be_made_admin(client, db):
    admin = make_user(db, role="admin")
    consumer = make_user(db, role="consumer")
    assert _demote(client, admin, consumer, role="admin").status_code == 200
    assert _row(db, consumer.id).role == "admin"


def test_the_two_refusals_have_different_wording():
    assert PROMOTE_DETAIL != DETAIL


# ---------- the read-only check for rows created before this rule ----------


def test_the_check_script_finds_an_admin_with_a_business_and_nothing_else(db):
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "backend"
        / "scripts"
        / "check_admin_owners.py"
    )
    spec = importlib.util.spec_from_file_location("check_admin_owners", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    make_user(db, role="admin")  # an admin with no business
    _owner(db)  # an owner who is not an admin
    assert module.admin_owners(db) == []

    legacy, _ = _owner(db, role="admin")  # the state no route can create any more
    assert [u.id for u in module.admin_owners(db)] == [legacy.id]
