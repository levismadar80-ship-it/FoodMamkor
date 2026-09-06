"""
Module:   test_meh1287_seasonal_module
Purpose:  Chunk B backend — `?in_season=true` selects businesses an editor
          marked with an UNEXPIRED date, the admin can write and read back
          that date, and the owner still cannot write it.
Touches:  The test DB via `db`; HTTP through `client`, admin-authenticated.
Does NOT: assert the homepage module or its >=3 render gate — that is the
          frontend half of chunk B and lives in vitest. Does not re-assert the
          column shape (chunk A, test_meh1287_in_season_until.py).
Related:  backend/app/services/producer_listing.py (the in_season branch);
          backend/app/routers/producers.py (the query param);
          backend/app/schemas/schemas.py (ProducerAdminUpdate / ProducerAdminOut).
History:  MEH-1287 chunk B (creation, 06/09).

WHY THE EXPIRY CASES ARE THE POINT
----------------------------------
Chunk A chose a DATE over a boolean precisely so nobody has to remember to
turn the mark off — the failure a flag produces is a page reading "in season"
in February. A filter that ignored the date would pass every "is it listed"
assertion and reintroduce exactly that bug, so `yesterday` and `today` are
separate cases rather than one "some date" case.
"""

from datetime import timedelta

from conftest import auth_header, make_producer, make_user

from app.models.models import Producer
from app.utils.clock import israel_today


def _admin(db):
    return make_user(db, email="season-admin@example.com", role="admin")


def _marked(db, *, name, until):
    p = make_producer(db, name=name)
    p.in_season_until = until
    db.commit()
    db.refresh(p)
    return p


def _names(client, params):
    r = client.get("/producers", params=params)
    assert r.status_code == 200, r.text
    return {row["name"] for row in r.json()}


# ── the filter ────────────────────────────────────────────────────────────
def test_control_an_unmarked_producer_is_listed_without_the_filter(db, client):
    """If the fixture cannot produce a listable producer at all, every
    "not in the results" assertion below is green for the wrong reason."""
    make_producer(db, name="עסק בלי סימון")
    assert "עסק בלי סימון" in _names(client, {})


def test_a_future_mark_is_in_season(db, client):
    _marked(db, name="תאנים עד אוקטובר", until=israel_today() + timedelta(days=30))
    assert "תאנים עד אוקטובר" in _names(client, {"in_season": "true"})


def test_today_is_inside_the_window(db, client):
    """Inclusive. The editor typed the last day of the season, not the first
    day after it — an exclusive bound would drop the business on the one day
    the mark most obviously still means something."""
    _marked(db, name="דובדבנים עד היום", until=israel_today())
    assert "דובדבנים עד היום" in _names(client, {"in_season": "true"})


def test_an_expired_mark_is_not_in_season(db, client):
    """The whole reason the column is a date. Yesterday's mark stops matching
    with nobody clearing anything."""
    _marked(db, name="ענבים שנגמרו אתמול", until=israel_today() - timedelta(days=1))
    assert "ענבים שנגמרו אתמול" not in _names(client, {"in_season": "true"})


def test_an_unmarked_producer_is_not_in_season(db, client):
    make_producer(db, name="עסק שלא סומן")
    assert "עסק שלא סומן" not in _names(client, {"in_season": "true"})


def test_the_filter_selects_exactly_the_unexpired_marks(db, client):
    """A count, not a membership spot-check: nothing else gets swept in."""
    today = israel_today()
    _marked(db, name="בעונה א", until=today + timedelta(days=1))
    _marked(db, name="בעונה ב", until=today)
    _marked(db, name="פג תוקף", until=today - timedelta(days=1))
    make_producer(db, name="לא סומן")

    assert _names(client, {"in_season": "true"}) == {"בעונה א", "בעונה ב"}


