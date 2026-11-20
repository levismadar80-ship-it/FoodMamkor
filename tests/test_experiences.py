"""API tests for the Experiences (community workshops) feature.

Experiences are community-submitted events: anyone logged in can host
a workshop, cooking class, food tour, nutrition session, etc. Every
submission goes through Claude Haiku pre-moderation (FLAGGED/APPROVED/
REJECTED) and then admin approval before becoming public.

Coverage:
  - Submission: auth, validation, Claude verdict handling, persistence
  - Public listing: only approved visible, filters by category / city
  - Detail visibility: stranger/owner/admin rules for non-approved
  - Admin moderation: approve / request-changes / reject with feedback
  - Full status cycle: pending → changes_requested → pending → approved
  - Owner-only edit/delete + /experiences/mine
  - POST /experiences/validate — no auth, no DB write (real-time hint)

Claude calls are mocked via monkeypatch so tests are deterministic
and don't need ANTHROPIC_API_KEY.
"""

# MEH-3540: this file was split mechanically into the modules imported
# below, so each one can be read whole. pytest collects the imported
# tests here, so every node id is unchanged. DO NOT rename this file —
# the Stop hook, DoD rules and CI reference it by path.
# Re-export every module-level name of the old module (helpers, constants,
# fixtures): other test modules import them from here, and pytest registers
# fixtures where they are imported.
from _test_experiences__common import (  # noqa: F401
    time,
    timedelta,
    Decimal,
    Experience,
    User,
    israel_today,
    auth_header,
    make_producer,
    make_user,
    _make_host,
    _payload,
    _make_experience,
    _mock_moderation,
)
from _test_experiences__p01 import (  # noqa: F401
    TestExperienceSubmission,
    TestExperienceValidate,
    TestExperienceCount,
    TestExperienceListing,
    TestExperienceDetail,
    TestPublicVisibilityRequiresApprovedBusiness,
    TestAdminExperienceFlows,
)
from _test_experiences__p02 import (  # noqa: F401
    TestExperienceEdit,
    TestExperienceCancelToggle,
    TestExperienceSignupCount,
    TestExperienceMinParticipants,
    TestExperiencePinPrivacy,
    TestEventsUntouched,
    TestHostBusinessLink,
)
