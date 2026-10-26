/**
 * MEH-2360 self-QA — hide / unhide on /admin/reviews, driven in a real browser
 * at 1440 (the page is desktop-only by decision, MEH-2070).
 *
 * Drives the REAL page (a local `next start` build), never a copy: every
 * /api/** call is fulfilled by page.route with fixtures, and an admin session
 * is faked by seeding localStorage + mocking /auth/me. The PUT handlers record
 * which endpoint the button actually hit.
 *
 * Disposable probe, not a gate. The gate is __tests__/AdminReviewsHide.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

// CLI flag, not an env var (scripts/check_env_drift.sh — see qa-meh2209).
const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = new URL("../../qa-artifacts/MEH-2360/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const review = (n, stars, body, hidden, ai = "APPROVED") => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  producer_id: "11111111-1111-1111-1111-111111111111",
  producer_name: "מאפיית הבוקר",
  user_id: `22222222-2222-2222-2222-22222222222${n}`,
  user_name: `משתמשת ${n}`,
  user_email: `u${n}@example.com`,
  stars,
  body,
  is_hidden: hidden,
  created_at: "2026-10-25T09:00:00Z",
  source: "click",
  ai_moderation_status: ai,
});
const REVIEWS = [
  review(1, 1, "הלחם הגיע שרוף ואף אחד לא ענה לי בטלפון, חבל מאוד", true, "FLAGGED"),
  review(2, 5, "לחם מחמצת מעולה, נשאר טרי שלושה ימים", false),
  review(3, 4, "עוגיות טובות, קצת מתוקות לטעמי", false),
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
const puts = [];
await page.route("**/api/**", (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname.replace(/^\/api/, "");
  if (req.method() === "PUT") {
    puts.push(p);
    return json(route, { detail: "ok" });
  }
  if (p === "/auth/me") return json(route, { id: "admin-1", email: "a@b.co", role: "admin", name: "מנהלת" });
  if (p === "/admin/reviews") return json(route, REVIEWS);
  return json(route, []);
});

await page.goto(`${BASE}/he/admin/reviews`);
await page.getByTestId("review-ai-flag-filter").waitFor({ timeout: 20000 });
// The filter renders before the list arrives; wait for a row, not the chrome.
await page.getByTestId("review-body").first().waitFor({ timeout: 20000 });

const tags = page.getByTestId("review-hidden-tag");
check("one hidden tag across three reviews", (await tags.count()) === 1, `count=${await tags.count()}`);
check("hidden tag copy", (await tags.first().innerText()).trim() === "מוסתרת");
check("one unhide, two hide", (await page.getByTestId("review-unhide").count()) === 1 &&
  (await page.getByTestId("review-hide").count()) === 2);
check("unhide copy", (await page.getByTestId("review-unhide").innerText()).trim() === "החזירי");
await page.screenshot({ path: `${OUT}1440-before.png`, fullPage: true });

// Hide review 2: its row flips in place, review 3 stays visible.
const row2 = page.locator("tr", { hasText: "לחם מחמצת מעולה" });
await row2.getByTestId("review-hide").click();
await row2.getByTestId("review-hidden-tag").waitFor({ timeout: 5000 });
check("hide hit PUT /hide for review 2", puts.at(-1) === `/admin/reviews/${REVIEWS[1].id}/hide`, puts.at(-1));
check("two hidden tags after hiding", (await tags.count()) === 2);
const row3 = page.locator("tr", { hasText: "עוגיות טובות" });
check("review 3 untouched", (await row3.getByTestId("review-hidden-tag").count()) === 0);

// Unhide review 1.
const row1 = page.locator("tr", { hasText: "הלחם הגיע שרוף" });
await row1.getByTestId("review-unhide").click();
await row1.getByTestId("review-hide").waitFor({ timeout: 5000 });
check("unhide hit PUT /unhide for review 1", puts.at(-1) === `/admin/reviews/${REVIEWS[0].id}/unhide`, puts.at(-1));
check("review 1 tag gone", (await row1.getByTestId("review-hidden-tag").count()) === 0);
await page.screenshot({ path: `${OUT}1440-after.png`, fullPage: true });

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
