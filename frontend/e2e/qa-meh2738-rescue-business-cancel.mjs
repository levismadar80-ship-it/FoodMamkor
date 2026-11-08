/**
 * MEH-2738 self-QA — the business cancels today's bag:
 *   - dashboard: «לבטל את הסל» under the reservations list (placement A), the
 *     question with the many-reservations line, «כן, לבטל» → button gone
 *   - placement B (inside the publish box) rendered for comparison only, by
 *     moving the same node — it is not what the code ships
 *   - buyer page: «בית העסק ביטל את הסל של היום…» with no code on screen
 * Drives the REAL pages against `next start` on :3100 (built with
 * NEXT_PUBLIC_RESCUE_BAGS_ENABLED=true; the SSR producer read from the mock on
 * :8099), /api/** from fixtures. 375 + 1440. Chromium only.
 * Run manually:  node e2e/qa-meh2738-rescue-business-cancel.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2738";
const BASE = "http://localhost:3100";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium";
const OWNER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה", producer_id: "p-42", producer_kind: "producer" };
const BUYER = { id: 9, email: "demo-buyer@example.com", role: "user", name: "נועה" };
const PROFILE = { id: 42, name: "מאפיית שדה", status: "approved" };
const LOCS = [{ id: "loc1", location_precision: "exact", is_primary: true, city: "זכרון יעקב" }];
const PID = "3c3c3c3c-3333-4333-8333-333333333333";
const PRODUCER = {
  id: PID, name: "מאפיית שדה", slug: "sade", city: "זכרון יעקב", description: "לחמים ומאפים מקמח מלא",
  categories: [{ id: 2, name: "מאפים" }], images: [], lat: 32.5732, lng: 34.9519, locations: [],
  primary_contact_method: "whatsapp", phone: "0501110001", delivery_areas: [], avg_rating: null,
  reviews_count: 0, plan: "free", verification_tier: "declared",
};
const failures = [];
const check = (l, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}`);
  if (!ok) failures.push(l);
};

const H = 3_600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const offer = (status = "active") => ({
  id: "of1", qty_total: 5, qty_left: 2, status, leftover: 0, qty_donated: 0,
  pickup_start: iso(H), pickup_end: iso(2 * H),
});
const row = (id, code, status) => ({
  id, offer_id: "of1", qty: 1, pickup_code: code, status, handed_at: status === "handed" ? iso(-600_000) : null,
  cancelled_at: null, created_at: iso(-H), pickup_start: iso(H), pickup_end: iso(2 * H),
});

async function json(route, status, body) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function dashboard(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  let offerStatus = "active";
  let posted = null;
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (req.method() === "POST" && path === "/rescue/offers/of1/cancel") {
      posted = path;
      offerStatus = "cancelled";
      return json(route, 200, { ...offer("cancelled") });
    }
    if (path === "/auth/me") return json(route, 200, OWNER);
    if (path === "/producers/me") return json(route, 200, PROFILE);
    if (path === "/producers/me/locations") return json(route, 200, LOCS);
    if (path === "/producers/me/rescue/typical-items") return json(route, 200, { items: ["לחם"] });
    if (path === "/producers/me/rescue/offers") return json(route, 200, [offer(offerStatus)]);
    if (path === "/producers/me/rescue/orders") {
      const st = offerStatus === "cancelled" ? "cancelled" : "reserved";
      return json(route, 200, [row("o1", "0431", st), row("o2", "1187", st), row("o3", "5520", "handed")]);
    }
    return json(route, 200, []);
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await page.goto(`${BASE}/producer/dashboard/rescue`, { waitUntil: "load" });
  const btn = page.getByTestId("rescue-offer-cancel");
  await btn.waitFor({ timeout: 30_000 });
  return { ctx, page, btn, wasPosted: () => posted };
}

async function shot(page, el, name, width, { full = false } = {}) {
  if (el) await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`[${name}] no horizontal scroll`, sw <= width);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}

async function run(browser, label, width, height) {
  // A — shipped: under the reservations list.
  {
    const { ctx, page, btn, wasPosted } = await dashboard(browser, width, height);
    check(`[${label}] button text`, (await btn.innerText()) === "לבטל את הסל");
    const scope = await btn.evaluate((n) => n.closest("[data-notice-scope]")?.dataset.noticeScope);
    check(`[${label}] button is in its own box (A)`, scope === "cancel");
    const below = await page.evaluate(() => {
      const list = document.querySelector('[data-notice-scope="orders"]').getBoundingClientRect();
      const box = document.querySelector('[data-testid="rescue-offer-cancel-box"]').getBoundingClientRect();
      return box.top >= list.bottom;
    });
    check(`[${label}] A sits below the reservations list`, below);
    if (label === "375") await shot(page, null, `placement-A-full-${label}`, width, { full: true });
    await shot(page, btn, `placement-A-${label}`, width);

    await btn.click();
    const ask = page.getByTestId("rescue-offer-cancel-ask");
    await ask.waitFor();
    const text = await ask.innerText();
    check(`[${label}] ask title`, text.includes("לבטל את הסל של היום?"));
    check(`[${label}] ask counts the 2 open (not the handed one)`, text.includes("יש 2 שריונים פעילים. נשלח לכולם מייל שהסל בוטל."));
    await shot(page, ask, `cancel-ask-${label}`, width);

    await page.getByTestId("rescue-offer-cancel-yes").click();
    // The button is out of the DOM while the question is open, so wait for
    // the whole box: it goes once the reload says the bag is cancelled.
    await page.getByTestId("rescue-offer-cancel-box").waitFor({ state: "detached", timeout: 10_000 });
    check(`[${label}] posted to the offer's cancel`, wasPosted() === "/rescue/offers/of1/cancel");
    check(`[${label}] counter shows 0 reserved after the cancel`, (await page.getByTestId("rescue-counter-reserved").innerText()) === "0");
    await shot(page, page.locator('[data-notice-scope="orders"]'), `after-cancel-${label}`, width);
    await ctx.close();
  }
  // B — comparison only: the same node moved under the publish title.
  if (label === "375") {
    const { ctx, page } = await dashboard(browser, width, height);
    await page.evaluate(() => {
      const box = document.querySelector('[data-testid="rescue-offer-cancel-box"]');
      const pub = document.querySelector('[data-notice-scope="publish"]');
      pub.querySelector("h3").after(box);
    });
    await shot(page, null, `placement-B-full-${label}`, width, { full: true });
    await shot(page, page.getByTestId("rescue-offer-cancel"), `placement-B-${label}`, width);
    await ctx.close();
  }
  // Buyer page after the business cancelled.
  {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
    await ctx.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      if (!url.includes("/api/")) return route.continue();
      const path = new URL(url).pathname.replace(/^\/api/, "");
      if (path === "/auth/me") return json(route, 200, BUYER);
      if (path === `/producers/${PID}`) return json(route, 200, PRODUCER);
      if (path === "/rescue/orders/mine") {
        return json(route, 200, [{
          ...row("bbbbbbbb-2222-4222-8222-222222222222", "0431", "cancelled"),
          offer_id: "aaaaaaaa-1111-4111-8111-111111111111", user_id: "cccccccc-3333-4333-8333-333333333333",
          cancelled_at: iso(-60_000), price_agorot: 1500, cancel_until: iso(30 * 60_000),
          reviewed: false, producer_id: PID, cancelled_by_business: true,
        }]);
      }
      return json(route, 200, []); // the cancelled offer is off the public list
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("token", "qa-fixture-token");
      localStorage.setItem("cookieConsent", "all");
    });
    await page.goto(`${BASE}/producer/${PID}`, { waitUntil: "load" });
    const notice = page.getByTestId("rescue-business-cancelled");
    await notice.waitFor({ timeout: 30_000 });
    check(`[${label}] buyer line text`, (await notice.innerText()) === "בית העסק ביטל את הסל של היום, ולכן השריון שלכם בוטל. אין צורך להגיע.");
    check(`[${label}] no code on screen`, (await page.getByTestId("rescue-confirmation-code").count()) === 0);
    check(`[${label}] no reserve button`, (await page.getByTestId("rescue-reserve").count()) === 0);
    await shot(page, notice, `buyer-business-cancelled-${label}`, width);
    await ctx.close();
  }
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {});
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) await run(browser, label, w, h);
await browser.close();
if (failures.length) {
  console.log(`FAILURES: ${failures.length}`);
  process.exit(1);
}
console.log("ALL PASS");
