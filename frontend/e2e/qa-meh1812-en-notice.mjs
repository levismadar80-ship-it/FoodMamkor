/**
 * MEH-1812 Phase 2 self-QA — the /en search-locale notice.
 *
 * Closes the YELLOW-tier evidence gap on PR #2579: the logic is covered by
 * __tests__/EnSearchNotice.test.jsx, but that spec renders the component in
 * isolation with next-intl mocked. This drives the REAL pages in Chromium
 * against a `next start` build, so it exercises the actual locale routing and
 * the actual LanguageToggle — the two things the unit test necessarily fakes.
 *
 * WHAT IT ASSERTS, AND WHY THESE
 *   1. /en renders the notice with the copy Sapir locked (read from en.json,
 *      never a literal, so a key rename fails here instead of passing).
 *   2. The Hebrew route renders it ZERO times. This is the discriminating
 *      assertion — an implementation with no locale gate satisfies (1) too.
 *   3. /en/search renders it as well: the ticket's AC is "all affected consumer
 *      surfaces", and there are two.
 *   4. Clicking the CTA from a DEEP /en path lands on that path's Hebrew twin,
 *      not the homepage. This is the criterion most likely to regress silently
 *      if someone ever inlines router.replace instead of delegating to
 *      LanguageToggle, and it cannot be proven by reading the component.
 *
 * localePrefix is "as-needed" (i18n/routing.js): Hebrew is the bare path and
 * English is /en/*. So the Hebrew twin of `/en/search?q=X` is `/search?q=X`.
 *
 * Run:  node e2e/qa-meh1812-en-notice.mjs
 *
 * REUSES: e2e/qa-meh1775-sticky-inset.mjs (route-fixture + dual-viewport
 *         harness, he.json/en.json-sourced strings, env-noise filter).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const EN = JSON.parse(fs.readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"));
const NOTICE = EN.search.en_notice.body;
const CTA = EN.search.en_notice.cta;

const OUT = "../qa-artifacts/MEH-1812";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const failures = [];
const consoleErrors = [];

// Proven-environmental noise only: /_vercel/speed-insights is served by Vercel's
// edge, so under `next start` it 404s to HTML and Chromium refuses the MIME
// type. Pinned to that one external path and matched on the originating URL —
// never on anything about the element under test, which would convert "the
// notice is gone" into "nothing to report".
// Each entry is an EXTERNAL HOST the sandbox cannot reach, identified by the
// originating request URL. Measured, not guessed — the hosts below were read off
// `console.location().url` on this exact server before being listed:
//   · /_vercel/speed-insights — served by Vercel's edge, so `next start` 404s it
//     to an HTML error page and Chromium refuses the MIME type.
//   · images.unsplash.com — reached THROUGH /_next/image?url=…, so the failing
//     request's own URL is localhost; the external host appears in its query.
//     Matching the substring anywhere in the URL covers both spellings.
//   · res.cloudinary.com — producer imagery, blocked the same way.
// All three are image/telemetry hosts this component neither calls nor depends
// on. The filter is keyed on FIXED EXTERNAL HOSTS and never on the notice, its
// testid, or its copy — a filter keyed on the subject would turn "the notice is
// broken" into "nothing to report", which is the defect class the testing rules
// name. Every other console error still fails the run.
const ENV_HOSTS = ["/_vercel/speed-insights", "images.unsplash.com", "res.cloudinary.com"];
const isEnvNoise = (m) => {
  const url = m.location()?.url || "";
  const text = m.text();
  return ENV_HOSTS.some((h) => url.includes(h) || text.includes(h));
};

const PRODUCERS = [];

async function newCtx(browser, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/auth/me" ? {}
      : path.startsWith("/producers") ? PRODUCERS
      : path.startsWith("/search") ? { producers: [], products: [] }
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !isEnvNoise(m)) consoleErrors.push(`[${width}] ${m.text()}`);
  });
  // Suppress the consent banner so it cannot cover the notice in a screenshot;
  // it is a different ticket's surface and irrelevant to this assertion.
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
  return { ctx, page };
}

const noticeCount = (page) => page.locator('[data-testid="en-search-notice"]').count();

async function run(browser, label, width, height) {
  const { ctx, page } = await newCtx(browser, width, height);

  // ---- 1. /en homepage: present, with the locked copy ----
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  const enHome = await noticeCount(page);
  const text = enHome ? (await page.locator('[data-testid="en-search-notice"]').first().innerText()) : "";
  const copyOk = text.includes(NOTICE) && text.includes(CTA);
  console.log(`[${label}] /en home        notice=${enHome} copyExact=${copyOk}`);
  if (enHome !== 1) failures.push(`[${label}] /en home rendered ${enHome} notices, expected 1`);
  if (!copyOk) failures.push(`[${label}] /en home copy mismatch — got: ${JSON.stringify(text)}`);
  await page.screenshot({ path: `${OUT}/${label}-1-en-home.png`, fullPage: false });

  // ---- 2. Hebrew route: ZERO. The discriminating case. ----
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const heHome = await noticeCount(page);
  console.log(`[${label}] he home         notice=${heHome} (expect 0)`);
  if (heHome !== 0) failures.push(`[${label}] Hebrew home rendered ${heHome} notices, expected 0`);
  await page.screenshot({ path: `${OUT}/${label}-2-he-home.png`, fullPage: false });

  // ---- 3. /en/search: the second consumer surface ----
  await page.goto(`${BASE}/en/search?q=cheese`, { waitUntil: "networkidle" });
  const enSearch = await noticeCount(page);
  console.log(`[${label}] /en/search      notice=${enSearch} (expect 1)`);
  if (enSearch !== 1) failures.push(`[${label}] /en/search rendered ${enSearch} notices, expected 1`);
  await page.screenshot({ path: `${OUT}/${label}-3-en-search.png`, fullPage: false });

  // ---- 4. CTA from a DEEP path returns to that path's Hebrew twin ----
  // Not the homepage. localePrefix "as-needed" => Hebrew twin of /en/search?q=X
  // is /search?q=X. Proven by clicking, not by reading the component.
  const before = page.url();
  await page.getByRole("button", { name: CTA }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/en"), { timeout: 10_000 }).catch(() => {});
  const after = new URL(page.url());
  const pathOk = after.pathname === "/search";
  const queryOk = after.searchParams.get("q") === "cheese";
  console.log(`[${label}] CTA  ${before} -> ${page.url()}  pathOk=${pathOk} queryOk=${queryOk}`);
  if (!pathOk) failures.push(`[${label}] CTA landed on ${after.pathname}, expected /search (deep path lost)`);
  if (!queryOk) failures.push(`[${label}] CTA dropped ?q= — got ${after.search}`);
  const afterNotice = await noticeCount(page);
  if (afterNotice !== 0) failures.push(`[${label}] notice still present after switching to Hebrew`);
  await page.screenshot({ path: `${OUT}/${label}-4-after-cta.png`, fullPage: false });

  await ctx.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  await run(browser, "375", 375, 812);
  await run(browser, "1440", 1440, 900);
  await browser.close();
  console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
  const bad = failures.length || consoleErrors.length;
  failures.forEach((f) => console.log("FAIL:", f));
  console.log(bad ? "FAILED" : "PASS — notice on /en only, deep-path CTA return intact");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
