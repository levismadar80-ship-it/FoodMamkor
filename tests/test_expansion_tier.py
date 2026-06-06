"""Mutation-guided test expansion (2026-06, Refs MEH-214) — domain B6.

trust_tier computation. test_trust_ladder.py covers tiers 1-5, precedence,
and the (10, 4.4)/(9, 4.5) near-miss boundary. The remaining genuine gap is
the None-coalescing guard: a producer with NULL reviews_count / avg_rating
(a brand-new row) must compute tier 1, not raise.

NOTE: the public verification_tier resolver (מאומת/מוצהר, MEH-762 Chunk 3)
is covered by test_meh_762_public_tier_contract.py (landed on staging this
session) — not duplicated here.

Pure-function unit tests — no DB, but run under CI with the rest.
"""
from types import SimpleNamespace

from app.services.trust_tier import compute_trust_tier


def _producer(**kw):
    base = dict(
        ambassador=False,
        reviews_count=0,
        avg_rating=0,
        is_verified=False,
        phone_verified=False,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_null_review_fields_compute_tier_1_not_crash():
    """reviews_count / avg_rating = None → tier 1 (NULL on a fresh row).

    Kills TR-1: removing the `or 0` coalescing makes `None >= 10` raise a
    TypeError (500), not return tier 1.
    """
    p = _producer(reviews_count=None, avg_rating=None)
    assert compute_trust_tier(p) == 1


def test_null_phone_verified_compute_tier_1():
    """phone_verified = None → falsy → tier 1, not a crash."""
    p = _producer(phone_verified=None, reviews_count=None, avg_rating=None)
    assert compute_trust_tier(p) == 1


def test_exactly_ten_reviews_and_4_5_rating_is_tier_4():
    """Boundary anchor: (10, 4.5) qualifies for tier 4 (>= not >).

    Reinforces the existing near-miss tests by pinning the inclusive edge,
    so a `>= 10`→`> 10` or `>= 4.5`→`> 4.5` mutant (TR-2/TR-3) is caught.
    """
    p = _producer(reviews_count=10, avg_rating=4.5)
    assert compute_trust_tier(p) == 4


def test_ambassador_with_no_reviews_still_tier_5():
    """ambassador outranks the tier-4 criteria even with 0 reviews.

    Kills TR-4 (moving the ambassador check below tier-4 → returns 1).
    """
    p = _producer(ambassador=True, reviews_count=0, avg_rating=0)
    assert compute_trust_tier(p) == 5
