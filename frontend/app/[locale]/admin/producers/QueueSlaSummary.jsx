"use client";

/**
 * Module:   QueueSlaSummary
 * Purpose:  One line above the admin producers table — how many businesses are
 *           waiting for review, and how long the oldest has waited. The row
 *           badges answer "how old is THIS one"; nothing on the page answered
 *           "am I meeting the «עד 3 ימי עסקים» promise at all".
 * Does NOT: compute business days. That is server-side
 *           (`routers/admin.py` → `utils/clock.business_days_waiting`), the
 *           same field `WaitingBadge` renders, so the summary and the badges
 *           can never disagree about a row's age.
 * Related:  AdminProducersTable.jsx (WaitingBadge — the per-row half),
 *           app/[locale]/admin/producers/page.js (the mount site).
 * History:  MEH-2138 chunk E (creation). The other three items of that chunk —
 *           oldest-first ordering, the per-row badge, the serializer field —
 *           already shipped under MEH-2110; this is the residual.
 */

import { useTranslations } from "next-intl";

// The same set `WaitingBadge` colours. A business that has not asked to be
// reviewed is not waiting on us, so it is not in the promise this line reports
// against — counting drafts here would inflate the queue with work nobody has
// requested.
const QUEUED_STATUSES = ["pending"];

/**
 * @param {{rows: Array<object>}} props `rows` must be the FULL filtered set,
 *   not one page. Pagination on this table is client-side (`use-admin-producers`
 *   slices `visible`), so `visible` is available and correct; handing this the
 *   paged slice would make the count a claim about the current page while
 *   reading as a claim about the queue.
 */
export default function QueueSlaSummary({ rows }) {
  const t = useTranslations("admin");
  const queued = (rows || []).filter((p) => QUEUED_STATUSES.includes(p?.status));

  // Nothing waiting → render nothing. A «0 ממתינים» line is a permanent
  // fixture that says nothing on the day it matters, and the empty queue is
  // already legible from the table itself.
  if (queued.length === 0) return null;

  const oldest = queued.reduce(
    (max, p) => Math.max(max, p.business_days_waiting ?? 0),
    0,
  );

  // >=3 is a breach of the stated promise, 2 is the day before. Same
  // thresholds as WaitingBadge, deliberately — two different answers to
  // "is this late" on one screen would be worse than none.
  let tone = "bg-gray-100 text-gray-700";
  if (oldest >= 3) tone = "bg-red-100 text-red-800";
  else if (oldest === 2) tone = "bg-amber-100 text-amber-800";

  return (
    <div
      role="status"
      data-testid="queue-sla-summary"
      data-count={queued.length}
      data-oldest={oldest}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${tone}`}
    >
      <span>{t("producers.queue_summary", { count: queued.length, days: oldest })}</span>
    </div>
  );
}
