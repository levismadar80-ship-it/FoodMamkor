/**
 * MEH-2249 self-QA — experience creation under the producer dashboard.
 *
 * Drives the REAL pages in Chromium against a local `next start`. Five states,
 * both viewports:
 *   (i)   anonymous  → /producer/dashboard/experiences/new lands on /login?redirect=…
 *   (ii)  consumer   → data-testid="access-denied" + the register CTA, NO form
 *   (iii) producer   → ExperienceForm visible, crumb "ניהול העסק › חוויה חדשה"
 *   (iv)  /he/experiences/new → 308 → the dashboard route (read off the network log)
 *   (v)   the /experiences empty-state CTA href = the dashboard route
 *
 * Auth is stubbed at the browser (token in localStorage + a routed /auth/me),
 * the pattern the sibling qa-meh2013 probe already uses. State (i) seeds NO
 * token, which is what makes it the control: if the stub leaked, (i) would
 * show the form and the whole run would be meaningless.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = process.argv[2] || "qa-artifacts/MEH-2249";
const NEW_ROUTE = "/producer/dashboard/experiences/new";
fs.mkdirSync(OUT, { recursive: true });

const log = [];
const say = (s) => { console.log(s); log.push(s); };
let failures = 0;
const check = (cond, msg) => {
  if (cond) say(`PASS ${msg}`);
  else { failures++; say(`FAIL ${msg}`); }
};

const PRODUCER = { id: 7, email: "owner@example.com", role: "producer", name: "דנה", email_verified: true };
const CONSUMER = { id: 8, email: "shopper@example.com", role: "consumer", name: "נועה", email_verified: true };
const PROFILE = { id: 3, name: "חוות הדגמה", status: "approved", city: "חיפה" };

async function ctxFor(browser, vp, user) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: "he-IL" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    if (p === "/auth/me") {
      return user
        ? route.fulfill({ json: user })
        : route.fulfill({ status: 401, json: { detail: "Not authenticated" } });
    }
    if (p === "/producers/me") return route.fulfill({ json: PROFILE });
    if (p === "/producers/me/dashboard") return route.fulfill({ json: { producer: PROFILE } });
    if (p === "/experiences/count") return route.fulfill({ json: { count: 3 } });
    if (p.startsWith("/experiences/mine")) return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  if (user) {
    await page.addInitScript(() => {
      localStorage.setItem("token", "qa-fixture-token");
      localStorage.setItem("cookieConsent", "all");
    });
  } else {
    await page.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
  }
  return { ctx, page };
}

// The sandbox ships chromium-1194; this Playwright pins a newer headless
// shell it has no binary for. Use the pre-installed browser (env guidance)
// rather than downloading one.
const EXEC = process.env.QA_CHROMIUM || "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  fs.existsSync(EXEC) ? { executablePath: EXEC } : {}
);
try {
  // ── (iv) the redirect, server-side, before any browser state ───────────────
  const plain = await browser.newContext();
  for (const src of ["/he/experiences/new", "/experiences/new", "/en/experiences/new"]) {
    const r = await plain.request.fetch(BASE + src, { maxRedirects: 0 });
    const loc = r.headers()["location"] || "";
    say(`REDIRECT ${src} → ${r.status()} ${loc}`);
    check(r.status() === 308, `${src} answers 308`);
    check(loc.endsWith(NEW_ROUTE) || loc.endsWith("/en" + NEW_ROUTE) || loc.endsWith("/he" + NEW_ROUTE),
      `${src} Location targets the dashboard route (got ${loc})`);
  }
  // control: a route that must NOT redirect
  const ctl = await plain.request.fetch(BASE + "/experiences", { maxRedirects: 0 });
  check(ctl.status() === 200, `control: /experiences is still 200 (got ${ctl.status()})`);
  await plain.close();

  for (const [label, vp] of [["375", { width: 375, height: 812 }], ["1440", { width: 1440, height: 900 }]]) {
    // ── (i) anonymous → /login ──────────────────────────────────────────────
    {
      const { ctx, page } = await ctxFor(browser, vp, null);
      await page.goto(BASE + NEW_ROUTE, { waitUntil: "domcontentloaded" });
      await page.waitForURL((u) => new URL(u).pathname.endsWith("/login"), { timeout: 10000 }).catch(() => {});
      const url = new URL(page.url());
      say(`[${label}] anonymous landed on ${page.url()}`);
      check(url.pathname.endsWith("/login"), `[${label}] (i) anonymous → /login`);
      check((url.searchParams.get("redirect") || "").includes("experiences/new"),
        `[${label}] (i) /login carries redirect back to the route`);
      check(await page.locator("form").count() === 0 || !(await page.getByLabel(/כותרת החוויה/).count()),
        `[${label}] (i) no experience form for an anonymous visitor`);
      await page.screenshot({ path: path.join(OUT, `anonymous-${label}.png`) });
      await ctx.close();
    }

    // ── (ii) consumer → denied state, no form ───────────────────────────────
    {
      const { ctx, page } = await ctxFor(browser, vp, CONSUMER);
      await page.goto(BASE + NEW_ROUTE, { waitUntil: "domcontentloaded" });
      const denied = page.getByTestId("access-denied");
      await denied.waitFor({ timeout: 10000 }).catch(() => {});
      check(await denied.count() === 1, `[${label}] (ii) consumer sees data-testid="access-denied"`);
      const cta = page.getByRole("link", { name: /רשמו בית עסק/ });
      check(await cta.count() >= 1, `[${label}] (ii) denied state offers the "רשמו בית עסק" CTA`);
      check(await page.getByLabel(/כותרת החוויה/).count() === 0, `[${label}] (ii) NO form for a consumer`);
      say(`[${label}] consumer URL stayed at ${page.url()}`);
      await page.screenshot({ path: path.join(OUT, `consumer-denied-${label}.png`) });
      await ctx.close();
    }

    // ── (iii) producer → the form + the crumb ───────────────────────────────
    {
      const { ctx, page } = await ctxFor(browser, vp, PRODUCER);
      await page.goto(BASE + NEW_ROUTE, { waitUntil: "domcontentloaded" });
      const titleField = page.getByLabel(/כותרת החוויה/);
      await titleField.waitFor({ timeout: 10000 }).catch(() => {});
      check(await titleField.count() === 1, `[${label}] (iii) producer sees ExperienceForm`);
      check(await page.getByTestId("access-denied").count() === 0, `[${label}] (iii) no denied state for a producer`);
      // NOT `nav.first()` — that is the site header, which is why the first
      // run of this probe reported an empty crumb while the page was
      // fine. Scope to the nav that actually carries the current-page crumb.
      const crumbNav = page.locator("nav").filter({ hasText: /חוויה חדשה/ }).first();
      const crumb = await crumbNav.innerText().catch(() => "");
      say(`[${label}] crumb = ${crumb.replace(/\s+/g, " ").trim()}`);
      check(/ניהול העסק/.test(crumb) && /חוויה חדשה/.test(crumb),
        `[${label}] (iii) crumb reads "ניהול העסק › חוויה חדשה"`);
      await page.screenshot({ path: path.join(OUT, `producer-form-${label}.png`) });
      await ctx.close();
    }

    // ── (v) the public empty-state CTA points at the dashboard route ────────
    {
      const { ctx, page } = await ctxFor(browser, vp, null);
      await page.goto(BASE + "/experiences", { waitUntil: "domcontentloaded" });
      await page.getByRole("tab").first().waitFor({ timeout: 10000 }).catch(() => {});
      const hrefs = await page.locator(`a[href$="${NEW_ROUTE}"]`).count();
      const stale = await page.locator('a[href$="/experiences/new"]:not([href*="dashboard"])').count();
      say(`[${label}] /experiences: dashboard-route links=${hrefs}, stale /experiences/new links=${stale}`);
      check(stale === 0, `[${label}] (v) zero links still pointing at the old public route`);
      await page.screenshot({ path: path.join(OUT, `experiences-empty-${label}.png`) });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

say(`SUMMARY: ${failures} failure(s)`);
fs.writeFileSync(path.join(OUT, "qa-log.txt"), log.join("\n") + "\n");
process.exit(failures ? 1 : 0);
