/**
 * MEH-2349 self-QA — the admin reviews AI flag, driven in a real browser at
 * 1440 (the page is desktop-only by decision, MEH-2070).
 *
 * Drives the REAL page (a local `next start` build), never a copy: every
 * /api/** call is fulfilled by page.route with fixtures, and an admin session
 * is faked by seeding localStorage + mocking /auth/me.
 *
 * Disposable probe, not a gate. The gate is __tests__/AdminReviewsAiFlag.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

// CLI flag, not an env var (scripts/check_env_drift.sh — see qa-meh2209).
const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = new URL("../../qa-artifacts/MEH-2349/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const review = (n, stars, body, ai) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  producer_id: "11111111-1111-1111-1111-111111111111",
  producer_name: "מאפיית הבוקר",
  user_id: `22222222-2222-2222-2222-22222222222${n}`,
  user_name: `משתמשת ${n}`,
  user_email: `u${n}@example.com`,
  stars,
  body,
  is_hidden: false,
  created_at: "2026-10-25T09:00:00Z",
  source: "click",
  ai_moderation_status: ai,
});
const REVIEWS = [
  review(1, 1, "הלחם הגיע שרוף ואף אחד לא ענה לי בטלפון, חבל מאוד", "FLAGGED"),
  review(2, 5, "לחם מחמצת מעולה, נשאר טרי שלושה ימים", "APPROVED"),
  review(3, 2, "ביקורת ישנה מלפני העמודה", null),
];

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};
const json = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

// Pinned sandbox Chromium; `playwright install` is disabled here.
const PINNED = "/opt/pw-browsers/chromium";
const executablePath = existsSync(PINNED) ? PINNED : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await ctx.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
const page = await ctx.newPage();
await page.route("**/api/**", (route) => {
  const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
  if (p === "/auth/me") return json(route, { id: "admin-1", email: "a@b.co", role: "admin", name: "מנהלת" });
  if (p === "/admin/reviews") return json(route, REVIEWS);
  return json(route, []);
});

await page.goto(`${BASE}/he/admin/reviews`);
await page.getByTestId("review-ai-flag-filter").waitFor({ timeout: 20000 });

// Unfiltered: three rows, one badge.
const badges = page.getByTestId("review-ai-flag");
check("one badge across three reviews", (await badges.count()) === 1, `count=${await badges.count()}`);
check("badge copy", (await badges.first().innerText()).trim() === "סומן ע״י AI");
await page.screenshot({ path: `${OUT}1440-all.png`, fullPage: true });

// Filtered: only the flagged review remains.
await page.getByTestId("review-ai-flag-filter").check();
const bodies = await page.locator("body").innerText();
check("filter keeps the flagged review", bodies.includes("הלחם הגיע שרוף"));
check("filter drops the approved review", !bodies.includes("לחם מחמצת מעולה"));
check("filter drops the NULL review", !bodies.includes("ביקורת ישנה"));
await page.screenshot({ path: `${OUT}1440-flagged-only.png`, fullPage: true });

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
