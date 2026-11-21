"""Shared helpers, constants and fixtures of `tests/test_experiences.py`.

Moved here verbatim by the MEH-3540 mechanical split. Not collected by
pytest (no `test_` prefix); `tests/test_experiences.py` is the module pytest runs.
"""

from datetime import time, timedelta
from decimal import Decimal

from app.models.models import Experience, User
from app.utils.clock import israel_today
from conftest import auth_header, make_producer, make_user


def _make_host(db, *, producer_status: str = "approved", **user_kwargs) -> User:
    """A host whose business is approved.

    MEH-1749 gated the public read paths on the host's business status, so a
    plain `make_user(db)` host is no longer publicly visible — its experiences
    are correctly filtered out. Public-visibility tests therefore build their
    host through here; owner/admin tests keep using `make_user` directly,
    because those paths bypass the gate by design.

    "Public read path" is the whole test, not just its subject. A test whose
    *subject* is cancellation or pin privacy still asserts through
    `GET /experiences` — so it needs a host with a business even though the
    business is not what it is testing. Six such tests were missed on the first
    sweep and only CI caught them; the criterion is **does this test read a
    public path**, never **is this test about visibility**.

    `**user_kwargs` forwards to `make_user` (e.g. `email=`) for tests that pin
    explicit addresses to keep two actors apart.

    Pass `producer_status="pending"` / `"rejected"` to exercise the gate.
    """
    host = make_user(db, **user_kwargs)
    producer = make_producer(db, status=producer_status)
    host.producer_id = producer.id
    db.commit()
    db.refresh(host)
    return host


# ---------- helpers ----------


def _payload(**overrides) -> dict:
    """Valid minimal submission payload. Override fields per-test."""
    base = {
        "title": "סדנת אפיית לחם מחמצת לכל המשפחה",
        "description": (
            "סדנה מעשית של 3 שעות ללימוד אפיית לחם מחמצת ביתי מהתחלה "
            "ועד הסוף. מתאים למתחילות ומתקדמות."
        ),
        "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "category": "בישול",
        "event_date": (israel_today() + timedelta(days=14)).isoformat(),
        "event_time": "10:00",
        "location_type": "home",
        "city": "תל אביב",
        "address": "רחוב הרצל 1",
        "price_per_person": 150,
        "max_participants": 10,
        "requirements": "סינר ונעליים סגורות",
        "is_recurring": False,
    }
    base.update(overrides)
    return base


def _make_experience(db, host: User, **overrides) -> Experience:
    """Insert an Experience row directly (bypassing the HTTP layer).
    Used for listing/admin tests that don't care about the submission flow."""
    data = {
        "title": "Experience",
        "description": (
            "A detailed description long enough to pass validation — "
            "at least twenty characters of real content."
        ),
        "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "category": "בישול",
        "host_user_id": host.id,
        "event_date": israel_today() + timedelta(days=7),
        "event_time": time(10, 0),
        "location_type": "home",
        "city": "תל אביב",
        "max_participants": 10,
        "price_per_person": Decimal("150"),
        "status": "pending",
        "moderation_status": "APPROVED",
    }
    data.update(overrides)
    ex = Experience(**data)
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


def _mock_moderation(monkeypatch, status="APPROVED", reason=None, suggestion=None):
    """Patch the moderation service to return a fixed verdict.

    Applied at both the service module and the router module to cover
    both `from … import validate_experience` and the local reference
    inside the router. Tests that want to simulate FLAGGED/REJECTED
    just change the `status` argument.
    """
    result = {"status": status, "reason": reason, "suggestion": suggestion}

    def _fake_validate(_):
        return result

    import app.services.experience_moderation as mod
    import app.routers.experiences as router_mod

    monkeypatch.setattr(mod, "validate_experience", _fake_validate)
    monkeypatch.setattr(router_mod, "validate_experience", _fake_validate)
