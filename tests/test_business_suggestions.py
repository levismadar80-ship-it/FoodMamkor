"""
Module:   test_business_suggestions
Purpose:  MEH-2633 chunk A — the public POST /business-suggestions endpoint,
          the admin ?source= filter, the community metric, and
          POST /admin/outreach/{id}/thank-suggester.
Touches:  Postgres test DB via TestClient; email + WhatsApp mocked — never
          sends.
Does NOT: cover the /recommend page or the admin UI (chunk B), and does NOT
          re-test OutreachLead's admin create/dedupe path — see
          tests/test_outreach_prefill_edge_cases.py.
Related:  backend/app/routers/business_suggestions.py;
          backend/app/routers/admin_outreach.py thank_suggester;
          backend/app/schemas/schemas.py BusinessSuggestionCreate.
History:  MEH-2633 (creation, chunk A).
"""

from unittest.mock import MagicMock

from sqlalchemy import text

from app.models.models import OutreachLead
from conftest import auth_header, make_user

ENDPOINT = "/business-suggestions"


def _payload(**overrides) -> dict:
    """A schema-valid suggestion. Guard tests override ONE key so a 4xx is
    never really a 422 about something else (workflow regression rule 6)."""
    body = {
        "name": "מעדניית הזיתים",
        "city": "חיפה",
        "instagram": "hazeitim",
        "reason": "הזיתים הכי טובים שאכלתי",
        "suggester_name": "דנה",
        "suggester_email": "dana@example-suggester.co.il",
        "wants_update": True,
    }
    body.update(overrides)
    return body


def _silence_notify(monkeypatch) -> MagicMock:
    """Stub the admin ping. Returns the mock so a test can assert ON it."""
    import app.routers.business_suggestions as mod

    mock = MagicMock()
    monkeypatch.setattr(mod, "notify_admin_new_business_suggestion", mock)
    return mock


# ---------- public submit ----------


