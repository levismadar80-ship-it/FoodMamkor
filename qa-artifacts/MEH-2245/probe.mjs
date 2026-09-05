// MEH-2245 self-QA probe — route-as-tab. Runs against `next start` on :3000
// with the API stubbed at the browser (no backend in the sandbox).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const OUT = process.argv[2] || "qa-artifacts/MEH-2245";
fs.mkdirSync(OUT, { recursive: true });
const log = [];
const say = (s) => { console.log(s); log.push(s); };
let failures = 0;
const check = (cond, msg) => { if (cond) say(`PASS ${msg}`); else { failures++; say(`FAIL ${msg}`); } };

const ROW = (id, kind) => ({
  id, title: kind === "exp" ? `סדנת בישול ${id}` : `אירוע קטיף ${id}`,
  event_date: "2026-10-10", event_time: "10:00:00", city: "חיפה",
  category: kind === "exp" ? "בישול" : "קטיף", description: "תיאור קצר לצילום.",
  producer_name: "חוות הדגמה", host: { name: "בית עסק לדוגמה" },
  price: 0, price_per_person: 120,
});

async function stub(page) {
  await page.route("**/api/**", (route) => {
    const u = route.request().url();
    if (/\/api\/experiences\/count/.test(u)) return route.fulfill({ json: { count: 3 } });
    if (/\/api\/experiences(\?|$)/.test(u)) return route.fulfill({ json: [ROW(1, "exp"), ROW(2, "exp")] });
    if (/\/api\/events(\?|$)/.test(u)) return route.fulfill({ json: [ROW(1, "ev"), ROW(2, "ev")] });
    return route.fulfill({ status: 200, json: [] });
  });
}

