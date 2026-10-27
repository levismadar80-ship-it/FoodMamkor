/**
 * MEH-2381 self-QA — /admin/reviews at 1440 (desktop-only, MEH-2070), in a
 * real Chromium against a local `next start` build. Checks the cell with all
 * three tags (hidden + edited after hidden + AI-flagged) lays out on one row
 * of chips, and that "keep hidden" clears the tag while the row stays hidden.
 *
 * Every /api/** call is fulfilled by page.route; the admin session is faked.
 * Disposable probe, not a gate. The gate is
 * __tests__/AdminReviewsEditedAfterHidden.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// CLI flag, not an env var (scripts/check_env_drift.sh — see qa-meh2209).
const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = fileURLToPath(new URL("../../qa-artifacts/MEH-2381/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const EDITED = "2026-10-27T07:40:00";
const review = (n, body, { hidden = false, ai = "APPROVED", edited = null } = {}) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  producer_id: "11111111-1111-1111-1111-111111111111",
  producer_name: "מאפיית הבוקר",
  user_id: `22222222-2222-2222-2222-22222222222${n}`,
  user_name: `משתמשת ${n}`,
  user_email: `u${n}@example.com`,
  stars: 4,
  body,
  is_hidden: hidden,
  created_at: "2026-10-25T09:00:00Z",
  source: "click",
  ai_moderation_status: ai,
  edited_after_hidden_at: edited,
});
const REVIEWS = [
  review(1, "הלחם הגיע שרוף ואף אחד לא ענה לי בטלפון", { hidden: true, ai: "FLAGGED", edited: EDITED }),
  review(2, "המשלוח איחר, אבל הלחם עצמו טוב", { hidden: true, edited: EDITED }),
  review(3, "ביקורת מוסתרת שלא נערכה", { hidden: true }),
  review(4, "לחם מחמצת מעולה, נשאר טרי שלושה ימים"),
];

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};
const json = (route, status, body) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const PINNED = "/opt/pw-browsers/chromium";
const executablePath = existsSync(PINNED) ? PINNED : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await ctx.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
const page = await ctx.newPage();
const puts = [];
await page.route("**/api/**", async (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname.replace(/^\/api/, "");
  if (req.method() === "PUT") {
    puts.push(path);
    return json(route, 200, { detail: "ok" });
  }
  if (path === "/auth/me") return json(route, 200, { id: "admin-1", email: "a@b.co", role: "admin", name: "מנהלת" });
  if (path === "/admin/reviews") return json(route, 200, REVIEWS);
  return json(route, 200, []);
});

await page.goto(`${BASE}/he/admin/reviews`);
await page.getByTestId("review-body").first().waitFor({ timeout: 20000 });

check("exactly two rows carry the edited tag", (await page.getByTestId("review-edited-after-hidden-tag").count()) === 2);
check("exactly two keep-hidden buttons", (await page.getByTestId("review-keep-hidden").count()) === 2);

const row1 = page.locator("tr", { hasText: "הלחם הגיע שרוף" });
const boxes = await Promise.all(
  ["review-hidden-tag", "review-edited-after-hidden-tag", "review-ai-flag"].map((id) =>
    row1.getByTestId(id).boundingBox(),
  ),
);
check("all three tags render in review 1", boxes.every(Boolean));
// Centres, ±2 px: the AI tag has no border, so its box is 2 px shorter.
const mids = boxes.map((b) => b.y + b.height / 2);
check("the three tags sit on one line at 1440", Math.max(...mids) - Math.min(...mids) <= 2, `mids=${mids.map(Math.round)}`);
const overlap = boxes.some((a, i) =>
  boxes.some((b, j) => i < j && a.x < b.x + b.width && b.x < a.x + a.width),
);
check("no two tags overlap", !overlap);
check("tag text", (await row1.getByTestId("review-edited-after-hidden-tag").innerText()) === "נערכה אחרי שהוסתרה");
await page.screenshot({ path: `${OUT}1440-before.png`, fullPage: true });

const row2 = page.locator("tr", { hasText: "המשלוח איחר" });
// Keyboard: the button removes itself, so focus must land somewhere useful.
await row2.getByTestId("review-keep-hidden").focus();
await page.keyboard.press("Enter");
await row2.getByTestId("review-edited-after-hidden-tag").waitFor({ state: "detached", timeout: 5000 });
const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
check("focus moves to the row's unhide button", focused === "review-unhide", String(focused));
check("keep-hidden sent PUT /hide for review 2", puts.length === 1 && puts[0].endsWith(`${REVIEWS[1].id}/hide`), puts.join(","));
check("review 2 is still hidden", (await row2.getByTestId("review-hidden-tag").count()) === 1);
check("review 2 still offers unhide", (await row2.getByTestId("review-unhide").count()) === 1);
check("review 1 keeps its tag", (await row1.getByTestId("review-edited-after-hidden-tag").count()) === 1);
await page.screenshot({ path: `${OUT}1440-after-keep-hidden.png`, fullPage: true });

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
