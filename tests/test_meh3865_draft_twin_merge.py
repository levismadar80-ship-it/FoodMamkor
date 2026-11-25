"""MEH-3865 — a draft the admin prepared, and the same business its owner
registered herself.

Three parts, each test named for the input it covers:
1. The match rule (services/draft_twins.py twin_reasons): one strong signal is
   enough; a name signal counts only in the same city; a city alone never.
2. Where the admin sees it: GET /admin/producers `draft_twin`, and the admin
   email on submit-for-review.
3. The merge (POST /admin/producers/{draft_id}/merge-owner): the draft becomes
   the owner's page, her content moves in, her own row is deleted, and every
   refusal happens before the first write.
"""

from types import SimpleNamespace

import pytest

from app.models import Producer, ProducerLocation, Product, User
from app.services.draft_twins import (
    EMAIL,
    FACEBOOK,
    INSTAGRAM,
    NAME_CITY,
    NAME_CONTAINS_CITY,
    PHONE,
    WEBSITE,
    facebook_key,
    instagram_key,
    twin_reasons,
    website_key,
)
from app.services.producer_duplicates import name_key as dup_name_key
from conftest import (
    auth_header,
    make_producer,
    make_submit_ready_producer,
    make_user,
)


def _biz(**kw):
    base = dict(
        name="", city="", phone=None, contact_email=None,
        instagram=None, website=None, facebook=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _owner(email="owner@example.com", phone=None):
    return SimpleNamespace(email=email, phone=phone)


# --- 1. the rule ---------------------------------------------------------------


class TestRule:
    def test_same_phone_in_two_notations_matches_without_a_name(self):
        owned = _biz(name="א", city="חיפה", phone="050-123-4567")
        draft = _biz(name="ב", city="אילת", phone="+972501234567")
        assert twin_reasons(owned, _owner(), draft) == [PHONE]

    def test_the_owners_own_account_phone_counts(self):
        owned = _biz(name="א", phone=None)
        draft = _biz(name="ב", phone="0501234567")
        assert twin_reasons(owned, _owner(phone="050-1234567"), draft) == [PHONE]

    def test_login_email_equal_to_the_drafts_business_email_matches(self):
        draft = _biz(name="ב", contact_email="Erez@Example.com ")
        assert twin_reasons(_biz(name="א"), _owner(email="erez@example.com"), draft) == [EMAIL]

    def test_instagram_url_and_handle_are_one_account(self):
        owned = _biz(name="א", instagram="https://www.instagram.com/Erez.Bakery/?hl=he")
        draft = _biz(name="ב", instagram="@erez.bakery")
        assert twin_reasons(owned, _owner(), draft) == [INSTAGRAM]

    def test_website_compares_the_host_without_www(self):
        owned = _biz(name="א", website="https://www.erez.co.il/shop")
        draft = _biz(name="ב", website="erez.co.il")
        assert twin_reasons(owned, _owner(), draft) == [WEBSITE]

    def test_a_link_on_a_shared_host_is_not_a_website(self):
        assert website_key("https://linktr.ee/erez") is None
        owned = _biz(name="א", website="https://linktr.ee/erez")
        draft = _biz(name="ב", website="https://linktr.ee/other")
        assert twin_reasons(owned, _owner(), draft) == []

    def test_a_post_or_share_link_names_no_account(self):
        assert instagram_key("https://www.instagram.com/p/Cx123/") is None
        assert instagram_key("instagram.com/reel/abc") is None
        assert facebook_key("https://www.facebook.com/share/abc123") is None
        assert facebook_key("facebook.com/profile.php?id=1") == "id:1"
        assert facebook_key("facebook.com/profile.php?id=1") != facebook_key("facebook.com/profile.php?id=2")
        assert facebook_key("https://facebook.com/pages/Erez/123") == "erez"
        assert website_key("https://bit.ly/abc") is None

    def test_a_dummy_phone_never_matches(self):
        owned = _biz(name="א", city="חיפה", phone="050-0000000")
        draft = _biz(name="ב", city="אילת", phone="0500000000")
        assert twin_reasons(owned, _owner(), draft) == []

    def test_facebook_page_path_matches(self):
        owned = _biz(name="א", facebook="https://www.facebook.com/ErezBakery/")
        draft = _biz(name="ב", facebook="facebook.com/erezbakery")
        assert twin_reasons(owned, _owner(), draft) == [FACEBOOK]
        assert facebook_key("not a facebook link") is None

    def test_same_name_with_different_quote_marks_in_the_same_city(self):
        owned = _biz(name="ג׳חנון של אמא", city="חיפה")
        draft = _biz(name="ג'חנון  של אמא", city="חיפה")
        assert twin_reasons(owned, _owner(), draft) == [NAME_CITY]

    def test_same_name_in_another_city_does_not_match(self):
        owned = _biz(name="מאפיית ארז", city="חיפה")
        draft = _biz(name="מאפיית ארז", city="אילת")
        assert twin_reasons(owned, _owner(), draft) == []

    def test_name_inside_the_other_in_the_same_city(self):
        owned = _biz(name="מאפיית ארז וליאת", city="חיפה")
        draft = _biz(name="מאפיית ארז", city="חיפה")
        assert twin_reasons(owned, _owner(), draft) == [NAME_CONTAINS_CITY]

    def test_a_one_word_name_inside_another_does_not_match(self):
        owned = _biz(name="חלה של שבת", city="חיפה")
        draft = _biz(name="חלה", city="חיפה")
        assert twin_reasons(owned, _owner(), draft) == []

    def test_city_alone_never_matches(self):
        owned = _biz(name="א ב", city="חיפה")
        draft = _biz(name="ג ד", city="חיפה")
        assert twin_reasons(owned, _owner(), draft) == []

    def test_blank_values_never_match_each_other(self):
        assert twin_reasons(_biz(), _owner(email=None), _biz()) == []
        assert instagram_key("") is None

    def test_reasons_are_listed_strongest_first(self):
        owned = _biz(name="מאפיית ארז", city="חיפה", phone="0501234567", instagram="erez")
        draft = _biz(name="מאפיית ארז", city="חיפה", phone="0501234567", instagram="@erez")
        assert twin_reasons(owned, _owner(), draft) == [PHONE, INSTAGRAM, NAME_CITY]

    def test_the_duplicate_signal_uses_the_same_name_key(self):
        """«כפילות?» saw ג׳חנון and ג'חנון as two names before MEH-3865."""
        assert dup_name_key("ג׳חנון") == dup_name_key("ג'חנון")


# --- 2. where the admin sees it -----------------------------------------------


def _ownerless_draft(db, name="מאפיית ארז", phone="0501234567", city="תל אביב"):
    draft = make_producer(db, name=name, status="draft", city=city)
    draft.phone = phone
    db.commit()
    return draft


def _rows(client, admin):
    """Every status: the default list leaves drafts out (their own filter)."""
    out = {}
    for status in ("draft", "pending", "approved"):
        r = client.get("/admin/producers", params={"status": status}, headers=auth_header(admin))
        assert r.status_code == 200, r.text
        out.update({row["id"]: row for row in r.json()})
    return out


class TestAdminList:
    def test_both_rows_carry_the_twin_with_its_reasons(self, client, db):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        owned, _ = make_submit_ready_producer(db, status="pending", name="מאפיית ארז וליאת")
        owned.phone = "+972-50-123-4567"
        db.commit()

        rows = _rows(client, admin)
        for pid in (str(draft.id), str(owned.id)):
            twin = rows[pid]["draft_twin"]
            assert twin["draft_id"] == str(draft.id)
            assert twin["target_id"] == str(owned.id)
            assert twin["reasons"] == [PHONE, NAME_CONTAINS_CITY]

    def test_no_match_reads_null(self, client, db):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db, name="משהו אחר", phone="0509999999")
        owned, _ = make_submit_ready_producer(db, status="pending", name="מאפיית ארז")
        rows = _rows(client, admin)
        assert rows[str(draft.id)]["draft_twin"] is None
        assert rows[str(owned.id)]["draft_twin"] is None

    def test_an_approved_business_is_not_offered_a_merge(self, client, db):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        owned, _ = make_submit_ready_producer(db, status="approved", name="מאפיית ארז")
        rows = _rows(client, admin)
        assert rows[str(draft.id)]["draft_twin"] is None
        assert rows[str(owned.id)]["draft_twin"] is None

    def test_a_draft_that_already_has_an_owner_is_not_a_twin(self, client, db):
        admin = make_user(db, role="admin")
        claimed, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        owned, _ = make_submit_ready_producer(db, status="pending", name="מאפיית ארז")
        rows = _rows(client, admin)
        assert rows[str(owned.id)]["draft_twin"] is None
        assert rows[str(claimed.id)]["draft_twin"] is None