const SEO_TITLE = "חוויות וסדנאות אוכל אצל בתי עסק מקומיים | מהמקור";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  // --- 1. redirect (server-side, no browser) ---
  const ctx0 = await browser.newContext();
  for (const src of ["/events?tab=experiences", "/he/events?tab=experiences", "/en/events?tab=experiences", "/events?tab=experiences&city=%D7%97%D7%99%D7%A4%D7%94"]) {
    const r = await ctx0.request.fetch(BASE + src, { maxRedirects: 0 });
    const loc = r.headers()["location"] || "";
    say(`REDIRECT ${src} -> ${r.status()} ${loc}`);
    check(r.status() === 308, `${src} answers 308`);
    check(/\/experiences/.test(loc), `${src} location targets /experiences`);
    say(`NOTE ${src}: Location ${/tab=/.test(loc) ? "CARRIES" : "does not carry"} ?tab= (Next forwards the request query on redirect)`);
  }
  // control: a plain /events must NOT redirect
  const r0 = await ctx0.request.fetch(BASE + "/events", { maxRedirects: 0 });
  check(r0.status() === 200, `control: /events without ?tab= is 200 (got ${r0.status()})`);
  const r1 = await ctx0.request.fetch(BASE + "/events?tab=events", { maxRedirects: 0 });
  check(r1.status() === 200, `control: /events?tab=events is 200 (got ${r1.status()})`);
  await ctx0.close();

  // --- 2. browser flows at two viewports ---
  for (const [label, vp] of [["375", { width: 375, height: 812 }], ["1440", { width: 1440, height: 900 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: "he-IL" });
    const page = await ctx.newPage();
    await stub(page);

    // /events — events tab active
    await page.goto(BASE + "/events", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab").first().waitFor();
    const tabs = page.getByRole("tablist").first().getByRole("tab");
    check((await tabs.count()) === 2, `[${label}] /events renders both tabs (MEH-1865)`);
    check((await tabs.nth(0).getAttribute("aria-selected")) === "true", `[${label}] /events: events tab is selected`);
    await page.locator("h3").first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: path.join(OUT, `events-${label}.png`), fullPage: false });

    // click experiences tab → URL flips to /experiences, no ?tab=
    await tabs.nth(1).click();
    await page.waitForURL((u) => new URL(u).pathname.endsWith("/experiences"), { timeout: 10000 });
    say(`[${label}] after tab click from /events: ${page.url()}`);
    check(new URL(page.url()).pathname === "/experiences", `[${label}] tab click navigates to /experiences`);
    check(!page.url().includes("tab="), `[${label}] no ?tab= after tab click`);

    // /experiences — experiences tab active, breadcrumb, title
    await page.goto(BASE + "/experiences", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab").first().waitFor();
    const tabs2 = page.getByRole("tablist").first().getByRole("tab");
    check((await tabs2.count()) === 2, `[${label}] /experiences renders both tabs (MEH-1865)`);
    check((await tabs2.nth(1).getAttribute("aria-selected")) === "true", `[${label}] /experiences: experiences tab is selected`);
    const title = await page.title();
    say(`[${label}] /experiences <title> = ${title}`);
    check(title === SEO_TITLE, `[${label}] <title> equals the new seo.experiences.title`);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    say(`[${label}] /experiences description = ${desc}`);
    check(!/קהילתי|אנשים מקומיים|מארחים מקומיים/.test(`${title} ${desc}`), `[${label}] no LOCK-violating words in title/description`);
    // Breadcrumb = the <nav> whose current-page item is aria-current="page".
    const crumbCurrent = page.locator('nav [aria-current="page"]').first();
    const crumbText = (await crumbCurrent.innerText()).trim();
    say(`[${label}] breadcrumb current item = ${crumbText}`);
    check(crumbText === "חוויות", `[${label}] breadcrumb current item is "חוויות"`);
    const h1 = await page.locator("h1").first().innerText();
    say(`[${label}] /experiences h1 = ${h1}`);
    await page.locator("h3").first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: path.join(OUT, `experiences-${label}.png`), fullPage: false });

    // click events tab → URL flips to /events
    await tabs2.nth(0).click();
    await page.waitForURL((u) => new URL(u).pathname.endsWith("/events"), { timeout: 10000 });
    say(`[${label}] after tab click from /experiences: ${page.url()}`);
    check(new URL(page.url()).pathname === "/events", `[${label}] tab click navigates back to /events`);

    // old deep-link through the browser → lands on /experiences, 308 in the network log
    const statuses = [];
    page.on("response", (r) => { if (/\/events\?tab=experiences/.test(r.url())) statuses.push(r.status()); });
    await page.goto(BASE + "/events?tab=experiences", { waitUntil: "domcontentloaded" });
    say(`[${label}] /events?tab=experiences landed on ${page.url()} (network: ${statuses.join(",")})`);
    check(new URL(page.url()).pathname === "/experiences", `[${label}] old deep-link lands on /experiences`);
    check(statuses.includes(308), `[${label}] network log shows 308 for the old deep-link`);
    // The 308 forwards the query (Next passes it through), so the FIRST URL
    // carries ?tab=experiences. The client URL-writer (city/category only)
    // then rewrites the query on hydration — wait for that and report both.
    const landedFirst = page.url();
    // Poll the in-page location (history.replaceState is a same-document
    // change; waitForURL was observed not to fire on it here).
    let settled = "";
    let cleaned = false;
    for (let i = 0; i < 40 && !cleaned; i++) {
      settled = await page.evaluate(() => `${location.pathname}${location.search}`);
      cleaned = !settled.includes("tab=");
      if (!cleaned) await page.waitForTimeout(250);
    }
    say(`[${label}] first URL: ${landedFirst} → settled: ${settled} (client cleanup: ${cleaned})`);
    check(cleaned, `[${label}] stray ?tab= is removed by the client URL-writer after hydration`);

    // /en locale prefix preserved by the locale-aware push
    await page.goto(BASE + "/en/events", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab").first().waitFor();
    await page.getByRole("tablist").first().getByRole("tab").nth(1).click();
    await page.waitForURL((u) => new URL(u).pathname.endsWith("/experiences"), { timeout: 10000 });
    say(`[${label}] /en tab click → ${page.url()}`);
    check(new URL(page.url()).pathname === "/en/experiences", `[${label}] locale prefix survives the tab push (/en/experiences)`);

    await ctx.close();
  }
} finally {
  await browser.close();
}
say(`SUMMARY: ${failures} failure(s)`);
fs.writeFileSync(path.join(OUT, "qa-log.txt"), log.join("\n") + "\n");
process.exit(failures ? 1 : 0);
