"""MEH-1677 — coverage-request city capture + coverage_cta_enabled.

Two columns landed in revision b3f7a1c46e92. These tests assert BEHAVIOUR, not
that the prescribed change was applied (workflow.md §3.6): each one would still
fail if the column existed but nothing wrote to it, or if it were written on the
wrong event.

The discriminating case is `test_ordinary_whatsapp_click_leaves_city_null`. A
suite that only proved "a city can be stored" would pass identically against an
implementation that stamped a city onto EVERY WhatsApp click — which is the
actual defect worth preventing, because it would silently reclassify ordinary
clicks as coverage requests in MEH-1676's dashboard card.
"""

from app.models.models import Producer, ProducerWhatsAppClick
from app.schemas.schemas import COVERAGE_CITY_MAX_LENGTH

from tests.conftest import make_producer


class TestCoverageCityCapture:
    def test_coverage_click_persists_city(self, client, db):
        p = make_producer(db)
        r = client.post(
            f"/producers/{p.id}/whatsapp-click", json={"city": "מודיעין"}
        )
        assert r.status_code == 200
        row = db.query(ProducerWhatsAppClick).one()
        assert row.city == "מודיעין"

    def test_ordinary_whatsapp_click_leaves_city_null(self, client, db):
        """THE discriminating case — see the module docstring."""
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/whatsapp-click")
        assert r.status_code == 200
        row = db.query(ProducerWhatsAppClick).one()
        assert row.city is None

    def test_empty_and_whitespace_city_normalise_to_null(self, client, db):
        p = make_producer(db)
        for payload in ({"city": ""}, {"city": "   "}, {"city": None}):
            client.post(f"/producers/{p.id}/whatsapp-click", json=payload)
        rows = db.query(ProducerWhatsAppClick).all()
        assert len(rows) == 3
        assert all(r.city is None for r in rows), [r.city for r in rows]

    def test_city_is_trimmed(self, client, db):
        p = make_producer(db)
        client.post(f"/producers/{p.id}/whatsapp-click", json={"city": "  חיפה  "})
        assert db.query(ProducerWhatsAppClick).one().city == "חיפה"

    def test_city_capped_at_60_chars(self, client, db):
        p = make_producer(db)
        client.post(f"/producers/{p.id}/whatsapp-click", json={"city": "א" * 200})
        stored = db.query(ProducerWhatsAppClick).one().city
        # Assert the CAP, derived from the constant -- not a literal 60, which
        # would silently disagree with the column if either were changed alone.
        assert len(stored) == COVERAGE_CITY_MAX_LENGTH

    def test_junk_city_drops_to_null_but_the_click_is_still_logged(self, client, db):
        """MEH-555 pattern: a free-text field feeding a dashboard must require a
        letter class, or "???" becomes a phantom city in the demand feed.

        Asserts BOTH halves, and the second is the one that discriminates: a
        naive fix that raises 422 would satisfy "no junk stored" while silently
        discarding a real click. This endpoint's rule is the opposite (MEH-1627,
        "losing attribution beats losing the click"), so the row must exist with
        city NULL.
        """
        p = make_producer(db)
        for junk in ("???", "123", "!!!", "...", "—"):
            r = client.post(f"/producers/{p.id}/whatsapp-click", json={"city": junk})
            assert r.status_code == 200, f"{junk!r} -> {r.status_code} {r.text}"
        rows = db.query(ProducerWhatsAppClick).all()
        assert len(rows) == 5, "every click must still be logged"
        assert all(row.city is None for row in rows), [row.city for row in rows]

    def test_short_real_city_names_still_pass(self, client, db):
        """Real city names must survive the junk guard.

        HONEST LIMIT, stated because the first draft of this docstring claimed
        more than the test delivers: this does NOT discriminate min_count=1
        from min_count=3. Measured -- swapping the guard to `< 3` leaves all 12
        tests green, because every name here clears 3 letters once separators
        are stripped ("בת ים" -> 4). It proves the guard does not reject real
        localities; it does not pin the floor's value. The floor is 1 to match
        the sibling `_validate_city_letters`, not because a test forces it.
        """
        p = make_producer(db)
        for city in ("לוד", "בת ים", "אום אל-פחם"):
            r = client.post(f"/producers/{p.id}/whatsapp-click", json={"city": city})
            assert r.status_code == 200
        stored = [row.city for row in db.query(ProducerWhatsAppClick).all()]
        assert sorted(stored) == sorted(["לוד", "בת ים", "אום אל-פחם"]), stored

    def test_non_string_city_is_rejected_not_silently_nulled(self, client, db):
        """The `isinstance(v, str)` branch of _validate_city. Without this the
        branch is unexercised, and a regression that replaced the raise with a
        `return None` would look identical to a legitimately absent city -- a
        422 and a silent null are very different contracts."""
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/whatsapp-click", json={"city": 123})
        assert r.status_code == 422, r.text
        assert db.query(ProducerWhatsAppClick).count() == 0

    def test_unknown_city_is_stored_not_dropped(self, client, db):
        """Soft validation: a locality our canonical list does not carry is the
        most interesting row in the table, not the one to discard."""
        p = make_producer(db)
        client.post(
            f"/producers/{p.id}/whatsapp-click", json={"city": "יישוב שלא ברשימה"}
        )
        assert db.query(ProducerWhatsAppClick).one().city == "יישוב שלא ברשימה"


class TestCoverageCtaEnabled:
    def test_defaults_true_on_a_new_producer(self, db):
        p = make_producer(db)
        db.refresh(p)
        assert p.coverage_cta_enabled is True

    def test_exposed_on_the_public_detail_payload(self, client, db):
        p = make_producer(db)
        r = client.get(f"/producers/{p.id}")
        assert r.status_code == 200
        assert r.json()["coverage_cta_enabled"] is True

    def test_false_is_reported_as_false(self, client, db):
        """Without this, a serializer that hardcoded True would pass the test
        above and ship an opt-out that does nothing."""
        p = make_producer(db)
        db.query(Producer).filter(Producer.id == p.id).update(
            {"coverage_cta_enabled": False}
        )
        db.commit()
        r = client.get(f"/producers/{p.id}")
        assert r.json()["coverage_cta_enabled"] is False