class TestSubmitEmail:
    def test_admin_is_told_when_a_twin_is_sent_for_review(self, client, db, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "app.routers.producer_me_review.notify_admin_draft_twin",
            lambda target, draft, reasons, test_cause=False: calls.append((target, draft, reasons)),
        )
        draft = _ownerless_draft(db, name="טיוטה מוכנה")
        owned, user = make_submit_ready_producer(db, name="נרשם לבד")
        owned.phone = "050-123-4567"
        db.commit()

        r = client.post("/producers/me/submit-for-review", headers=auth_header(user))
        assert r.status_code == 200, r.text
        assert calls == [("נרשם לבד", "טיוטה מוכנה", [PHONE])]
        db.refresh(draft)
        assert draft.status == "draft", "the submit touches nothing on the draft"

    def test_no_email_without_a_twin(self, client, db, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "app.routers.producer_me_review.notify_admin_draft_twin",
            lambda *a, **k: calls.append(a),
        )
        _ownerless_draft(db, name="משהו אחר", phone="0509999999")
        _, user = make_submit_ready_producer(db, name="נרשם לבד")
        r = client.post("/producers/me/submit-for-review", headers=auth_header(user))
        assert r.status_code == 200, r.text
        assert calls == []


# --- 3. the merge --------------------------------------------------------------


