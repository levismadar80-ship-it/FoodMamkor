"""MEH-2585 — DELETE /admin/users/{id}: an admin can remove a (test) user.

Same cascade as the self-service DELETE /auth/me (services/user_deletion.py),
minus the confirmation email. Admins — and the protected super-admin — are
refused, so removing an admin always takes a demote first.
"""

from app.models.models import Favorite, Producer, ProducerReview, User
from app.routers import admin_extra
from tests.conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin")


def test_admin_deletes_consumer_and_her_rows(client, db):
    admin = _admin(db)
    victim = make_user(db, role="consumer")
    other_business = make_producer(db, name="Other Farm", status="approved")
    db.add(Favorite(producer_id=other_business.id, user_id=victim.id))
    db.add(ProducerReview(producer_id=other_business.id, user_id=victim.id, stars=5))
    db.commit()
    victim_id = victim.id

    r = client.delete(f"/admin/users/{victim_id}", headers=auth_header(admin))

    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.query(User).filter(User.id == victim_id).first() is None
    assert db.query(Favorite).filter(Favorite.user_id == victim_id).count() == 0
    assert db.query(ProducerReview).filter(ProducerReview.user_id == victim_id).count() == 0
    # The third-party business she reviewed stays, with its rating recomputed.
    business = db.query(Producer).filter(Producer.id == other_business.id).first()
    assert business is not None
    assert business.reviews_count == 0


def test_admin_delete_removes_users_own_business(client, db):
    admin = _admin(db)
    producer = make_producer(db, name="Test Farm", status="draft")
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    producer_id = producer.id

    r = client.delete(f"/admin/users/{owner.id}", headers=auth_header(admin))

    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.query(Producer).filter(Producer.id == producer_id).first() is None


def test_admin_delete_sends_no_confirmation_email(client, db, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routers.auth._send_deletion_email", lambda *a, **k: sent.append(a)
    )
    admin = _admin(db)
    victim = make_user(db, role="consumer")

    r = client.delete(f"/admin/users/{victim.id}", headers=auth_header(admin))

    assert r.status_code == 200
    assert sent == []


def test_admin_cannot_delete_another_admin(client, db):
    admin = _admin(db)
    other_admin = _admin(db)

    r = client.delete(f"/admin/users/{other_admin.id}", headers=auth_header(admin))

    assert r.status_code == 403
    db.expire_all()
    assert db.query(User).filter(User.id == other_admin.id).first() is not None


def test_admin_cannot_delete_super_admin_even_when_not_admin_role(client, db):
    """levismadar80@gmail.com is a producer-role account on prod; still protected."""
    admin = _admin(db)
    protected = make_user(db, role="producer", email=admin_extra.SUPER_ADMIN_EMAIL)

    r = client.delete(f"/admin/users/{protected.id}", headers=auth_header(admin))

    assert r.status_code == 403
    db.expire_all()
    assert db.query(User).filter(User.id == protected.id).first() is not None


def test_admin_cannot_delete_self(client, db):
    admin = _admin(db)

    r = client.delete(f"/admin/users/{admin.id}", headers=auth_header(admin))

    assert r.status_code == 400
    db.expire_all()
    assert db.query(User).filter(User.id == admin.id).first() is not None


def test_non_admin_gets_403_and_nothing_is_deleted(client, db):
    consumer = make_user(db, role="consumer")
    victim = make_user(db, role="consumer")

    r = client.delete(f"/admin/users/{victim.id}", headers=auth_header(consumer))

    assert r.status_code == 403
    db.expire_all()
    assert db.query(User).filter(User.id == victim.id).first() is not None


def test_anonymous_gets_401(client, db):
    victim = make_user(db, role="consumer")

    r = client.delete(f"/admin/users/{victim.id}")

    assert r.status_code == 401


def test_unknown_user_404(client, db):
    admin = _admin(db)

    r = client.delete(
        "/admin/users/00000000-0000-0000-0000-000000000000",
        headers=auth_header(admin),
    )

    assert r.status_code == 404


def test_both_doors_destroy_every_owned_image(client, db, monkeypatch):
    """The URL capture was rewritten while moving to services/user_deletion.py.

    Pin all five surfaces (avatar, business images, product images, home
    product photo + images) plus the story card, on both doors.
    """
    from decimal import Decimal

    from app import cloudinary_utils
    from app.models.models import HomeProduct, Product

    def seed(tag):
        producer = make_producer(db, name=f"Img Farm {tag}", status="approved")
        producer.images = [f"https://img/{tag}/biz1.jpg", None, f"https://img/{tag}/biz2.jpg"]
        producer.story_card_url = f"https://img/{tag}/story.png"
        owner = make_user(db, role="producer")
        owner.producer_id = producer.id
        owner.avatar_url = f"https://img/{tag}/avatar.jpg"
        db.add(Product(producer_id=producer.id, name="p", price_min=Decimal("20"),
                       image_url=f"https://img/{tag}/prod.jpg"))
        db.add(Product(producer_id=producer.id, name="p2", price_min=Decimal("20")))
        db.add(HomeProduct(user_id=owner.id, title="hp", description="x",
                           phone="0500000000", city="TLV", price=30,
                           photo=f"https://img/{tag}/hp.jpg",
                           images=[f"https://img/{tag}/hp2.jpg"]))
        db.commit()
        return owner

    expected = {"avatar.jpg", "biz1.jpg", "biz2.jpg", "prod.jpg", "hp.jpg", "hp2.jpg"}
    for tag, call in (
        ("self", lambda u: client.delete("/auth/me", headers=auth_header(u))),
        ("admin", lambda u: client.delete(f"/admin/users/{u.id}", headers=auth_header(_admin(db)))),
    ):
        calls = []
        monkeypatch.setattr(
            cloudinary_utils,
            "destroy_image",
            lambda url, bypass_reserved=False, context="": calls.append((url, bypass_reserved)) or True,
        )
        owner = seed(tag)
        r = call(owner)
        assert r.status_code == 200, (tag, r.text)
        plain = {u.rsplit("/", 1)[-1] for u, bypass in calls if not bypass and u}
        assert plain == expected, (tag, calls)
        assert (f"https://img/{tag}/story.png", True) in calls, (tag, calls)
