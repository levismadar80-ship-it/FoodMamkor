"""
MEH-1881 — GET /producers?open_for_orders_now= consumer filter.

Matches on the DECLARED `order_window` (when the owner said she takes orders),
never on `opening_hours` (when the shop is staffed). The two are different facts
and this product's conversion event is a WhatsApp message, not a visit.

The clock is frozen through `producer_listing.israel_now`, the same monkeypatch
idiom `tests/test_availability_validation.py` uses for `israel_today`. Without a
frozen clock every assertion here would pass or fail depending on the hour the
suite happens to run, which is the "green with two possible causes" shape — a
suite that is green at 11:00 and red at 15:00 is not testing the filter.

Lives in its own module rather than inside an existing file because this
directory already keeps one module per listing filter
(`test_meh1645_delivery_day_filter.py`, `test_has_delivery_filter.py`,
`test_dietary_filter.py`).

REUSES: tests/test_meh1645_delivery_day_filter.py (approved-producer fixture +
name-set assertion pattern).
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.services import producer_listing
from tests.conftest import make_producer

ISRAEL = ZoneInfo("Asia/Jerusalem")

# 2026-06-07 is a SUNDAY (asserted below, not assumed — a wrong weekday here
# would make every fixture key the wrong day and the whole file would pass for
# the wrong reason).
SUNDAY = datetime(2026, 6, 7, 10, 0, tzinfo=ISRAEL)

SPLIT_DAY = {
    "sunday": [
        {"open": "09:00", "close": "13:00"},
        {"open": "16:00", "close": "20:00"},
    ]
}
# The pre-MEH-1869 storage shape. Still on disk for any row not re-saved since
# the cutover, because `_order_window_validator` normalises on WRITE only.
LEGACY_SHAPE = {"sunday": {"open": "09:00", "close": "13:00"}}
OTHER_DAY = {"monday": [{"open": "09:00", "close": "13:00"}]}


def _freeze(monkeypatch, when):
    monkeypatch.setattr(producer_listing, "israel_now", lambda: when)


def _approved(db, name, window):
    p = make_producer(db, name=name)
    p.status = "approved"
    p.order_window = window
    db.commit()
    return p


def _names(resp):
    return {row["name"] for row in resp.json()}


def test_the_fixture_date_really_is_sunday():
    """Guards the premise every other test in this file rests on."""
    assert SUNDAY.strftime("%A") == "Sunday"


def test_inside_a_range_is_included(client, db, monkeypatch):
    _freeze(monkeypatch, SUNDAY)  # 10:00, inside 09:00–13:00
    _approved(db, "פתוחה עכשיו", SPLIT_DAY)
    _approved(db, "בלי חלון", None)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert resp.status_code == 200, resp.text
    assert _names(resp) == {"פתוחה עכשיו"}


def test_between_two_ranges_is_excluded(client, db, monkeypatch):
    """14:30 on a split day is genuinely closed — the lunch break is the whole
    reason multi-range days exist, so it must not read as open."""
    _freeze(monkeypatch, SUNDAY.replace(hour=14, minute=30))
    _approved(db, "בהפסקת צהריים", SPLIT_DAY)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert resp.status_code == 200, resp.text
    assert _names(resp) == set()


def test_second_range_of_the_same_day_is_included(client, db, monkeypatch):
    _freeze(monkeypatch, SUNDAY.replace(hour=17))
    _approved(db, "ערב", SPLIT_DAY)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert _names(resp) == {"ערב"}


def test_null_window_is_excluded(client, db, monkeypatch):
    """A producer who declared nothing is neither open nor closed by this filter.

    `jsonb_path_exists(NULL, …)` is NULL, not false, so the condition uses
    `IS TRUE` / `IS NOT TRUE`. A bare `== True` would drop these rows from BOTH
    sides of the filter, which is the silent-disappearance bug this pins.
    """
    _freeze(monkeypatch, SUNDAY)
    _approved(db, "לא הגדירה", None)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert _names(resp) == set()


def test_null_window_appears_under_the_false_branch(client, db, monkeypatch):
    """The exact complement: ?open_for_orders_now=false must return everything
    the true branch does not, including the never-declared rows."""
    _freeze(monkeypatch, SUNDAY)
    _approved(db, "פתוחה", SPLIT_DAY)
    _approved(db, "לא הגדירה", None)
    _approved(db, "יום אחר", OTHER_DAY)

    resp = client.get("/producers", params={"open_for_orders_now": "false"})
    assert _names(resp) == {"לא הגדירה", "יום אחר"}


def test_open_boundary_is_inclusive(client, db, monkeypatch):
    """`open == now` counts as open."""
    _freeze(monkeypatch, SUNDAY.replace(hour=9, minute=0))
    _approved(db, "בדיוק נפתחה", SPLIT_DAY)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert _names(resp) == {"בדיוק נפתחה"}


def test_close_boundary_is_exclusive(client, db, monkeypatch):
    """`close == now` counts as closed — the mirror of the test above, and the
    pair is what pins `open <= now < close` rather than either half alone."""
    _freeze(monkeypatch, SUNDAY.replace(hour=13, minute=0))
    _approved(db, "בדיוק נסגרה", SPLIT_DAY)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert _names(resp) == set()


def test_legacy_single_dict_shape_still_matches(client, db, monkeypatch):
    """The shape-drift case, and the one most likely to fail silently.

    Rows written before MEH-1869 store a single dict per day instead of a list.
    jsonpath's default LAX mode auto-wraps a non-array at `[*]`, so one
    expression covers both shapes — measured here rather than trusted, because
    the failure mode is a business that simply never appears in the filter, with
    no error anywhere.
    """
    _freeze(monkeypatch, SUNDAY)
    _approved(db, "שורה ישנה", LEGACY_SHAPE)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert _names(resp) == {"שורה ישנה"}


def test_wrong_day_is_excluded(client, db, monkeypatch):
    _freeze(monkeypatch, SUNDAY)
    _approved(db, "פותחת רק בשני", OTHER_DAY)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert _names(resp) == set()


def test_total_count_header_matches_the_filtered_page(client, db, monkeypatch):
    """The count query has to carry the same filter as the page query.

    Applying it to only one is the classic version of this bug: the page shows
    3 businesses while the header claims 12, so pagination invents empty pages.
    """
    _freeze(monkeypatch, SUNDAY)
    _approved(db, "פתוחה א", SPLIT_DAY)
    _approved(db, "פתוחה ב", LEGACY_SHAPE)
    _approved(db, "סגורה", OTHER_DAY)
    _approved(db, "בלי חלון", None)

    resp = client.get("/producers", params={"open_for_orders_now": "true"})
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 2
    assert resp.headers["x-total-count"] == "2"


def test_composes_with_another_filter(client, db, monkeypatch):
    _freeze(monkeypatch, SUNDAY)
    a = _approved(db, "פתוחה בחיפה", SPLIT_DAY)
    a.city = "חיפה"
    b = _approved(db, "פתוחה בעכו", SPLIT_DAY)
    b.city = "עכו"
    db.commit()

    resp = client.get(
        "/producers", params={"open_for_orders_now": "true", "city": "חיפה"}
    )
    assert _names(resp) == {"פתוחה בחיפה"}


def test_absent_param_leaves_the_listing_untouched(client, db, monkeypatch):
    """The opt-in guarantee, and the one that matters most before launch.

    Every business must still be listed when the filter is not asked for —
    including the one with no window at all. A filter that quietly hides
    businesses nobody asked to hide is the failure this ticket exists to avoid.
    """
    _freeze(monkeypatch, SUNDAY.replace(hour=23))  # everyone is "closed" now
    _approved(db, "פתוחה", SPLIT_DAY)
    _approved(db, "יום אחר", OTHER_DAY)
    _approved(db, "בלי חלון", None)

    resp = client.get("/producers")
    assert resp.status_code == 200, resp.text
    assert _names(resp) == {"פתוחה", "יום אחר", "בלי חלון"}
    assert resp.headers["x-total-count"] == "3"