def _merge(client, admin, draft, target):
    return client.post(
        f"/admin/producers/{draft.id}/merge-owner",
        json={"target_producer_id": str(target.id)},
        headers=auth_header(admin),
    )


@pytest.fixture
def no_emails(monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routers.admin_draft_merge.send_owner_draft_merged",
        lambda email, name, draft_name, test_cause=False: sent.append((email, draft_name)),
    )
    return sent


class TestMerge:
    def test_the_draft_becomes_the_owners_page_and_hers_is_deleted(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db, name="מאפיית ארז")
        draft.description = "מה שהאדמין כתבה"
        draft.opening_hours = None
        draft.images = ["https://res.cloudinary.com/x/image/upload/a.jpg"]
        db.add(Product(producer_id=draft.id, name="לחם מחמצת"))
        db.commit()
        owned, owner = make_submit_ready_producer(db, status="pending", name="ארז אופה בבית")
        owned.description = "מה שהבעלים כתב"
        owned.instagram = "erez.bakery"
        owned.phone = "0501234567"
        owned.images = ["https://res.cloudinary.com/x/image/upload/b.jpg"]
        db.commit()
        draft_id, owned_id, owner_id = draft.id, owned.id, owner.id

        r = _merge(client, admin, draft, owned)
        assert r.status_code == 200, r.text
        assert r.json()["products_moved"] == 1

        db.expire_all()
        assert db.get(Producer, owned_id) is None
        merged = db.get(Producer, draft_id)
        assert db.get(User, owner_id).producer_id == draft_id
        assert merged.name == "ארז אופה בבית", "the name she chose wins (Sapir 25/11)"
        assert merged.description == "מה שהאדמין כתבה", "the admin's prose stays"
        assert merged.instagram == "erez.bakery", "her contact details win"
        assert merged.phone == "0501234567", "her phone wins"
        assert merged.images == [
            "https://res.cloudinary.com/x/image/upload/b.jpg",
            "https://res.cloudinary.com/x/image/upload/a.jpg",
        ], "her photos first"
        names = sorted(p.name for p in db.query(Product).filter(Product.producer_id == draft_id))
        assert names == ["לחם מחמצת", "מוצר ניסוי"]
        assert db.query(ProducerLocation).filter(ProducerLocation.producer_id == draft_id).count() == 1
        assert merged.declared_at is None or merged.declaration_version is not None
        assert no_emails == [(owner.email, "ארז אופה בבית")]

    def test_a_same_name_product_keeps_hers_and_drops_the_drafts(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        db.add(Product(producer_id=draft.id, name="חלה  מתוקה", price_min=10, price_max=10))
        db.add(Product(producer_id=draft.id, name="עוגת שמרים"))
        db.commit()
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        db.add(Product(producer_id=owned.id, name="חלה מתוקה", price_min=25, price_max=25))
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        rows = db.query(Product).filter(Product.producer_id == draft_id).all()
        challot = [p for p in rows if "חלה" in p.name]
        assert len(challot) == 1 and challot[0].price_min == 25, "hers wins, one challah"
        assert sorted(p.name for p in rows) == ["חלה מתוקה", "מוצר ניסוי", "עוגת שמרים"]
        assert db.query(Product).count() == 3, "the draft's twin product is deleted"

    def test_her_pickup_points_replace_the_drafts(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        db.add(ProducerLocation(producer_id=draft.id, kind="branch", city="של האדמין", lat=32.0, lng=34.8))
        db.commit()
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        hers = {
            loc.id
            for loc in db.query(ProducerLocation).filter(ProducerLocation.producer_id == owned.id)
        }
        assert hers, "the fixture gives her a location"
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        kept = {
            loc.id
            for loc in db.query(ProducerLocation).filter(ProducerLocation.producer_id == draft_id)
        }
        assert kept == hers
        assert db.query(ProducerLocation).count() == len(hers), "the admin's point is deleted"

    def test_the_drafts_pickup_points_stay_when_she_has_none(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        db.add(ProducerLocation(producer_id=draft.id, kind="branch", city="של האדמין", lat=32.0, lng=34.8))
        db.commit()
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        db.query(ProducerLocation).filter(ProducerLocation.producer_id == owned.id).delete()
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        labels = [
            loc.city
            for loc in db.query(ProducerLocation).filter(ProducerLocation.producer_id == draft_id)
        ]
        assert labels == ["של האדמין"]

    def test_her_logo_wins_and_the_drafts_goes_with_her_row(self, client, db, no_emails, monkeypatch):
        destroyed = []
        monkeypatch.setattr(
            "app.cloudinary_utils.destroy_image", lambda url, **k: destroyed.append(url)
        )
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        draft.logo_url = "https://res.cloudinary.com/x/image/upload/admin-logo.jpg"
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        owned.logo_url = "https://res.cloudinary.com/x/image/upload/her-logo.jpg"
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        assert db.get(Producer, draft_id).logo_url.endswith("her-logo.jpg")
        assert not any(str(u).endswith("her-logo.jpg") for u in destroyed)
        assert any(str(u).endswith("admin-logo.jpg") for u in destroyed), "no orphan"

    def test_sent_for_review_stays_sent_when_the_page_passes_the_gate(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        owned, _ = make_submit_ready_producer(db, status="pending", name="מאפיית ארז")
        owned.phone = "050-123-4567"  # her verified number is the draft's number
        db.commit()
        r = _merge(client, admin, draft, owned)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"

    def test_sent_for_review_goes_back_to_draft_when_the_page_misses_a_requirement(
        self, client, db, no_emails
    ):
        """Her number was never verified → the merged page misses phone_verified."""
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db, phone="0521111111")
        owned, _ = make_submit_ready_producer(db, status="pending", name="מאפיית ארז")
        owned.phone = "0502222222"
        owned.phone_verified = False
        db.commit()
        r = _merge(client, admin, draft, owned)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "draft"

    def test_a_draft_owner_stays_a_draft(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        r = _merge(client, admin, draft, owned)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "draft"

    def test_her_verified_phone_replaces_the_drafts_and_stays_verified(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db, phone="0521111111")
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        owned.phone = "0502222222"
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        merged = db.get(Producer, draft_id)
        assert merged.phone == "0502222222" and merged.phone_verified is True

    def test_an_unverified_phone_does_not_become_verified(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db, phone="0521111111")
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        owned.phone_verified = False
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        assert db.get(Producer, draft_id).phone_verified is not True

    def test_non_admin_is_refused(self, client, db, no_emails):
        draft = _ownerless_draft(db)
        owned, owner = make_submit_ready_producer(db, status="pending")
        r = client.post(
            f"/admin/producers/{draft.id}/merge-owner",
            json={"target_producer_id": str(owned.id)},
            headers=auth_header(owner),
        )
        assert r.status_code == 403
        db.expire_all()
        assert db.get(Producer, owned.id) is not None

    @pytest.mark.parametrize("status", ["approved", "rejected", "inactive"])
    def test_a_decided_business_is_refused(self, client, db, no_emails, status):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        owned, _ = make_submit_ready_producer(db, status=status)
        r = _merge(client, admin, draft, owned)
        assert r.status_code == 409
        assert r.json()["detail"] == "אפשר להעביר טיוטה רק לעסק שעוד לא אושר"

    def test_a_claimed_draft_is_refused(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        claimed, _ = make_submit_ready_producer(db, status="draft")
        owned, _ = make_submit_ready_producer(db, status="pending")
        r = _merge(client, admin, claimed, owned)
        assert r.status_code == 409
        assert r.json()["detail"] == "אפשר להעביר רק טיוטה שעוד אין לה בעלים"

    def test_a_business_without_an_owner_is_refused(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        other = _ownerless_draft(db, name="עוד טיוטה")
        r = _merge(client, admin, draft, other)
        assert r.status_code == 409
        assert r.json()["detail"] == "לעסק הזה אין בעלים, אז אין למי להעביר את הטיוטה"

    def test_a_business_with_two_accounts_is_refused(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        owned, _ = make_submit_ready_producer(db, status="pending")
        second = make_user(db, role="producer")
        second.producer_id = owned.id
        db.commit()
        r = _merge(client, admin, draft, owned)
        assert r.status_code == 409
        assert r.json()["detail"] == "לעסק הזה יש יותר מחשבון אחד, אז אי אפשר להעביר אליו את הטיוטה"

    def test_a_test_account_never_takes_a_real_draft(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        owned, owner = make_submit_ready_producer(db, status="pending")
        owned.is_test = True
        db.commit()
        owner_id, owned_id = owner.id, owned.id
        r = _merge(client, admin, draft, owned)
        assert r.status_code == 409
        assert r.json()["detail"] == "הטיוטה והעסק מסוגים שונים, אז אי אפשר להעביר"
        db.expire_all()
        assert db.get(User, owner_id).producer_id == owned_id

    def test_too_many_products_is_refused_before_any_write(self, client, db, no_emails, monkeypatch):
        monkeypatch.setattr("app.routers.admin_draft_merge.MAX_PRODUCTS", 1)
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        db.add(Product(producer_id=draft.id, name="לחם"))
        db.commit()
        owned, owner = make_submit_ready_producer(db, status="pending")
        owner_id, owned_id = owner.id, owned.id
        r = _merge(client, admin, draft, owned)
        assert r.status_code == 409
        db.expire_all()
        assert db.get(User, owner_id).producer_id == owned_id
        assert db.query(Product).filter(Product.producer_id == owned_id).count() == 1

    def test_merging_a_row_into_itself_is_refused(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        r = _merge(client, admin, draft, draft)
        assert r.status_code == 409
        assert r.json()["detail"] == "אי אפשר להעביר טיוטה לעצמה"

    def test_her_delivery_setup_comes_whole_with_her_areas(self, client, db, no_emails):
        from app.models import DeliveryArea

        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        draft.offers_delivery = False
        db.add(DeliveryArea(producer_id=draft.id, city="חיפה"))
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        owned.offers_delivery = True
        owned.delivery_fee = 25
        db.add(DeliveryArea(producer_id=owned.id, city="רמת גן"))
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        merged = db.get(Producer, draft_id)
        cities = [a.city for a in db.query(DeliveryArea).filter(DeliveryArea.producer_id == draft_id)]
        assert cities == ["רמת גן"]
        assert merged.offers_delivery is True and merged.delivery_fee == 25

    def test_a_blank_text_in_the_draft_takes_hers(self, client, db, no_emails):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        draft.opening_hours = None
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        owned.opening_hours = "א-ה 8-14"
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        assert db.get(Producer, draft_id).opening_hours == "א-ה 8-14"

    def test_her_other_rows_move_and_nothing_dies_with_her_row(self, client, db, no_emails):
        from app.models.admin_ops import CategoryRequest

        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db)
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        db.add(CategoryRequest(requested_name="שמרים", producer_id=owned.id))
        owned.email_followup_2_sent_at = owned.created_at
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        req = db.query(CategoryRequest).one()
        assert req.producer_id == draft_id, "an APPEND table follows her"
        assert db.get(Producer, draft_id).email_followup_2_sent_at is not None, "no second nudge"

    def test_a_verified_draft_does_not_stay_verified_under_her_unverified_phone(
        self, client, db, no_emails
    ):
        admin = make_user(db, role="admin")
        draft = _ownerless_draft(db, phone="0521111111")
        draft.phone_verified = True
        owned, _ = make_submit_ready_producer(db, status="draft", name="מאפיית ארז")
        owned.phone = "0502222222"
        owned.phone_verified = False
        db.commit()
        draft_id = draft.id
        assert _merge(client, admin, draft, owned).status_code == 200
        db.expire_all()
        assert db.get(Producer, draft_id).phone_verified is False


class TestPolicyCoverage:
    """A new column or child table must be classified, or it dies silently with her row."""

    def test_every_producer_column_has_a_rule(self):
        from app.services import draft_merge_policy as pol

        rules = (
            pol.OWNER_WINS, pol.FILL_IF_BLANK, pol.DELIVERY_COLUMNS, pol.PICKUP_COLUMNS,
            pol.IMAGE_OWNER_WINS, pol.SPECIAL, pol.DRAFT_KEEPS,
        )
        named = [n for group in rules for n in group]
        assert len(named) == len(set(named)), "a column has two rules"
        columns = {c.name for c in Producer.__table__.columns}
        assert columns - set(named) == set(), "unclassified producers columns"
        assert set(named) - columns == set(), "a rule names a column that is gone"

    def test_every_child_table_has_a_rule(self):
        from app.services import draft_merge_policy as pol

        sets = (pol.HANDLED_TABLES, pol.APPEND_TABLES, pol.REPLACE_TABLES, pol.LEFT_TABLES)
        named = [n for group in sets for n in group]
        assert len(named) == len(set(named)), "a table has two rules"
        tables = set(pol.producer_child_tables())
        assert len(tables) > 20, "control: the metadata walk found the child tables"
        assert tables - set(named) == set(), "unclassified child tables of producers"
        assert set(named) - tables == set(), "a rule names a table that is gone"
