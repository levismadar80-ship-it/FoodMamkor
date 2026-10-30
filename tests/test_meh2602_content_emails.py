"""MEH-2602: the mails the staging sweep (29/10) found missing.

Approving a recipe or a kashrut certificate, a new review, and an owner's
reply all sent nothing. Experiences already mailed on every outcome
(test_meh1176); these assert the same for the other surfaces, through the
public endpoints, by capturing the one send_email the new module calls.

Every positive case has a negative twin (an edit, a second reply, a business
with no owner account) so a module that mailed on everything cannot pass.

DISCRIMINATION: with the new module present but the three routers reverted to
staging, 7 failed and 1 passed — the survivor is the no-owner control, which
asserts silence and is not evidence. (On the bare pre-2602 tree all 8 error at
the fixture, because the module does not exist; that run proves nothing.)
"""

from datetime import timedelta

import pytest

from app.models import ProducerWhatsAppClick
from app.models.models import KashrutBadgeRequest, ProducerRecipe, ProducerReview
from app.utils.clock import israel_today
from tests.conftest import auth_header, make_producer, make_user

BODY = "המוצרים מדהימים ואוהבת את השירות!"


@pytest.fixture
def sent(monkeypatch):
    from app.services import content_notifications

    box = []
    monkeypatch.setattr(
        content_notifications,
        "send_email",
        lambda to, subject, body, **_: box.append((to, subject, body)),
    )
    return box


def _owned_producer(db, email="owner@example.com"):
    producer = make_producer(db, name="מאפיית השדה")
    producer.slug = "maafiyat-hasade"
    owner = make_user(db, email=email, role="producer")
    owner.producer_id = producer.id
    db.commit()
    return producer, owner


def _recipe(db, producer):
    recipe = ProducerRecipe(
        producer_id=producer.id,
        title="לחם מחמצת",
        ingredients="א" * 20,
        instructions="ב" * 20,
        moderation_status="pending",
        published=False,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


# --- recipes ---


def test_recipe_approval_mails_the_owner(client, db, sent):
    producer, owner = _owned_producer(db)
    recipe = _recipe(db, producer)
    admin = make_user(db, role="admin")

    r = client.post(f"/admin/recipes/{recipe.id}/approve", headers=auth_header(admin))

    assert r.status_code == 200, r.text
    assert [s[0] for s in sent] == [owner.email]
    assert "לחם מחמצת" in sent[0][1]
    assert f"/maafiyat-hasade/recipes/{recipe.id}" in sent[0][2]


def test_recipe_change_request_mails_the_feedback(client, db, sent):
    producer, owner = _owned_producer(db)
    recipe = _recipe(db, producer)
    admin = make_user(db, role="admin")

    r = client.post(
        f"/admin/recipes/{recipe.id}/request-changes",
        json={"feedback": "חסרה כמות\nהקמח"},
        headers=auth_header(admin),
    )

    assert r.status_code == 200, r.text
    assert [s[0] for s in sent] == [owner.email]
    assert "חסרה כמות הקמח" in sent[0][2]  # the line break never reaches the mail


def test_recipe_rejection_mails_the_owner(client, db, sent):
    producer, owner = _owned_producer(db)
    recipe = _recipe(db, producer)
    admin = make_user(db, role="admin")

    r = client.post(
        f"/admin/recipes/{recipe.id}/reject",
        json={"feedback": ""},
        headers=auth_header(admin),
    )

    assert r.status_code == 200, r.text
    assert [s[0] for s in sent] == [owner.email]


def test_control_no_owner_account_no_mail(client, db, sent):
    producer = make_producer(db, name="עסק בלי חשבון")
    recipe = _recipe(db, producer)
    admin = make_user(db, role="admin")

    r = client.post(f"/admin/recipes/{recipe.id}/approve", headers=auth_header(admin))

    assert r.status_code == 200, r.text
    assert sent == []


# --- kashrut ---


def _kashrut_request(db, producer):
    req = KashrutBadgeRequest(producer_id=producer.id, badge_code="rabanut")
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def test_kashrut_approval_mails_the_owner_with_the_expiry(client, db, sent):
    producer, owner = _owned_producer(db)
    req = _kashrut_request(db, producer)
    admin = make_user(db, role="admin")
    expires = israel_today() + timedelta(days=90)

    r = client.post(
        f"/admin/kashrut/{req.id}/approve",
        json={"expires_on": expires.isoformat()},
        headers=auth_header(admin),
    )

    assert r.status_code == 200, r.text
    assert [s[0] for s in sent] == [owner.email]
    assert expires.strftime("%d/%m/%Y") in sent[0][2]


def test_kashrut_rejection_mails_the_notes(client, db, sent):
    producer, owner = _owned_producer(db)
    req = _kashrut_request(db, producer)
    admin = make_user(db, role="admin")

    r = client.post(
        f"/admin/kashrut/{req.id}/reject",
        json={"notes": "התעודה לא קריאה"},
        headers=auth_header(admin),
    )

    assert r.status_code == 200, r.text
    assert [s[0] for s in sent] == [owner.email]
    assert "התעודה לא קריאה" in sent[0][2]


# --- reviews ---


def _reviewer(db, producer, email="buyer@example.com"):
    buyer = make_user(db, email=email)
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=buyer.id))
    db.commit()
    return buyer


def test_new_review_mails_the_owner_once(client, db, sent):
    producer, owner = _owned_producer(db)
    buyer = _reviewer(db, producer)

    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": BODY},
        headers=auth_header(buyer),
    )
    assert r.status_code == 201, r.text
    assert [s[0] for s in sent] == [owner.email]
    assert "5 מתוך 5" in sent[0][2]

    # An edit of the same review is not news.
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 4, "body": BODY + " עריכה"},
        headers=auth_header(buyer),
    )
    assert r.status_code == 201, r.text
    assert len(sent) == 1


def test_first_owner_reply_mails_the_reviewer_once(client, db, sent):
    producer, owner = _owned_producer(db)
    buyer = _reviewer(db, producer)
    review = ProducerReview(
        producer_id=producer.id, user_id=buyer.id, stars=5, body=BODY
    )
    db.add(review)
    db.commit()

    r = client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "תודה רבה, שמחנו!"},
        headers=auth_header(owner),
    )
    assert r.status_code == 200, r.text
    assert [s[0] for s in sent] == [buyer.email]
    assert "/p/maafiyat-hasade#reviews" in sent[0][2]

    # Editing the reply does not mail again.
    r = client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "תודה רבה, שמחנו מאוד!"},
        headers=auth_header(owner),
    )
    assert r.status_code == 200, r.text
    assert len(sent) == 1
