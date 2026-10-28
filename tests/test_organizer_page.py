"""MEH-2461 — the public organizer page and its sitemap source.

GET /organizers/{slug}: an approved organizer's profile + upcoming events
(active, today-or-later in Israel, soonest first). 404 for a business slug, a
pending organizer and an unknown slug — the business keeps its own page and a
pending row is not public. GET /organizers: the slug list the sitemap reads,
approved organizers only. 5-state rule: 0 / 1 / many upcoming events.
"""

from datetime import timedelta

from app.models.models import Event, Producer
from app.slug_utils import is_reserved
from app.utils.clock import israel_today
from conftest import make_producer

ORG_SLUG = "meh2461-market"


def _organizer(db, *, slug: str = ORG_SLUG, status: str = "approved") -> Producer:
    producer = Producer(
        name=f"שוק {slug}",
        description="שוק יצרנים נודד",
        city="חיפה",
        status=status,
        kind="organizer",
        slug=slug,
        images=["https://res.cloudinary.com/x/image/upload/a.jpg"],
        has_physical_location=True,
    )
    db.add(producer)
    db.commit()
    db.refresh(producer)
    return producer


def _event(db, producer, *, days: int, title: str, active: bool = True) -> None:
    db.add(
        Event(
            producer_id=producer.id,
            title=title,
            event_date=israel_today() + timedelta(days=days),
            category="שוק",
            city="חיפה",
            is_active=active,
        )
    )
    db.commit()


class TestOrganizerPage:
    def test_zero_upcoming_events(self, client, db):
        _organizer(db)
        resp = client.get(f"/organizers/{ORG_SLUG}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["slug"] == ORG_SLUG
        assert body["upcoming_events"] == []

    def test_one_upcoming_event(self, client, db):
        org = _organizer(db)
        _event(db, org, days=3, title="שוק החורף")
        events = client.get(f"/organizers/{ORG_SLUG}").json()["upcoming_events"]
        assert [e["title"] for e in events] == ["שוק החורף"]
        assert events[0]["owner_kind"] == "organizer"
        assert events[0]["owner_slug"] == ORG_SLUG

    def test_many_upcoming_soonest_first_past_and_inactive_excluded(self, client, db):
        org = _organizer(db)
        _event(db, org, days=10, title="later")
        _event(db, org, days=0, title="today")
        _event(db, org, days=4, title="middle")
        _event(db, org, days=-1, title="past")
        _event(db, org, days=2, title="inactive", active=False)
        events = client.get(f"/organizers/{ORG_SLUG}").json()["upcoming_events"]
        assert [e["title"] for e in events] == ["today", "middle", "later"]

    def test_business_slug_is_404(self, client, db):
        business = make_producer(db, name="חוות הניסוי", status="approved")
        business.slug = "meh2461-business"
        db.commit()
        assert client.get("/organizers/meh2461-business").status_code == 404

    def test_pending_organizer_is_404(self, client, db):
        _organizer(db, status="pending")
        assert client.get(f"/organizers/{ORG_SLUG}").status_code == 404

    def test_unknown_slug_is_404(self, client, db):
        assert client.get("/organizers/nope-nope").status_code == 404

    def test_no_street_address_or_business_fields(self, client, db):
        org = _organizer(db)
        org.address = "רחוב הבדיקה 1"
        db.commit()
        body = client.get(f"/organizers/{ORG_SLUG}").json()
        for field in ("address", "products", "categories", "producer_license_number"):
            assert field not in body


class TestOrganizerSitemapSource:
    def test_lists_approved_organizers_only(self, client, db):
        _organizer(db, slug="meh2461-a")
        _organizer(db, slug="meh2461-pending", status="pending")
        business = make_producer(db, name="חוות", status="approved")
        business.slug = "meh2461-biz"
        db.commit()
        slugs = [row["slug"] for row in client.get("/organizers").json()]
        assert slugs == ["meh2461-a"]


def test_organizers_is_a_reserved_slug():
    """/organizers is a real route — a business must not be able to take it."""
    assert is_reserved("organizers")
