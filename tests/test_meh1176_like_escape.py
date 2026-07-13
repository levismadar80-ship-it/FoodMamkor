"""MEH-1176 F1 — LIKE/ILIKE wildcard escaping in search inputs.

Triage found user-supplied `%` / `_` reaching ILIKE unescaped in both
search paths (producer_listing._apply_search_filter and
routers/search.unified smart_search): a lone "%" matched EVERY producer
and "_" acted as match-any-single-char. Fix: app/utils/sql.escape_like +
ESCAPE '\\' on every pattern (both files, incl. the prefix-relevance
ordering). These tests pin the injection behavior AND that normal Hebrew
search is byte-for-byte unchanged.

Sibling instances found during Phase 0 and deliberately NOT folded in
(no-drive-by rule): admin.py:127 + admin_extra.py:65 build the same
unescaped patterns for ADMIN-only search — logged as finding F13.
"""

from app.utils.sql import escape_like

from tests.conftest import make_producer


class TestEscapeLikeUnit:
    def test_escapes_percent_underscore_backslash(self):
        assert escape_like("50%") == "50\\%"
        assert escape_like("a_b") == "a\\_b"
        assert escape_like("a\\b") == "a\\\\b"
        # backslash escaped BEFORE %/_ so the metachar escapes survive
        assert escape_like("\\%") == "\\\\\\%"

    def test_hebrew_passthrough(self):
        assert escape_like("חוות השקמה") == "חוות השקמה"


class TestProducersListEscaping:
    def test_lone_percent_no_longer_matches_everything(self, client, db):
        make_producer(db, name="חוות השקמה")
        make_producer(db, name="גבינות העמק")
        db.commit()

        r = client.get("/producers", params={"q": "%"})
        assert r.status_code == 200
        assert r.json() == []  # pre-fix: both producers matched

    def test_underscore_is_literal_not_single_char_wildcard(self, client, db):
        make_producer(db, name="חוות השקמה")
        db.commit()

        # "חוות השקמ_" would match via the _ wildcard pre-fix.
        r = client.get("/producers", params={"q": "חוות השקמ_"})
        assert r.status_code == 200
        assert r.json() == []

    def test_literal_percent_in_description_is_findable(self, client, db):
        p = make_producer(db, name="חוות המבצעים")
        p.description = "מבצע 50% הנחה על כל הגבינות"
        db.commit()

        r = client.get("/producers", params={"q": "50%"})
        assert r.status_code == 200
        body = r.json()
        assert [p["name"] for p in body] == ["חוות המבצעים"]

    def test_normal_hebrew_search_unchanged(self, client, db):
        make_producer(db, name="חוות השקמה")
        make_producer(db, name="גבינות העמק")
        db.commit()

        r = client.get("/producers", params={"q": "שקמה"})
        assert r.status_code == 200
        body = r.json()
        assert [p["name"] for p in body] == ["חוות השקמה"]

    def test_city_filter_composability_unchanged(self, client, db):
        make_producer(db, name="חוות השקמה", city="חיפה")
        make_producer(db, name="חוות הדרים", city="אשדוד")
        db.commit()

        r = client.get("/producers", params={"q": "חוות", "city": "חיפה"})
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 1 and body[0]["city"] == "חיפה"


class TestUnifiedSearchEscaping:
    def test_lone_percent_returns_empty_buckets(self, client, db):
        make_producer(db, name="חוות השקמה")
        db.commit()

        r = client.get("/search", params={"q": "%"})
        assert r.status_code == 200
        body = r.json()
        assert body["producers"] == []
        assert body["products"] == []
        assert body["cities"] == []
        assert body["categories"] == []

    def test_hebrew_search_still_hits_producers_and_cities(self, client, db):
        make_producer(db, name="חוות השקמה", city="רחובות")
        db.commit()

        r = client.get("/search", params={"q": "שקמה"})
        assert r.status_code == 200
        assert [p["name"] for p in r.json()["producers"]] == ["חוות השקמה"]

        r2 = client.get("/search", params={"q": "רחובות"})
        assert r2.status_code == 200
        assert r2.json()["cities"] == ["רחובות"]
