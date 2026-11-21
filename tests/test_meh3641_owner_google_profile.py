"""MEH-3641 — the owner's «הפרופיל שלכם בגוגל» tool.

Google is never called for real: `httpx` inside services/google_profile.py is
replaced by a recorder that answers like Places API (New). A link is accepted
only when the Google name or phone matches the business; nothing Google sends
is stored except the place_id (ToS §3.2.3(b)).
"""

import uuid

import pytest

from app.config import settings
from app.routers import producer_google_profile as router_mod
from app.services import google_profile as gp
from tests.conftest import auth_header, make_producer, make_user

BASE = "/producers/me/google-profile"
PLACE = "ChIJ_test_place_1"


class _Resp:
    def __init__(self, status, data):
        self.status_code = status
        self._data = data

    def json(self):
        return self._data


@pytest.fixture
def google(monkeypatch):
    """A Places key, and a fake Google that answers from `google.places`."""
    monkeypatch.setattr(settings, "google_places_api_key", "test-key")
    state = {"places": {}, "search": [], "calls": [], "down": False}

    def fake_get(url, headers, timeout):
        state["calls"].append(("get", url, headers["X-Goog-FieldMask"]))
        if state["down"]:
            raise RuntimeError("network")
        place_id = url.rsplit("/", 1)[-1]
        if place_id not in state["places"]:
            return _Resp(404, {})
        return _Resp(200, state["places"][place_id])

    def fake_post(url, headers, json, timeout):
        state["calls"].append(("post", json["textQuery"], headers["X-Goog-FieldMask"]))
        if state["down"]:
            return _Resp(500, {})
        return _Resp(200, {"places": state["search"]})

    monkeypatch.setattr(gp.httpx, "get", fake_get)
    monkeypatch.setattr(gp.httpx, "post", fake_post)
    return state


def _owner(db, *, name="המאפייה של רותי", phone="0501234567", status="approved"):
    producer = make_producer(db, name=name, city="רחובות", status=status)
    producer.phone = phone
    db.commit()
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user, producer


def _place(name="המאפייה של רותי", phone="050-123-4567", website=None, hours=None):
    data = {"id": PLACE, "displayName": {"text": name}}
    if phone:
        data["nationalPhoneNumber"] = phone
    if website:
        data["websiteUri"] = website
    if hours:
        data["regularOpeningHours"] = {"weekdayDescriptions": hours}
    return data


# ── status ──────────────────────────────────────────────────────────────────


def test_status_without_a_key_says_unavailable_and_calls_nothing(
    client, db, monkeypatch
):
    monkeypatch.setattr(settings, "google_places_api_key", None)
    monkeypatch.setattr(
        gp.httpx, "get", lambda *a, **k: pytest.fail("no call without a key")
    )
    user, _ = _owner(db)
    r = client.get(BASE, headers=auth_header(user))
    assert r.json() == {"available": False, "google_place_id": None}
    r = client.get(f"{BASE}/candidates", headers=auth_header(user))
    assert r.status_code == 503
    assert r.json()["detail"] == router_mod.UNAVAILABLE


def test_routes_are_for_owners_only(client, db):
    consumer = make_user(db, role="consumer", email="c@example.com")
    for method, path in (
        ("get", BASE),
        ("get", f"{BASE}/candidates"),
        ("get", f"{BASE}/check"),
    ):
        assert (
            getattr(client, method)(path, headers=auth_header(consumer)).status_code
            == 403
        )
    r = client.put(BASE, json={"google_place_id": PLACE}, headers=auth_header(consumer))
    assert r.status_code == 403
    assert client.get(BASE).status_code == 401


def test_every_route_needs_a_login(client):
    # One line per route, so docs/release/action-map.md sees each negative cell.
    assert client.get(f"{BASE}/candidates", params={"q": "x"}).status_code == 401
    assert client.get(f"{BASE}/check").status_code == 401
    assert client.put(BASE, json={"google_place_id": PLACE}).status_code == 401


