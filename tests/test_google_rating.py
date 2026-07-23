"""MEH-1490 — GET /producers/{id}/google-rating (live-fetch Google trust line).

The endpoint is a read-only proxy to Google Places API (New). It must:
  - return 200 + {rating, user_rating_count, google_maps_uri} only when the
    producer has a mapped place_id AND the live profile has ≥ MIN_REVIEWS (20);
  - return 204 (empty) for: no place_id / count < 20 / any API error / no key;
  - return 404 for an unknown producer id;
  - NEVER persist any Google value (ToS §3.2.3(b) No Caching).

Google is never actually called: _fetch_place_details is monkeypatched so the
suite is deterministic and offline (mirrors test_api.py's Anthropic mocks).
"""
from conftest import auth_header, make_producer, make_user

from app.models import Producer
from app.routers import google_rating

PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4"


def _map_place(db, producer, place_id=PLACE_ID):
    """Attach a mapped place_id to an existing producer row."""
    producer.google_place_id = place_id
    db.commit()


def test_eligible_returns_200_with_live_fields(client, db, monkeypatch):
    """place_id mapped + count ≥ 20 → 200 with the three Google fields."""
    p = make_producer(db)
    _map_place(db, p)
    monkeypatch.setattr(
        google_rating,
        "_fetch_place_details",
        lambda place_id: {
            "rating": 4.7,
            "user_rating_count": 128,
            "google_maps_uri": "https://maps.google.com/?cid=123",
        },
    )
    r = client.get(f"/producers/{p.id}/google-rating")
    assert r.status_code == 200
    body = r.json()
    assert body["rating"] == 4.7
    assert body["user_rating_count"] == 128
    assert body["google_maps_uri"] == "https://maps.google.com/?cid=123"


def test_no_place_id_returns_204_without_calling_google(client, db, monkeypatch):
    """Unmapped producer → 204, and Google is never called."""
    p = make_producer(db)  # google_place_id stays NULL

    def _boom(place_id):
        raise AssertionError("Google must not be called when there is no place_id")

    monkeypatch.setattr(google_rating, "_fetch_place_details", _boom)
    r = client.get(f"/producers/{p.id}/google-rating")
    assert r.status_code == 204
    assert r.content == b""


def test_below_min_reviews_returns_204(client, db, monkeypatch):
    """Live profile with < 20 reviews → 204 (cannibalization gate)."""
    p = make_producer(db)
    _map_place(db, p)
    monkeypatch.setattr(
        google_rating,
        "_fetch_place_details",
        lambda place_id: {
            "rating": 5.0,
            "user_rating_count": 19,  # one below the threshold
            "google_maps_uri": "https://maps.google.com/?cid=1",
        },
    )
    r = client.get(f"/producers/{p.id}/google-rating")
    assert r.status_code == 204


def test_exactly_min_reviews_returns_200(client, db, monkeypatch):
    """Boundary: exactly 20 reviews is eligible (>= MIN_REVIEWS)."""
    p = make_producer(db)
    _map_place(db, p)
    monkeypatch.setattr(
        google_rating,
        "_fetch_place_details",
        lambda place_id: {
            "rating": 4.0,
            "user_rating_count": google_rating.MIN_REVIEWS,
            "google_maps_uri": "https://maps.google.com/?cid=2",
        },
    )
    r = client.get(f"/producers/{p.id}/google-rating")
    assert r.status_code == 200


def test_api_error_returns_204(client, db, monkeypatch):
    """Any Google API error → helper returns None → 204 (fail-quiet)."""
    p = make_producer(db)
    _map_place(db, p)
    monkeypatch.setattr(google_rating, "_fetch_place_details", lambda place_id: None)
    r = client.get(f"/producers/{p.id}/google-rating")
    assert r.status_code == 204


def test_unknown_producer_returns_404(client):
    """A non-existent producer id → 404 (the only non-204 error path)."""
    r = client.get("/producers/00000000-0000-0000-0000-000000000000/google-rating")
    assert r.status_code == 404


def test_helper_fail_quiets_without_api_key(monkeypatch):
    """No GOOGLE_PLACES_API_KEY → _fetch_place_details returns None, never calls
    httpx (dormant + free until an operator sets the key)."""
    from app.config import settings

    monkeypatch.setattr(settings, "google_places_api_key", "", raising=False)

    def _no_http(*args, **kwargs):
        raise AssertionError("httpx must not be called when the key is unset")

    monkeypatch.setattr(google_rating.httpx, "get", _no_http)
    assert google_rating._fetch_place_details(PLACE_ID) is None


