// @ts-check
/**
 * Module:   lib/whats-new
 * Purpose:  The «מה חדש» release list for business owners (MEH-3200): which
 *           versions have news for businesses, how many lines each has, and
 *           whether the owner has already seen the newest one.
 * Touches:  nothing — pure data and helpers. The seen key is read and written
 *           in hooks/useWhatsNew.js.
 * Does NOT: hold the text. Each line lives in messages/{he,en}.json under
 *           dashboard.producer.whats_new.releases.<key>.i0…iN, so the i18n
 *           tooling sees it and he/en stay in step (WhatsNew.test.jsx).
 * Related:  components/producer/WhatsNewCard.jsx (top of the dashboard home),
 *           components/producer/WhatsNewRow.jsx (fixed row above «צריכים עזרה?»),
 *           app/[locale]/producer/dashboard/whats-new/page.js (the archive),
 *           scripts/checks/whats-new-release-guard.sh (a release PR to main
 *           needs an entry newer than the last tag), docs/release/whats-new.md.
 * History:  MEH-3200 (creation, placement א׳+ג׳ and copy approved by Sapir 14/11).
 *
 * HOW AN ENTRY IS ADDED — at release time Claude lists the PRs merged since the
 * last tag whose body declares Launch tier א׳ or ב׳ (workflow.md «Launch tier»),
 * drafts 2–3 lines, Sapir approves them word for word, and they land here plus
 * in both message files. A release with nothing for businesses still gets an
 * entry, with `items: 0`: the guard then passes and nothing is shown.
 */

import { israelToday } from "@/lib/israel-date";

/**
 * @typedef {{ version: string, key: string, date: string, items: number, tools?: string[] }} WhatsNewRelease
 *   version — the release tag without the «v» ("1.5.1").
 *   key     — the messages key under whats_new.releases ("v1_5_1").
 *   date    — release day, YYYY-MM-DD (shown as month + year).
 *   items   — how many lines (i0…) the release has; 0 = nothing for businesses.
 *   tools   — optional: dashboard hrefs of tools this release ADDS. Each gets a
 *             «חדש» pill on its «כלים» tile, and the tab a dot, for
 *             NEW_TOOL_DAYS after `date` (MEH-3200 part 2).
 */

/** Newest first. @type {WhatsNewRelease[]} */
export const WHATS_NEW_RELEASES = [
  // 1.5.4 (16/11): hotfix — organizer page with a Hebrew address no longer
  // 404s (MEH-3340). A bug fix, nothing new to learn, so no lines (items: 0).
  { version: "1.5.4", key: "v1_5_4", date: "2026-11-16", items: 0 },
  // 1.5.3 (15/11): two founders named on the site (MEH-3323). Copy only —
  // nothing new for businesses to learn, so no lines (items: 0).
  { version: "1.5.3", key: "v1_5_3", date: "2026-11-15", items: 0 },
  // 1.5.2 (15/11): card badges off the photo + admin main-photo control.
  // Nothing new for businesses to learn, so no lines (items: 0).
  { version: "1.5.2", key: "v1_5_2", date: "2026-11-15", items: 0 },
  { version: "1.5.1", key: "v1_5_1", date: "2026-11-15", items: 3 },
];

export const WHATS_NEW_SEEN_KEY = "mehamakor.whats_new.seen";

/** How long a new tool keeps its «חדש» pill (approved 14/11). */
export const NEW_TOOL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dashboard hrefs that are "new" at `now`: listed in `tools` of a release
 * whose date is at most NEW_TOOL_DAYS Israel days ago (and not in the future).
 * Days are counted between Israel calendar dates (testing.md, MEH-2290): the
 * pill appears at 00:00 Israel time on the release day.
 * @param {number} now epoch ms
 * @param {WhatsNewRelease[]} [releases]
 * @returns {Set<string>}
 */
export function newToolHrefs(now, releases = WHATS_NEW_RELEASES) {
  const out = new Set();
  for (const r of releases) {
    // Both sides are UTC midnights of calendar dates → an exact day count.
    const age = Date.parse(`${israelToday(new Date(now))}T00:00:00Z`) - Date.parse(`${r.date}T00:00:00Z`);
    if (Number.isNaN(age) || age < 0 || age > NEW_TOOL_DAYS * DAY_MS) continue;
    for (const href of r.tools ?? []) out.add(href);
  }
  return out;
}

/**
 * Releases that have something to show, newest first.
 * @param {WhatsNewRelease[]} [releases]
 * @returns {WhatsNewRelease[]}
 */
export function visibleReleases(releases = WHATS_NEW_RELEASES) {
  return releases.filter((r) => r.items > 0);
}

/**
 * The newest release with something to show, or null.
 * @param {WhatsNewRelease[]} [releases]
 * @returns {WhatsNewRelease | null}
 */
export function latestRelease(releases = WHATS_NEW_RELEASES) {
  return visibleReleases(releases)[0] ?? null;
}

/**
 * Compare two "x.y.z" versions: negative when a < b.
 * @param {string} a
 * @param {string} b
 */
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Is there a release the owner has not seen yet?
 * @param {string | null} seen
 * @param {WhatsNewRelease[]} [releases]
 * @returns {WhatsNewRelease | null} that release, or null.
 */
export function unseenRelease(seen, releases = WHATS_NEW_RELEASES) {
  const latest = latestRelease(releases);
  if (!latest) return null;
  if (seen && compareVersions(seen, latest.version) >= 0) return null;
  return latest;
}
