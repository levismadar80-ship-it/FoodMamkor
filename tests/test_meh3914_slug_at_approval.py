"""MEH-3914 — a business's public address is confirmed by a person before it goes live.

A business with no slug, no Instagram handle and a name with no Latin letter
used to go live under a machine transliteration nobody saw. Approval and
publish-with-consent now answer 422 `slug_required` with that transliteration
as the suggestion; the admin confirms it (or types another) with `?slug=`.
"""

from conftest import SUBMIT_READY_IMAGE, auth_header, make_producer, make_user
from sqlalchemy.orm import Session

from app.models import User
from app.services import producer_approval
from app.slug_utils import latin_slug
from tests.test_meh1817_slug_on_approve import _integrity_error

CONSENT = {"consent_confirmed": True, "consent_note": "אישרו בוואטסאפ, 26.11"}


def _admin(db):
    existing = db.query(User).filter(User.email == "admin3914@example.com").first()
    return existing or make_user(db, role="admin", email="admin3914@example.com")


def _pending(db, instagram=None, slug=None, **kw):
    kw.setdefault("images", [SUBMIT_READY_IMAGE])
    kw.setdefault("phone_verified", True)
    producer = make_producer(db, status="pending", **kw)
    producer.instagram = instagram
    producer.slug = slug
    db.commit()
    return producer


def _approve(client, db, producer, **params):
    return client.post(
        f"/admin/producers/{producer.id}/approve",
        params=params,
        headers=auth_header(_admin(db)),
    )


def test_a_hebrew_name_with_no_instagram_asks_for_the_address(client, db):
    producer = _pending(db, name="סנדרה פרו")
    resp = _approve(client, db, producer)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["code"] == "slug_required"
    assert detail["suggested"] == latin_slug("סנדרה פרו") != ""
    db.refresh(producer)
    assert producer.status == "pending"
    assert producer.slug is None


def test_the_confirmed_address_is_the_one_that_goes_live(client, db):
    producer = _pending(db, name="סנדרה פרו")
    resp = _approve(client, db, producer, slug="Sandra Perot")
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"
    assert producer.slug == "sandra-perot"


def test_a_hebrew_address_is_refused(client, db):
    producer = _pending(db, name="סנדרה פרו")
    resp = _approve(client, db, producer, slug="סנדרה")
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "slug_not_latin"
    db.refresh(producer)
    assert producer.status == "pending"


def test_an_instagram_handle_needs_no_confirmation(client, db):
    producer = _pending(db, name="סנדרה פרו", instagram="@sandra.bakes")
    resp = _approve(client, db, producer)
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.slug == "sandra-bakes"


def test_a_latin_name_needs_no_confirmation(client, db):
    producer = _pending(db, name="Sandra's Kitchen")
    assert _approve(client, db, producer).status_code == 200
    db.refresh(producer)
    assert producer.slug and producer.slug.startswith("sandra")


def test_an_existing_slug_is_kept_without_asking(client, db):
    producer = _pending(db, name="סנדרה פרו", slug="sandra-old")
    assert _approve(client, db, producer).status_code == 200
    db.refresh(producer)
    assert producer.slug == "sandra-old"


def test_a_missing_photo_is_reported_before_the_address(client, db):
    producer = _pending(db, name="סנדרה פרו", images=[])
    resp = _approve(client, db, producer)
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], str)  # the photo gate's sentence


def test_publish_with_consent_asks_for_the_address_too(client, db):
    draft = make_producer(
        db, status="draft", name="סנדרה פרו", images=[SUBMIT_READY_IMAGE]
    )
    url = f"/admin/producers/{draft.id}/publish-with-consent"
    resp = client.post(url, json=CONSENT, headers=auth_header(_admin(db)))
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "slug_required"
    db.refresh(draft)
    assert draft.status == "draft"

    resp = client.post(
        url,
        params={"slug": "sandra-perot"},
        json=CONSENT,
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["slug"] == "sandra-perot"


def test_a_taken_address_is_offered_back_not_suffixed_silently(client, db):
    _pending(db, name="אחרת", slug="sandra-perot")
    producer = _pending(db, name="סנדרה פרו", city="פרדס חנה")
    resp = _approve(client, db, producer, slug="sandra-perot")
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "slug_taken"
    assert detail["suggested"] not in ("", "sandra-perot")
    assert detail["suggested"].startswith("sandra-perot-")
    db.refresh(producer)
    assert producer.status == "pending"
    assert producer.slug is None
    # Confirming the offered variant goes live under exactly that address.
    assert _approve(client, db, producer, slug=detail["suggested"]).status_code == 200
    db.refresh(producer)
    assert producer.slug == detail["suggested"]


def test_the_retry_after_a_slug_race_keeps_the_typed_address(client, db, monkeypatch):
    """`_persist_approval` re-mints after a producers_slug_key race; the retry
    must mint from the address the admin typed, not from the transliteration."""
    producer = _pending(db, name="סנדרה פרו")
    assert latin_slug("סנדרה פרו") != "my-bakery"
    real_commit = Session.commit
    real_mint = producer_approval._mint_slug_if_absent
    state = {"armed": False, "fired": False, "minted": []}

    def arming_mint(session, prod, typed_slug=None):
        state["minted"].append(typed_slug)
        if not state["fired"]:
            state["armed"] = True
        return real_mint(session, prod, typed_slug)

    def commit_raising_once(self, *args, **kwargs):
        if state["armed"]:
            state["armed"] = False
            state["fired"] = True
            raise _integrity_error("producers_slug_key")
        return real_commit(self, *args, **kwargs)

    monkeypatch.setattr(producer_approval, "_mint_slug_if_absent", arming_mint)
    monkeypatch.setattr(Session, "commit", commit_raising_once)
    resp = _approve(client, db, producer, slug="my-bakery")
    monkeypatch.undo()
    assert state["fired"], "the race was never simulated"
    assert state["minted"] == ["my-bakery", "my-bakery"], state["minted"]
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(producer)
    assert producer.slug == "my-bakery"
