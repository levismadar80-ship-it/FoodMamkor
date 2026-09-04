"""
Module:   data_ownership
Purpose:  Machine-readable half of the data-ownership registry — the set of
          Producer fields whose OWNER write path was deliberately closed, so a
          later change cannot quietly re-open one.
Touches:  nothing at runtime. Imported only by tests; holds no DB or network
          side effects and is not wired into the app.
Does NOT: police admin (`admin.py`), import (`producer_import.py`) or seed
          writes — those stay open by design and are the reason the COLUMNS
          still exist. It also does not enforce LEGACY expiry dates; that is
          `scripts/checks/legacy-expiry-check.sh` (MEH-1857).
Related:  docs/DATA_OWNERSHIP.md (the prose registry this mirrors),
          backend/app/routers/producer_me.py (`_PRODUCER_WRITABLE_FIELDS`),
          tests/test_data_ownership.py (the fitness function).
History:  MEH-2145 (creation, MEH-1938 batch B6).
"""

# Fields REMOVED from `_PRODUCER_WRITABLE_FIELDS` in producer_me.py, each
# because the owner PUT accepted a value that no owner-facing UI produced or
# that no consumer surface rendered. The disposition per field, and the reason
# re-adding one is a decision rather than a tidy-up, is in
# docs/DATA_OWNERSHIP.md — this set is only the machine-checkable half.
#
# Re-adding a field here is not forbidden. Shipping its editor in the SAME PR
# is the condition; the guard exists so that the removal is a deliberate,
# reviewed act instead of an accident nobody notices.
DEPRECATED_OWNER_WRITE_FIELDS = frozenset(
    {
        # MEH-1856 (dispositions from MEH-1851)
        "address",
        "slug",
        "lactose_free_facility",
        "pickup_points",
        # MEH-1851 rows 1 · 19 · 39 (Sapir's ruling, 03/08). Row 19 — the
        # producer-level price alias — is no longer listed: MEH-1855 chunk 2
        # DROPPED the column (revision 9849fab1637a), and this registry holds
        # only fields whose column still exists (test_data_ownership.py asserts
        # exactly that). A dropped column cannot be re-opened by accident.
        "name",
        "is_available_today",
        # MEH-1938 batch: B4 and B3 respectively
        "kosher",
        "opening_hours",
        # MEH-1938 chunk 5a (Contract): the owner's editor is LocationsEditor.
        # lat/lng are read by nothing as a fallback since 5a and are dropped in
        # 5b. `city` STAYS a column (17 readers, Q3 ruling) and follows the
        # primary location row (B2, MEH-2141) — closed here by ruling A
        # (02/09) so that write-through has no second writer racing it.
        "lat",
        "lng",
        "city",
    }
)
