"""
API tests for מהמקור backend.

Coverage:
- Auth: register, login (success/wrong password/blocked user), /auth/me
- Producers: list, filter by delivery_city, filter by category, get by id
- Admin: 401/403 for non-admins, approve flow, dashboard, users, categories,
  settings, analytics, page editing
- Contact: POST /contact — DB save, validation, email sending, fail-open
"""

# MEH-3540: this file was split mechanically into the modules imported
# below, so each one can be read whole. pytest collects the imported
# tests here, so every node id is unchanged. DO NOT rename this file —
# the Stop hook, DoD rules and CI reference it by path.
# Re-export every module-level name of the old module (helpers, constants,
# fixtures): other test modules import them from here, and pytest registers
# fixtures where they are imported.
from _test_api__common import (  # noqa: F401
    pytest,
    AdminSetting,
    ContactClick,
    ContactMessage,
    Producer,
    ProducerReview,
    ProducerWhatsAppClick,
    StaticPage,
    User,
    israel_today,
    auth_header,
    make_category,
    make_producer,
    make_submit_ready_producer,
    make_user,
    valid_producer_register_payload,
    valid_review_payload,
    utc_now,
    _REGISTER_ACK_DETAIL,
    _signup_cookie_shape,
)
from _test_api__p01 import (  # noqa: F401
    TestAuth,
)
from _test_api__p02 import (  # noqa: F401
    TestRegisterPerEmailRateLimit,
    TestRegistrationCoverageGaps,
    TestRegisterProducerContactMethodPresence,
    TestRegisterProducerRequiredFieldsNonUpgrade,
    TestRegisterPerIpRateLimit,
    TestLoginTimingEqualization,
)
from _test_api__p03 import (  # noqa: F401
    TestProducers,
    TestAdminGuard,
    TestAdminFlows,
    TestMeh56WhatsAppOnboarding,
    TestMeh56BioGenerator,
    TestMeh1236RequestReview,
    TestMeh2120RequestReviewGate,
    TestContact,
)
from _test_api__p04 import (  # noqa: F401
    TestWhatsAppClickTracking,
    TestProducerReviews,
    TestAvatarUpload,
    TestProfilePhone,
    TestReservedSlugs,
    TestDoubleSubmitIdempotency,
    TestCloudinaryHebrewErrors,
    TestOwnerStoryFields,
    TestVacationBadgeClear,
)
from _test_api__p05 import (  # noqa: F401
    TestAvailabilityState,
    TestProducersCount,
    TestCategoryRequests,
    TestFavoritesCount,
    TestSimilarProducersExclude,
    TestContactClickTracking,
    TestGetProducersMeRouteOrder,
    TestUploadGoogleAvatarOrNone,
    TestAuthEmailHtmlEscape,
    TestResetPasswordFlow,
)
from _test_api__p06 import (  # noqa: F401
    TestRefreshTokenFlow,
    TestFingerprintCookie,
    TestSanitizationIntegration,
    TestAppleTokenVerification,
    TestHomeProductsKillSwitch,
    TestBOLA,
    TestPublicStats,
)
from _test_api__p07 import (  # noqa: F401
    TestMeh1167KashrutCard,
)
