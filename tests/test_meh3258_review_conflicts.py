"""MEH-3258 — grill retro D2 (Sapir 14/11): a review whose author now owns the
business, or owns a business sharing one of its categories, leaves the public
list, the per-star counts and the stored rating. Computed per read — no column,
and ProducerReview.is_hidden is untouched (hidden still = an admin hid it).

Cells: 0 / 1 / many conflicted reviews × owner / competitor / cross-category,
plus the conflict lifting by itself, and each recompute trigger.
"""

import pytest

from conftest import auth_header, make_category, make_producer, make_user
from app.auth import create_producer_claim_token
from app.models import Producer, ProducerCategory, ProducerReview, User
from app.services.review_conflicts import recompute_producer_rating

BODY = "המוצרים מדהימים ואוהבת את השירות!"


def _review(db, producer, author, stars):
    r = ProducerReview(
        producer_id=producer.id, user_id=author.id, stars=stars, body=BODY
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def _own(db, user, producer):
    user.producer_id = producer.id
    user.role = "producer"
    db.commit()


def _public_ids(client, producer):
    page = client.get(f"/producers/{producer.id}/reviews").json()
    return {x["id"] for x in page["reviews"]}, page


def _rating(db, producer):
    db.expire_all()
    p = db.get(Producer, producer.id)
    return p.avg_rating, p.reviews_count


@pytest.fixture
def bakery_cat(db):
    return make_category(db, name="מאפים", emoji="🥖")


@pytest.fixture
def cheese_cat(db):
    return make_category(db, name="גבינות", emoji="🧀")


class TestOwnerConflict:
    def test_owner_review_leaves_list_counts_and_rating(self, client, db, bakery_cat):
        shop = make_producer(db, category=bakery_cat)
        fan = make_user(db, email="fan@example.com")
        other = make_user(db, email="other@example.com")
        mine = _review(db, shop, fan, 5)
        theirs = _review(db, shop, other, 1)
        recompute_producer_rating(shop.id, db)
        assert _rating(db, shop) == (3.0, 2)  # control: both count before

        _own(db, fan, shop)
        recompute_producer_rating(shop.id, db)

        ids, page = _public_ids(client, shop)
        assert ids == {str(theirs.id)}
        assert str(mine.id) not in ids
        assert page["total"] == 1
        assert page["rating_counts"]["5"] == 0 and page["rating_counts"]["1"] == 1
        assert _rating(db, shop) == (1.0, 1)
        db.refresh(mine)
        assert mine.is_hidden is False  # not an admin hide

    def test_legacy_flat_route_drops_it_too(self, client, db, bakery_cat):
        shop = make_producer(db, category=bakery_cat)
        fan = make_user(db, email="fan2@example.com")
        _review(db, shop, fan, 5)
        _own(db, fan, shop)
        assert client.get(f"/reviews?producer_id={shop.id}").json() == []


class TestCompetitorConflict:
    def test_same_category_owner_review_is_dropped(self, client, db, bakery_cat):
        target = make_producer(db, name="מאפיית יעד", category=bakery_cat)
        rival = make_producer(db, name="מאפייה מתחרה", category=bakery_cat)
        author = make_user(db, email="rival@example.com")
        r = _review(db, target, author, 1)
        _own(db, author, rival)
        recompute_producer_rating(target.id, db)
        ids, page = _public_ids(client, target)
        assert str(r.id) not in ids and page["total"] == 0
        assert _rating(db, target) == (0.0, 0)

    def test_cross_category_owner_review_stays(
        self, client, db, bakery_cat, cheese_cat
    ):
        """MEH-2076 policy: the bakery owner really does buy the cheese."""
        dairy = make_producer(db, name="מחלבה", category=cheese_cat)
        bakery = make_producer(db, name="מאפייה", category=bakery_cat)
        author = make_user(db, email="baker@example.com")
        r = _review(db, dairy, author, 4)
        _own(db, author, bakery)
        recompute_producer_rating(dairy.id, db)
        ids, _ = _public_ids(client, dairy)
        assert str(r.id) in ids
        assert _rating(db, dairy) == (4.0, 1)

    def test_shared_secondary_category_counts(self, client, db, bakery_cat, cheese_cat):
        target = make_producer(db, name="יעד", category=cheese_cat)
        rival = make_producer(db, name="מתחרה", category=bakery_cat)
        db.add(
            ProducerCategory(
                producer_id=rival.id, category_id=cheese_cat.id, position=1
            )
        )
        db.commit()
        author = make_user(db, email="secondary@example.com")
        r = _review(db, target, author, 2)
        _own(db, author, rival)
        ids, _ = _public_ids(client, target)
        assert str(r.id) not in ids


class TestCounts:
    def test_zero_conflicts_changes_nothing(self, client, db, bakery_cat):
        shop = make_producer(db, category=bakery_cat)
        a = make_user(db, email="a0@example.com")
        b = make_user(db, email="b0@example.com")
        _review(db, shop, a, 5)
        _review(db, shop, b, 3)
        recompute_producer_rating(shop.id, db)
        _, page = _public_ids(client, shop)
        assert page["total"] == 2
        assert _rating(db, shop) == (4.0, 2)

    def test_many_conflicts_among_many(self, client, db, bakery_cat):
        target = make_producer(db, name="יעד", category=bakery_cat)
        rivals = [
            make_producer(db, name=f"מתחרה {i}", category=bakery_cat) for i in range(3)
        ]
        keep = make_user(db, email="keep@example.com")
        _review(db, target, keep, 5)
        for i, rival in enumerate(rivals):
            author = make_user(db, email=f"rival{i}@example.com")
            _review(db, target, author, 1)
            _own(db, author, rival)
        recompute_producer_rating(target.id, db)
        _, page = _public_ids(client, target)
        assert page["total"] == 1
        assert page["rating_counts"]["1"] == 0
        assert _rating(db, target) == (5.0, 1)


class TestConflictLifts:
    def test_owner_leaving_brings_the_review_back(self, client, db, bakery_cat):
        target = make_producer(db, name="יעד", category=bakery_cat)
        rival = make_producer(db, name="מתחרה", category=bakery_cat)
        author = make_user(db, email="lift@example.com")
        r = _review(db, target, author, 4)
        _own(db, author, rival)
        assert str(r.id) not in _public_ids(client, target)[0]
        author.producer_id = None
        db.commit()
        assert str(r.id) in _public_ids(client, target)[0]


class TestTriggers:
    def test_claim_recomputes_the_competitor_she_reviewed(
        self, client, db, bakery_cat, monkeypatch
    ):
        for name in (
            "notify_producer_registered",
            "score_producer",
            "send_welcome_email",
        ):
            monkeypatch.setattr(
                f"app.routers.producer_claim.{name}", lambda *a, **k: None
            )
        target = make_producer(db, name="יעד", category=bakery_cat)
        author = make_user(db, email="claimer@example.com")
        _review(db, target, author, 1)
        recompute_producer_rating(target.id, db)
        assert _rating(db, target) == (1.0, 1)
        draft = make_producer(db, name="טיוטה", status="draft", category=bakery_cat)
        token = create_producer_claim_token(draft.id)[0]
        r = client.post(
            "/producer-claim",
            json={"token": token, "declaration_accepted": True, "terms_accepted": True},
            headers=auth_header(author),
        )
        assert r.status_code == 200, r.text
        assert _rating(db, target) == (0.0, 0)

    def test_owner_category_change_recomputes_both_sides(
        self, client, db, bakery_cat, cheese_cat, monkeypatch
    ):
        target = make_producer(db, name="יעד", category=bakery_cat)
        mine = make_producer(db, name="שלי", category=cheese_cat)
        owner = make_user(db, email="switch@example.com", role="producer")
        _review(db, target, owner, 1)
        _own(db, owner, mine)
        recompute_producer_rating(target.id, db)
        assert _rating(db, target) == (1.0, 1)  # cross-category: counts
        r = client.put(
            "/producers/me",
            json={"category_ids": [bakery_cat.id]},
            headers=auth_header(db.get(User, owner.id)),
        )
        assert r.status_code == 200, r.text
        assert _rating(db, target) == (0.0, 0)

    def test_save_without_categories_leaves_the_rating(
        self, client, db, bakery_cat, cheese_cat
    ):
        """A PUT with no category_ids must not recompute: seed a stale stored
        rating and check it survives (a recompute would rewrite it)."""
        target = make_producer(db, name="יעד", category=bakery_cat)
        mine = make_producer(db, name="שלי", category=bakery_cat)
        owner = make_user(db, email="nocat@example.com", role="producer")
        _review(db, target, owner, 1)
        _own(db, owner, mine)
        target.avg_rating, target.reviews_count = 1.0, 1  # stale on purpose
        db.commit()
        r = client.put(
            "/producers/me",
            json={"description": "תיאור חדש של העסק שלי"},
            headers=auth_header(db.get(User, owner.id)),
        )
        assert r.status_code == 200, r.text
        assert _rating(db, target) == (1.0, 1)

    def test_registration_upgrade_recomputes(self, client, db, bakery_cat):
        from conftest import valid_producer_register_payload

        target = make_producer(db, name="יעד", category=bakery_cat)
        author = make_user(db, email="upgrader@example.com")
        _review(db, target, author, 1)
        recompute_producer_rating(target.id, db)
        assert _rating(db, target) == (1.0, 1)
        payload = valid_producer_register_payload() | {
            "phone": "0501234567",
            "category_ids": [bakery_cat.id],
        }
        for field in ("email", "name", "password"):
            payload.pop(field, None)
        r = client.post(
            "/auth/register/producer", json=payload, headers=auth_header(author)
        )
        assert r.status_code == 200, r.text
        assert _rating(db, target) == (0.0, 0)

    def test_admin_delete_brings_her_reviews_back(self, client, db, bakery_cat):
        admin = make_user(db, email="admdel@example.com", role="admin")
        target = make_producer(db, name="יעד", category=bakery_cat)
        rival = make_producer(db, name="מתחרה", category=bakery_cat)
        author = make_user(db, email="deleted-owner@example.com")
        _review(db, target, author, 4)
        _own(db, author, rival)
        recompute_producer_rating(target.id, db)
        assert _rating(db, target) == (0.0, 0)
        r = client.delete(f"/admin/producers/{rival.id}", headers=auth_header(admin))
        assert r.status_code in (200, 204), r.text
        assert _rating(db, target) == (4.0, 1)

    def test_admin_category_save_recomputes(self, client, db, bakery_cat, cheese_cat):
        admin = make_user(db, email="admcat@example.com", role="admin")
        target = make_producer(db, name="יעד", category=bakery_cat)
        rival = make_producer(db, name="מתחרה", category=cheese_cat)
        author = make_user(db, email="admcat-owner@example.com")
        _review(db, target, author, 2)
        _own(db, author, rival)
        recompute_producer_rating(target.id, db)
        assert _rating(db, target) == (2.0, 1)  # cross-category: counts
        r = client.put(
            f"/admin/producers/{rival.id}",
            json={"category_ids": [bakery_cat.id]},
            headers=auth_header(admin),
        )
        assert r.status_code == 200, r.text
        assert _rating(db, target) == (0.0, 0)

    def test_owner_badge_skips_a_conflicted_review(self, db, bakery_cat):
        from app.services.owner_attention import _unreplied_reviews

        shop = make_producer(db, category=bakery_cat)
        owner = make_user(db, email="badge@example.com")
        other = make_user(db, email="badge-other@example.com")
        _review(db, shop, owner, 5)
        _review(db, shop, other, 4)
        assert _unreplied_reviews(db, shop.id) == 2  # control
        _own(db, owner, shop)
        assert _unreplied_reviews(db, shop.id) == 1


class TestAdminSeesWhy:
    def test_admin_list_names_the_conflict(self, client, db, bakery_cat, cheese_cat):
        admin = make_user(db, email="admin3258@example.com", role="admin")
        shop = make_producer(db, name="חנות", category=bakery_cat)
        rival = make_producer(db, name="מתחרה", category=bakery_cat)
        far = make_producer(db, name="רחוק", category=cheese_cat)
        o = make_user(db, email="o@example.com")
        c = make_user(db, email="c@example.com")
        n = make_user(db, email="n@example.com")
        x = make_user(db, email="x@example.com")
        r_owner = _review(db, shop, o, 5)
        r_comp = _review(db, shop, c, 1)
        r_none = _review(db, shop, n, 3)
        r_far = _review(db, shop, x, 4)
        _own(db, o, shop)
        _own(db, c, rival)
        _own(db, x, far)
        rows = client.get("/admin/reviews", headers=auth_header(admin)).json()
        by_id = {row["id"]: row["conflict"] for row in rows}
        assert by_id[str(r_owner.id)] == "owner"
        assert by_id[str(r_comp.id)] == "competitor"
        assert by_id[str(r_none.id)] is None
        assert by_id[str(r_far.id)] is None
