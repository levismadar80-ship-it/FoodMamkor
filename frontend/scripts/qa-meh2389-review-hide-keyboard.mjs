/**
 * MEH-2389 self-QA — /admin/reviews at 1440 (desktop-only, MEH-2070), in a
 * real Chromium against a local `next start` build. Two things jsdom cannot
 * show: keyboard focus while a hide is in flight (Chromium blurs a `disabled`
 * button; the button is now aria-disabled), and the "deleted elsewhere" 404
 * recognised by its `code`.
 *
 * Every /api/** call is fulfilled by page.route; the admin session is faked.
 * Disposable probe, not a gate. The gate is __tests__/AdminReviewsHide.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// CLI flag, not an env var (scripts/check_env_drift.sh — see qa-meh2209).
const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = fileURLToPath(new URL("../../qa-artifacts/MEH-2389/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const review = (n, body, hidden, ai) => ({
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
});
const REVIEWS = [
  review(1, "הלחם הגיע שרוף ואף אחד לא ענה לי בטלפון", true, "FLAGGED"),
  review(2, "לחם מחמצת מעולה, נשאר טרי שלושה ימים", false, "APPROVED"),
  review(3, "עוגיות טובות, קצת מתוקות לטעמי", false, "APPROVED"),
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
let release = null;
await page.route("**/api/**", async (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname.replace(/^\/api/, "");
  if (req.method() === "PUT") {
    puts.push(path);
    if (path.includes(REVIEWS[2].id)) {
      return json(route, 404, { detail: { code: "review_not_found", message: "ביקורת לא נמצאה" } });
    }
    // Hold review 2's hide until the probe has looked at focus mid-flight.
    await new Promise((res) => { release = res; });
    return json(route, 200, { detail: "ok" });
  }
  if (path === "/auth/me") return json(route, 200, { id: "admin-1", email: "a@b.co", role: "admin", name: "מנהלת" });
  if (path === "/admin/reviews") return json(route, 200, REVIEWS);
  return json(route, 200, []);
});

await page.goto(`${BASE}/he/admin/reviews`);
await page.getByTestId("review-body").first().waitFor({ timeout: 20000 });

// Both tags on review 1 (hidden + AI-flagged) in one cell.
const row1 = page.locator("tr", { hasText: "הלחם הגיע שרוף" });
check("review 1 shows the hidden tag", (await row1.getByTestId("review-hidden-tag").count()) === 1);
check("review 1 shows the AI tag", (await row1.getByTestId("review-ai-flag").count()) === 1);

// Keyboard: focus the hide button of review 2 and press Enter.
const row2 = page.locator("tr", { hasText: "לחם מחמצת מעולה" });
const btn2 = row2.getByTestId("review-hide");
await btn2.focus();
await page.keyboard.press("Enter");
// In flight = the button is blocked, either way (`disabled` before MEH-2389),
// so the focus check below also runs — and fails — against the old build.
await page.waitForFunction(() =>
  [...document.querySelectorAll('[data-testid="review-hide"]')].some(
    (b) => b.disabled || b.getAttribute("aria-disabled") === "true",
  ),
);
const midFlight = await page.evaluate(() => ({
  tag: document.activeElement?.tagName,
  testid: document.activeElement?.getAttribute("data-testid"),
  ariaDisabled: document.activeElement?.getAttribute("aria-disabled"),
}));
check("focus stays on the button while the hide runs", midFlight.tag === "BUTTON" && midFlight.testid === "review-hide", JSON.stringify(midFlight));
check("the focused button is aria-disabled", midFlight.ariaDisabled === "true");
await page.keyboard.press("Enter");
await page.screenshot({ path: `${OUT}1440-in-flight.png`, fullPage: true });
release();
await row2.getByTestId("review-hidden-tag").waitFor({ timeout: 5000 });
check("a second Enter mid-flight sent no second PUT", puts.length === 1, `puts=${puts.length}`);
const after = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
check("focus is on the row's button after the flip", after === "review-unhide", after);

// Deleted elsewhere: review 3's hide answers 404 with the code.
await page.locator("tr", { hasText: "עוגיות טובות" }).getByTestId("review-hide").click();
await page.locator("tr", { hasText: "עוגיות טובות" }).waitFor({ state: "detached", timeout: 5000 });
check("404 with code removed review 3", (await page.locator("tr", { hasText: "עוגיות טובות" }).count()) === 0);
check("toast shows the server message", (await page.getByText("ביקורת לא נמצאה").count()) >= 1);
await page.screenshot({ path: `${OUT}1440-after.png`, fullPage: true });

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