# ── the two halves must partition the table ───────────────────────────────
# This is the discriminating pair. Written as the bare `in_season_until >=
# today` comparison the SQL is three-valued: `NULL >= date` is NULL and so is
# its negation, so an unmarked producer would fall out of BOTH halves — and
# every assertion above would still pass.
def test_the_false_half_includes_the_unmarked_and_the_expired(db, client):
    today = israel_today()
    make_producer(db, name="ללא סימון בכלל")
    _marked(db, name="סימון שפג", until=today - timedelta(days=2))
    _marked(db, name="סימון בתוקף", until=today + timedelta(days=2))

    out = _names(client, {"in_season": "false"})

    assert "ללא סימון בכלל" in out, "NULL fell out of both halves (SQL NULL logic)"
    assert "סימון שפג" in out
    assert "סימון בתוקף" not in out
    assert out == {"ללא סימון בכלל", "סימון שפג"}


def test_the_counter_agrees_with_the_listing(db, client):
    """`count_q` is a second query object. Filtering one and not the other
    shows the module its businesses while the "X מתוך Y" counter denies them."""
    _marked(db, name="ספירה בעונה", until=israel_today() + timedelta(days=5))
    make_producer(db, name="ספירה לא בעונה")

    r = client.get("/producers", params={"in_season": "true"})
    assert r.status_code == 200, r.text
    rows = len(r.json())
    header = r.headers.get("X-Total-Count")
    assert header is not None, "count_q never reached the caller"
    assert rows == 1, rows
    assert int(header) == rows, f"count_q says {header}, the listing says {rows}"


# ── the write path ────────────────────────────────────────────────────────
def test_the_admin_can_set_the_date_and_read_it_back(db, client):
    """ADR-006 R2. Without the read half the admin form reopens with an empty
    date field and the next save clears a mark the editor set."""
    admin = _admin(db)
    p = make_producer(db, name="עסק שמסמנים עכשיו")
    until = israel_today() + timedelta(days=21)

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"in_season_until": until.isoformat()},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["in_season_until"] == until.isoformat()
    db.expire_all()
    assert (
        db.query(Producer).filter(Producer.id == p.id).first().in_season_until == until
    )


def test_the_admin_can_clear_the_mark(db, client):
    admin = _admin(db)
    p = _marked(db, name="עסק שמסירים ממנו", until=israel_today() + timedelta(days=3))

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"in_season_until": None},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["in_season_until"] is None
    assert "עסק שמסירים ממנו" not in _names(client, {"in_season": "true"})


def test_an_unrelated_admin_edit_leaves_the_mark_alone(db, client):
    """`exclude_unset` semantics: a payload that never mentions the field must
    not clear it. Otherwise every name fix silently unmarks the business."""
    admin = _admin(db)
    until = israel_today() + timedelta(days=10)
    p = _marked(db, name="שם ישן", until=until)

    resp = client.put(
        f"/admin/producers/{p.id}",
        json={"name": "שם חדש"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["in_season_until"] == until.isoformat()


# ── the anti-self-curation guard, over HTTP ───────────────────────────────
def test_the_owner_cannot_mark_her_own_business(db, client):
    """Chunk A asserts the field's absence from ProducerUpdate by NAME. This
    is the same guard at the endpoint: a business that could set this would
    put itself on the homepage, which is the ADR-030 failure on another
    surface. The PUT is allowed to succeed — extra keys are ignored — but the
    column must not move."""
    p = make_producer(db, name="עסק שמנסה לסמן את עצמו")
    owner = make_user(db, email="season-owner@example.com", role="producer")
    owner.producer_id = p.id
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"in_season_until": (israel_today() + timedelta(days=30)).isoformat()},
        headers=auth_header(owner),
    )

    assert resp.status_code in (200, 422), resp.text
    db.expire_all()
    assert (
        db.query(Producer).filter(Producer.id == p.id).first().in_season_until is None
    )
    assert "עסק שמנסה לסמן את עצמו" not in _names(client, {"in_season": "true"})


def test_the_public_shapes_do_not_carry_the_editorial_date(db, client):
    """The reader learns WHICH businesses are in season from the module they
    appear in — never a date on a card. Asserted over HTTP because the by-name
    schema guard cannot see a handler that adds the key by hand."""
    p = _marked(db, name="עסק בעונה לציבור", until=israel_today() + timedelta(days=7))

    detail = client.get(f"/producers/{p.id}")
    assert detail.status_code == 200, detail.text
    assert "in_season_until" not in detail.json()

    listed = client.get("/producers", params={"in_season": "true"})
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    assert len(rows) == 1, rows
    assert "in_season_until" not in rows[0]
