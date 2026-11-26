"""MEH-3896 — short preview (/v/<code>) and claim (/c/<code>) links.

The admin's two "create link" buttons now return a 12-character random code
backed by a share_links row, instead of a ~250-character JWT. Each case is
named for the input it covers. The JWT links already sent keep working; their
own tests stay in test_producer_claim.py / test_producer_draft_preview.py /
test_meh3122_claim_new_link.py, which this file does not repeat.
"""

import hashlib
import re
import string
from datetime import timedelta

import pytest

from conftest import SUBMIT_READY_IMAGE, auth_header, make_producer, make_user
from app.models.share_links import ShareLink
from app.services import share_links as share_links_service
from app.services.retention_purge import run_purge
from app.services.share_links import (
    CODE_LENGTH,
    link_producer_id,
    looks_like_share_code,
    mint_share_code,
    resolve_share_code,
)
from app.utils.clock import utc_now

CLAIM = "/producer-claim"
CLAIM_PREVIEW = "/producer-claim/preview"
NEW_LINK = "/producer-claim/new-link-request"
PREVIEW_INVALID = "הקישור לא תקף או שפג תוקפו"
CLAIM_INVALID = "הקישור לא תקין או שפג תוקפו. אפשר לבקש מאיתנו קישור חדש."


@pytest.fixture(autouse=True)
def _quiet_side_effects(monkeypatch):
    calls = []
    for name in (
        "notify_producer_registered",
        "score_producer",
        "notify_admin_draft_claimed",
        "send_welcome_email",
        "notify_admin_claim_link_requested",
    ):
        monkeypatch.setattr(
            f"app.routers.producer_claim.{name}",
            lambda *a, _n=name, **k: calls.append(_n),
        )
    # The new-link cooldown is a module-level dict; start every test clean.
    monkeypatch.setattr("app.routers.producer_claim._new_link_last_notice", {})
    return calls


def _draft(db, **kw):
    kw.setdefault("images", [SUBMIT_READY_IMAGE])
    return make_producer(db, status="draft", **kw)


def _code(url, prefix):
    assert f"/{prefix}/" in url, url
    return url.rsplit(f"/{prefix}/", 1)[1]


def _mint_via_admin(client, db, producer, kind):
    admin = make_user(db, role="admin")
    path = "preview-link" if kind == "v" else "claim-link"
    r = client.post(f"/admin/producers/{producer.id}/{path}", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    return _code(r.json()["url"], kind)


def _expire(db, code, *, ago):
    row = (
        db.query(ShareLink)
        .filter(ShareLink.code_hash == hashlib.sha256(code.encode()).hexdigest())
        .one()
    )
    row.expires_at = utc_now() - ago
    db.commit()


def _claim_body(token):
    return {"token": token, "declaration_accepted": True, "terms_accepted": True}


# ---------- the code itself ----------


def test_admin_preview_link_is_short_and_on_the_v_path(client, db):
    p = _draft(db)
    admin = make_user(db, role="admin")
    r = client.post(f"/admin/producers/{p.id}/preview-link", headers=auth_header(admin))
    url = r.json()["url"]
    code = _code(url, "v")
    assert re.fullmatch(rf"[A-Za-z0-9]{{{CODE_LENGTH}}}", code)
    assert CODE_LENGTH == 12
    # The whole link is short — the point of the card.
    assert len(url) - len(url.split("/v/")[0]) == len("/v/") + 12


def test_admin_claim_link_is_short_and_on_the_c_path(client, db):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "c")
    assert re.fullmatch(r"[A-Za-z0-9]{12}", code)


def test_only_the_hash_is_stored_never_the_code(client, db):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "v")
    row = db.query(ShareLink).filter(ShareLink.producer_id == p.id).one()
    assert row.code_hash == hashlib.sha256(code.encode()).hexdigest()
    assert code not in {str(getattr(row, c.name)) for c in ShareLink.__table__.columns}


def test_two_mints_give_two_different_codes_and_both_work(client, db):
    p = _draft(db)
    a = _mint_via_admin(client, db, p, "v")
    b = _mint_via_admin(client, db, p, "v")
    assert a != b
    assert client.get(f"/producer-preview/{a}").status_code == 200
    assert client.get(f"/producer-preview/{b}").status_code == 200


def test_mint_uses_the_csprng(monkeypatch, db):
    """The code comes from secrets.choice, not random: replace it and the
    code follows."""
    p = _draft(db)
    monkeypatch.setattr(share_links_service.secrets, "choice", lambda alphabet: "Z")
    code, _ = mint_share_code(
        db, producer_id=p.id, scope="draft_preview", ttl_days=14, created_by=None
    )
    assert code == "Z" * 12


def test_mint_refuses_an_unknown_scope(db):
    with pytest.raises(ValueError):
        mint_share_code(
            db, producer_id=_draft(db).id, scope="access", ttl_days=1, created_by=None
        )


