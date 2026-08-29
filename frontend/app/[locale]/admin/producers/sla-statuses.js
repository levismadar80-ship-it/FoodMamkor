/**
 * Module:   sla-statuses
 * Purpose:  The one answer to "is this row waiting on the admin, and therefore
 *           accruing the «עד 3 ימי עסקים» clock". Read by the per-row badge
 *           (`WaitingBadge`) and by the queue counter (`QueueSlaSummary`).
 * Touches:  nothing — a bare constant, no hooks, no I/O.
 * Does NOT: decide which statuses need a PHOTO review before approval. That is
 *           `PENDING_PHOTO_STATUSES` in AdminProducersTable.jsx (MEH-1232), a
 *           DIFFERENT question that happens to have the same answer today —
 *           see the note there for why the two are deliberately not merged.
 *           Does NOT compute business days either: that is server-side
 *           (`routers/admin.py` → `utils/clock.business_days_waiting`).
 * Related:  AdminProducersTable.jsx (WaitingBadge — the per-row half),
 *           QueueSlaSummary.jsx (the counter half).
 * History:  MEH-2161 (creation). Extracted after the CI reviewer flagged, twice
 *           on PR #3058, that the counter carried its own `QUEUED_STATUSES`
 *           copy while the badge read `SLA_STATUSES` — one fact, two owners,
 *           and the second was unexported so duplication was the only option.
 *           A status added to one would have left the counter and the badges
 *           silently disagreeing about the same queue.
 *
 * WHICH ROWS GET SLA COLOURS, and why it is not "every row": the promise this
 * escalates against is made only to a business that has ASKED to be reviewed.
 * A draft has made no such request, so it shows its age in plain grey — the
 * MEH-2110 "no SLA colours on drafts" rule. Approved / rejected / inactive rows
 * render nothing at all: they sit in the default view (`status != draft`, not
 * the pending filter) but they are not waiting for anything, and a «ממתין 0» on
 * every live business would be pure noise.
 *
 * One entry since `pending_whatsapp` was removed in MEH-2124. Kept as an ARRAY
 * rather than collapsed to an equality: both call sites read it as a set
 * membership question, and a second waiting state is a plausible addition —
 * which is exactly the change this module exists to make safe.
 */

export const SLA_STATUSES = ["pending"];
