"""MEH-2974 — owner invite for a business an admin built end to end.

THE FLOW: Sapir creates an approved business through /admin after written
consent from its owner, then hands the page over — a one-time link on which the
owner sets a password and signs the terms + the licensing declaration herself.
There is no `users` row until she accepts.

WHAT THIS FILE IS FOR, and why it is shaped this way
----------------------------------------------------
The feature is RED tier (auth + schema + a bearer token that grants full
control of a LIVE page), so the `TestExploits` cases below are the point
of the file, not an appendix to it. Each one was run RED against staging's code
before the implementation existed and GREEN after — both runs are quoted in the
PR body (ADR-032 §2.6: they assert BEHAVIOUR — a status code, a row count, a
column value — never that a prescribed change was applied).

Four things worth knowing before reading any assertion:

* **Accepting takes an address AND a 6-digit code mailed to it** (the card's v3
  revision). The code's only store is a hash too, it dies after ten minutes or
  five wrong guesses, and a failed accept writes nothing but the attempts
  counter. `arm_code` below reads the plaintext out of the mail the real
  endpoint queues, because that is the only place it exists — a test that wrote
  the hash itself would be asserting against its own arithmetic.

* **The token's only store is a hash.** `producers.owner_invite_token_hash` is
  the sha256 hex of a `secrets.token_urlsafe(32)`. `TestExploits::test_raw_token_
  is_nowhere_in_the_database_or_our_own_logs` is the guard that keeps it that way,
  and it reads every text-ish column of the row rather than the one we expect,
  so a future column that starts carrying the token reds it.

* **Every unusable link answers the same 404 with the same body.** Invalid,
  expired, already used, replaced by a resend, cancelled — one message. Telling
  them apart would let anyone holding one link probe the state of others.
  `test_every_dead_token_answers_byte_identically` asserts the bytes, not just
  the status.

* **`conftest` builds its schema with `create_all`, not alembic** (and
  `.claude/settings.json` denies `alembic upgrade`/`downgrade` to this session),
  so the revision's own content is pinned by reading it with `ast` —
  `TestRevisionShape`, the instrument `docs/MIGRATIONS.md` prescribes and the
  pattern `tests/test_meh2496_claim_link_sent_at.py` established. The real
  upgrade/downgrade round trip is covered by `tests/test_alembic_roundtrip.py`,
  which runs the actual CLI on a scratch database.
"""

# MEH-3540: this file was split mechanically into the modules imported
# below, so each one can be read whole. pytest collects the imported
# tests here, so every node id is unchanged. DO NOT rename this file —
# the Stop hook, DoD rules and CI reference it by path.
from _test_producer_owner_invite__p01 import (  # noqa: F401
    TestModelColumns,
    TestAdminCreate,
    TestAdminResend,
    TestAdminCancel,
    TestPublicLookup,
    TestAccept,
    TestInviteEmail,
)
from _test_producer_owner_invite__p02 import (  # noqa: F401
    TestExploits,
    TestEmailCode,
    TestAcceptCodeGate,
)
from _test_producer_owner_invite__p03 import (  # noqa: F401
    TestSuspensionRevokesTheInvite,
    TestResendSurvivesAPoisonedAddress,
    TestInviteWithoutAnAddress,
    TestAcceptPublishes,
    TestTokenNeverReachesSentry,
    TestNoEnumeration,
    TestExposure,
    TestNeighbours,
    TestOnboardingFollowupClock,
    TestRevisionShape,
    TestFarmerCategoriesAreOneFact,
    test_owner_invite_is_a_reserved_slug,
    TestGrowerDeclarationOnAccept,
)