def test_expires_at_returned_to_admin_is_fourteen_days_out(client, db):
    p = _draft(db)
    admin = make_user(db, role="admin")
    r = client.post(f"/admin/producers/{p.id}/claim-link", headers=auth_header(admin))
    row = db.query(ShareLink).filter(ShareLink.producer_id == p.id).one()
    assert row.scope == "producer_claim"
    assert row.created_by == admin.id
    delta = row.expires_at - utc_now()
    assert timedelta(days=13, hours=23) < delta <= timedelta(days=14)
    assert r.json()["expires_at"].startswith(row.expires_at.isoformat()[:16])


# ---------- the shape check ----------


@pytest.mark.parametrize(
    "value",
    ["", "abc", "A" * 11, "A" * 13, "AAAAAAAAAAA-", "AAAAAAAAAAA.", "eyJ.x.y", "אאאאאאאאאאאא"],
)
def test_shape_check_refuses_anything_but_twelve_base62(value):
    assert looks_like_share_code(value) is False


def test_shape_check_accepts_twelve_base62():
    assert looks_like_share_code(string.ascii_letters[:6] + "012345") is True


def test_link_producer_id_sends_a_jwt_to_the_jwt_decoder(db):
    seen = []
    link_producer_id(db, "a.b.c", "draft_preview", lambda t: seen.append(t))
    assert seen == ["a.b.c"]


def test_link_producer_id_never_sends_a_code_to_the_jwt_decoder(db):
    seen = []
    assert link_producer_id(db, "A" * 12, "draft_preview", lambda t: seen.append(t)) is None
    assert seen == []


# ---------- preview: /v/<code> ----------


def test_live_preview_code_shows_the_draft(client, db):
    p = _draft(db, name="מאפיית הבדיקה")
    code = _mint_via_admin(client, db, p, "v")
    r = client.get(f"/producer-preview/{code}")
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "מאפיית הבדיקה"


def test_preview_code_and_old_jwt_return_the_same_page(client, db):
    from app.services.draft_preview import create_draft_preview_token

    p = _draft(db)
    code = _mint_via_admin(client, db, p, "v")
    old = create_draft_preview_token(p.id)[0]
    a = client.get(f"/producer-preview/{code}").json()
    b = client.get(f"/producer-preview/{old}").json()
    assert a == b


@pytest.mark.parametrize("case", ["unknown", "expired", "claim_scope", "published", "deleted"])
def test_every_dead_preview_code_gets_the_same_404(client, db, case):
    p = _draft(db)
    if case == "claim_scope":
        code = _mint_via_admin(client, db, p, "c")
    else:
        code = _mint_via_admin(client, db, p, "v")
    if case == "unknown":
        code = "Q" * 12
    elif case == "expired":
        _expire(db, code, ago=timedelta(seconds=1))
    elif case == "published":
        p.status = "approved"
        db.commit()
    elif case == "deleted":
        db.delete(p)
        db.commit()
        # CASCADE: the row went with the draft.
        assert db.query(ShareLink).count() == 0
    r = client.get(f"/producer-preview/{code}")
    assert r.status_code == 404
    assert r.json()["detail"] == PREVIEW_INVALID


def test_guessing_codes_returns_no_draft(client, db):
    """Enumeration: 50 random well-shaped codes against a table that holds a
    live one. None opens anything, and every answer is the same 404."""
    p = _draft(db)
    real = _mint_via_admin(client, db, p, "v")
    for _ in range(50):
        guess, _ = mint_share_code(
            db, producer_id=p.id, scope="draft_preview", ttl_days=1, created_by=None
        )
        db.rollback()  # minted, never stored: a random code nobody holds
        assert guess != real
        r = client.get(f"/producer-preview/{guess}")
        assert r.status_code == 404
        assert r.json()["detail"] == PREVIEW_INVALID


# ---------- claim: /c/<code> ----------


def test_claim_code_previews_the_draft(client, db):
    p = _draft(db, name="משק הבדיקה")
    code = _mint_via_admin(client, db, p, "c")
    r = client.post(CLAIM_PREVIEW, json={"token": code})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "משק הבדיקה"


def test_claim_code_claims_the_draft(client, db):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "c")
    owner = make_user(db, role="consumer")
    r = client.post(CLAIM, json=_claim_body(code), headers=auth_header(owner))
    assert r.status_code == 200, r.text
    db.refresh(owner)
    assert owner.producer_id == p.id


def test_claim_code_is_dead_once_the_draft_has_an_owner(client, db):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "c")
    first = make_user(db, role="consumer")
    assert client.post(CLAIM, json=_claim_body(code), headers=auth_header(first)).status_code == 200
    second = make_user(db, role="consumer")
    r = client.post(CLAIM, json=_claim_body(code), headers=auth_header(second))
    assert r.status_code == 409


