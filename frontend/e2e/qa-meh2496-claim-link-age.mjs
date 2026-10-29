/**
 * MEH-2496 — «קישור נשלח ב-… · בתוקף עד …», «הקישור פג — צרו חדש» and
 * «ממתין 7+ ימים» on the REAL /he/admin/producers drafts list, Chromium on
 * `next start`, /api/** from fixtures (house pattern — qa-meh2495-…).
 *
 * Stamps are RELATIVE to the run's clock, so the frames stay true whenever it
 * runs: fresh (1 h ago), 8 days, 20 days (expired), never sent, and a claimed
 * draft with an old stamp (must show nothing). CONTROL first: the rows render.
 *
 * Run: node e2e/qa-meh2496-claim-link-age.mjs   (next start -p 3100 first)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium";
const OUT = "../qa-artifacts/MEH-2496";
const ADMIN = { id: 1, email: "admin@example.com", role: "admin", name: "ספיר" };
const LINK = { url: "https://www.mehamakor.co.il/claim/eyJhbGciOi.qa.fixture", expires_at: new Date(Date.now() + 14 * 24 * 3600e3).toISOString() };
const H = 60 * 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const base = (i, name, status, has_owner, claim_link_sent_at) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  name, slug: null, city: "זכרון יעקב", status, has_owner, claim_link_sent_at,
  images: [], categories: [],
  created_at: ago(30 * 24 * H), submitted_for_review_at: null,
  business_days_waiting: 2, risk_score: null, risk_reasoning: null,
});
const ROWS = [
  base(1, "הגבינות של מיכל", "draft", false, ago(1 * H)),
  base(2, "דבש מהגליל", "draft", false, ago(8 * 24 * H)),
  base(3, "מאפיית השכונה", "draft", false, ago(20 * 24 * H)),
  base(4, "חוות הזיתים", "draft", false, null),
  base(5, "שמן מהכפר", "draft", true, ago(20 * 24 * H)),
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
  const { ctx, page } = await newCtx(browser, width, height, ROWS);
  await page.goto(`${BASE}/he/admin/producers?status=draft`, { waitUntil: "load" });
  await page.getByText("הגבינות של מיכל").first().waitFor({ timeout: 15000 });
  const named = await page.getByText("שמן מהכפר").count();
  check(named > 0, `[${tag}] CONTROL fixture rows rendered`);
  if (!named) throw new Error("control failed — every reading below would be void");

  const ages = page.locator('[data-testid="draft-link-age"]');
  check((await ages.count()) === 3, `[${tag}] 3 age blocks (never-sent + claimed show none)`, String(await ages.count()));
  check((await page.locator('[data-testid="draft-link-expired"]').count()) === 1, `[${tag}] 1 × «הקישור פג — צרו חדש»`);
  check((await page.locator('[data-testid="draft-link-valid-until"]').count()) === 2, `[${tag}] 2 × «בתוקף עד»`);
  check((await page.locator('[data-testid="draft-waiting-7"]').count()) === 2, `[${tag}] 2 × «ממתין 7+ ימים» (8 d + 20 d)`);
  const sentText = await page.locator('[data-testid="draft-link-sent"]').first().textContent();
  check(/^קישור נשלח ב-\d{2}\.\d{2}\.\d{4}$/.test(sentText || ""), `[${tag}] sent line reads «קישור נשלח ב-dd.mm.yyyy»`, JSON.stringify(sentText));
  for (const testid of ["draft-link-age", "draft-waiting-7"]) {
    const b = await page.locator(`[data-testid="${testid}"]`).first().boundingBox();
    check(!!b && b.x >= 0 && b.x + b.width <= width, `[${tag}] ${testid} on-screen`, JSON.stringify(b));
  }
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollW <= width, `[${tag}] no page-level sideways scroll`, `scrollWidth=${scrollW}`);
  await page.screenshot({ path: `${OUT}/${tag}-drafts-link-age.png`, fullPage: true });
  await ctx.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  await run(browser, 375, 812, "375");
  await run(browser, 1440, 900, "1440");
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