# ── search ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("count", [0, 1, 3, 5])
def test_search_returns_at_most_three(client, db, google, count):
    google["search"] = [
        {
            "id": f"p{i}",
            "displayName": {"text": f"מקום {i}"},
            "formattedAddress": "רחובות",
        }
        for i in range(count)
    ]
    user, _ = _owner(db)
    r = client.get(f"{BASE}/candidates", headers=auth_header(user))
    assert r.status_code == 200
    assert [c["place_id"] for c in r.json()["candidates"]] == [
        f"p{i}" for i in range(min(count, 3))
    ]


def test_search_uses_her_name_and_city_or_her_own_words(client, db, google):
    user, _ = _owner(db)
    client.get(f"{BASE}/candidates", headers=auth_header(user))
    client.get(
        f"{BASE}/candidates", params={"q": "מאפיית רותי"}, headers=auth_header(user)
    )
    assert [c[1] for c in google["calls"]] == ["המאפייה של רותי רחובות", "מאפיית רותי"]


def test_search_failure_is_unavailable_not_empty(client, db, google):
    google["down"] = True
    user, _ = _owner(db)
    assert (
        client.get(f"{BASE}/candidates", headers=auth_header(user)).status_code == 503
    )


# ── link ────────────────────────────────────────────────────────────────────


