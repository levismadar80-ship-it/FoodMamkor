"""MEH-3252 (B4) — account deletion removes the email/phone-keyed rows too.

The privacy policy promises «עם מחיקת חשבון נמחקים כל הנתונים המזוהים
מיידית». Before this fix the WhatsApp inbox, «צרו קשר» messages, the
newsletter list, the delivery waitlist and the suggester fields on outreach
leads kept her email / phone forever, because none of them points at
users.id with a cascade.
"""

from conftest import auth_header, make_producer, make_user
from app.models.models import (
    ContactMessage,
    DeliveryWaitlistEntry,
    InboundMessage,
    NewsletterSubscriber,
    OutboundMessage,
    OutreachLead,
)


def _trail(db, *, email, phone_stored, producer, user_id=None):
    db.add(NewsletterSubscriber(email=email))
    db.add(ContactMessage(name="דנה", email=email, message="שאלה על האתר"))
    db.add(
        DeliveryWaitlistEntry(
            producer_id=producer.id,
            city="חדרה",
            city_key="hadera",
            email=email,
            user_id=user_id,
        )
    )
    db.add(InboundMessage(from_phone=phone_stored, body="היי"))
    db.add(OutboundMessage(to_phone=phone_stored, kind="favorite_alert"))
    db.add(
        OutreachLead(
            name="מאפיית הכפר",
            source="community",
            suggested_by_name="דנה",
            suggested_by_email=email,
            suggester_wants_update=True,
        )
    )
    db.commit()


def test_delete_account_erases_contact_trail(client, db):
    user = make_user(db, email="Dana@Example.com", name="דנה כהן")
    user.phone = "050-123-4567"
    db.commit()
    other = make_user(db, email="keep@example.com")
    producer = make_producer(db)
    # Her rows: email in another case, phone in the canonical Meta form.
    _trail(
        db,
        email="dana@example.com",
        phone_stored="972501234567",
        producer=producer,
        user_id=user.id,
    )
    # Another person's rows must survive.
    _trail(
        db,
        email="keep@example.com",
        phone_stored="972529999999",
        producer=producer,
        user_id=other.id,
    )

    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code in (200, 204), r.text
    db.expire_all()

    assert (
        db.query(NewsletterSubscriber).filter_by(email="dana@example.com").count() == 0
    )
    assert db.query(ContactMessage).filter_by(email="dana@example.com").count() == 0
    assert (
        db.query(DeliveryWaitlistEntry).filter_by(email="dana@example.com").count() == 0
    )
    assert db.query(InboundMessage).filter_by(from_phone="972501234567").count() == 0
    assert db.query(OutboundMessage).filter_by(to_phone="972501234567").count() == 0
    lead = db.query(OutreachLead).filter(OutreachLead.suggested_by_name.is_(None)).one()
    assert lead.suggested_by_email is None
    assert lead.suggester_wants_update is False

    assert (
        db.query(NewsletterSubscriber).filter_by(email="keep@example.com").count() == 1
    )
    assert db.query(ContactMessage).filter_by(email="keep@example.com").count() == 1
    assert (
        db.query(DeliveryWaitlistEntry).filter_by(email="keep@example.com").count() == 1
    )
    assert db.query(InboundMessage).filter_by(from_phone="972529999999").count() == 1
    assert db.query(OutboundMessage).filter_by(to_phone="972529999999").count() == 1
    assert (
        db.query(OutreachLead).filter_by(suggested_by_email="keep@example.com").count()
        == 1
    )


def test_owner_delete_erases_business_phone_inbox(client, db):
    owner = make_user(db, email="owner3219@example.com", role="producer")
    producer = make_producer(db, name="Doomed Farm 3219")
    owner.producer_id = producer.id
    producer.phone = "0541112222"
    db.commit()
    db.add(InboundMessage(from_phone="972541112222", body="שאלה לעסק"))
    db.commit()

    r = client.delete("/auth/me", headers=auth_header(owner))
    assert r.status_code in (200, 204), r.text
    db.expire_all()
    assert db.query(InboundMessage).filter_by(from_phone="972541112222").count() == 0


def test_admin_delete_takes_the_same_erase_and_syncs_resend(client, db, monkeypatch):
    """Both doors share delete_user_and_data (MEH-2585); the admin one too.
    Also: the newsletter address leaves Resend Contacts, and the 05… / +972…
    notations of her number are matched, not only Meta's 972…."""
    removed: list[str] = []
    monkeypatch.setattr(
        "app.services.newsletter_sync.sync_unsubscribe",
        lambda email: removed.append(email),
    )
    admin = make_user(db, email="admin3252@example.com", role="admin")
    victim = make_user(db, email="victim3252@example.com")
    victim.phone = "+972 52-765-4321"
    db.commit()
    producer = make_producer(db, name="Farm 3252")
    _trail(
        db, email="victim3252@example.com", phone_stored="0527654321", producer=producer
    )
    db.add(InboundMessage(from_phone="+972527654321", body="עוד הודעה"))
    db.commit()

    r = client.delete(f"/admin/users/{victim.id}", headers=auth_header(admin))
    assert r.status_code in (200, 204), r.text
    db.expire_all()
    assert (
        db.query(NewsletterSubscriber).filter_by(email="victim3252@example.com").count()
        == 0
    )
    assert (
        db.query(InboundMessage)
        .filter(InboundMessage.from_phone.in_(["0527654321", "+972527654321"]))
        .count()
        == 0
    )
    assert db.query(OutboundMessage).filter_by(to_phone="0527654321").count() == 0
    assert removed == ["victim3252@example.com"]
