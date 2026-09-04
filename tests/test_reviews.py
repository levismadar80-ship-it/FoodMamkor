"""MEH-103 — verified reviews system tests.

Guards tested:
  - POST without any contact click → 403 (MEH-2204: WhatsApp OR any channel)
  - POST from producer owner → 403
  - POST with valid WA click → 201
  - GET /producers/{id}/reviews excludes is_hidden=True rows
  - PUT /admin/reviews/{id}/hide sets is_hidden, recomputes aggregates
  - _recompute_producer_rating excludes hidden reviews
"""
import pytest

from conftest import auth_header, make_producer, make_user
from app.models.models import ContactClick, ProducerReview, ProducerWhatsAppClick

# MEH-2204: imported, not transcribed. The matrix below must widen on its own
# the day this frozenset does — otherwise adding a method (e.g. when facebook /
# external_order are fixed at the beacon) silently leaves the new one uncovered
# while the suite still reports green.
from app.routers.producers import _VALID_CONTACT_METHODS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _wa_click(db, producer, user):
    """Insert a WA click row so the user passes the gate."""
    click = ProducerWhatsAppClick(producer_id=producer.id, user_id=user.id)
    db.add(click)
    db.commit()


def _contact_click(db, producer, user, method="phone"):
    """MEH-2204: a non-WhatsApp contact click — the other way through the gate."""
    db.add(ContactClick(producer_id=producer.id, user_id=user.id, method=method))
    db.commit()


# MEH-2204: the gate's 403 is channel-neutral. Asserted by EQUALITY, not by
# substring: the old copy named WhatsApp, and a substring check on the new text
# would keep passing if someone reinstated a WhatsApp-specific instruction
# around it.
GATE_403 = "יש ליצור קשר עם בית העסק לפני כתיבת ביקורת"


VALID_BODY = "המוצרים מדהימים ואוהבת את השירות!"  # >10 chars


# ---------------------------------------------------------------------------
# POST guard: no contact of ANY kind → 403
#
# MEH-2204 renamed this from `..._requires_wa_click`. The fixture never had a
# WhatsApp click OR a contact click, so the behaviour it asserts is unchanged —
# but the old name said the gate requires WhatsApp specifically, which is no
# longer true and would lead the next editor to treat the WA path as the only
# one that counts. Named after the input it covers, not the class it belongs to.
# ---------------------------------------------------------------------------

def test_post_review_requires_some_contact_click(client, db):
    user = make_user(db)
    producer = make_producer(db)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 403, r.text
    assert r.json().get("detail", "") == GATE_403


# ---------------------------------------------------------------------------
# POST guard: unauthenticated → 401
# ---------------------------------------------------------------------------

def test_post_review_requires_auth(client, db):
    producer = make_producer(db)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 4, "body": VALID_BODY},
    )
    assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# POST guard: producer owner cannot review themselves
# ---------------------------------------------------------------------------

def test_post_review_rejects_producer_owner(client, db):
    owner = make_user(db, role="producer")
    producer = make_producer(db)
    owner.producer_id = producer.id
    db.commit()
    # Give owner a WA click so only the owner guard fires
    _wa_click(db, producer, owner)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(owner),
    )
    assert r.status_code == 403, r.text
    assert "עסק" in r.json().get("detail", "") or "עצמ" in r.json().get("detail", "")


# ---------------------------------------------------------------------------
# POST success: user with WA click → 201
# ---------------------------------------------------------------------------

def test_post_review_success(client, db):
    user = make_user(db)
    producer = make_producer(db)
    _wa_click(db, producer, user)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 4, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["stars"] == 4
    assert data["body"] == VALID_BODY


# ---------------------------------------------------------------------------
# MEH-1426: an UNATTRIBUTED click (user_id=NULL — exactly what the pre-fix
# sendBeacon produced, since it can't carry the Bearer header) does NOT satisfy
# the gate. guard 3 matches on user_id == user.id, so a NULL-user row is
# invisible to it. This is the regression that would have caught the bug: the
# frontend fix (authenticated fetch) is what makes the row attributable.
# ---------------------------------------------------------------------------

def test_post_review_unattributed_wa_click_still_403(client, db):
    user = make_user(db)
    producer = make_producer(db)
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=None))
    db.commit()
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 403, r.text
    assert r.json().get("detail", "") == GATE_403


