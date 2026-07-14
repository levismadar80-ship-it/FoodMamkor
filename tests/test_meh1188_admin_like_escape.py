"""MEH-1188 (F13) — LIKE/ILIKE wildcard escaping in ADMIN search.

Same bug class as F1 (MEH-1176, #1725): user-supplied `%` / `_` reached
ILIKE unescaped in the two admin search paths —
`routers/admin.list_producers` (search on Producer.name / city) and
`routers/admin_extra.list_users` (search on User.email / name). A lone
"%" matched every row; "_" acted as match-any-single-char. Fix: reuse
`app.utils.sql.escape_like` + `.ilike(..., escape=LIKE_ESCAPE)` (F1 pattern).

These tests pin the injection behaviour AND that a literal `%` is still
findable. Both endpoints are admin-only (require_admin).
"""

from tests.conftest import auth_header, make_producer, make_user


def _admin(db, email):
    return make_user(db, role="admin", email=email)


class TestAdminProducersSearchEscaping:
    def test_lone_percent_does_not_match_every_producer(self, client, db):
        make_producer(db, name="חוות השקמה", city="חיפה")
        make_producer(db, name="גבינות העמק", city="עמק יזרעאל")
        admin = _admin(db, "admin-f13-prod@example.com")
        db.commit()

        r = client.get(
            "/admin/producers", params={"search": "%"}, headers=auth_header(admin)
        )
        assert r.status_code == 200
        # pre-fix: the unescaped "%" wildcard matched BOTH producers
        assert r.json() == []

    def test_underscore_is_literal_not_single_char_wildcard(self, client, db):
        make_producer(db, name="חוות השקמה", city="חיפה")
        admin = _admin(db, "admin-f13-underscore@example.com")
        db.commit()

        # "חוות השקמ_" would match via the _ wildcard pre-fix
        r = client.get(
            "/admin/producers",
            params={"search": "חוות השקמ_"},
            headers=auth_header(admin),
        )
        assert r.status_code == 200
        assert r.json() == []

    def test_literal_percent_in_name_is_findable(self, client, db):
        make_producer(db, name="חוות 50% הנחה", city="תל אביב")
        make_producer(db, name="גבינות העמק", city="עמק יזרעאל")
        admin = _admin(db, "admin-f13-literal@example.com")
        db.commit()

        r = client.get(
            "/admin/producers", params={"search": "50%"}, headers=auth_header(admin)
        )
        assert r.status_code == 200
        assert [p["name"] for p in r.json()] == ["חוות 50% הנחה"]


class TestAdminUsersSearchEscaping:
    def test_lone_percent_does_not_match_every_user(self, client, db):
        make_user(db, role="consumer", email="alice@example.com", name="אליס")
        make_user(db, role="consumer", email="bob@example.com", name="בוב")
        admin = _admin(db, "admin-f13-users@example.com")
        db.commit()

        r = client.get(
            "/admin/users", params={"search": "%"}, headers=auth_header(admin)
        )
        assert r.status_code == 200
        # pre-fix: the unescaped "%" wildcard matched EVERY user (incl. the admin)
        assert r.json() == []

    def test_literal_underscore_in_email_is_findable(self, client, db):
        make_user(db, role="consumer", email="a_b@example.com", name="דנה")
        make_user(db, role="consumer", email="cd@example.com", name="נועה")
        admin = _admin(db, "admin-f13-users-literal@example.com")
        db.commit()

        # the "_" must match literally — find exactly the one address that has it
        r = client.get(
            "/admin/users", params={"search": "a_b@"}, headers=auth_header(admin)
        )
        assert r.status_code == 200
        assert [u["email"] for u in r.json()] == ["a_b@example.com"]
