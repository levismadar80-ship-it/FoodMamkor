"""MEH-2238 — edge cases for the MEH-22 outreach prefill flow, driven by the
REAL outreach sheet.

WHY THIS FILE EXISTS, in one sentence: Sapir sends a prefill link to a real
business from the spreadsheet, and the values in that spreadsheet are not
clean — the name carries an apostrophe or an ampersand, the phone carries a
parenthesised note, the website carries a query string and usually no scheme.
Every fixture below is a *format-preserving* copy of a row that is actually in
the sheet (business names are public; every phone digit is fake; no person
names).

SCOPE — tests only. This file changes no application code and fixes nothing.
Where measured behaviour differs from what the outreach flow needs, the test
records the CURRENT behaviour and is marked `xfail(strict=True)` with a
FINDING-n reason string. Each such marker is one row in the PR's Findings
table. `strict=True` matters: if someone later fixes the underlying gap, the
xfail flips to XPASS and the suite goes RED, which is the notification that
this file's Findings table is stale.

WHAT THIS FILE DELIBERATELY DOES NOT RE-TEST (link, don't duplicate — see
.claude/rules/testing.md "over-engineering"):
  - the 30/hour rate limit on the public prefill lookup and the happy-path
    lookup itself → tests/test_meh1724_prefill_rate_limit.py
  - `_normalize_instagram` as a unit → tests/test_instagram_normalization.py
  - the escape_like convention this file measures `list_leads` against →
    tests/test_meh1188_admin_like_escape.py (admin.py:454-457 is the standard)

Related source: backend/app/routers/admin_outreach.py ·
backend/app/schemas/schemas.py:3500-3547 · backend/app/models/models.py:743-777
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.models import OutreachLead
from tests.conftest import auth_header, make_user

# ---------------------------------------------------------------------------
# Fixtures lifted from the real outreach sheet, format preserved.
#
# Inline rather than in `tests/fixtures/` on purpose: this repo has no fixtures
# package under `tests/` (measured — `ls tests/` is flat), and inventing one for
# a single consumer is the module nobody else imports.
# ---------------------------------------------------------------------------

# Names. The interesting axes are the Hebrew geresh, an ASCII apostrophe, an
# ampersand, an em dash, Hebrew gershayim, digits, and an emoji.
REAL_NAMES = [
    "מוטק'ה החולב",
    "צ'ופצ'יק (Chupchik)",
    "משק 98 — נאשי אורגני",
    'מ.יוחננוף ובניו (1988) בע"מ',
    "LIVNEY'S",
    "בית מאפה לחם הבית — אמינוב יעקב",
    "TALA — רוקחות טבעית",
    "🍞 לחם אלחנן",
]

# Phones. `_phone_validator` (schemas.py:244) strips only [\s()-] and validates
# the DIGIT projection, so the stored value is the input minus those three
# separator classes — NOT a canonical form.
REAL_PHONES_TO_STORED = [
    ("050-1234567", "0501234567"),
    ("0541-234567", "0541234567"),
    ("0501234567", "0501234567"),
    ("054-123-4567", "0541234567"),
    ("03-1234567", "031234567"),
    ("072-1234567", "0721234567"),
    ("+972-50-123-4567", "+972501234567"),
]

# Instagram. `_normalize_instagram` strips a leading "@" and an instagram.com
# URL prefix; everything else is stored verbatim, messy or not.
REAL_INSTAGRAM_TO_STORED = [
    ("@yaar_mushrooms", "yaar_mushrooms"),
    ("_goats_with_the_wind", "_goats_with_the_wind"),
    ("frau_horn_", "frau_horn_"),
    ("https://instagram.com/yotzbread", "yotzbread"),
    # The three messy rows: stored byte-identical, which is the finding.
    ("IG: mushroom.co.il", "IG: mushroom.co.il"),
    ("idanpanda · pandapitachef", "idanpanda · pandapitachef"),
    ("oded_chocolate (3.1K עוקבים)", "oded_chocolate (3.1K עוקבים)"),
]

# Cities, including the two Binyamina spellings that differ only by en-dash vs
# hyphen, and a row where the admin wrote a note instead of a town.
REAL_CITIES = [
    "זכרון יעקב / עמק חפר",
    "בנימינה–גבעת עדה",  # U+2013 EN DASH
    "בנימינה-גבעת עדה",  # U+002D HYPHEN-MINUS
    "לבדוק מיקום המשק",
    "שוקי מפה יפו",
    None,
]


def _admin(db, email):
    return make_user(db, role="admin", email=email)


def _post(client, headers, **fields):
    return client.post("/admin/outreach", json=fields, headers=headers)


class TestRealSheetRoundTrip:
    """Every real row must be storable, and read back as stored."""

    def test_real_names_round_trip_byte_identical(self, client, db):
        h = auth_header(_admin(db, "rt-names@example.com"))
        for name in REAL_NAMES:
            r = _post(client, h, name=name)
            assert r.status_code == 201, f"{name!r} -> {r.status_code} {r.text[:200]}"
            assert r.json()["name"] == name, f"{name!r} did not round-trip"

    @pytest.mark.xfail(
        strict=True,
        reason="FINDING-1: sanitize_text HTML-escapes '&', so 'Crust & Crumb' "
        "is STORED as 'Crust &amp; Crumb' and renders literally in the admin "
        "table and in the prefilled registration input.",
    )
    def test_ampersand_in_name_round_trips(self, client, db):
        h = auth_header(_admin(db, "rt-amp@example.com"))
        r = _post(client, h, name="Crust & Crumb")
        assert r.status_code == 201
        assert r.json()["name"] == "Crust & Crumb"

    def test_ampersand_current_behaviour_is_double_escaped(self, client, db):
        """The other half of FINDING-1, asserted positively so the file records
        what actually happens today rather than only that it is wrong.

        Also proves the escape survives all the way to the PUBLIC prefill
        response — i.e. the business owner sees `&amp;` in her own name.
        """
        h = auth_header(_admin(db, "rt-amp2@example.com"))
        lead = _post(client, h, name="Crust & Crumb").json()
        assert lead["name"] == "Crust &amp; Crumb"

        token = client.post(
            f"/admin/outreach/{lead['id']}/prefill-token", headers=h
        ).json()["prefill_token"]
        assert client.get(f"/register/producer/prefill/{token}").json()["name"] == (
            "Crust &amp; Crumb"
        )

    def test_real_phones_round_trip_to_separator_stripped_form(self, client, db):
        h = auth_header(_admin(db, "rt-phone@example.com"))
        for i, (typed, stored) in enumerate(REAL_PHONES_TO_STORED):
            r = _post(client, h, name=f"עסק טלפון {i}", phone=typed)
            assert r.status_code == 201, f"{typed!r} -> {r.status_code} {r.text[:200]}"
            assert r.json()["phone"] == stored

    def test_real_instagram_round_trips(self, client, db):
        h = auth_header(_admin(db, "rt-ig@example.com"))
        for i, (typed, stored) in enumerate(REAL_INSTAGRAM_TO_STORED):
            r = _post(client, h, name=f"עסק אינסטגרם {i}", instagram=typed)
            assert r.status_code == 201, f"{typed!r} -> {r.status_code} {r.text[:200]}"
            assert r.json()["instagram"] == stored

    def test_real_cities_round_trip(self, client, db):
        h = auth_header(_admin(db, "rt-city@example.com"))
        for i, city in enumerate(REAL_CITIES):
            r = _post(client, h, name=f"עסק עיר {i}", city=city)
            assert r.status_code == 201, f"{city!r} -> {r.status_code} {r.text[:200]}"
            assert r.json()["city"] == city

    def test_categories_are_free_text_and_round_trip(self, client, db):
        """`OutreachLead.category` is free text (`String(100)`), matched against
        NOTHING. There is no FK to `categories` and no normalisation — a value
        that happens to equal a real Category name and one that does not are
        stored identically. Asserted rather than assumed, because the
        registration form's own field is `category_ids` (a list of Category
        UUIDs), so the two are not the same vocabulary at all.
        """
        h = auth_header(_admin(db, "rt-cat@example.com"))
        for i, category in enumerate(["גבינות", "ירקות אורגני + גבינות עיזים"]):
            r = _post(client, h, name=f"עסק קטגוריה {i}", category=category)
            assert r.status_code == 201
            assert r.json()["category"] == category


class TestWebsiteScheme:
    """`SanitizedUrlField` requires an http(s) scheme (schemas.py:302-315)."""

    def test_absolute_https_url_with_query_string_round_trips(self, client, db):
        """The `&id=17703` tail must survive — it is what makes the link work."""
        h = auth_header(_admin(db, "web-ok@example.com"))
        url = "https://machine.co.il/show.asp?table=users&id=17703"
        r = _post(client, h, name="מכונה", website=url)
        assert r.status_code == 201
        assert r.json()["website"] == url

    def test_trailing_slash_url_round_trips(self, client, db):
        h = auth_header(_admin(db, "web-ok2@example.com"))
        url = "https://www.floracheese.co.il/"
        assert _post(client, h, name="פלורה", website=url).json()["website"] == url

    @pytest.mark.parametrize(
        "raw",
        [
            "havivian.co.il",
            "machine.co.il/show.asp?table=users&id=17703",
            "meshekfine.co.il · mypips.app/finerotem",
            "קטלוג ב-Drive (קישור בביו)",
        ],
    )
    @pytest.mark.xfail(
        strict=True,
        reason="FINDING-2: 4 of the 5 real website formats in the sheet carry "
        "no scheme (or are prose), and each 422s the whole lead. The admin "
        "cannot save a row as it appears in the spreadsheet.",
    )
    def test_scheme_less_website_from_the_sheet_is_accepted(self, client, db, raw):
        h = auth_header(_admin(db, f"web-{abs(hash(raw)) % 10**6}@example.com"))
        assert _post(client, h, name=f"אתר {raw[:12]}", website=raw).status_code == 201

    def test_scheme_less_website_currently_422s_and_never_500s(self, client, db):
        """The positive half of FINDING-2: it is a clean 422, not a crash, and
        the rejection names the website field."""
        h = auth_header(_admin(db, "web-422@example.com"))
        r = _post(client, h, name="חביביאן", website="havivian.co.il")
        assert r.status_code == 422
        assert r.json()["detail"][0]["loc"] == ["body", "website"]


class TestPhoneColumnWidth:
    """`PhoneNumberField` caps the INPUT at 30 chars (schemas.py:539-541) while
    `outreach_leads.phone` is `String(20)` (models.py:761). The validator strips
    only [\\s()-], so a parenthesised Hebrew note survives into the column and
    the two limits disagree by 10 characters.
    """

    def test_phone_with_note_is_stored_with_the_note_text_glued_on(self, client, db):
        """The exact sheet value. It does NOT 422 and it does NOT 500 — it is
        accepted and stored as `0541234567ווטסאפ`, which is what the admin
        table then renders inside a `tel:` href (page.jsx:230-232).
        """
        h = auth_header(_admin(db, "ph-note@example.com"))
        r = _post(client, h, name="עם הערה", phone="054-1234567 (ווטסאפ)")
        assert r.status_code == 201
        assert r.json()["phone"] == "0541234567ווטסאפ"

    @pytest.mark.xfail(
        strict=True,
        reason="FINDING-3: a phone note long enough to push the stripped value "
        "past 20 chars (schema cap is 30) reaches the DB and raises an "
        "unhandled psycopg2 StringDataRightTruncation -> 500, not a 422.",
    )
    def test_long_phone_note_is_rejected_with_422_not_500(self, db):
        h = auth_header(_admin(db, "ph-long@example.com"))
        # 27 input chars (inside the schema's 30 cap); 22 after separator
        # stripping, i.e. 2 over the String(20) column.
        raw = "0501234567 (ווטסאפ בלבד נא)"
        assert len(raw) <= 30
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.post(
                "/admin/outreach", json={"name": "טלפון ארוך", "phone": raw}, headers=h
            )
        assert r.status_code == 422, f"got {r.status_code}"

    def test_long_phone_note_currently_500s(self, db):
        """The positive half of FINDING-3 — the observed status code."""
        h = auth_header(_admin(db, "ph-long2@example.com"))
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.post(
                "/admin/outreach",
                json={"name": "טלפון ארוך 2", "phone": "0501234567 (ווטסאפ בלבד נא)"},
                headers=h,
            )
        assert r.status_code == 500

    def test_note_that_fits_the_column_is_accepted(self, client, db):
        """Boundary control: exactly 20 stored chars still lands. Without this
        the 500 above could be read as "any note fails", which is not true and
        would misdescribe the finding.
        """
        h = auth_header(_admin(db, "ph-fit@example.com"))
        r = _post(client, h, name="הערה קצרה", phone="0501234567 (ווטסאפ בלבד)")
        assert r.status_code == 201
        assert len(r.json()["phone"]) == 20


class TestLengthCaps:
    """Over-length input is a 422 on the named field — never a 500."""

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("name", "א" * 201),
            ("instagram", "a" * 101),
            ("website", "https://x.co/" + "a" * 190),
            ("city", "ג" * 101),
            ("category", "ד" * 101),
        ],
    )
    def test_over_length_field_is_422_on_that_field(self, client, db, field, value):
        h = auth_header(_admin(db, f"len-{field}@example.com"))
        r = _post(client, h, **{"name": "אורך", field: value})
        assert r.status_code == 422, f"{field} -> {r.status_code}"
        assert [e["loc"] for e in r.json()["detail"]] == [["body", field]]

    def test_name_at_the_cap_is_accepted(self, client, db):
        """Discriminating control for the row above: 200 passes, 201 fails, so
        the parametrised 422s are the cap and not a blanket rejection."""
        h = auth_header(_admin(db, "len-ok@example.com"))
        assert _post(client, h, name="ב" * 200).status_code == 201


class TestDedupe:
    """Soft uniqueness on `(lower(name), lower(city))`, application-layer
    (admin_outreach.py:69-84). Trim + lowercase only — no other normalisation.
    """

    def test_exact_duplicate_returns_409_with_existing_id(self, client, db):
        h = auth_header(_admin(db, "dup-1@example.com"))
        first = _post(client, h, name="שיטה (Shita Bakery)", city="חדרה").json()

        r = _post(client, h, name="שיטה (Shita Bakery)", city="חדרה")
        assert r.status_code == 409
        detail = r.json()["detail"]
        assert detail["error"] == "duplicate_lead"
        assert detail["existing_id"] == first["id"]
        assert detail["message"]

    def test_surrounding_whitespace_is_still_a_duplicate(self, client, db):
        h = auth_header(_admin(db, "dup-ws@example.com"))
        first = _post(client, h, name="שיטה (Shita Bakery)", city="חדרה").json()

        r = _post(client, h, name=" שיטה (Shita Bakery) ", city=" חדרה ")
        assert r.status_code == 409
        assert r.json()["detail"]["existing_id"] == first["id"]

    def test_same_name_different_city_is_allowed_by_design(self, client, db):
        """One farm can genuinely have two locations, and the admin may not yet
        know they are the same business. 201 is the design, not a gap."""
        h = auth_header(_admin(db, "dup-city@example.com"))
        assert _post(client, h, name="משק פיין", city="גבעת עדה").status_code == 201
        assert _post(client, h, name="משק פיין", city="בנימינה").status_code == 201

    def test_substring_name_is_not_a_duplicate(self, client, db):
        h = auth_header(_admin(db, "dup-sub@example.com"))
        assert _post(client, h, name="משק פיין", city="גבעת עדה").status_code == 201
        assert _post(client, h, name="משק רתם פיין", city="גבעת עדה").status_code == 201

    def test_null_city_twice_collides_via_the_coalesce_path(self, client, db):
        """`func.coalesce(city, "")` (admin_outreach.py:74) means two cityless
        leads with the same name DO collide."""
        h = auth_header(_admin(db, "dup-null@example.com"))
        first = _post(client, h, name="ללא עיר").json()

        r = _post(client, h, name="ללא עיר")
        assert r.status_code == 409
        assert r.json()["detail"]["existing_id"] == first["id"]

    def test_punctuation_variant_is_not_caught_known_limitation(self, client, db):
        """KNOWN LIMITATION, deliberately not a finding: the check compares
        trimmed-lowercased strings, so a business written once with gershayim
        and once transliterated is two leads. Catching it would need fuzzy
        matching, which is a product decision, not a bug. Pinned so the
        behaviour cannot change silently.
        """
        h = auth_header(_admin(db, "dup-punct@example.com"))
        assert _post(client, h, name='צח"ם', city="עכו").status_code == 201
        assert _post(client, h, name="צחם (Zechem)", city="עכו").status_code == 201


class TestListFilters:
    def test_city_filter_is_a_case_insensitive_substring_match(self, client, db):
        h = auth_header(_admin(db, "flt-city@example.com"))
        for i, city in enumerate(
            ["זכרון יעקב / עמק חפר", "בנימינה–גבעת עדה", "בנימינה-גבעת עדה"]
        ):
            _post(client, h, name=f"עסק סינון {i}", city=city)

        r = client.get("/admin/outreach", params={"city": "זכרון"}, headers=h)
        assert r.status_code == 200
        assert [x["city"] for x in r.json()] == ["זכרון יעקב / עמק חפר"]

    def test_binyamina_matches_both_dash_spellings(self, client, db):
        """The sheet contains both an EN DASH and a HYPHEN-MINUS spelling. A
        substring search on the town name must return both, or the admin
        silently works on half her list."""
        h = auth_header(_admin(db, "flt-dash@example.com"))
        _post(client, h, name="בנימינה קו מפריד", city="בנימינה–גבעת עדה")
        _post(client, h, name="בנימינה מקף", city="בנימינה-גבעת עדה")

        cities = {
            x["city"]
            for x in client.get(
                "/admin/outreach", params={"city": "בנימינה"}, headers=h
            ).json()
        }
        assert cities == {"בנימינה–גבעת עדה", "בנימינה-גבעת עדה"}

    @pytest.mark.parametrize("wildcard", ["%", "_"])
    @pytest.mark.xfail(
        strict=True,
        reason="FINDING-4: list_leads uses `.contains()` with no escaping "
        "(admin_outreach.py:54), so a lone '%' or '_' is a LIKE wildcard and "
        "matches every lead that has a city. admin.py:454-457 already applies "
        "escape_like + LIKE_ESCAPE for exactly this (MEH-1188 F13).",
    )
    def test_like_wildcards_are_treated_as_literals(self, client, db, wildcard):
        h = auth_header(_admin(db, f"flt-wc{ord(wildcard)}@example.com"))
        _post(client, h, name="חוות השקמה", city="חיפה")
        _post(client, h, name="גבינות העמק", city="עמק יזרעאל")

        r = client.get("/admin/outreach", params={"city": wildcard}, headers=h)
        assert r.status_code == 200
        assert r.json() == []

    def test_like_wildcards_currently_match_every_lead_with_a_city(self, client, db):
        """The positive half of FINDING-4, and its blast radius: the wildcard
        returns the same set as an unfiltered list restricted to rows that have
        a city — i.e. the filter is inert, not merely loose.
        """
        h = auth_header(_admin(db, "flt-wc-obs@example.com"))
        _post(client, h, name="חוות השקמה", city="חיפה")
        _post(client, h, name="גבינות העמק", city="עמק יזרעאל")
        _post(client, h, name="ללא עיר בכלל")  # city is NULL

        with_city = [
            x["id"] for x in client.get("/admin/outreach", headers=h).json() if x["city"]
        ]
        assert len(with_city) == 2
        for wildcard in ("%", "_"):
            got = [
                x["id"]
                for x in client.get(
                    "/admin/outreach", params={"city": wildcard}, headers=h
                ).json()
            ]
            assert sorted(got) == sorted(with_city), wildcard

    def test_literal_percent_in_a_city_is_findable(self, client, db):
        h = auth_header(_admin(db, "flt-lit@example.com"))
        _post(client, h, name="הנחה", city="חיפה 50% צפון")
        _post(client, h, name="אחר", city="תל אביב")

        r = client.get("/admin/outreach", params={"city": "50%"}, headers=h)
        assert [x["city"] for x in r.json()] == ["חיפה 50% צפון"]

    def test_unknown_status_is_400(self, client, db):
        h = auth_header(_admin(db, "flt-status@example.com"))
        r = client.get("/admin/outreach", params={"status": "bogus"}, headers=h)
        assert r.status_code == 400

    def test_known_status_is_200(self, client, db):
        """Control for the row above — `new` is in VALID_STATUSES, so the 400
        is the validation and not a broken parameter."""
        h = auth_header(_admin(db, "flt-status2@example.com"))
        assert (
            client.get(
                "/admin/outreach", params={"status": "new"}, headers=h
            ).status_code
            == 200
        )


class TestPrefillToken:
    """Mint / rotate / expire / revoke. The token IS the credential."""

    PUBLIC_KEYS = {"name", "phone", "instagram", "website", "city", "category"}

    def _lead_with_token(self, client, headers, **fields):
        lead = _post(client, headers, **fields).json()
        minted = client.post(
            f"/admin/outreach/{lead['id']}/prefill-token", headers=headers
        ).json()
        return minted, minted["prefill_token"]

    def test_minted_token_returns_exactly_the_six_public_fields(self, client, db):
        h = auth_header(_admin(db, "tok-6@example.com"))
        _, token = self._lead_with_token(
            client,
            h,
            name="מאפיית פרופיל",
            phone="050-1234567",
            instagram="@bakery",
            website="https://b.co.il/show.asp?table=users&id=17703",
            city="חיפה",
            category="מאפים",
            notes="הערה פנימית שאסור לחשוף",
        )
        assert len(token) >= 40

        r = client.get(f"/register/producer/prefill/{token}")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == self.PUBLIC_KEYS
        for leaked in ("notes", "status", "id", "prefill_token", "source"):
            assert leaked not in body
        # The query string is the whole point of storing the URL.
        assert body["website"].endswith("&id=17703")

    def test_expired_token_is_404(self, client, db):
        h = auth_header(_admin(db, "tok-exp@example.com"))
        minted, token = self._lead_with_token(client, h, name="פג תוקף")

        lead = db.query(OutreachLead).filter(OutreachLead.id == minted["id"]).first()
        lead.prefill_token_expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()

        assert client.get(f"/register/producer/prefill/{token}").status_code == 404

    def test_token_with_null_expiry_is_404(self, client, db):
        """A row whose expiry is NULL (pre-MEH-22 data, or a manual edit) must
        not be treated as "never expires" — admin_outreach.py:224-227 rejects
        it. Without this the expiry test above passes for a NULL row too.
        """
        h = auth_header(_admin(db, "tok-null@example.com"))
        minted, token = self._lead_with_token(client, h, name="בלי תוקף")

        lead = db.query(OutreachLead).filter(OutreachLead.id == minted["id"]).first()
        lead.prefill_token_expires_at = None
        db.commit()

        assert client.get(f"/register/producer/prefill/{token}").status_code == 404

    def test_minting_twice_revokes_the_first_link(self, client, db):
        """Sapir re-sends the link; the one already in a WhatsApp thread must
        stop working."""
        h = auth_header(_admin(db, "tok-rot@example.com"))
        minted, first = self._lead_with_token(client, h, name="רוטציה")
        assert client.get(f"/register/producer/prefill/{first}").status_code == 200

        second = client.post(
            f"/admin/outreach/{minted['id']}/prefill-token", headers=h
        ).json()["prefill_token"]
        assert second != first
        assert client.get(f"/register/producer/prefill/{first}").status_code == 404
        assert client.get(f"/register/producer/prefill/{second}").status_code == 200

    @pytest.mark.parametrize(
        ("label", "token"),
        [
            ("15 chars — under the length guard", "a" * 15),
            ("43 chars, never minted", "z" * 43),
            ("percent-encoded spaces", "aaaa%20bbbb%20cccccccccccccc"),
            ("raw spaces", "aaaa bbbb cccccccccccccccccc"),
            ("path traversal shape", "..%2F..%2Fetc%2Fpasswd%2Fxxxxxxxx"),
        ],
    )
    def test_bad_token_is_404_never_500(self, client, label, token):
        r = client.get(f"/register/producer/prefill/{token}")
        assert r.status_code == 404, f"{label}: {r.status_code}"

    def test_prefill_is_a_live_read_not_a_snapshot(self, client, db):
        """The admin corrects the name after sending the link; the owner who
        opens it later must get the corrected one."""
        h = auth_header(_admin(db, "tok-live@example.com"))
        minted, token = self._lead_with_token(client, h, name="שם ישן", city="חיפה")
        assert client.get(f"/register/producer/prefill/{token}").json()["name"] == (
            "שם ישן"
        )

        client.patch(f"/admin/outreach/{minted['id']}", json={"name": "שם חדש"}, headers=h)
        assert client.get(f"/register/producer/prefill/{token}").json()["name"] == (
            "שם חדש"
        )

    def test_deleting_the_lead_kills_the_link(self, client, db):
        h = auth_header(_admin(db, "tok-del@example.com"))
        minted, token = self._lead_with_token(client, h, name="נמחק")
        assert client.get(f"/register/producer/prefill/{token}").status_code == 200

        assert client.delete(f"/admin/outreach/{minted['id']}", headers=h).status_code == 204
        assert client.get(f"/register/producer/prefill/{token}").status_code == 404


class TestAdminOnly:
    """Every `/admin/outreach*` route is `require_admin`. Guard payloads are
    schema-valid (Regression rule 6) — a 422 would prove nothing about the
    guard.
    """

    def _lead_id(self, client, db):
        h = auth_header(_admin(db, "guard-owner@example.com"))
        return _post(client, h, name="ליד לשמירה").json()["id"]

    def test_anonymous_is_401(self, client, db):
        lead_id = self._lead_id(client, db)
        assert client.get("/admin/outreach").status_code == 401
        assert client.get("/admin/outreach/metrics/summary").status_code == 401
        assert client.post("/admin/outreach", json={"name": "אנונימי"}).status_code == 401
        assert (
            client.patch(f"/admin/outreach/{lead_id}", json={"status": "contacted"}).status_code
            == 401
        )
        assert client.delete(f"/admin/outreach/{lead_id}").status_code == 401
        assert client.post(f"/admin/outreach/{lead_id}/prefill-token").status_code == 401

    def test_authenticated_non_admin_is_403(self, client, db):
        lead_id = self._lead_id(client, db)
        h = auth_header(make_user(db, role="consumer", email="guard-c@example.com"))
        assert client.get("/admin/outreach", headers=h).status_code == 403
        assert client.get("/admin/outreach/metrics/summary", headers=h).status_code == 403
        assert (
            client.post("/admin/outreach", json={"name": "צרכנית"}, headers=h).status_code
            == 403
        )
        assert (
            client.patch(
                f"/admin/outreach/{lead_id}", json={"status": "contacted"}, headers=h
            ).status_code
            == 403
        )
        assert client.delete(f"/admin/outreach/{lead_id}", headers=h).status_code == 403
        assert (
            client.post(f"/admin/outreach/{lead_id}/prefill-token", headers=h).status_code
            == 403
        )

    def test_producer_owner_is_also_403(self, client, db):
        """A business owner is authenticated and privileged on her OWN data —
        she must still not read the outreach list, which is every prospect's
        PII."""
        lead_id = self._lead_id(client, db)
        h = auth_header(make_user(db, role="producer", email="guard-p@example.com"))
        assert client.get("/admin/outreach", headers=h).status_code == 403
        assert (
            client.post(f"/admin/outreach/{lead_id}/prefill-token", headers=h).status_code
            == 403
        )


class TestRegistrationDoesNotCloseTheLoop:
    """Phase 0 §5: `OutreachLead` is imported by exactly three modules —
    `models/__init__.py`, `router_registry.py` and `routers/admin_outreach.py`.
    No registration path touches it, so a lead whose owner registers through
    the prefill link stays at whatever status the admin last set.

    Asserted as CURRENT BEHAVIOUR, not as a defect: nothing in MEH-22 promises
    an automatic transition, and `registered` exists in VALID_STATUSES for the
    admin to set by hand. This test exists so that if auto-transition is ever
    added, it is added deliberately and this file goes red first.
    """

    def test_status_is_unchanged_by_a_producer_registration(self, client, db):
        from tests.conftest import valid_producer_register_payload

        h = auth_header(_admin(db, "loop@example.com"))
        lead = _post(
            client, h, name="חוות הבדיקה", city="תל אביב", phone="050-1234567"
        ).json()
        client.patch(f"/admin/outreach/{lead['id']}", json={"status": "contacted"}, headers=h)

        payload = valid_producer_register_payload() | {
            "email": "loop-owner@example.com",
            "producer_name": "חוות הבדיקה",
            "city": "תל אביב",
            # primary_contact_method is "whatsapp" in the shared helper, and
            # auth.py requires a phone for that channel.
            "phone": "0501234567",
        }
        assert client.post("/auth/register/producer", json=payload).status_code in (200, 201)

        after = client.get("/admin/outreach", headers=h).json()
        assert [x["status"] for x in after if x["id"] == lead["id"]] == ["contacted"]
