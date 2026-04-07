"""
TDD: rating request dispatcher.

Spec (CLAUDE.md §6):
  24 hours after a buyer clicks the WhatsApp button on a "מהמטבח של השכן"
  listing, the platform sends them a rating request via Twilio WhatsApp,
  containing a unique tokenised link. Each click is dispatched at most once,
  and clicks that have already been rated are skipped.

This module tests the pure dispatcher in isolation with a fake sender — no
Twilio network call. The dispatcher returns the number of requests it sent.
"""
import uuid
from datetime import datetime, timedelta

from app.models.models import HomeProduct, HomeProductWhatsAppClick
from app.services.rating_dispatcher import dispatch_pending_rating_requests
from tests.conftest import make_user


def _make_listing(db, owner) -> HomeProduct:
    hp = HomeProduct(
        user_id=owner.id,
        title="כרוב כבוש ביתי",
        description="טעים מאוד",
        quantity="2 צנצנות",
        price=25,
        neighborhood="פלורנטין",
        city="תל אביב",
        phone="0501234567",
    )
    db.add(hp)
    db.commit()
    db.refresh(hp)
    return hp


def _make_click(db, *, buyer, listing, hours_ago: float, **overrides) -> HomeProductWhatsAppClick:
    click = HomeProductWhatsAppClick(
        user_id=buyer.id,
        home_product_id=listing.id,
        clicked_at=datetime.utcnow() - timedelta(hours=hours_ago),
        rating_token=f"tok-{uuid.uuid4().hex}",
        **overrides,
    )
    db.add(click)
    db.commit()
    db.refresh(click)
    return click


class TestRatingDispatcher:
    def test_click_older_than_24h_triggers_send(self, db):
        """A click that happened >24h ago should produce exactly one rating request."""
        seller = make_user(db, name="המוכרת")
        buyer = make_user(db, name="הקונה")
        listing = _make_listing(db, seller)
        click = _make_click(db, buyer=buyer, listing=listing, hours_ago=25)

        sent_to: list[HomeProductWhatsAppClick] = []

        sent = dispatch_pending_rating_requests(db, sender=sent_to.append)

        assert sent == 1
        assert len(sent_to) == 1
        assert sent_to[0].id == click.id
        # The click is now flagged so we don't double-send
        db.refresh(click)
        assert click.rating_sent is True

    def test_click_younger_than_24h_is_skipped(self, db):
        seller = make_user(db)
        buyer = make_user(db)
        listing = _make_listing(db, seller)
        _make_click(db, buyer=buyer, listing=listing, hours_ago=23)

        sent_to: list = []
        sent = dispatch_pending_rating_requests(db, sender=sent_to.append)

        assert sent == 0
        assert sent_to == []

    def test_already_sent_click_not_resent(self, db):
        seller = make_user(db)
        buyer = make_user(db)
        listing = _make_listing(db, seller)
        _make_click(
            db, buyer=buyer, listing=listing, hours_ago=72, rating_sent=True
        )

        sent_to: list = []
        sent = dispatch_pending_rating_requests(db, sender=sent_to.append)

        assert sent == 0
        assert sent_to == []

    def test_already_rated_click_not_sent(self, db):
        seller = make_user(db)
        buyer = make_user(db)
        listing = _make_listing(db, seller)
        _make_click(
            db, buyer=buyer, listing=listing, hours_ago=48, rated=True
        )

        sent_to: list = []
        sent = dispatch_pending_rating_requests(db, sender=sent_to.append)

        assert sent == 0
        assert sent_to == []

    def test_dispatcher_handles_mixed_batch(self, db):
        """Only clicks that are old, unsent, and unrated should be dispatched."""
        seller = make_user(db)
        buyer = make_user(db)
        listing = _make_listing(db, seller)

        eligible = _make_click(db, buyer=buyer, listing=listing, hours_ago=30)
        _make_click(db, buyer=buyer, listing=listing, hours_ago=10)  # too new
        _make_click(
            db, buyer=buyer, listing=listing, hours_ago=40, rating_sent=True
        )
        _make_click(
            db, buyer=buyer, listing=listing, hours_ago=40, rated=True
        )

        sent_ids: list = []
        sent = dispatch_pending_rating_requests(
            db, sender=lambda c: sent_ids.append(c.id)
        )

        assert sent == 1
        assert sent_ids == [eligible.id]

    def test_explicit_now_parameter_controls_cutoff(self, db):
        """Passing `now` lets us pin the clock without freezegun."""
        seller = make_user(db)
        buyer = make_user(db)
        listing = _make_listing(db, seller)
        click = _make_click(db, buyer=buyer, listing=listing, hours_ago=0)

        # Pretend it's 25 hours later than the click
        future = click.clicked_at + timedelta(hours=25)
        sent_to: list = []
        sent = dispatch_pending_rating_requests(
            db, now=future, sender=sent_to.append
        )

        assert sent == 1
        assert len(sent_to) == 1
