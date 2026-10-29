/**
 * MEH-2582 self-QA — the Google-profile link in the /admin/producers approval
 * row, at 375 and 1440.
 *
 * Drives the REAL build (`next start`); only /api/** is synthetic (page.route
 * fixtures + a faked admin session), same harness as qa-meh2209. Captures:
 *   - not linked (checklist open)
 *   - after "חפשי בגוגל": 3 candidates, one under 20 reviews
 *   - after picking one: linked + "החלפה"
 *
 * Disposable probe, not a gate. The gate is __tests__/GooglePlaceLink.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = new URL("../../qa-artifacts/MEH-2582/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Optional: --chromium=/opt/pw-browsers/chromium in the CC sandbox, where the
// repo's Playwright version has no matching bundled browser.
const CHROMIUM_FLAG = "--chromium=";
const CHROMIUM = (process.argv.find((a) => a.startsWith(CHROMIUM_FLAG)) || "").slice(CHROMIUM_FLAG.length);

const PRODUCER = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "מאפיית הבוקר", city: "בנימינה", status: "pending", slug: null,
  ambassador: false, categories: [], requested_changes: null, google_place_id: null,
};
const CANDIDATES = [
  { place_id: "ChIJ_a", display_name: "מאפיית הבוקר", formatted_address: "הנדיב 12, בנימינה", user_rating_count: 57 },
  { place_id: "ChIJ_b", display_name: "מאפיית הבוקר — סניף זכרון", formatted_address: "זכרון יעקב", user_rating_count: 4 },
  { place_id: "ChIJ_c", display_name: "בוקר טוב קפה", formatted_address: "חדרה", user_rating_count: 212 },
];

const puts = [];
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};
const json = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function newPage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL" });
  await ctx.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    const m = route.request().method();
    if (m === "PUT" && p === `/admin/producers/${PRODUCER.id}/google-place-id`) {
      puts.push(JSON.parse(route.request().postData() || "{}"));
      return json(route, { google_place_id: "ChIJ_a" });
    }
    if (p === "/auth/me") return json(route, { id: "admin-1", email: "a@b.co", role: "admin", name: "מנהלת" });
    if (p === "/admin/producers") return json(route, [PRODUCER]);
    if (p === `/admin/producers/${PRODUCER.id}/google-place-candidates`) return json(route, { candidates: CANDIDATES });
    if (p === "/admin/checklist-items") return json(route, [{ id: "c1", label: "פרטים בסיסיים תקינים", hint: "שם, עיר, טלפון" }]);
    if (p.startsWith(`/admin/producers/${PRODUCER.id}/review-checks`)) return json(route, { producer_id: PRODUCER.id, checks: [] });
    return json(route, []);
  });
  return page;
}

async function run(browser, viewport, tag) {
  const page = await newPage(browser, viewport.width, viewport.height);
  await page.goto(`${BASE}/he/admin/producers`, { waitUntil: "domcontentloaded" });
  await page.getByText("מאפיית הבוקר").first().waitFor({ timeout: 20_000 });
  // CONTROL — the checklist toggle must exist, or every later null is void.
  const toggle = page.getByRole("button", { name: /רשימת בדיקה|בדיקה לפני אישור/ }).first();
  check(`${tag} control: checklist toggle visible`, await toggle.isVisible().catch(() => false));
  await toggle.click();

  const block = page.getByText("פרופיל Google").first();
  await block.waitFor({ timeout: 10_000 });
  await block.scrollIntoViewIfNeeded();
  check(`${tag} not-linked line`, await page.getByText("לא מקושר — בלי קישור, הדירוג מגוגל לא יופיע בדף העסק.").isVisible());
  await page.screenshot({ path: `${OUT}${tag}-1-not-linked.png`, fullPage: false });

  await page.getByRole("button", { name: "חפשי בגוגל" }).click();
  await page.getByText("בוקר טוב קפה").waitFor({ timeout: 10_000 });
  check(`${tag} 3 candidates`, (await page.getByText(/^\d+ ביקורות$/).count()) === 3);
  check(`${tag} one low-reviews flag`, (await page.getByText("פחות מ-20 ביקורות — השורה לא תוצג").count()) === 1);
  await page.getByText("בוקר טוב קפה").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}${tag}-2-candidates.png`, fullPage: false });

  await page.getByText("הנדיב 12, בנימינה").click();
  await page.getByText("מקושר ✓").waitFor({ timeout: 10_000 });
  check(`${tag} linked + replace`, await page.getByRole("button", { name: "החלפה" }).isVisible());
  await page.screenshot({ path: `${OUT}${tag}-3-linked.png`, fullPage: false });
  await page.context().close();
}

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
try {
  await run(browser, { width: 375, height: 812 }, "375");
  await run(browser, { width: 1440, height: 900 }, "1440");
} finally {
  await browser.close();
}
check("PUT carried only google_place_id", puts.length === 2 && puts.every((b) => JSON.stringify(b) === '{"google_place_id":"ChIJ_a"}'), JSON.stringify(puts));
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