def test_preview_code_does_not_claim(client, db):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "v")
    owner = make_user(db, role="consumer")
    r = client.post(CLAIM, json=_claim_body(code), headers=auth_header(owner))
    assert r.status_code == 404
    assert r.json()["detail"] == CLAIM_INVALID
    db.refresh(owner)
    assert owner.producer_id is None
    assert client.post(CLAIM_PREVIEW, json={"token": code}).status_code == 404


def test_expired_claim_code_is_refused_like_an_unknown_one(client, db):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "c")
    _expire(db, code, ago=timedelta(seconds=1))
    expired = client.post(CLAIM_PREVIEW, json={"token": code})
    unknown = client.post(CLAIM_PREVIEW, json={"token": "Q" * 12})
    assert expired.status_code == unknown.status_code == 404
    assert expired.json() == unknown.json()


# ---------- «send me a new link» with a lapsed short code ----------


def test_new_link_request_with_a_code_lapsed_30_days_tells_the_admin(
    client, db, _quiet_side_effects
):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "c")
    _expire(db, code, ago=timedelta(days=30))
    r = client.post(NEW_LINK, json={"token": code})
    assert r.status_code == 200
    assert _quiet_side_effects.count("notify_admin_claim_link_requested") == 1


def test_new_link_request_with_a_code_lapsed_past_the_grace_is_silent(
    client, db, _quiet_side_effects
):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "c")
    _expire(db, code, ago=timedelta(days=91))
    r = client.post(NEW_LINK, json={"token": code})
    assert r.status_code == 200  # same answer as a real request
    assert "notify_admin_claim_link_requested" not in _quiet_side_effects


def test_new_link_request_with_a_preview_code_is_silent(client, db, _quiet_side_effects):
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "v")
    assert client.post(NEW_LINK, json={"token": code}).status_code == 200
    assert "notify_admin_claim_link_requested" not in _quiet_side_effects


def test_lapsed_code_still_cannot_claim(client, db):
    """The 90-day grace is for the notice only, never for the claim."""
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "c")
    _expire(db, code, ago=timedelta(days=1))
    owner = make_user(db, role="consumer")
    assert client.post(CLAIM, json=_claim_body(code), headers=auth_header(owner)).status_code == 404


# ---------- retention ----------


def test_purge_deletes_a_code_90_days_past_expiry_and_keeps_a_newer_one(client, db):
    p = _draft(db)
    old = _mint_via_admin(client, db, p, "c")
    recent = _mint_via_admin(client, db, p, "c")
    _expire(db, old, ago=timedelta(days=91))
    _expire(db, recent, ago=timedelta(days=89))
    result = run_purge(db)
    assert result.share_links_deleted == 1
    left = db.query(ShareLink).one()
    assert left.code_hash == hashlib.sha256(recent.encode()).hexdigest()


def test_resolve_never_raises_on_a_string_of_any_kind(db):
    for value in ["", "x" * 5000, "\x00" * 12, "🙂" * 12]:
        assert resolve_share_code(db, value, "draft_preview") is None


# ---------- backend logs and Sentry never carry a short code ----------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("/producer-preview/K7m2Qx9aPbR4", "/producer-preview/[token]"),
        ("https://mehamakor.co.il/v/K7m2Qx9aPbR4", "https://mehamakor.co.il/v/[token]"),
        ("https://mehamakor.co.il/en/c/K7m2Qx9aPbR4?x=1", "https://mehamakor.co.il/en/c/[token]?x=1"),
    ],
)
def test_redact_url_tokens_hides_a_short_code(raw, expected):
    from app.utils.pii import redact_url_tokens

    assert redact_url_tokens(raw) == expected


@pytest.mark.parametrize("raw", ["/c/abcdefghijklm", "/v/abcdefghijkl-bakery", "/producers/12"])
def test_redact_url_tokens_leaves_other_paths(raw):
    from app.utils.pii import redact_url_tokens

    assert redact_url_tokens(raw) == raw


def test_redact_url_tokens_hides_an_encoded_short_code():
    from app.utils.pii import redact_url_tokens

    raw = "/login?redirect=%2Fhe%2Fc%2FK7m2Qx9aPbR4"
    assert redact_url_tokens(raw) == "/login?redirect=%2Fhe%2Fc%2F[token]"


def test_a_code_is_dead_at_the_exact_expiry_instant(monkeypatch, client, db):
    """Boundary: `expires_at <= now` is dead, one second before is live."""
    p = _draft(db)
    code = _mint_via_admin(client, db, p, "v")
    row = db.query(ShareLink).one()
    at = row.expires_at
    monkeypatch.setattr(share_links_service, "utc_now", lambda: at)
    assert resolve_share_code(db, code, "draft_preview") is None
    monkeypatch.setattr(share_links_service, "utc_now", lambda: at - timedelta(seconds=1))
    assert resolve_share_code(db, code, "draft_preview") == p.id
