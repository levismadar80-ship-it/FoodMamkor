import {
  Bread,
  ChatCircleSlash,
  Seal,
  Sparkle,
  Tag,
  TextAa,
  Warning,
} from "@phosphor-icons/react";

/**
 * Module:   admin/queues
 * Purpose:  MEH-2359 — the ONE list of secondary moderation queues the admin
 *           has, with the `/admin/dashboard` stats key that counts each one.
 *           Consumed by admin/AdminLayoutClient.jsx (sidebar + mobile strip: a queue is
 *           listed only while its count is > 0) and admin/page.js (the
 *           «מה מחכה לטיפול» home: one row per non-empty queue).
 * Does NOT: include the approvals queue itself (/admin/producers) — that is
 *           the primary surface and is always visible, never a row here.
 * Why one module: two consumers of the same set is the dual-owner smell
 *           (.claude/rules/workflow.md Smell #1); the help page already
 *           drifted from the sidebar once (MEH-2359 Phase 0).
 */
export const QUEUES = [
  // Reports are the one secondary queue that stays visible at 0 — a user
  // report is a safety signal and the MEH-217 e2e card enumerates the tab.
  { href: "/admin/reports", key: "reports", Icon: Warning, stat: "open_reports", always: true },
  { href: "/admin/kashrut", key: "kashrut", Icon: Seal, stat: "pending_kashrut_requests" },
  { href: "/admin/category-requests", key: "category_requests", Icon: Tag, stat: "pending_category_requests" },
  { href: "/admin/name-change-requests", key: "name_change_requests", Icon: TextAa, stat: "pending_name_change_requests" },
  { href: "/admin/whatsapp-failures", key: "whatsapp_failures", Icon: ChatCircleSlash, stat: "undelivered_whatsapp_7d" },
  // Admin's-turn counts only (status == "pending"): `pending_experiences` /
  // `pending_recipes` also count the owner's turn (changes_requested /
  // needs_revision), which is work in the queue but not a decision to make.
  { href: "/admin/experiences", key: "experiences", Icon: Sparkle, stat: "experiences_awaiting_review" },
  { href: "/admin/recipes", key: "recipes", Icon: Bread, stat: "recipes_awaiting_review" },
];

/**
 * Count for one queue, or null when the stats are unknown (fetch failed /
 * not loaded yet). null is NOT zero — callers that hide empty queues must
 * keep a queue visible while its count is unknown (MEH-2096: "no badge" must
 * never read as "nothing waiting" because the endpoint died).
 */
export function queueCount(stats, queue) {
  if (!stats) return null;
  const v = stats[queue.stat];
  return typeof v === "number" ? v : null;
}

/**
 * Queues to show: always-on ones, non-empty ones, all of them while unknown —
 * and the one the admin is standing on (`isActive`), whatever its count:
 * approving the last recipe must not make the «מתכונים» entry vanish from
 * under the highlighted page.
 */
export function visibleQueues(stats, countsError = false, isActive = () => false) {
  return QUEUES.filter((q) => {
    if (q.always) return true;
    if (countsError) return true;
    if (isActive(q.href)) return true;
    const n = queueCount(stats, q);
    return n === null || n > 0;
  });
}