# ---------------------------------------------------------------------------
# MEH-1426: an attributed click by a DIFFERENT user doesn't count — the gate is
# per-(producer, user), so one user's click can't unlock another's review.
# ---------------------------------------------------------------------------

def test_post_review_other_users_wa_click_does_not_count(client, db):
    reviewer = make_user(db)
    other = make_user(db)
    producer = make_producer(db)
    _wa_click(db, producer, other)  # attributed to `other`, not `reviewer`
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(reviewer),
    )
    assert r.status_code == 403, r.text
    assert r.json().get("detail", "") == GATE_403


# ---------------------------------------------------------------------------
# MEH-2204 — the gate accepts contact through ANY channel.
#
# Before this, the gate read producer_whatsapp_clicks alone. Once the page
# started routing its CTAs by the declared primary channel, a non-WhatsApp
# business rendered zero wa.me links, so no action available to its customers
# could ever satisfy the gate: first reviews were structurally impossible.
#
# The matrix below is the whole claim — wa-only, contact-only, both, neither —
# and the two negatives that keep the widening honest: a NULL-user contact row
# and another user's contact row must both still be refused, exactly as their
# WhatsApp twins above are.
# ---------------------------------------------------------------------------

def test_post_review_contact_click_unlocks_first_review(client, db):
    """The case the ticket exists for: no WhatsApp click anywhere, phone click only."""
    user = make_user(db)
    producer = make_producer(db)
    _contact_click(db, producer, user, method="phone")
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 201, r.text
    assert r.json()["stars"] == 5


@pytest.mark.parametrize("method", sorted(_VALID_CONTACT_METHODS))
def test_post_review_any_contact_method_unlocks(client, db, method):
    """Every method the contact-click endpoint accepts opens the gate.

    Parametrised over the imported `_VALID_CONTACT_METHODS` (routers/producers.py)
    rather than over the seven `primary_contact_method` values, because only the
    methods that set accepts can produce a stored row at all: `record_contact_click`
    raises 422 for anything outside it, so no ContactClick row is written and the
    gate has nothing to find.

    That gap is real and is NOT closed here: ContactCard renders `facebook` and
    `external_order` tiles that call trackContactClick with those keys, and both
    are rejected at the beacon — so those two channels still cannot unlock a first
    review. Fixing it means widening the frozenset, which is outside this change's
    scope; when someone does, this test widens with it because the list is derived
    rather than transcribed.
    """
    user = make_user(db)
    producer = make_producer(db)
    _contact_click(db, producer, user, method=method)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 4, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 201, r.text


def test_post_review_both_click_kinds_present(client, db):
    """Both rows present → still one review, still 201 (no double-counting)."""
    user = make_user(db)
    producer = make_producer(db)
    _wa_click(db, producer, user)
    _contact_click(db, producer, user)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 201, r.text


def test_post_review_unattributed_contact_click_still_403(client, db):
    """user_id=NULL is an anonymous click and must not unlock anyone's review.

    The WhatsApp twin of this case is MEH-1426 above. Widening the gate to a
    second table would have re-opened exactly that hole if the new query had
    matched on producer_id alone.
    """
    user = make_user(db)
    producer = make_producer(db)
    db.add(ContactClick(producer_id=producer.id, user_id=None, method="phone"))
    db.commit()
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 403, r.text
    assert r.json().get("detail", "") == GATE_403


def test_post_review_other_users_contact_click_does_not_count(client, db):
    """The gate stays per-(producer, user) on the new table too."""
    reviewer = make_user(db)
    other = make_user(db)
    producer = make_producer(db)
    _contact_click(db, producer, other)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(reviewer),
    )
    assert r.status_code == 403, r.text
    assert r.json().get("detail", "") == GATE_403


def test_post_review_contact_click_for_other_producer_does_not_count(client, db):
    """…and per-producer: contacting one business does not unlock reviewing another."""
    user = make_user(db)
    producer = make_producer(db)
    other_producer = make_producer(db)
    _contact_click(db, other_producer, user)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 403, r.text
    assert r.json().get("detail", "") == GATE_403