class TestSubmitSuggestion:
    def test_happy_path_creates_community_lead(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        r = client.post(ENDPOINT, json=_payload())
        assert r.status_code == 201

        rows = db.query(OutreachLead).all()
        assert len(rows) == 1
        lead = rows[0]
        assert lead.source == "community"
        assert lead.status == "new"
        assert lead.name == "מעדניית הזיתים"
        assert lead.city == "חיפה"
        assert lead.instagram == "hazeitim"
        assert lead.suggestion_reason == "הזיתים הכי טובים שאכלתי"
        assert lead.suggested_by_name == "דנה"
        assert lead.suggested_by_email == "dana@example-suggester.co.il"
        assert lead.suggester_wants_update is True
        assert lead.suggester_thanked_at is None

    def test_response_body_is_only_ok(self, client, monkeypatch):
        """The whole no-leak guarantee: no id, no email, no echo of anything.

        Asserted as EQUALITY against the full dict, not `"email" not in body` —
        a membership check passes for any field name nobody thought of, which
        is exactly the field that would leak.
        """
        _silence_notify(monkeypatch)
        r = client.post(ENDPOINT, json=_payload())
        assert r.status_code == 201
        assert r.json() == {"ok": True}

    def test_phone_only_is_enough(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        r = client.post(
            ENDPOINT,
            json=_payload(instagram=None, phone="0521234567"),
        )
        assert r.status_code == 201
        assert db.query(OutreachLead).count() == 1

    def test_website_only_is_enough(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        r = client.post(
            ENDPOINT,
            json=_payload(instagram=None, website="https://hazeitim.co.il"),
        )
        assert r.status_code == 201
        assert db.query(OutreachLead).count() == 1

    def test_no_contact_at_all_is_422_and_stores_nothing(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        r = client.post(ENDPOINT, json=_payload(instagram=None))
        assert r.status_code == 422
        assert "צריך לפחות דרך אחת" in r.text
        assert db.query(OutreachLead).count() == 0

    def test_city_is_required(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        assert client.post(ENDPOINT, json=_payload(city="")).status_code == 422
        assert db.query(OutreachLead).count() == 0

    def test_instagram_url_is_normalised_to_a_handle(self, client, db, monkeypatch):
        """REUSES _normalize_instagram — a pasted profile URL must not become a
        dead https://instagram.com/https://… link in the admin list."""
        _silence_notify(monkeypatch)
        r = client.post(
            ENDPOINT,
            json=_payload(instagram="https://www.instagram.com/hazeitim/?hl=he"),
        )
        assert r.status_code == 201
        assert db.query(OutreachLead).one().instagram == "hazeitim"


class TestNoExistenceOracle:
    """The endpoint must not reveal whether a business is already queued.

    The 2xx paths were built byte-identical for this reason. The security
    review (04/11) found the 5xx path was not: a crafted `phone` that passes
    validation but overflows outreach_leads.phone VARCHAR(20) only reaches the
    INSERT on a miss — the duplicate branch returns before `phone` is written.
    Miss -> 500, hit -> 201 is a clean binary oracle for an anonymous caller.

    `_phone_validator` returns `cleaned` (only [\s()-] stripped) while
    validating the DIGIT projection, so non-digits survive up to the field's
    30-char input cap, over the 20-char column. Measured: the value below is
    accepted and 25 chars long.

    The assertion is on the INVARIANT, not on a status code, so it keeps
    holding if the chosen remedy changes which code both paths return.
    """

    CRAFTED_PHONE = "+" * 15 + "0501234567"

    def test_hit_and_miss_answer_identically_for_a_crafted_phone(
        self, client, db, monkeypatch
    ):
        _silence_notify(monkeypatch)
        body = _payload(instagram=None, phone=self.CRAFTED_PHONE)

        miss = client.post(ENDPOINT, json=body)
        # Pre-seed the same (name, city) so the second call takes the
        # duplicate branch.
        db.add(OutreachLead(name=_payload()["name"], city="חיפה", source="manual"))
        db.commit()
        hit = client.post(ENDPOINT, json=body)

        assert miss.status_code == hit.status_code, (
            f"existence oracle: miss={miss.status_code} hit={hit.status_code}"
        )
        assert miss.json() == hit.json()

    def test_the_crafted_phone_never_500s(self, client, db, monkeypatch):
        """A 422 or a 201 are both fine; an unhandled 500 is not — it is the
        asymmetry above AND a bare error to an anonymous caller."""
        _silence_notify(monkeypatch)
        r = client.post(
            ENDPOINT, json=_payload(instagram=None, phone=self.CRAFTED_PHONE)
        )
        assert r.status_code < 500, r.status_code


class TestHoneypot:
    def test_filled_honeypot_returns_201_and_stores_nothing(
        self, client, db, monkeypatch
    ):
        notify = _silence_notify(monkeypatch)
        r = client.post(ENDPOINT, json=_payload(company="Acme SEO Ltd"))
        assert r.status_code == 201
        assert r.json() == {"ok": True}
        assert db.query(OutreachLead).count() == 0
        # Nobody is bothered by bot traffic.
        notify.assert_not_called()

    def test_empty_honeypot_is_not_a_trap(self, client, db, monkeypatch):
        """Discriminates: the trap must fire on a VALUE, not on the field's
        presence. A real browser submits company="" for an untouched input, and
        if that counted as a bot every genuine suggestion would be dropped
        silently — a bug no 4xx would ever reveal."""
        _silence_notify(monkeypatch)
        r = client.post(ENDPOINT, json=_payload(company=""))
        assert r.status_code == 201
        assert db.query(OutreachLead).count() == 1

    def test_whitespace_only_honeypot_is_not_a_trap(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        r = client.post(ENDPOINT, json=_payload(company="   "))
        assert r.status_code == 201
        assert db.query(OutreachLead).count() == 1


class TestDuplicateSuggestion:
    def test_second_suggestion_appends_a_note_and_adds_no_row(
        self, client, db, monkeypatch
    ):
        _silence_notify(monkeypatch)
        assert client.post(ENDPOINT, json=_payload()).status_code == 201
        r = client.post(
            ENDPOINT,
            json=_payload(
                name="  מעדניית הזיתים  ",
                city="חיפה",
                reason="גם אני ממליצה",
                suggester_email="second@example-suggester.co.il",
                suggester_name="יעל",
            ),
        )
        assert r.status_code == 201
        # Identical body — the endpoint is not an oracle for "already queued".
        assert r.json() == {"ok": True}

        rows = db.query(OutreachLead).all()
        assert len(rows) == 1
        lead = rows[0]
        assert "המלצה נוספת: גם אני ממליצה" in lead.notes
        # First suggester kept, not overwritten.
        assert lead.suggested_by_email == "dana@example-suggester.co.il"
        assert lead.suggested_by_name == "דנה"

    def test_an_admin_typed_lead_cannot_be_CLAIMED_by_an_anonymous_caller(
        self, client, db, monkeypatch
    ):
        """Security review (04/11) finding 2 — this assertion is INVERTED from
        what chunk A shipped.

        Chunk A filled the empty suggester slot on any matching lead, so that a
        person suggesting a business the admin had already typed could still be
        thanked. The review showed what that allows: the dedupe key is public
        information about a food business and the match is case/trim-loose, so
        an anonymous caller can guess (name, city), attach their own address to
        a lead they had nothing to do with, and have the thank-you mail
        redirected to them — while appearing in /admin/outreach as the person
        who recommended a business that joined.

        The suggestion is still recorded in `notes`, so nothing is lost for the
        admin; only the hijackable slot-fill is gone.
        """
        _silence_notify(monkeypatch)
        db.add(
            OutreachLead(
                name="מעדניית הזיתים", city="חיפה", source="manual", status="contacted"
            )
        )
        db.commit()

        r = client.post(ENDPOINT, json=_payload())
        assert r.status_code == 201

        rows = db.query(OutreachLead).all()
        assert len(rows) == 1
        lead = rows[0]
        assert lead.suggested_by_email is None, "an admin-typed lead was claimed"
        assert lead.suggester_wants_update is False
        assert lead.source == "manual"
        assert lead.status == "contacted"
        # The signal still reaches the admin.
        assert "המלצה נוספת" in lead.notes

    def test_a_community_leads_empty_slot_is_still_fillable(
        self, client, db, monkeypatch
    ):
        """The control for the narrowing above: it must not freeze the case the
        fill exists for — a community suggestion whose first suggester left no
        address, followed by one who did."""
        _silence_notify(monkeypatch)
        assert (
            client.post(
                ENDPOINT, json=_payload(suggester_email=None, suggester_name=None)
            ).status_code
            == 201
        )
        assert db.query(OutreachLead).one().source == "community"

        assert (
            client.post(
                ENDPOINT, json=_payload(suggester_email="late@example-suggester.co.il")
            ).status_code
            == 201
        )
        db.expire_all()
        assert (
            db.query(OutreachLead).one().suggested_by_email
            == "late@example-suggester.co.il"
        )

    def test_a_repeat_suggestion_never_erases_the_first_suggester_name(
        self, client, db, monkeypatch
    ):
        """REFEREE finding 1 (adversarial review): the adopt branch set
        `suggested_by_name` unconditionally, so a second suggestion carrying an
        email but NO name wiped the first suggester's name.

        Both halves of the setup are reachable with the documented schema:
        name and email are each optional, so a lead with a name and no email is
        an ordinary first suggestion.
        """
        _silence_notify(monkeypatch)
        # First: a name, no email.
        assert (
            client.post(
                ENDPOINT, json=_payload(suggester_name="דנה", suggester_email=None)
            ).status_code
            == 201
        )
        lead = db.query(OutreachLead).one()
        assert lead.suggested_by_name == "דנה"
        assert lead.suggested_by_email is None

        # Second: an email, no name → the empty email slot is filled, and the
        # name that was already there must survive.
        assert (
            client.post(
                ENDPOINT,
                json=_payload(
                    suggester_name=None, suggester_email="second@example-suggester.co.il"
                ),
            ).status_code
            == 201
        )
        db.expire_all()
        lead = db.query(OutreachLead).one()
        assert lead.suggested_by_email == "second@example-suggester.co.il"
        assert lead.suggested_by_name == "דנה", "the first suggester's name was erased"

    def test_a_repeat_suggestion_with_a_name_still_fills_an_empty_name(
        self, client, db, monkeypatch
    ):
        """The control for the fix above: `or existing.…` must not freeze the
        field. An empty name slot still accepts the new suggester's name."""
        _silence_notify(monkeypatch)
        client.post(ENDPOINT, json=_payload(suggester_name=None, suggester_email=None))
        client.post(
            ENDPOINT,
            json=_payload(suggester_name="יעל", suggester_email="y@example-suggester.co.il"),
        )
        db.expire_all()
        lead = db.query(OutreachLead).one()
        assert lead.suggested_by_name == "יעל"

    def test_a_different_city_is_a_different_business(self, client, db, monkeypatch):
        """Discriminates the dedupe key: same name, other city → a NEW row.
        Without this, a dedupe that matched on name alone would pass every
        other test in this class."""
        _silence_notify(monkeypatch)
        assert client.post(ENDPOINT, json=_payload()).status_code == 201
        assert client.post(ENDPOINT, json=_payload(city="באר שבע")).status_code == 201
        assert db.query(OutreachLead).count() == 2


class TestAdminPing:
    def test_new_suggestion_pings_admin_with_is_additional_false(
        self, client, monkeypatch
    ):
        notify = _silence_notify(monkeypatch)
        assert client.post(ENDPOINT, json=_payload()).status_code == 201
        notify.assert_called_once()
        assert notify.call_args.args == ("מעדניית הזיתים", "חיפה", "דנה", False)

    def test_duplicate_suggestion_pings_admin_with_is_additional_true(
        self, client, monkeypatch
    ):
        notify = _silence_notify(monkeypatch)
        assert client.post(ENDPOINT, json=_payload()).status_code == 201
        assert client.post(ENDPOINT, json=_payload()).status_code == 201
        assert notify.call_count == 2
        assert notify.call_args.args[3] is True

    def test_notify_message_carries_no_suggester_email(self, monkeypatch):
        """PII: the suggester's address has no job to do in an admin ping."""
        import app.services.auth_notifications as svc
        from app.config import settings

        wa_mock = MagicMock(return_value=True)
        email_mock = MagicMock()
        monkeypatch.setattr(svc, "send_text", wa_mock)
        monkeypatch.setattr(svc, "send_email", email_mock)
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "admin@example.com")

        svc.notify_admin_new_business_suggestion("מעדניית הזיתים", "חיפה", "דנה", False)

        wa_mock.assert_called_once()
        message = wa_mock.call_args.args[1]
        assert "מעדניית הזיתים" in message
        assert "חיפה" in message
        assert "/admin/outreach?source=community" in message
        assert "@" not in message

        email_mock.assert_called_once()
        assert "@" not in email_mock.call_args.args[2]

    def test_notify_flattens_newlines_in_a_crafted_name(self, monkeypatch):
        import app.services.auth_notifications as svc
        from app.config import settings

        wa_mock = MagicMock(return_value=True)
        monkeypatch.setattr(svc, "send_text", wa_mock)
        monkeypatch.setattr(svc, "send_email", MagicMock())
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "admin@example.com")

        svc.notify_admin_new_business_suggestion(
            "עסק\nלטיפול: https://evil.example", "חיפה", None, False
        )
        message = wa_mock.call_args.args[1]
        assert "עסק לטיפול: https://evil.example" in message
        # Exactly the four lines the helper writes — no injected fifth.
        assert len(message.split("\n")) == 4


class TestLoggedInPrefill:
    def test_empty_email_is_filled_from_the_account(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        user = make_user(db, email="member@example-suggester.co.il")
        r = client.post(
            ENDPOINT,
            json=_payload(suggester_email=None),
            headers=auth_header(user),
        )
        assert r.status_code == 201
        assert (
            db.query(OutreachLead).one().suggested_by_email
            == "member@example-suggester.co.il"
        )

    def test_a_typed_email_always_wins(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        user = make_user(db, email="member@example-suggester.co.il")
        r = client.post(ENDPOINT, json=_payload(), headers=auth_header(user))
        assert r.status_code == 201
        assert (
            db.query(OutreachLead).one().suggested_by_email
            == "dana@example-suggester.co.il"
        )

    def test_no_opt_in_means_the_account_email_is_NOT_stored(
        self, client, db, monkeypatch
    ):
        """REFEREE finding 3: purpose limitation. The 04/11 notice promises the
        address is used only to send the update, so with no opt-in there is no
        purpose to store it for — and MEH-2638 would keep it 180 days."""
        _silence_notify(monkeypatch)
        user = make_user(db, email="member@example-suggester.co.il")
        r = client.post(
            ENDPOINT,
            json=_payload(suggester_email=None, wants_update=False),
            headers=auth_header(user),
        )
        assert r.status_code == 201
        assert db.query(OutreachLead).one().suggested_by_email is None

    def test_a_typed_email_is_kept_even_without_opt_in(self, client, db, monkeypatch):
        """Control: the narrowing applies ONLY to the server-side prefill. An
        address the visitor typed themselves is their own act and is stored."""
        _silence_notify(monkeypatch)
        r = client.post(ENDPOINT, json=_payload(wants_update=False))
        assert r.status_code == 201
        assert (
            db.query(OutreachLead).one().suggested_by_email
            == "dana@example-suggester.co.il"
        )

    def test_anonymous_submission_stores_no_email_when_none_given(
        self, client, db, monkeypatch
    ):
        _silence_notify(monkeypatch)
        r = client.post(ENDPOINT, json=_payload(suggester_email=None))
        assert r.status_code == 201
        assert db.query(OutreachLead).one().suggested_by_email is None


class TestRateLimit:
    def test_sixth_suggestion_in_an_hour_is_429(self, client, db, monkeypatch):
        _silence_notify(monkeypatch)
        for i in range(5):
            r = client.post(ENDPOINT, json=_payload(name=f"עסק מספר {i}"))
            assert r.status_code == 201, f"request {i + 1} should pass: {r.text}"
        r = client.post(ENDPOINT, json=_payload(name="עסק מספר שש"))
        assert r.status_code == 429
        assert db.query(OutreachLead).count() == 5


# ---------- admin side ----------


def _admin_headers(db) -> dict:
    return auth_header(make_user(db, role="admin"))


class TestSourceFilter:
    def test_filters_to_community_only(self, client, db):
        db.add_all(
            [
                OutreachLead(name="קהילה", city="חיפה", source="community"),
                OutreachLead(name="ידני", city="חיפה", source="manual"),
            ]
        )
        db.commit()
        r = client.get("/admin/outreach?source=community", headers=_admin_headers(db))
        assert r.status_code == 200
        assert [row["name"] for row in r.json()] == ["קהילה"]

    def test_manual_filter_includes_a_null_source_row(self, client, db):
        """`source` is nullable with only a Python-side default, so a row
        written by raw SQL carries NULL. COALESCE is what keeps it visible
        under ?source=manual; a bare == would drop it with no error.

        The row is inserted with raw SQL on purpose. Built through the ORM as
        `OutreachLead(source=None)` it is NOT null: SQLAlchemy substitutes the
        column's Python-side `default="manual"` for a None value at flush, so
        the row arrives as 'manual' and the test passes whether or not the
        query coalesces. That is how this test was first written, and the
        mutation run caught it — swapping COALESCE for a bare `==` left it
        green. The precondition below is asserted, not assumed, so the test
        can never silently go vacuous again.

        It calls `list_leads` DIRECTLY rather than going through the HTTP
        route, and that detour is a finding, not a convenience: serialising a
        NULL-source row through OutreachLeadOut raises
        ResponseValidationError, because `source: str = "manual"` is a field
        DEFAULT and a Pydantic default does not apply to an explicit None read
        off an ORM attribute. So `GET /admin/outreach` 500s on such a row
        before any filter is reached. That is pre-existing (MEH-22 shipped the
        model; nothing here changed it) and currently unreachable — no raw-SQL
        writer to outreach_leads exists, so every row goes through the ORM and
        gets 'manual'. It is reported for its own card rather than fixed here:
        widening `source`'s type is not one of the five fields this card asks
        of OutreachLeadOut. Testing the query at the query layer is therefore
        the only level at which this assertion can be true today.
        """
        import app.routers.admin_outreach as mod

        db.execute(
            text(
                "INSERT INTO outreach_leads "
                "(id, name, city, source, status, created_at, updated_at) "
                "VALUES (gen_random_uuid(), 'ללא מקור', 'חיפה', NULL, 'new', "
                "now(), now())"
            )
        )
        db.add(OutreachLead(name="קהילה", city="חיפה", source="community"))
        db.commit()

        stored = db.execute(
            text("SELECT source FROM outreach_leads WHERE name = 'ללא מקור'")
        ).scalar()
        assert stored is None, "precondition: the row under test must be NULL-source"

        rows = mod.list_leads(source="manual", _=None, db=db)
        assert [row.name for row in rows] == ["ללא מקור"]

    def test_unknown_source_is_400(self, client, db):
        r = client.get("/admin/outreach?source=nonsense", headers=_admin_headers(db))
        assert r.status_code == 400

    def test_no_source_param_returns_everything(self, client, db):
        db.add_all(
            [
                OutreachLead(name="קהילה", city="חיפה", source="community"),
                OutreachLead(name="ידני", city="חיפה", source="manual"),
            ]
        )
        db.commit()
        r = client.get("/admin/outreach", headers=_admin_headers(db))
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_admin_list_exposes_the_new_fields(self, client, db):
        db.add(
            OutreachLead(
                name="קהילה",
                city="חיפה",
                source="community",
                suggested_by_name="דנה",
                suggested_by_email="dana@example-suggester.co.il",
                suggester_wants_update=True,
                suggestion_reason="הזיתים",
            )
        )
        db.commit()
        r = client.get("/admin/outreach", headers=_admin_headers(db))
        row = r.json()[0]
        assert row["suggested_by_name"] == "דנה"
        assert row["suggested_by_email"] == "dana@example-suggester.co.il"
        assert row["suggester_wants_update"] is True
        assert row["suggestion_reason"] == "הזיתים"
        assert row["suggester_thanked_at"] is None


class TestMetricsCommunityCount:
    def test_counts_only_community_rows(self, client, db):
        db.add_all(
            [
                OutreachLead(name="ק1", city="חיפה", source="community", status="new"),
                OutreachLead(name="ק2", city="לוד", source="community", status="new"),
                OutreachLead(name="י1", city="חיפה", source="manual", status="new"),
            ]
        )
        # Raw SQL for the NULL-source row — same reason as
        # test_manual_filter_includes_a_null_source_row above: the ORM would
        # substitute default="manual" and the row would not be NULL at all.
        db.execute(
            text(
                "INSERT INTO outreach_leads "
                "(id, name, city, source, status, created_at, updated_at) "
                "VALUES (gen_random_uuid(), 'י2', 'חיפה', NULL, 'new', "
                "now(), now())"
            )
        )
        db.commit()
        r = client.get("/admin/outreach/metrics/summary", headers=_admin_headers(db))
        assert r.status_code == 200
        body = r.json()
        assert body["community"] == 2
        # The status axis is untouched by the new counter.
        assert body["total"] == 4
        assert body["new"] == 4

    def test_zero_when_there_are_no_community_rows(self, client, db):
        db.add(OutreachLead(name="י1", city="חיפה", source="manual", status="new"))
        db.commit()
        r = client.get("/admin/outreach/metrics/summary", headers=_admin_headers(db))
        assert r.json()["community"] == 0


# ---------- thank the suggester ----------


def _thankable_lead(db, **overrides) -> OutreachLead:
    fields = {
        "name": "מעדניית הזיתים",
        "city": "חיפה",
        "source": "community",
        "status": "registered",
        "suggested_by_name": "דנה",
        "suggested_by_email": "dana@example-suggester.co.il",
        "suggester_wants_update": True,
    }
    fields.update(overrides)
    lead = OutreachLead(**fields)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


def _mock_send_email(monkeypatch) -> MagicMock:
    import app.routers.admin_outreach as mod

    mock = MagicMock()
    monkeypatch.setattr(mod, "send_email", mock)
    return mock


class TestThankSuggester:
    def test_happy_path_sends_and_stamps(self, client, db, monkeypatch):
        send = _mock_send_email(monkeypatch)
        lead = _thankable_lead(db)
        r = client.post(
            f"/admin/outreach/{lead.id}/thank-suggester", headers=_admin_headers(db)
        )
        assert r.status_code == 200
        assert r.json()["suggester_thanked_at"] is not None

        db.expire_all()
        assert db.query(OutreachLead).one().suggester_thanked_at is not None

        send.assert_called_once()
        to, subject, body = send.call_args.args
        assert to == "dana@example-suggester.co.il"
        assert subject == "מעדניית הזיתים כבר במהמקור, בזכותכם"
        assert "המלצתם לנו על מעדניית הזיתים" in body

    def test_409_when_there_is_no_suggester_email(self, client, db, monkeypatch):
        send = _mock_send_email(monkeypatch)
        lead = _thankable_lead(db, suggested_by_email=None)
        r = client.post(
            f"/admin/outreach/{lead.id}/thank-suggester", headers=_admin_headers(db)
        )
        assert r.status_code == 409
        assert "אין כתובת אימייל" in r.json()["detail"]
        send.assert_not_called()

    def test_409_when_the_suggester_did_not_opt_in(self, client, db, monkeypatch):
        send = _mock_send_email(monkeypatch)
        lead = _thankable_lead(db, suggester_wants_update=False)
        r = client.post(
            f"/admin/outreach/{lead.id}/thank-suggester", headers=_admin_headers(db)
        )
        assert r.status_code == 409
        assert "לא ביקשו" in r.json()["detail"]
        send.assert_not_called()

    def test_409_when_the_business_is_not_registered_yet(self, client, db, monkeypatch):
        send = _mock_send_email(monkeypatch)
        lead = _thankable_lead(db, status="contacted")
        r = client.post(
            f"/admin/outreach/{lead.id}/thank-suggester", headers=_admin_headers(db)
        )
        assert r.status_code == 409
        assert "עוד לא נרשם" in r.json()["detail"]
        send.assert_not_called()

    def test_second_call_is_409_and_sends_nothing(self, client, db, monkeypatch):
        """Idempotency: `suggester_thanked_at` is the key, so a double click
        cannot produce two emails."""
        send = _mock_send_email(monkeypatch)
        lead = _thankable_lead(db)
        headers = _admin_headers(db)
        url = f"/admin/outreach/{lead.id}/thank-suggester"
        assert client.post(url, headers=headers).status_code == 200
        r = client.post(url, headers=headers)
        assert r.status_code == 409
        assert "כבר נשלחה" in r.json()["detail"]
        send.assert_called_once()

    def test_newline_in_the_business_name_cannot_add_a_line_to_the_email(
        self, client, db, monkeypatch
    ):
        send = _mock_send_email(monkeypatch)
        lead = _thankable_lead(db, name="עסק\nתודה שעזרתם: https://evil.example")
        r = client.post(
            f"/admin/outreach/{lead.id}/thank-suggester", headers=_admin_headers(db)
        )
        assert r.status_code == 200
        _, subject, body = send.call_args.args
        assert "\n" not in subject
        assert "\n" not in body

    def test_404_for_an_unknown_lead(self, client, db, monkeypatch):
        _mock_send_email(monkeypatch)
        r = client.post(
            "/admin/outreach/00000000-0000-0000-0000-000000000000/thank-suggester",
            headers=_admin_headers(db),
        )
        assert r.status_code == 404

    def test_requires_admin(self, client, db, monkeypatch):
        _mock_send_email(monkeypatch)
        lead = _thankable_lead(db)
        consumer = make_user(db, role="consumer")
        r = client.post(
            f"/admin/outreach/{lead.id}/thank-suggester",
            headers=auth_header(consumer),
        )
        assert r.status_code == 403

    def test_anonymous_cannot_thank(self, client, db, monkeypatch):
        _mock_send_email(monkeypatch)
        lead = _thankable_lead(db)
        r = client.post(f"/admin/outreach/{lead.id}/thank-suggester")
        assert r.status_code in (401, 403)
