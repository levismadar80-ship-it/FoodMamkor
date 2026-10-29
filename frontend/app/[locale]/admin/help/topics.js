/**
 * Module:   admin/help/topics
 * Purpose:  MEH-2591 — the ordered list of «איך עושים…» help topics on
 *           /admin/help. Each topic is one task, answered in a few steps and
 *           closed by a link to the screen where the task is done. The copy
 *           lives in messages/*.json under `admin.help.topics.<id>`
 *           ({ q, steps[] }); this file only owns order, grouping, the target
 *           screen and whether the steps are a sequence (`ol`) or a set (`ul`).
 * Groups:   the sidebar's own sections (approvals · queues · more,
 *           AdminLayoutClient.jsx NAV_SECTIONS), so a screen is found in the
 *           same place in the menu and here.
 * Guard:    __tests__/AdminHelp.test.jsx fails when a screen in the admin
 *           menu has no topic, or a topic points at a route that is gone —
 *           the previous handbook drifted from the admin for months
 *           (MEH-2591 audit: 12 of 15 sections stale).
 */
export const HELP_GROUPS = ["approvals", "queues", "more"];

export const HELP_TOPICS = [
  { id: "daily", group: "approvals", href: "/admin", list: "ol" },
  { id: "approve", group: "approvals", href: "/admin/producers?status=pending", list: "ol" },
  { id: "request_changes", group: "approvals", href: "/admin/producers?status=pending", list: "ol" },
  { id: "reject", group: "approvals", href: "/admin/producers?status=pending", list: "ol" },
  { id: "approve_without_license", group: "approvals", href: "/admin/producers?status=pending", list: "ol" },
  { id: "row_tags", group: "approvals", href: "/admin/producers", list: "ul" },
  { id: "draft_invite", group: "approvals", href: "/admin/producers/new", list: "ol" },
  { id: "approved_actions", group: "approvals", href: "/admin/producers", list: "ul" },

  { id: "reports", group: "queues", href: "/admin/reports", list: "ol" },
  { id: "kashrut", group: "queues", href: "/admin/kashrut", list: "ol" },
  { id: "category_requests", group: "queues", href: "/admin/category-requests", list: "ol" },
  { id: "name_change_requests", group: "queues", href: "/admin/name-change-requests", list: "ol" },
  { id: "whatsapp_failures", group: "queues", href: "/admin/whatsapp-failures", list: "ul" },
  { id: "experiences", group: "queues", href: "/admin/experiences", list: "ol" },
  { id: "recipes", group: "queues", href: "/admin/recipes", list: "ol" },

  { id: "users", group: "more", href: "/admin/users", list: "ol" },
  { id: "reviews", group: "more", href: "/admin/reviews", list: "ol" },
  { id: "content", group: "more", href: "/admin/content", list: "ol" },
  { id: "outreach", group: "more", href: "/admin/outreach", list: "ol" },
  { id: "settings", group: "more", href: "/admin/settings", list: "ul" },
  { id: "analytics", group: "more", href: "/admin/analytics", list: "ul" },
  // Not in the sidebar since MEH-2359; this link is the way in.
  { id: "group_buys", group: "more", href: "/admin/group-buys", list: "ul" },
];

/** Lower-cased haystack for the search box: the question and every step. */
export function topicMatches(question, steps, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [question, ...steps].some((s) => s.toLowerCase().includes(q));
}
