"""MEH-3408 — the admin «כפילות?» signal sees every business, not the loaded page.

Before: the badge compared name and city only against the rows the admin had
loaded (`use-admin-producers.js`), so with the «טיוטות» filter a draft was never
compared with the business its owner had registered herself (approved,
pending, …), and a shared phone, the strongest sign of a duplicate, was not
compared at all.

Now `GET /admin/producers` carries two booleans per row, computed against the
whole `producers` table in every status: `dup_name` (same trimmed, lower-cased
name) and `dup_phone` (same number after normalisation).

Each test is named for the input it covers.
"""

from conftest import auth_header, make_producer, make_user

LIST = "/admin/producers"


def _rows(client, admin, status=None):
    params = {"status": status} if status else {}
    r = client.get(LIST, params=params, headers=auth_header(admin))
    assert r.status_code == 200, r.text
    return {row["id"]: row for row in r.json()}


def _id(producer):
    return str(producer.id)


def _with_phone(db, producer, phone):
    producer.phone = phone
    db.commit()
    return producer


class TestPhoneAcrossStatuses:
    def test_draft_with_the_phone_of_an_approved_business_reads_dup_phone(self, client, db):
        """The card's acceptance case: the drafts filter, an approved twin."""
        admin = make_user(db, role="admin")
        draft = _with_phone(db, make_producer(db, name="טיוטה שלנו", status="draft"), "050-123-4567")
        _with_phone(db, make_producer(db, name="נרשמה לבד", city="חיפה", status="approved"), "+972501234567")

        rows = _rows(client, admin, status="draft")
        assert list(rows) == [_id(draft)]
        assert rows[_id(draft)]["dup_phone"] is True
        assert rows[_id(draft)]["dup_name"] is False

    def test_two_businesses_with_different_phones_read_false(self, client, db):
        admin = make_user(db, role="admin")
        draft = _with_phone(db, make_producer(db, name="א", status="draft"), "0501234567")
        _with_phone(db, make_producer(db, name="ב", status="approved"), "0507654321")
        assert _rows(client, admin, status="draft")[_id(draft)]["dup_phone"] is False

    def test_a_business_without_a_phone_never_matches(self, client, db):
        """Two empty phones are not the same number."""
        admin = make_user(db, role="admin")
        draft = make_producer(db, name="א", status="draft")
        make_producer(db, name="ב", status="approved")
        assert draft.phone is None
        assert _rows(client, admin, status="draft")[_id(draft)]["dup_phone"] is False

    def test_a_landline_matches_across_notations(self, client, db):
        admin = make_user(db, role="admin")
        draft = _with_phone(db, make_producer(db, name="א", status="draft"), "04-8123456")
        _with_phone(db, make_producer(db, name="ב", status="approved"), "+972 4 812 3456")
        assert _rows(client, admin, status="draft")[_id(draft)]["dup_phone"] is True

    def test_the_00972_dial_out_form_matches_a_local_number(self, client, db):
        admin = make_user(db, role="admin")
        draft = _with_phone(db, make_producer(db, name="א", status="draft"), "00972501234567")
        _with_phone(db, make_producer(db, name="ב", status="approved"), "050-123-4567")
        assert _rows(client, admin, status="draft")[_id(draft)]["dup_phone"] is True

    def test_two_short_fragments_never_match(self, client, db):
        """Fewer than 8 national digits is a typo, not a number."""
        admin = make_user(db, role="admin")
        draft = _with_phone(db, make_producer(db, name="א", status="draft"), "050-12")
        _with_phone(db, make_producer(db, name="ב", status="approved"), "05012")
        assert _rows(client, admin, status="draft")[_id(draft)]["dup_phone"] is False


class TestNameAcrossStatuses:
    def test_draft_named_like_a_pending_business_reads_dup_name(self, client, db):
        admin = make_user(db, role="admin")
        draft = make_producer(db, name="המאפייה של רותי", status="draft")
        make_producer(db, name="  המאפייה של רותי ", city="חיפה", status="pending")

        row = _rows(client, admin, status="draft")[_id(draft)]
        assert row["dup_name"] is True
        assert row["dup_phone"] is False

    def test_a_unique_name_reads_false(self, client, db):
        admin = make_user(db, role="admin")
        draft = make_producer(db, name="שם יחיד", status="draft")
        make_producer(db, name="שם אחר", status="approved")
        assert _rows(client, admin, status="draft")[_id(draft)]["dup_name"] is False


class TestEveryView:
    def test_the_default_queue_flags_a_pending_row_whose_twin_is_a_draft(self, client, db):
        """The other direction: the default view hides drafts, and still sees them."""
        admin = make_user(db, role="admin")
        pending = _with_phone(db, make_producer(db, name="א", status="pending"), "0521112233")
        _with_phone(db, make_producer(db, name="ב", status="draft"), "052-111-2233")

        rows = _rows(client, admin)
        assert _id(pending) in rows
        assert rows[_id(pending)]["dup_phone"] is True

    def test_a_row_never_matches_itself(self, client, db):
        admin = make_user(db, role="admin")
        only = _with_phone(db, make_producer(db, name="לבד", status="approved"), "0531234567")
        row = _rows(client, admin, status="approved")[_id(only)]
        assert row["dup_phone"] is False
        assert row["dup_name"] is False