def test_edit_existing_review_is_not_gated(client, db):
    """The gate guards the FIRST review only — editing is never re-gated.

    Deliberately builds the existing review directly, with NO click row of
    either kind, so the 201 can only come from the `if not existing_review`
    branch being skipped. The upsert test above cannot show this: it creates
    its first review through a WhatsApp click, so a gate that also ran on edits
    would still pass there.
    """
    user = make_user(db)
    producer = make_producer(db)
    db.add(
        ProducerReview(
            producer_id=producer.id,
            user_id=user.id,
            stars=3,
            body=VALID_BODY,
        )
    )
    db.commit()
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY + " עדכון"},
        headers=auth_header(user),
    )
    assert r.status_code == 201, r.text
    assert r.json()["stars"] == 5


# ---------------------------------------------------------------------------
# POST validation: body too short → 422
# ---------------------------------------------------------------------------

def test_post_review_body_too_short(client, db):
    user = make_user(db)
    producer = make_producer(db)
    _wa_click(db, producer, user)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": "קצר"},  # <10 chars
        headers=auth_header(user),
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# POST upsert: duplicate updates existing review
# ---------------------------------------------------------------------------

def test_post_review_upserts_existing(client, db):
    user = make_user(db)
    producer = make_producer(db)
    _wa_click(db, producer, user)
    client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 3, "body": VALID_BODY},
        headers=auth_header(user),
    )
    r2 = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY + " עדכון"},
        headers=auth_header(user),
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["stars"] == 5


# ---------------------------------------------------------------------------
# GET: hidden reviews excluded from public endpoint
# ---------------------------------------------------------------------------

def test_get_excludes_hidden_reviews(client, db):
    user1 = make_user(db)
    user2 = make_user(db, email="other@test.com")
    producer = make_producer(db)

    visible = ProducerReview(
        producer_id=producer.id, user_id=user1.id, stars=5, body="נהדר!"
    )
    hidden = ProducerReview(
        producer_id=producer.id, user_id=user2.id, stars=1, body="ספאם", is_hidden=True
    )
    db.add_all([visible, hidden])
    db.commit()

    r = client.get(f"/producers/{producer.id}/reviews")
    assert r.status_code == 200, r.text
    ids = [rev["id"] for rev in r.json()["reviews"]]
    assert str(visible.id) in ids
    assert str(hidden.id) not in ids
    assert r.json()["total"] == 1


# ---------------------------------------------------------------------------
# Admin: PUT /admin/reviews/{id}/hide sets is_hidden
# ---------------------------------------------------------------------------

