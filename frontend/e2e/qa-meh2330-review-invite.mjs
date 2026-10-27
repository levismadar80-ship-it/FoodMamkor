/**
 * MEH-2330 (MEH-1428 chunk 2) self-QA — the "request a review" link, both ends.
 *
 * Drives the REAL pages in Chromium against `next start` built from THIS
 * branch, with every /api/** call fulfilled in-page. Staging cannot show this
 * diff (not deployed there), and the producer fixture is the shared VRT one.
 *
 * What it proves, in order (each line prints PASS/FAIL):
 *   0. CONTROL — the same consumer on the same page WITHOUT ?rt= gets no write
 *      CTA. If this fails, every PASS below is void: the gate was open anyway.
 *   1. with ?rt= the write CTA is there, with no WhatsApp click on record
 *   2. the submitted POST body carries `review_token` = the link's token
 *   2b. the slug link the backend actually mints (/p/{slug}?rt=) keeps the token
 *      through the /p/[slug] → /[slug] redirect, and still unlocks the form
 *   3. tools tab: the card renders the approved copy, and Copy puts EXACTLY the
 *      minted URL on the clipboard
 * Screenshots: open review form + the dashboard card, at 375 and 1440.
 *
 * The producer page also fetches GET /producers/{id} SERVER-side (page.js:39),
 * which page.route cannot see — so the harness serves that one call itself on
 * :8000, the API_URL the build is made with (NEXT_PUBLIC_API_URL=http://localhost:8000).
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2330-review-invite.mjs
 * REUSES: e2e/qa-meh1875-order-window-schedule.mjs (fixture-route + capture shape).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const OUT = "../qa-artifacts/MEH-2330";
// Hard-coded, not env-driven: the env-drift gate treats any process.env read as an undeclared var.
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium";
const TOKEN = "qa-invite-token.not-a-real-jwt";

const producer = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "visual", "fixtures", "producer-detail.json"), "utf8"),
);
const LINK = `https://mehamakor.co.il/producer/${producer.id}?rt=${TOKEN}`;
const CONSUMER = { id: "c-1", email: "c@example.com", role: "consumer", name: "לקוחה", producer_id: null, email_verified: true };
const OWNER = { id: "o-1", email: "o@example.com", role: "producer", name: "בעלת העסק", producer_id: producer.id, email_verified: true };

fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
};

async function newCtx(browser, width, user) {
  const ctx = await browser.newContext({
    locale: "he-IL",
    viewport: { width, height: width < 500 ? 812 : 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("cookieConsent", "all");
    localStorage.setItem("token", "qa-session");
  });
  const posted = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const p = new URL(url).pathname.replace(/^\/api/, "");
    if (req.method() === "POST" && p.endsWith("/reviews")) {
      posted.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "r-new", producer_id: producer.id, user_id: user.id, user_name: user.name, stars: 5, body: "x", created_at: "2026-10-25T21:00:00" }),
      });
    }
    const body =
      p === "/auth/me" ? user
      : p === "/producers/me/dashboard" ? { producer: { id: producer.id, name: producer.name, status: "approved" }, favorites_count: 0, whatsapp_clicks_week: 0 }
      : p === "/producers/me/review-link" ? { url: LINK }
      : p === "/producers/me" ? { ...producer, status: "approved" }
      : /^\/producers\/[^/]+$/.test(p) || p.startsWith("/producers/by-slug/") ? producer
      : p.endsWith("/reviews") ? { reviews: [], total: 0, page: 1, pages: 1 }
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { ctx, posted };
}

async function gotoReviews(page, query) {
  // query === null → stay on the page already loaded (the slug route).
  if (query !== null) await page.goto(`${BASE}/producer/${producer.id}${query}`);
  // `#reviews` is a zero-height scroll anchor (never "visible"), so wait for it
  // to be attached and scroll it in; ReviewsSection lazy-loads on intersection.
  const anchor = page.locator("#reviews").first();
  await anchor.waitFor({ state: "attached", timeout: 20_000 });
  await anchor.evaluate((el) => el.scrollIntoView({ block: "start" }));
  // The section's own copy proves it rendered — a capture of an unmounted
  // section would otherwise read as "gated" in the control.
  await page.getByText("החוויה שלך").or(page.getByText("עדיין אין ביקורות", { exact: false })).or(page.getByRole("button", { name: "כתבו ביקורת" })).first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

// Server-side fixture for the SSR producer fetch; every other path is [].
const ssr = http
  .createServer((req, res) => {
    const p = req.url.split("?")[0];
    const body = /^\/producers\/[^/]+$/.test(p) || p.startsWith("/producers/by-slug/") ? producer : [];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  })
  .listen(8000);

const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});

for (const width of [375, 1440]) {
  // 0. control — no token, no click → gated.
  {
    const { ctx } = await newCtx(browser, width, CONSUMER);
    const page = await ctx.newPage();
    await gotoReviews(page, "");
    const n = await page.getByRole("button", { name: "כתבו ביקורת" }).count();
    // && not ||: "no CTA" only means "gated" if the section actually rendered.
    const rendered = await page.getByText("עדיין אין ביקורות כאן.", { exact: false }).count();
    check(rendered > 0 && n === 0, `@${width} CONTROL: no ?rt= → section rendered (${rendered}) and no write CTA (count ${n})`);
    await ctx.close();
  }
  // 1+2. with the link.
  {
    const { ctx, posted } = await newCtx(browser, width, CONSUMER);
    const page = await ctx.newPage();
    await gotoReviews(page, `?rt=${TOKEN}`);
    const cta = page.getByRole("button", { name: "כתבו ביקורת" });
    check((await cta.count()) === 1, `@${width} ?rt= → write CTA shown with no WhatsApp click`);
    await cta.click();
    await page.locator("#reviews form").getByRole("button").nth(4).click(); // 5th star
    await page.locator("#review-body").fill("מוצרים טעימים מאוד, ממליצה בחום");
    await page.locator("#reviews form").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/review-form-open-${width}.png` });
    await page.getByRole("button", { name: "פרסמו ביקורת" }).click();
    await page.waitForTimeout(800);
    check(posted.length === 1 && posted[0].review_token === TOKEN, `@${width} POST body carries review_token (${JSON.stringify(posted[0] || null)})`);
    await ctx.close();
  }
  // 2b. the vanity link, through the redirect stub.
  {
    const { ctx } = await newCtx(browser, width, CONSUMER);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/p/${producer.slug}?rt=${TOKEN}`);
    await page.waitForURL((u) => !u.pathname.startsWith("/p/"), { timeout: 20_000 });
    const landed = new URL(page.url());
    check(
      landed.pathname === `/${producer.slug}` && landed.searchParams.get("rt") === TOKEN,
      `@${width} /p/{slug}?rt= → ${landed.pathname}${landed.search} keeps the token`,
    );
    await gotoReviews(page, null);
    const n = await page.getByRole("button", { name: "כתבו ביקורת" }).count();
    check(n === 1, `@${width} slug route: write CTA shown (count ${n})`);
    await ctx.close();
  }
  // 3. owner, tools tab.
  {
    const { ctx } = await newCtx(browser, width, OWNER);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/producer/dashboard/tools`);
    const card = page.getByTestId("request-review-card");
    await card.waitFor({ timeout: 20_000 });
    const text = await card.innerText();
    check(
      text.includes("בקשו ביקורת מלקוחה") &&
        text.includes("שלחו את הקישור בשיחת הוואטסאפ עם לקוחה — היא תוכל להשאיר ביקורת מאומתת.") &&
        text.includes("שלחו לכל לקוחה שקנתה — לא רק למי שבטוח תפרגן. ככה הביקורות נשארות אמינות."),
      `@${width} card renders the approved copy verbatim`,
    );
    const btn = page.getByTestId("request-review-copy");
    await btn.waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="request-review-copy"]').disabled);
    await card.scrollIntoViewIfNeeded();
    await btn.click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(clip === LINK, `@${width} clipboard holds exactly the minted URL`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/dashboard-card-${width}.png` });
    await ctx.close();
  }
}

await browser.close();
ssr.close();
console.log(failures ? `${failures} FAILED` : "ALL PASS");
process.exit(failures ? 1 : 0);