def test_link_by_matching_name(client, db, google):
    google["places"][PLACE] = _place(phone=None, name="המאפייה של רותי - רחובות")
    user, producer = _owner(db, phone="0529999999")
    r = client.put(BASE, json={"google_place_id": PLACE}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    db.refresh(producer)
    assert producer.google_place_id == PLACE


def test_link_by_matching_phone_in_international_form(client, db, google):
    google["places"][PLACE] = {
        "id": PLACE,
        "displayName": {"text": "Ruti Bakery"},
        "internationalPhoneNumber": "+972 50-123-4567",
    }
    user, producer = _owner(db)
    assert (
        client.put(
            BASE, json={"google_place_id": PLACE}, headers=auth_header(user)
        ).status_code
        == 200
    )


def test_a_landline_matches_too(client, db, google):
    google["places"][PLACE] = _place(name="Other", phone="08-946-1234")
    user, _ = _owner(db, phone="089461234")
    assert (
        client.put(
            BASE, json={"google_place_id": PLACE}, headers=auth_header(user)
        ).status_code
        == 200
    )


def test_someone_elses_profile_is_refused_and_nothing_is_stored(client, db, google):
    google["places"][PLACE] = _place(name="קפה אחר", phone="03-555-0000")
    user, producer = _owner(db)
    r = client.put(BASE, json={"google_place_id": PLACE}, headers=auth_header(user))
    assert r.status_code == 409
    assert r.json()["detail"] == router_mod.NOT_HERS
    db.refresh(producer)
    assert producer.google_place_id is None


def test_a_one_letter_name_does_not_match_everything(client, db, google):
    google["places"][PLACE] = _place(name="א בית קפה", phone=None)
    user, _ = _owner(db, name="א")
    assert (
        client.put(
            BASE, json={"google_place_id": PLACE}, headers=auth_header(user)
        ).status_code
        == 409
    )


def test_a_profile_linked_to_another_business_is_refused(client, db, google):
    google["places"][PLACE] = _place()
    other = make_producer(db, name="עסק אחר")
    other.google_place_id = PLACE
    db.commit()
    user, producer = _owner(db)
    r = client.put(BASE, json={"google_place_id": PLACE}, headers=auth_header(user))
    assert r.status_code == 409
    assert r.json()["detail"] == router_mod.TAKEN
    db.refresh(producer)
    assert producer.google_place_id is None


def test_saving_the_same_link_again_calls_nothing_and_pings_no_one(
    client, db, google, monkeypatch
):
    sent = []
    monkeypatch.setattr(
        "app.routers.producer_me.notify_admin_producer_sensitive_edit",
        lambda name, fields, test_cause=False: sent.append(fields),
    )
    user, producer = _owner(db)
    producer.google_place_id = PLACE
    db.commit()
    assert (
        client.put(
            BASE, json={"google_place_id": PLACE}, headers=auth_header(user)
        ).status_code
        == 200
    )
    assert google["calls"] == [] and sent == []


def test_an_organizer_has_no_google_profile_tool(client, db, google):
    user, producer = _owner(db)
    producer.kind = "organizer"
    db.commit()
    assert client.get(BASE, headers=auth_header(user)).status_code == 404


def test_link_when_google_is_down_is_unavailable(client, db, google):
    google["down"] = True
    user, producer = _owner(db)
    assert (
        client.put(
            BASE, json={"google_place_id": PLACE}, headers=auth_header(user)
        ).status_code
        == 503
    )
    db.refresh(producer)
    assert producer.google_place_id is None


def test_unlink_needs_no_google_call(client, db, google):
    user, producer = _owner(db)
    producer.google_place_id = PLACE
    db.commit()
    r = client.put(BASE, json={"google_place_id": None}, headers=auth_header(user))
    assert r.status_code == 200 and r.json() == {"google_place_id": None}
    assert google["calls"] == []
    db.refresh(producer)
    assert producer.google_place_id is None


def test_a_url_instead_of_a_place_id_is_refused(client, db, google):
    user, _ = _owner(db)
    r = client.put(
        BASE,
        json={"google_place_id": "https://maps.google.com/x"},
        headers=auth_header(user),
    )
    assert r.status_code == 422


@pytest.mark.parametrize(("status", "pinged"), [("approved", True), ("pending", False)])
def test_admin_hears_about_a_link_change_on_an_approved_business(
    client, db, google, monkeypatch, status, pinged
):
    sent = []
    monkeypatch.setattr(
        "app.routers.producer_me.notify_admin_producer_sensitive_edit",
        lambda name, fields, test_cause=False: sent.append(fields),
    )
    google["places"][PLACE] = _place()
    user, _ = _owner(db, status=status)
    client.put(BASE, json={"google_place_id": PLACE}, headers=auth_header(user))
    assert sent == ([["google_place_id"]] if pinged else [])


# ── check ───────────────────────────────────────────────────────────────────


def test_check_before_linking_says_not_linked(client, db, google):
    user, _ = _owner(db)
    r = client.get(f"{BASE}/check", headers=auth_header(user))
    assert r.status_code == 404
    assert r.json()["detail"] == router_mod.NOT_LINKED


def test_check_gives_a_verdict_per_row_and_hours_side_by_side(client, db, google):
    google["places"][PLACE] = _place(
        name="המאפייה של רותי",
        phone="052-000-0000",
        website="https://mehamakor.co.il/ruti-bakery",
        hours=["יום ראשון: 08:00–14:00"],
    )
    user, producer = _owner(db)
    producer.slug = "ruti-bakery"
    producer.google_place_id = PLACE
    producer.opening_hours = "Sun 08:00-14:00"
    db.commit()
    r = client.get(f"{BASE}/check", headers=auth_header(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert {row["field"]: row["verdict"] for row in body["rows"]} == {
        "name": "same",
        "phone": "different",
        "website": "same",  # Google links to her own page here
    }
    assert body["hours_ours"] == "Sun 08:00-14:00"
    assert body["hours_google"] == ["יום ראשון: 08:00–14:00"]


def test_check_reports_what_google_is_missing(client, db, google):
    google["places"][PLACE] = {"id": PLACE, "displayName": {"text": "המאפייה של רותי"}}
    user, producer = _owner(db)
    producer.google_place_id = PLACE
    db.commit()
    rows = client.get(f"{BASE}/check", headers=auth_header(user)).json()["rows"]
    assert {r["field"]: r["verdict"] for r in rows} == {
        "name": "same",
        "phone": "missing",
        "website": "missing",
    }


def test_check_failure_is_unavailable(client, db, google):
    google["down"] = True
    user, producer = _owner(db)
    producer.google_place_id = PLACE
    db.commit()
    assert client.get(f"{BASE}/check", headers=auth_header(user)).status_code == 503


def test_check_stores_nothing_from_google(client, db, google):
    google["places"][PLACE] = _place(
        name="שם אחר בגוגל", phone="03-555-0000", website="https://x.example"
    )
    user, producer = _owner(db)
    producer.google_place_id = PLACE
    db.commit()
    cols = ("name", "phone", "website", "opening_hours", "google_place_id")
    before = {c: getattr(producer, c) for c in cols}
    client.get(f"{BASE}/check", headers=auth_header(user))
    db.refresh(producer)
    assert {c: getattr(producer, c) for c in cols} == before


# ── rate limits ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("route", ["search", "check", "put"])
def test_each_google_route_is_limited_to_ten_an_hour(client, db, google, route):
    google["places"][PLACE] = _place()
    user, producer = _owner(db)
    producer.google_place_id = PLACE
    db.commit()
    h = auth_header(user)
    call = {
        "search": lambda: client.get(f"{BASE}/candidates", headers=h),
        "check": lambda: client.get(f"{BASE}/check", headers=h),
        "put": lambda: client.put(BASE, json={"google_place_id": PLACE}, headers=h),
    }[route]
    codes = [call().status_code for _ in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429


# ── comparison helpers (pure) ───────────────────────────────────────────────


@pytest.mark.parametrize(
    ("ours", "theirs", "expected"),
    [
        ("המאפייה של רותי", "המאפייה של רותי", True),
        ("המאפייה של רותי", 'המאפייה  של "רותי"', True),
        ("גבינות הגליל", "גבינות הגליל - משק משפחתי", True),
        ("גבינות הגליל", "יין הגולן", False),
        ("", "יין הגולן", False),
        ("אב", "אבוקדו", False),
        # one word never claims a longer name, and parts of words never match
        ("מאפיה", "מאפיה של שכונה אחרת", False),
        ("קפה", "קפה ג׳ו", False),
        ("גבינות הגליל", "גבינות הגלילית", False),
        ("קפה", "קפה", True),
    ],
)
def test_names_match(ours, theirs, expected):
    assert gp.names_match(ours, theirs) is expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("050-123-4567", "0501234567"),
        ("+972 50-123-4567", "0501234567"),
        ("08-946-1234", "089461234"),
        ("+1 415 555 0100", None),
        ("00972 3 123 4567", "031234567"),
        ("03-123-4567 ext. 12", "031234567"),
        ("", None),
    ],
)
def test_national_digits(raw, expected):
    assert gp.national_digits(raw) == expected


@pytest.mark.parametrize(
    ("ours", "theirs", "expected"),
    [
        ("https://ruti.co.il/", "http://www.ruti.co.il", "same"),
        ("ruti.co.il", "https://ruti.co.il/menu", "same"),  # any page on her own site
        (None, "https://mehamakor.co.il/ruti", "same"),  # her page here
        (None, "https://mehamakor.co.il/he/ruti/", "same"),
        (None, "https://mehamakor.co.il/producer/abc", "same"),
        (
            None,
            "https://mehamakor.co.il/other-bakery",
            "different",
        ),  # someone else's page here
        ("https://ruti.co.il", "https://other.co.il", "different"),
        ("https://ruti.co.il", None, "missing"),
        (None, "https://mehamakor.co.il.evil.io/ruti", "different"),
    ],
)
def test_website_verdict(ours, theirs, expected):
    assert (
        gp.website_verdict(
            ours, ["mehamakor.co.il"], ["/ruti", "/producer/abc"], theirs
        )
        == expected
    )
