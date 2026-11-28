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
  // 1.5.22 (28/11): the night train of 27-28/11 (orders, delivery, banners,
  // staging fixes). Nothing in docs/release/whats-new-pending.md, so items: 0;
  // business-facing copy changes ride in their own screens. Sapir's go for
  // this version: 27/11 23:13Z («חייבת לעלות גרסה עד הבוקר»).
  { version: "1.5.22", key: "v1_5_22", date: "2026-11-28", items: 0 },
  // 1.5.21 (27/11): three lines for businesses, moved from
  // docs/release/whats-new-pending.md: «מה יש השבוע» (#5423), how far ahead
  // each product must be ordered (#5424, MEH-3932), repeat weekly orders
  // (#5427, MEH-3933). The pending line for daily stock shipped in 1.5.18
  // already. Copy checked by the release thread under Sapir's standing
  // approval (26/11 23:15) and her go for this version (27/11 16:38Z).
  { version: "1.5.21", key: "v1_5_21", date: "2026-11-27", items: 3 },
  // 1.5.20 (27/11): hotfix to main, #5436 cherry-picked (MEH-3942) — admin
  // route to set or clear a product's price on any business. Admin-only, so
  // nothing new for businesses: items: 0. Sapir chose the hotfix 27/11 14:16Z.
  { version: "1.5.20", key: "v1_5_20", date: "2026-11-27", items: 0 },
  // 1.5.19 (27/11): hotfix to main, #5429 — /map list failed when a category
  // has no emoji. Nothing new for businesses, so items: 0 (docs/release/
  // whats-new.md: a hotfix adds a patch entry with items: 0).
  { version: "1.5.19", key: "v1_5_19", date: "2026-11-27", items: 0 },
  // 1.5.18 (27/11): one line for businesses, moved from
  // docs/release/whats-new-pending.md: daily stock per product with «נשארו N»
  // and «מה להכין» (#5420, MEH-3930). The rest of 1.5.18 is layout fixes,
  // emails, admin and tests. Copy checked by the release thread under Sapir's
  // standing approval of new UI copy (20/11) and her go for 1.5.18 (27/11).
  { version: "1.5.18", key: "v1_5_18", date: "2026-11-27", items: 1 },
  // 1.5.17 (27/11): four lines for businesses. Two moved here from
  // docs/release/whats-new-pending.md (experiences course #5383, owner
  // assistant #5387); «בתיאום מראש» as the owner's own answer (#5412,
  // MEH-2447); the business's own prepay link and «סמן כשולם» on surprise
  // bags and group buys (#5379, #5385). Copy checked by the release thread
  // under Sapir's standing approval of 26/11 23:15 («מאשרת מה שתחליט»).
  { version: "1.5.17", key: "v1_5_17", date: "2026-11-27", items: 4 },
  // 1.5.16 (26/11): pasting a list of delivery cities (#5353) improves an
  // existing field; the admin events panel (#5356) is for the team, not for
  // businesses; the rest is tests and docs. Nothing new for businesses, so
  // items: 0.
  { version: "1.5.16", key: "v1_5_16", date: "2026-11-26", items: 0 },
  // 1.5.15 (25/11): one line for businesses, staff who handle only orders
  // (#5317, MEH-3526), approved word for word by Sapir on the release
  // thread's decision card on 25/11. The rest is the map, the home page, the
  // email events, refactors and tests.
  { version: "1.5.15", key: "v1_5_15", date: "2026-11-25", items: 1 },
  // 1.5.14 (24/11): seven lines approved word for word by Sapir in the
  // release thread («מאשרת», 24/11 21:29): order-form preview, AI drafts from
  // text, tomorrow's surprise bags, the closed-day warning, review requests,
  // «שיתוף», and the «בישול לפי הזמנה» category. i7, the weekly surprise-bag
  // schedule (MEH-3703), moved here from docs/release/whats-new-pending.md and
  // approved word for word by Sapir on 25/11.
  { version: "1.5.14", key: "v1_5_14", date: "2026-11-24", items: 8 },
  // 1.5.13 (23/11): the self-purchase block (#5164, MEH-3691) fixes an
  // existing tool rather than adding one; the rest is tests, CI and
  // dependency bumps. Nothing for businesses, so items: 0.
  { version: "1.5.13", key: "v1_5_13", date: "2026-11-23", items: 0 },
  // 1.5.12 (23/11): every PR in this release is launch tier ג׳ (internal) or a
  // dependency bump — the unified «צרו קשר» sheet (#5175) and the shorter
  // signup licensing text (#5174) change no business tool. Nothing for
  // businesses, so items: 0 (docs/release/whats-new.md step 5; not shown).
  { version: "1.5.12", key: "v1_5_12", date: "2026-11-23", items: 0 },
  // 1.5.11 (21/11): delivery time, own minimum and per-zone order cutoff,
  // nationwide zones (MEH-3511); pickup days and cutoff per pickup point
  // (MEH-3512); business-page assistant suggestions and zone/group/workshop
  // facts (MEH-3505, MEH-3510); orders-through-the-site line on the dashboard
  // home (MEH-3194). Copy under Sapir's standing approval (20/11 13:54Z).
  // i5: the Google profile tool (google_profile, from whats-new-pending.md),
  // approved by Sapir 22/11 «מאשרת הכל».
  { version: "1.5.11", key: "v1_5_11", date: "2026-11-21", items: 6, tools: ["/producer/dashboard/google-profile"] },
  // 1.5.10 (20/11): delivery zones (MEH-3484), next delivery date (MEH-3485),
  // business-page chat (MEH-3489), free-text page draft (MEH-3483), product
  // groups and description suggestion, AI review reply (MEH-3480), «מארז»
  // price unit. Lines shown to Sapir 20/11 17:18Z; she approved («מאשרת»).
  { version: "1.5.10", key: "v1_5_10", date: "2026-11-20", items: 7 },
  // 1.5.9 (20/11): weekly summary email with an owner on/off switch (MEH-3212);
  // allergens emphasised in the ingredients list (MEH-3443); shorter business
  // page FAQ, closed by default (MEH-3460). Lines approved by Sapir word for word.
  { version: "1.5.9", key: "v1_5_9", date: "2026-11-20", items: 3 },
  // 1.5.8 (19/11): product price unit, optional price, allergens, storage
  // (MEH-2936, MEH-2924, MEH-3439/3442/3444/3445, tier ב׳); recurring workshop
  // dates (MEH-3441/3447); duplicate event/experience, group buy from a product
  // (MEH-3438). Lines approved by Sapir word for word.
  { version: "1.5.8", key: "v1_5_8", date: "2026-11-19", items: 3 },
  // 1.5.7 (19/11): AI menu import in the products card (MEH-3430, #4833,
  // Launch tier ב׳). Line approved by Sapir word for word.
  { version: "1.5.7", key: "v1_5_7", date: "2026-11-19", items: 1 },
  // 1.5.6 (18/11): admin draft preview link + publish with consent (MEH-3377),
  // security and stability fixes. The owner-facing pieces (monthly freshness
  // email, surprise-bag email) sit behind flags that default to off, so
  // nothing new for businesses to learn yet (items: 0).
  { version: "1.5.6", key: "v1_5_6", date: "2026-11-18", items: 0 },
  // 1.5.5 (16/11): hotfix — map tiles send a Referer so OSM stops answering
  // 403 «Access blocked» (MEH-3077). A bug fix, nothing to learn (items: 0).
  { version: "1.5.5", key: "v1_5_5", date: "2026-11-16", items: 0 },
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
