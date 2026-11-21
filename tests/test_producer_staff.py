"""MEH-3526 — a business invites people to handle its orders, and only its orders.

Every case is behaviour: a request goes in and the status, the stored row or
the outgoing email is checked. The order routes are reached through the real
app, so a staff member who can reach a route that is not theirs goes red here.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.models import User
from app.models.producer_staff import ProducerStaff
from app.routers import producer_staff as staff_module
from app.services import order_access
from app.utils.clock import utc_now
from tests._test_meh3263_order_route__common import Shop, flag_on, stored_order  # noqa: F401
from tests.conftest import auth_header, make_user

INVITES = "/producers/me/staff"
ACCEPT = "/staff-invites/accept"
LEAVE = "/users/me/staff-membership"
ORDERS = "/producers/me/product-orders"


@pytest.fixture
def mails(monkeypatch):
    """Every invite email that would go out: (to, business, link)."""
    out: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        staff_module,
        "send_staff_invite_email",
        lambda to, business, link, test_cause=False: out.append((to, business, link)),
    )
    return out


def _token(mails) -> str:
    return mails[-1][2].rsplit("/", 1)[1]


def _invite(client, shop, email):
    return client.post(INVITES, json={"email": email}, headers=shop.headers)


def _staff(client, db, shop, mails, email=None):
    """A person invited by `shop` who accepted. Returns the User."""
    person = make_user(db, email=email or f"s{len(mails)}-{shop.id[:6]}@example.com")
    assert _invite(client, shop, person.email).status_code == 200
    r = client.post(ACCEPT, json={"token": _token(mails)}, headers=auth_header(person))
    assert r.status_code == 200, r.text
    return person


# --- the invite ---------------------------------------------------------------


def test_the_invite_answer_is_the_same_with_and_without_an_account(
    client, db, flag_on, mails
):
    shop = Shop(db)
    make_user(db, email="has-account@example.com")
    with_account = _invite(client, shop, "has-account@example.com").json()
    without = _invite(client, shop, "no-account@example.com").json()
    strip = lambda body: {k: v for k, v in body.items() if k not in ("id", "email", "created_at")}  # noqa: E731
    assert strip(with_account) == strip(without) == {
        "status": "pending",
        "expired": False,
        "accepted_at": None,
    }
    assert [m[0] for m in mails] == ["has-account@example.com", "no-account@example.com"]
    assert all(link.startswith("http") and "/staff-invite/" in link for _, _, link in mails)


def test_the_token_is_stored_only_as_a_hash(client, db, flag_on, mails):
    shop = Shop(db)
    _invite(client, shop, "a@example.com")
    row = db.query(ProducerStaff).one()
    token = _token(mails)
    assert row.token_hash != token and len(row.token_hash) == 64
    assert token not in str(_invite(client, shop, "b@example.com").json())


def test_a_sixth_live_invite_is_refused(client, db, flag_on, mails):
    shop = Shop(db)
    for n in range(5):
        assert _invite(client, shop, f"p{n}@example.com").status_code == 200
    r = _invite(client, shop, "p5@example.com")
    assert r.status_code == 409
    assert "עד 5" in r.json()["detail"]


def test_a_lapsed_invite_stops_counting(client, db, flag_on, mails):
    shop = Shop(db)
    for n in range(5):
        _invite(client, shop, f"p{n}@example.com")
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.query(ProducerStaff).filter(ProducerStaff.invited_email == "p0@example.com").update(
        {"expires_at": past}
    )
    db.commit()
    assert _invite(client, shop, "p5@example.com").status_code == 200


def test_sending_again_replaces_the_link(client, db, flag_on, mails):
    shop = Shop(db)
    person = make_user(db, email="again@example.com")
    _invite(client, shop, "again@example.com")
    first = _token(mails)
    _invite(client, shop, "Again@Example.com")
    assert db.query(ProducerStaff).count() == 1
    old = client.post(ACCEPT, json={"token": first}, headers=auth_header(person))
    assert old.status_code == 404
    new = client.post(ACCEPT, json={"token": _token(mails)}, headers=auth_header(person))
    assert new.status_code == 200


def test_the_owner_cannot_invite_their_own_address(client, db, flag_on, mails):
    shop = Shop(db)
    assert _invite(client, shop, shop.owner.email).status_code == 409
    assert mails == []


# --- accepting ----------------------------------------------------------------


def test_accept_makes_the_person_staff_and_me_says_so(client, db, flag_on, mails):
    shop = Shop(db)
    person = _staff(client, db, shop, mails)
    me = client.get("/auth/me", headers=auth_header(person)).json()
    assert me["staff_of"] == {"producer_id": shop.id, "name": shop.producer.name}
    db.refresh(person)
    assert person.producer_id is None and person.role == "consumer"
    row = db.query(ProducerStaff).one()
    assert row.status == "active" and row.token_hash is None and row.user_id == person.id


def test_a_used_link_cannot_be_used_again(client, db, flag_on, mails):
    shop = Shop(db)
    person = _staff(client, db, shop, mails)
    again = client.post(ACCEPT, json={"token": _token(mails)}, headers=auth_header(person))
    assert again.status_code == 404


def test_an_expired_link_is_refused(client, db, flag_on, mails):
    shop = Shop(db)
    person = make_user(db, email="late@example.com")
    _invite(client, shop, person.email)
    db.query(ProducerStaff).update(
        {"expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)}
    )
    db.commit()
    r = client.post(ACCEPT, json={"token": _token(mails)}, headers=auth_header(person))
    assert r.status_code == 404
    assert db.query(ProducerStaff).one().status == "pending"


def test_another_address_cannot_accept(client, db, flag_on, mails):
    shop = Shop(db)
    _invite(client, shop, "invited@example.com")
    stranger = make_user(db, email="stranger@example.com")
    r = client.post(ACCEPT, json={"token": _token(mails)}, headers=auth_header(stranger))
    assert r.status_code == 403
    assert db.query(ProducerStaff).one().status == "pending"


def test_an_unverified_address_cannot_accept(client, db, flag_on, mails):
    shop = Shop(db)
    person = make_user(db, email="unverified@example.com", email_verified=False)
    _invite(client, shop, person.email)
    r = client.post(ACCEPT, json={"token": _token(mails)}, headers=auth_header(person))
    assert r.status_code == 403
    assert db.query(ProducerStaff).one().status == "pending"


def test_an_owner_cannot_accept(client, db, flag_on, mails):
    shop, other = Shop(db), Shop(db)
    _invite(client, shop, other.owner.email)
    r = client.post(ACCEPT, json={"token": _token(mails)}, headers=other.headers)
    assert r.status_code == 409
    assert db.query(ProducerStaff).one().status == "pending"


def test_staff_of_one_business_cannot_join_another(client, db, flag_on, mails):
    a, b = Shop(db), Shop(db)
    person = _staff(client, db, a, mails, email="busy@example.com")
    _invite(client, b, person.email)
    r = client.post(ACCEPT, json={"token": _token(mails)}, headers=auth_header(person))
    assert r.status_code == 409


def test_a_business_with_no_owner_cannot_be_joined(client, db, flag_on, mails):
    shop = Shop(db)
    person = make_user(db, email="orphan@example.com")
    _invite(client, shop, person.email)
    shop.owner.producer_id = None
    db.commit()
    r = client.post(ACCEPT, json={"token": _token(mails)}, headers=auth_header(person))
    assert r.status_code == 409


def test_of_two_accepts_on_one_link_exactly_one_wins(client, db, flag_on, mails, monkeypatch):
    """The second request read the invite while it was still pending (the
    state is injected: its pre-checks see the row as it was before the first
    commit). Only the conditional UPDATE can refuse it, and it must."""
    shop = Shop(db)
    person = make_user(db, email="twotabs@example.com")
    _invite(client, shop, person.email)
    token = _token(mails)
    first = client.post(ACCEPT, json={"token": token}, headers=auth_header(person))
    assert first.status_code == 200

    stale = ProducerStaff(
        id=db.query(ProducerStaff.id).scalar(),
        producer_id=shop.producer.id,
        invited_email=person.email,
        status="pending",
    )
    monkeypatch.setattr(staff_module, "_live_invite", lambda db, t, now: stale)
    monkeypatch.setattr(staff_module, "active_staff_row", lambda db, uid: None)
    second = client.post(ACCEPT, json={"token": token}, headers=auth_header(person))
    assert second.status_code == 404
    assert db.query(ProducerStaff).filter(ProducerStaff.status == "active").count() == 1


# --- what a staff member can reach --------------------------------------------


def test_staff_sees_and_moves_their_business_orders(client, db, flag_on, mails):
    shop = Shop(db)
    order = stored_order(db, shop)
    person = _staff(client, db, shop, mails)
    h = auth_header(person)
    listed = client.get(ORDERS, headers=h)
    assert listed.status_code == 200
    assert [o["id"] for o in listed.json()["orders"]] == [str(order.id)]
    moved = client.post(f"{ORDERS}/{order.id}/decline", json={"note": None}, headers=h)
    assert moved.status_code == 200 and moved.json()["status"] == "declined"


def test_staff_of_a_cannot_touch_an_order_of_b(client, db, flag_on, mails):
    a, b = Shop(db), Shop(db)
    theirs = stored_order(db, b)
    person = _staff(client, db, a, mails)
    h = auth_header(person)
    r = client.post(f"{ORDERS}/{theirs.id}/decline", json={"note": None}, headers=h)
    assert r.status_code == 404
    assert client.get(ORDERS, headers=h).json()["orders"] == []


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/producers/me/order-settings"),
        ("get", "/producers/me/order-windows"),
        ("get", "/producers/me"),
        ("get", INVITES),
        ("post", INVITES),
    ],
)
def test_staff_is_refused_everything_but_the_orders(
    client, db, flag_on, mails, method, path
):
    shop = Shop(db)
    person = _staff(client, db, shop, mails)
    kwargs = {"json": {"email": "x@example.com"}} if method == "post" else {}
    r = getattr(client, method)(path, headers=auth_header(person), **kwargs)
    assert r.status_code == 403, (path, r.status_code)


def test_a_removed_member_is_refused_on_the_next_request(client, db, flag_on, mails):
    shop = Shop(db)
    person = _staff(client, db, shop, mails)
    h = auth_header(person)  # the same session, still valid as a login
    assert client.get(ORDERS, headers=h).status_code == 200
    row_id = db.query(ProducerStaff.id).scalar()
    assert client.delete(f"{INVITES}/{row_id}", headers=shop.headers).status_code == 204
    assert client.get(ORDERS, headers=h).status_code == 403
    assert client.get("/auth/me", headers=h).json()["staff_of"] is None


def test_a_member_who_leaves_is_refused(client, db, flag_on, mails):
    shop = Shop(db)
    person = _staff(client, db, shop, mails)
    h = auth_header(person)
    assert client.delete(LEAVE, headers=h).status_code == 204
    assert client.get(ORDERS, headers=h).status_code == 403
    assert client.delete(LEAVE, headers=h).status_code == 404


def test_staff_cannot_invite_or_remove(client, db, flag_on, mails):
    shop = Shop(db)
    person = _staff(client, db, shop, mails)
    row_id = db.query(ProducerStaff.id).scalar()
    h = auth_header(person)
    assert client.post(INVITES, json={"email": "y@example.com"}, headers=h).status_code == 403
    assert client.delete(f"{INVITES}/{row_id}", headers=h).status_code == 403
    assert db.query(ProducerStaff).one().status == "active"


def test_an_owner_cannot_remove_another_business_staff(client, db, flag_on, mails):
    a, b = Shop(db), Shop(db)
    _staff(client, db, a, mails)
    row_id = db.query(ProducerStaff.id).scalar()
    assert client.delete(f"{INVITES}/{row_id}", headers=b.headers).status_code == 404
    assert db.query(ProducerStaff).one().status == "active"


def test_staff_loses_access_when_the_business_loses_its_owner(client, db, flag_on, mails):
    shop = Shop(db)
    person = _staff(client, db, shop, mails)
    shop.owner.producer_id = None
    db.commit()
    assert client.get(ORDERS, headers=auth_header(person)).status_code == 403


def test_staff_sees_closed_orders_for_seven_days_only(client, db, flag_on, mails):
    shop = Shop(db)
    now = utc_now()
    recent = stored_order(db, shop, status="handed", closed_at=now - timedelta(days=6))
    old = stored_order(db, shop, status="handed", closed_at=now - timedelta(days=8))
    person = _staff(client, db, shop, mails)
    seen = {o["id"] for o in client.get(ORDERS, headers=auth_header(person)).json()["orders"]}
    assert seen == {str(recent.id)}
    owner_seen = {o["id"] for o in client.get(ORDERS, headers=shop.headers).json()["orders"]}
    assert owner_seen == {str(recent.id), str(old.id)}
    r = client.post(f"{ORDERS}/{old.id}/no-show", headers=auth_header(person))
    assert r.status_code == 404


def test_the_window_edge_is_seven_days(client, db, flag_on, mails, monkeypatch):
    """With the clock fixed: a minute inside the 7 days is shown, a minute
    outside is not."""
    now = datetime(2026, 11, 21, 12, 0)
    monkeypatch.setattr(order_access, "utc_now", lambda: now)
    shop = Shop(db)
    edge = timedelta(days=7)
    inside = stored_order(db, shop, status="handed", closed_at=now - edge + timedelta(minutes=1))
    stored_order(db, shop, status="handed", closed_at=now - edge - timedelta(minutes=1))
    person = _staff(client, db, shop, mails)
    seen = {o["id"] for o in client.get(ORDERS, headers=auth_header(person)).json()["orders"]}
    assert seen == {str(inside.id)}


# --- the owner's other promises -----------------------------------------------


def test_staff_does_not_make_the_business_owned(client, db, flag_on, mails):
    from app.routers.producer_owner_invite import _has_owner

    shop = Shop(db)
    _staff(client, db, shop, mails)
    shop.owner.producer_id = None
    db.commit()
    assert _has_owner(db, shop.producer.id) is False


def test_the_owner_list_shows_pending_and_active(client, db, flag_on, mails):
    shop = Shop(db)
    _staff(client, db, shop, mails, email="joined@example.com")
    _invite(client, shop, "waiting@example.com")
    body = client.get(INVITES, headers=shop.headers).json()
    assert body["max_staff"] == 5
    assert [(m["email"], m["status"]) for m in body["staff"]] == [
        ("joined@example.com", "active"),
        ("waiting@example.com", "pending"),
    ]


def test_order_emails_still_go_to_the_owner(db, flag_on, mails, client, monkeypatch):
    """The outbox composes the business's new-order email for the owner's
    address, never a staff member's."""
    from app.models.product_orders import ProductOrderNotification
    from app.services import product_order_outbox as outbox

    shop = Shop(db)
    _staff(client, db, shop, mails, email="staffer@example.com")
    order = stored_order(db, shop)
    sent_to: list[str] = []
    monkeypatch.setattr(
        outbox.email_service,
        "send_email_result",
        lambda to, *a, **kw: sent_to.append(to) or "sent",
    )
    row = ProductOrderNotification(order_id=order.id, kind="new_order", channel="email")
    message = outbox._compose(db, row, order, shop.producer, utc_now())
    assert not isinstance(message, str), message
    message.send()
    assert sent_to == [shop.owner.email]