def test_no_rating_persistence_on_the_model():
    """ToS §3.2.3(b) invariant: the ONLY stored Google datum is place_id — no
    rating / userRatingCount column may ever exist on Producer."""
    assert hasattr(Producer, "google_place_id")
    for forbidden in (
        "google_rating",
        "google_avg_rating",
        "google_user_rating_count",
        "google_reviews_count",
        "google_rating_cached_at",
    ):
        assert not hasattr(Producer, forbidden), (
            f"Producer.{forbidden} must not exist — MEH-1490 is live-fetch only"
        )


# ---------------------------------------------------------------------------
# MEH-1506 — GET /admin/producers/{id}/google-place-candidates (admin lookup).
# Google is never really called: _search_place_candidates is monkeypatched.
# ---------------------------------------------------------------------------

_CANDIDATES = [
    {
        "place_id": "ChIJaaa",
        "display_name": "מאפיית הכפר",
        "formatted_address": "הרצל 1, כפר סבא",
        "user_rating_count": 128,
    },
    {
        "place_id": "ChIJbbb",
        "display_name": "מאפיית הכפר הקטן",
        "formatted_address": "ויצמן 3, כפר סבא",
        "user_rating_count": 12,  # below MIN_REVIEWS — shown with a note, still pickable
    },
]


def _admin_headers(db):
    return auth_header(make_user(db, role="admin"))


def test_candidates_admin_results_returns_200(client, db, monkeypatch):
    """Admin + Google returns matches → 200 with up to 3 candidates (name,
    address, count). The low-count candidate is included (UI adds the note)."""
    p = make_producer(db)
    monkeypatch.setattr(
        google_rating, "_search_place_candidates", lambda name, city: _CANDIDATES
    )
    r = client.get(
        f"/admin/producers/{p.id}/google-place-candidates", headers=_admin_headers(db)
    )
    assert r.status_code == 200
    body = r.json()
    assert [c["place_id"] for c in body["candidates"]] == ["ChIJaaa", "ChIJbbb"]
    assert body["candidates"][0]["user_rating_count"] == 128
    assert body["candidates"][1]["user_rating_count"] == 12  # kept, not filtered


def test_candidates_no_results_returns_204(client, db, monkeypatch):
    """Admin + no Google matches → 204 (fail-quiet, no body)."""
    p = make_producer(db)
    monkeypatch.setattr(
        google_rating, "_search_place_candidates", lambda name, city: None
    )
    r = client.get(
        f"/admin/producers/{p.id}/google-place-candidates", headers=_admin_headers(db)
    )
    assert r.status_code == 204
    assert r.content == b""


def test_candidates_no_key_returns_204(client, db, monkeypatch):
    """No GOOGLE_PLACES_API_KEY → 204, and httpx is never called (dormant)."""
    p = make_producer(db)
    from app.config import settings

    monkeypatch.setattr(settings, "google_places_api_key", "", raising=False)

    def _no_http(*args, **kwargs):
        raise AssertionError("httpx must not be called when the key is unset")

    monkeypatch.setattr(google_rating.httpx, "post", _no_http)
    r = client.get(
        f"/admin/producers/{p.id}/google-place-candidates", headers=_admin_headers(db)
    )
    assert r.status_code == 204


def test_candidates_non_admin_returns_403(client, db, monkeypatch):
    """A non-admin (consumer) is refused with 403 — never reaches Google."""
    p = make_producer(db)

    def _boom(name, city):
        raise AssertionError("Google must not be searched for a non-admin")

    monkeypatch.setattr(google_rating, "_search_place_candidates", _boom)
    headers = auth_header(make_user(db, role="consumer"))
    r = client.get(
        f"/admin/producers/{p.id}/google-place-candidates", headers=headers
    )
    assert r.status_code == 403


def test_candidates_unknown_producer_returns_404(client, db):
    """Admin + a non-existent producer id → 404."""
    r = client.get(
        "/admin/producers/00000000-0000-0000-0000-000000000000/google-place-candidates",
        headers=_admin_headers(db),
    )
    assert r.status_code == 404