def test_admin_hide_review(client, db):
    admin = make_user(db, role="admin")
    user = make_user(db, email="user@test.com")
    producer = make_producer(db)
    review = ProducerReview(
        producer_id=producer.id, user_id=user.id, stars=2, body="לא טוב"
    )
    db.add(review)
    db.commit()

    r = client.put(
        f"/admin/reviews/{review.id}/hide",
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    db.refresh(review)
    assert review.is_hidden is True


def test_admin_hide_requires_admin(client, db):
    user = make_user(db)
    producer = make_producer(db)
    review = ProducerReview(
        producer_id=producer.id, user_id=user.id, stars=3, body="בסדר"
    )
    db.add(review)
    db.commit()

    r = client.put(
        f"/admin/reviews/{review.id}/hide",
        headers=auth_header(user),
    )
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# Aggregate: hidden reviews excluded from avg_rating
# ---------------------------------------------------------------------------

def test_rating_aggregate_excludes_hidden(db):
    from app.routers.reviews import _recompute_producer_rating

    user1 = make_user(db)
    user2 = make_user(db, email="u2@test.com")
    producer = make_producer(db)

    visible = ProducerReview(
        producer_id=producer.id, user_id=user1.id, stars=5, is_hidden=False, body="מצוין"
    )
    hidden = ProducerReview(
        producer_id=producer.id, user_id=user2.id, stars=1, is_hidden=True, body="ספאם"
    )
    db.add_all([visible, hidden])
    db.commit()

    _recompute_producer_rating(producer.id, db)
    db.refresh(producer)
    assert producer.avg_rating == 5.0   # hidden 1-star excluded
    assert producer.reviews_count == 1  # only the visible review counted


# ---------------------------------------------------------------------------
# Rating threshold: ProducerCard shows rating only when reviews_count >= 3
# (backend stores the raw count; frontend enforces the ≥3 gate)
# ---------------------------------------------------------------------------

def test_rating_threshold_in_aggregate(db):
    """With 2 visible reviews, reviews_count should be 2 (< threshold for display)."""
    from app.routers.reviews import _recompute_producer_rating

    users = [make_user(db, email=f"u{i}@test.com") for i in range(2)]
    producer = make_producer(db)

    for i, u in enumerate(users):
        db.add(ProducerReview(
            producer_id=producer.id, user_id=u.id, stars=4, body="טוב מאוד!"
        ))
    db.commit()

    _recompute_producer_rating(producer.id, db)
    db.refresh(producer)
    assert producer.reviews_count == 2  # below the ≥3 frontend threshold


# ---------------------------------------------------------------------------
# DELETE — owner or admin; cross-owner is 404 (MEH-1001 anti-existence-leak)
# ---------------------------------------------------------------------------

def test_delete_review_cross_owner_returns_404(client, db):
    """MEH-1001 — a non-owner (non-admin) deleting someone else's review gets
    404, not 403, so review existence isn't leaked (recipes convention)."""
    owner = make_user(db, email="owner@example.com")
    other = make_user(db, email="other@example.com")
    producer = make_producer(db)
    review = ProducerReview(
        producer_id=producer.id, user_id=owner.id, stars=4, body="ביקורת טובה"
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    r = client.delete(f"/reviews/{review.id}", headers=auth_header(other))
    assert r.status_code == 404, r.text
    # The review is untouched.
    assert db.query(ProducerReview).filter_by(id=review.id).count() == 1


def test_delete_review_owner_succeeds(client, db):
    """Sanity: the legitimate owner can still delete (no regression)."""
    owner = make_user(db, email="owner2@example.com")
    producer = make_producer(db)
    review = ProducerReview(
        producer_id=producer.id, user_id=owner.id, stars=5, body="מצוין"
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    r = client.delete(f"/reviews/{review.id}", headers=auth_header(owner))
    assert r.status_code == 200, r.text
    assert db.query(ProducerReview).filter_by(id=review.id).count() == 0


def test_delete_review_admin_succeeds(client, db):
    """MEH-1001 — the preserved owner-OR-admin override still lets an admin
    delete any review (parallel to experiences test_admin_can_delete_any)."""
    owner = make_user(db, email="owner3@example.com")
    admin = make_user(db, role="admin", email="admin@example.com")
    producer = make_producer(db)
    review = ProducerReview(
        producer_id=producer.id, user_id=owner.id, stars=2, body="לא משהו"
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    r = client.delete(f"/reviews/{review.id}", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    assert db.query(ProducerReview).filter_by(id=review.id).count() == 0


# ---------------------------------------------------------------------------
# PUT /reviews/{id}/reply — business-owner only (MEH-1039)
# ---------------------------------------------------------------------------

def _owned_producer_review(db, owner_email="biz@example.com", cust_email="c@example.com"):
    """Producer + owning user + a customer's review of that producer."""
    owner = make_user(db, role="producer", email=owner_email)
    customer = make_user(db, email=cust_email)
    producer = make_producer(db)
    owner.producer_id = producer.id
    db.commit()
    review = ProducerReview(
        producer_id=producer.id, user_id=customer.id, stars=5, body="מוצרים מעולים"
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return owner, customer, producer, review


def test_owner_can_reply(client, db):
    """MEH-1039 — the reviewed producer's owner sets a reply → 200, reply +
    reply_at in the payload."""
    owner, _, _, review = _owned_producer_review(db)
    r = client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "תודה רבה על המילים החמות, נשמח לראותך שוב"},
        headers=auth_header(owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["reply"] == "תודה רבה על המילים החמות, נשמח לראותך שוב"
    assert r.json()["reply_at"] is not None


def test_non_owner_cannot_reply_returns_404(client, db):
    """MEH-1039 — a producer who doesn't own this review's business gets 404
    (existence not leaked); NO admin override, so even an admin is a stranger."""
    owner, customer, producer, review = _owned_producer_review(db)
    other_producer = make_producer(db)
    stranger = make_user(db, role="producer", email="stranger@example.com")
    stranger.producer_id = other_producer.id
    admin = make_user(db, role="admin", email="admin2@example.com")
    db.commit()

    for actor in (stranger, customer, admin):
        r = client.put(
            f"/reviews/{review.id}/reply",
            json={"reply": "תגובה לא מורשית"},
            headers=auth_header(actor),
        )
        assert r.status_code == 404, r.text
    db.refresh(review)
    assert review.reply is None


def test_reply_appears_in_get_payload(client, db):
    """MEH-1039 — after the owner replies, the public GET carries reply/reply_at."""
    owner, _, producer, review = _owned_producer_review(db)
    client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "שמחנו לשרת אותך"},
        headers=auth_header(owner),
    )
    r = client.get(f"/producers/{producer.id}/reviews")
    assert r.status_code == 200, r.text
    row = next(x for x in r.json()["reviews"] if x["id"] == str(review.id))
    assert row["reply"] == "שמחנו לשרת אותך"
    assert row["reply_at"] is not None


def test_empty_reply_clears(client, db):
    """MEH-1039 — an empty/blank reply clears both reply and reply_at."""
    owner, _, _, review = _owned_producer_review(db)
    client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "תגובה ראשונית"},
        headers=auth_header(owner),
    )
    r = client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "   "},
        headers=auth_header(owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["reply"] is None
    assert r.json()["reply_at"] is None


def test_reply_rejects_punctuation_only(client, db):
    """MEH-1039/MEH-555 — a punctuation-only reply (<3 letters) is 422."""
    owner, _, _, review = _owned_producer_review(db)
    r = client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "??"},
        headers=auth_header(owner),
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# MEH-1428 chunk 1 — "request a review" signed link.
#
# Two surfaces: GET /producers/me/review-link mints the link (approved owners
# only), and POST /producers/{id}/reviews accepts its token as `review_token`
# — a valid token for THIS producer passes guard 3 without any click row.
# Every rejection below is the SAME 403 + detail as "no contact": the
# reviewer must not learn which proof failed.
#
# Red control (run with the reviews.py verify branch stashed): the valid-token
# / other-producer / round-trip cases go red (403 instead of 201, or no
# `source` key), the three rejection cases stay green by construction (a
# server that ignores the token rejects everything) — which is exactly why
# the positive cases are the ones that carry the evidence.
# ---------------------------------------------------------------------------

from datetime import datetime, timedelta, timezone  # noqa: E402
from urllib.parse import parse_qs, urlparse  # noqa: E402

from joserfc import jwt as jose_jwt  # noqa: E402
from joserfc.jwk import OctKey  # noqa: E402

from app.auth import (  # noqa: E402
    REVIEW_INVITE_SCOPE,
    _jwt_key,
    create_review_invite_token,
)
from app.config import settings  # noqa: E402


def _mint(producer_id, *, exp_delta=timedelta(days=1), key=None, scope=None):
    """Mint a review-invite-shaped JWT with ONE property under our control:
    expiry, signing key, or scope. Everything else mirrors auth.py."""
    now = datetime.now(timezone.utc)
    payload = {
        "producer_id": str(producer_id),
        "exp": now + exp_delta,
        "iat": int(now.timestamp()),
        "scope": scope or REVIEW_INVITE_SCOPE,
    }
    return jose_jwt.encode({"alg": settings.algorithm}, payload, key or _jwt_key())


class TestMeh1428ReviewInviteLink:
    @staticmethod
    def _owner_and_producer(db, *, status="approved", slug=None):
        producer = make_producer(db, status=status)
        if slug:
            producer.slug = slug
        owner = make_user(db, role="producer")
        owner.producer_id = producer.id
        db.commit()
        db.refresh(producer)
        return owner, producer

    @staticmethod
    def _post(client, producer, user, token=None):
        body = {"stars": 5, "body": VALID_BODY}
        if token is not None:
            body["review_token"] = token
        return client.post(
            f"/producers/{producer.id}/reviews",
            json=body,
            headers=auth_header(user),
        )

    # ---- POST verify branch ---------------------------------------------

    def test_valid_token_passes_gate_and_stores_invite_link_source(self, client, db):
        """No click of any kind + a valid token for THIS producer → 201, and
        the row records source="invite_link"."""
        _, producer = self._owner_and_producer(db)
        reviewer = make_user(db)
        r = self._post(client, producer, reviewer, create_review_invite_token(producer.id))
        assert r.status_code == 201, r.text
        assert r.json()["source"] == "invite_link"
        row = (
            db.query(ProducerReview)
            .filter(
                ProducerReview.producer_id == producer.id,
                ProducerReview.user_id == reviewer.id,
            )
            .one()
        )
        assert row.source == "invite_link"

    def test_expired_token_is_403(self, client, db):
        _, producer = self._owner_and_producer(db)
        reviewer = make_user(db)
        r = self._post(client, producer, reviewer, _mint(producer.id, exp_delta=timedelta(days=-1)))
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == GATE_403
        assert db.query(ProducerReview).filter(ProducerReview.user_id == reviewer.id).count() == 0

    def test_forged_signature_is_403(self, client, db):
        """Well-formed claims, wrong key — the signature is the whole proof."""
        _, producer = self._owner_and_producer(db)
        reviewer = make_user(db)
        forged = _mint(producer.id, key=OctKey.import_key(b"not-the-server-secret-at-all-0000"))
        r = self._post(client, producer, reviewer, forged)
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == GATE_403

    def test_wrong_scope_token_is_403(self, client, db):
        """A correctly signed token with another scope (e.g. an access token
        replayed here) must not pass — scope is what stops cross-use."""
        _, producer = self._owner_and_producer(db)
        reviewer = make_user(db)
        r = self._post(client, producer, reviewer, _mint(producer.id, scope="access"))
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == GATE_403

    def test_token_for_other_producer_is_403(self, client, db):
        """A genuine token minted for producer B is a forged claim of contact
        with producer A."""
        _, producer_a = self._owner_and_producer(db)
        _, producer_b = self._owner_and_producer(db)
        reviewer = make_user(db)
        r = self._post(client, producer_a, reviewer, create_review_invite_token(producer_b.id))
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == GATE_403

    def test_click_path_still_works_with_click_source(self, client, db):
        """Regression: the pre-MEH-1428 path — a click row, no token — is
        unchanged and records source="click"."""
        _, producer = self._owner_and_producer(db)
        reviewer = make_user(db)
        _wa_click(db, producer, reviewer)
        r = self._post(client, producer, reviewer)
        assert r.status_code == 201, r.text
        assert r.json()["source"] == "click"
        row = db.query(ProducerReview).filter(ProducerReview.user_id == reviewer.id).one()
        assert row.source == "click"

    def test_bad_token_falls_through_to_click_path(self, client, db):
        """A customer who clicked AND pasted a stale link is still a customer
        who clicked: the bad token is ignored, the click carries her through,
        and the row is recorded as the proof that actually held."""
        _, producer = self._owner_and_producer(db)
        reviewer = make_user(db)
        _contact_click(db, producer, reviewer)
        r = self._post(client, producer, reviewer, _mint(producer.id, exp_delta=timedelta(days=-1)))
        assert r.status_code == 201, r.text
        assert r.json()["source"] == "click"

    # ---- GET /producers/me/review-link ------------------------------------

    def test_review_link_403_for_non_approved(self, client, db):
        owner, _ = self._owner_and_producer(db, status="pending")
        r = client.get("/producers/me/review-link", headers=auth_header(owner))
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == "קישור לבקשת ביקורת זמין רק לעסק מאושר"

    def test_review_link_requires_producer_role(self, client, db):
        consumer = make_user(db)
        r = client.get("/producers/me/review-link", headers=auth_header(consumer))
        assert r.status_code == 403, r.text

    def test_review_link_200_for_approved_with_slug(self, client, db):
        owner, producer = self._owner_and_producer(db, slug="havat-hanisui")
        r = client.get("/producers/me/review-link", headers=auth_header(owner))
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        parsed = urlparse(url)
        assert url.startswith(settings.frontend_url.rstrip("/"))
        assert parsed.path == "/p/havat-hanisui"
        assert "rt" in parse_qs(parsed.query)

    def test_review_link_without_slug_uses_producer_id_route(self, client, db):
        owner, producer = self._owner_and_producer(db)
        assert producer.slug is None  # the factory never sets one
        r = client.get("/producers/me/review-link", headers=auth_header(owner))
        assert r.status_code == 200, r.text
        assert urlparse(r.json()["url"]).path == f"/producer/{producer.id}"

    def test_link_token_round_trips_through_post(self, client, db):
        """End to end: the `rt` the GET mints is exactly what the POST accepts."""
        owner, producer = self._owner_and_producer(db, slug="round-trip")
        link = client.get("/producers/me/review-link", headers=auth_header(owner)).json()["url"]
        rt = parse_qs(urlparse(link).query)["rt"][0]
        reviewer = make_user(db)
        r = self._post(client, producer, reviewer, rt)
        assert r.status_code == 201, r.text
        assert r.json()["source"] == "invite_link"
