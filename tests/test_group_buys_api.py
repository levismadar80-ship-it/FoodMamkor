"""Integration tests for the group-buys router (app/routers/group_buys.py).

Exercises the public list/detail endpoints, the producer create flow with
its guards, and the consumer commit/cancel lifecycle (auto-fund at
min_participants, revert-to-open on cancel, duplicate/closed/full/deadline
error paths). Uses the shared conftest fixtures + a producer-user helper
mirroring test_producer_recipes.py.
"""

# MEH-3540: this file was split mechanically into the modules imported
# below, so each one can be read whole. pytest collects the imported
# tests here, so every node id is unchanged. DO NOT rename this file —
# the Stop hook, DoD rules and CI reference it by path.
# Re-export every module-level name of the old module (helpers, constants,
# fixtures): other test modules import them from here, and pytest registers
# fixtures where they are imported.
from _test_group_buys_api__common import (  # noqa: F401
    pytest,
    re,
    datetime,
    timedelta,
    timezone,
    mock,
    uuid4,
    auth_header,
    make_producer,
    make_user,
    settings,
    GroupBuy,
    GroupBuyCommit,
    notify_participant_cancelled,
    notify_participant_funded,
    notify_producer_funded,
    utc_now,
    _producer_user,
    _make_group_buy,
    _valid_create_payload,
    _PHONE_RE,
    _contact_details_in,
    _FIXED_GB_ID,
    _FIXED_PRODUCER_ID,
)
from _test_group_buys_api__p01 import (  # noqa: F401
    TestListAndGet,
    TestApprovedBusinessOnly,
    TestMyGroupBuys,
    TestCreate,
    TestCommitLifecycle,
    TestFullLifecycle,
    TestFundedNotificationPrivacy,
)
from _test_group_buys_api__p02 import (  # noqa: F401
    TestFundedNotificationDispatch,
    TestOwnerStatusChange,
    TestExpectedStatus,
    TestCancelNotification,
)
