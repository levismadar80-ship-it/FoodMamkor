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
