/**
 * MEH-2495 — the drafts list's owner chip + «העתקת הודעה עם קישור», on the
 * REAL /he/admin/producers page in Chromium against `next start`, every
 * /api/** call fulfilled from fixtures (house pattern — qa-meh2070-admin-mobile.mjs).
 *
 * CONTROL runs first and fails loudly: the table must render the fixture rows
 * by name. Without it, "0 chips" and "the page never rendered" read the same.
 *
 * Captures, 375 and 1440: many drafts (waiting + claimed + one pending row),
 * then the copy click (toast), then 0 drafts. At 375 it also asserts the copy
 * button is on-screen (x >= 0) — the MEH-2070 actions-column question.
 *
 * Run: node e2e/qa-meh2495-draft-claim-actions.mjs   (next start -p 3100 first)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium";
const OUT = "../qa-artifacts/MEH-2495";
const ADMIN = { id: 1, email: "admin@example.com", role: "admin", name: "ספיר" };
const LINK = {
  url: "https://www.mehamakor.co.il/claim/eyJhbGciOi.qa.fixture",
  expires_at: "2026-11-11T10:00:00+02:00",
};

const base = (i, name, status, has_owner) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  name, slug: null, city: "זכרון יעקב", status, has_owner,
  images: [], categories: [],
  created_at: "2026-10-20T10:00:00Z", submitted_for_review_at: null,
  business_days_waiting: 2, ambassador: false, risk_score: null, risk_reasoning: null,
});
const MANY = [
  base(1, "הגבינות של מיכל", "draft", false),
  base(2, "מאפיית השכונה", "draft", true),
  base(3, "דבש מהגליל", "draft", false),
  base(4, "חוות הזיתים", "pending", true),
];

let failures = 0;
const check = (ok, label, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures += 1;
};

async function newCtx(browser, width, height, rows) {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: "he-IL",
    timezoneId: "Asia/Jerusalem", reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const calls = [];
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    calls.push(`${route.request().method()} ${path}`);
    const body =
      path === "/auth/me" ? ADMIN
      : path === "/admin/producers" ? rows
      : /\/admin\/producers\/[^/]+\/claim-link$/.test(path) ? LINK
      // List endpoints answer arrays, as the real API does: the pending
      // row's review checklist calls .filter on /admin/checklist-items, and a
      // `{}` here crashes the page into the error boundary (measured).
      : path === "/admin/checklist-items" || path === "/admin/producers/rejection-presets" ? []
      : path === "/admin/dashboard" ? { stats: { pending_moderation_count: 0, pending_kashrut_requests: 0 } }
      : {};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 300)));
  page.on("console", (m) => m.type() === "error" && console.log("CONSOLE:", m.text().slice(0, 300)));
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  return { ctx, page, calls };
}

async function run(browser, width, height, tag) {
  const { ctx, page, calls } = await newCtx(browser, width, height, MANY);
  await page.goto(`${BASE}/he/admin/producers?status=draft`, { waitUntil: "load" });
  await page.getByText("הגבינות של מיכל").first().waitFor({ timeout: 15000 }).catch(async (e) => {
    await page.screenshot({ path: `${OUT}/${tag}-DEBUG.png` });
    console.log(await page.locator("body").innerText().then((t) => t.slice(0, 300)));
    throw e;
  });

  // CONTROL — the fixture rows rendered.
  const named = await page.getByText("מאפיית השכונה").count();
  check(named > 0, `[${tag}] CONTROL fixture rows rendered`);
  if (!named) throw new Error("control failed — every reading below would be void");

  const chips = await page.locator('[data-testid="draft-owner-badge"]').allTextContents();
  check(chips.length === 3, `[${tag}] 3 owner chips (3 drafts, pending row excluded)`, JSON.stringify(chips));
  check(chips.filter((c) => c === "מחכה לבעלים").length === 2, `[${tag}] 2 × «מחכה לבעלים»`);
  check(chips.filter((c) => c === "נקלט, בהשלמה").length === 1, `[${tag}] 1 × «נקלט, בהשלמה»`);
  const buttons = page.locator('[data-testid="draft-copy-claim-message"]');
  check((await buttons.count()) === 2, `[${tag}] copy action on the 2 waiting drafts only`);
  const box = await buttons.first().boundingBox();
  check(!!box && box.x >= 0 && box.x + box.width <= width, `[${tag}] copy button on-screen`, JSON.stringify(box));
  await page.screenshot({ path: `${OUT}/${tag}-drafts-many.png`, fullPage: true });

  await buttons.first().click();
  await page.getByText("ההודעה הועתקה").first().waitFor({ timeout: 5000 });
  const pasted = await page.evaluate(() => navigator.clipboard.readText());
  check(pasted.startsWith("הכנתי לך את העמוד 🙂 זה הקישור: " + LINK.url), `[${tag}] clipboard holds the message + link`);
  check(pasted.endsWith("הקישור בתוקף 14 יום."), `[${tag}] clipboard holds the second line`);
  check(calls.some((c) => c.endsWith("/00000000-0000-4000-8000-000000000001/claim-link")), `[${tag}] minted for row 1`);
  await page.screenshot({ path: `${OUT}/${tag}-copied-toast.png`, fullPage: false });
  await ctx.close();

  const empty = await newCtx(browser, width, height, []);
  await empty.page.goto(`${BASE}/he/admin/producers?status=draft`, { waitUntil: "load" });
  await empty.page.getByText("אין בתי עסק להצגה").first().waitFor({ timeout: 15000 });
  check((await empty.page.locator('[data-testid="draft-owner-badge"]').count()) === 0, `[${tag}] 0 drafts → no chips`);
  await empty.page.screenshot({ path: `${OUT}/${tag}-drafts-empty.png`, fullPage: false });
  await empty.ctx.close();
}

// FINDER #13 (adversarial round 1): the manual-copy box must not push the
// actions column off-screen at 375 (the producers table keeps its columns —
// MEH-2070). The clipboard is made to refuse, so the box opens.
async function manualBox(browser, width, height, tag) {
  const { ctx, page } = await newCtx(browser, width, height, MANY);
  await page.addInitScript(() => {
    navigator.clipboard.write = () => Promise.reject(new DOMException("refused", "NotAllowedError"));
  });
  await page.goto(`${BASE}/he/admin/producers?status=draft`, { waitUntil: "load" });
  await page.getByText("הגבינות של מיכל").first().waitFor({ timeout: 15000 });
  await page.locator('[data-testid="draft-copy-claim-message"]').first().click();
  const box = page.locator('[data-testid="draft-claim-message-manual"]');
  await box.waitFor({ timeout: 5000 });
  const b = await box.boundingBox();
  check(!!b && b.x >= 0 && b.x + b.width <= width, `[${tag}] manual box on-screen`, JSON.stringify(b));
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollW <= width, `[${tag}] no page-level sideways scroll with the box open`, `scrollWidth=${scrollW}`);
  check(await box.evaluate((el) => el === document.activeElement), `[${tag}] box focused`);
  check((await page.locator('[data-testid="draft-claim-copy-failed"]').count()) === 1, `[${tag}] alert line shown`);
  await page.screenshot({ path: `${OUT}/${tag}-manual-box.png`, fullPage: true });
  await ctx.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  await run(browser, 375, 812, "375");
  await run(browser, 1440, 900, "1440");
  await manualBox(browser, 375, 812, "375");
  await manualBox(browser, 1440, 900, "1440");
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
