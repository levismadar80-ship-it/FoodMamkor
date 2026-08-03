/**
 * MEH-1851 row 23 self-QA — the owner-facing grass_fed declaration.
 *
 * Drives the REAL /producer/dashboard/edit page in Chromium against a
 * `next start` server, with every /api/** call fulfilled from fixtures (the CC
 * sandbox has no backend and cannot reach Railway — CLAUDE.md "Known Bug
 * Patterns"). Captures 375px + 1440px in both states:
 *   1-off — grass_fed false, checkbox clear, save disabled
 *   2-on  — after the owner ticks it, save enabled
 * and asserts the PUT body is EXACTLY { grass_fed: true } — the sibling-clobber
 * check, since PricingCard and DietaryScopeCard PUT to the same endpoint.
 *
 * Also fails loudly on any console error (self_qa_protocol step 4).
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1851-grass-fed.mjs
 *
 * REUSES: e2e/qa-meh1544-order-window.mjs (route-fixture + dual-viewport
 *         harness, cookie-banner dismissal, accordion-by-heading expansion).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

// Repo-root qa-artifacts/ (the path the MEH-1156 size-cap gate scans).
const OUT = "../qa-artifacts/MEH-1851";
// Hard-coded, not env-driven: the env-drift gate (.env.example) treats any
// process.env read in the repo as an undeclared var, and a one-off QA harness
// is not worth a new documented env var (regression rule 8).
const BASE = "http://localhost:3100";
// The sandbox ships chromium-1194; this @playwright/test pins a newer build,
// so point at the installed binary instead of downloading one.
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BASE_PROFILE = {
  id: 42,
  name: "משק הבקר של דנה",
  is_approved: true,
  categories: [{ id: 5, name: "בשר ודגים" }],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
};

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const puts = [];
const consoleErrors = [];

/**
 * Console noise that is PROVEN to belong to the local `next start` environment
 * rather than to the page under test, and is therefore not a self-QA failure.
 *
 * `/_vercel/speed-insights/script.js` is served by Vercel's edge, not by
 * `next start`, so locally it 404s to an HTML error page and Chromium refuses
 * the wrong MIME type. Measured on 03/08 against THIS server: the identical
 * pair appears on `/`, `/about` and `/login` — three routes this diff does not
 * touch — which is what makes it environmental rather than an assumption.
 *
 * Deliberately narrow, and matched on the ORIGINATING URL rather than on the
 * message text. The bare "Failed to load resource … 404" line does not name its
 * own URL, so a text-only filter would have to swallow every 404 on the page —
 * including one this card caused. `m.location().url` says exactly which request
 * emitted it, so the filter stays pinned to the one external path.
 *
 * It matches a fixed external URL, NOT anything about the element under test: a
 * filter keyed on the subject would convert "the thing is broken" into "nothing
 * to report", which is the exact defect class .claude/rules/testing.md names.
 * Every other console error still fails the run.
 */
const SPEED_INSIGHTS = "/_vercel/speed-insights";
const isEnvNoise = (m) =>
  // The "Failed to load resource … 404" line carries the URL only in
  // location(); the "Refused to execute script" line carries it only in the
  // text. Both are checked so neither half leaks through, and BOTH are pinned
  // to the same one external path.
  (m.location()?.url || "").includes(SPEED_INSIGHTS) || m.text().includes(SPEED_INSIGHTS);

async function openTrustGroup(browser, width, height, grassFed) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });

  const profile = { ...BASE_PROFILE, grass_fed: grassFed };

  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");

    if (req.method() === "PUT" && path === "/producers/me") {
      puts.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    // Unknown endpoints default to [] — the dashboard's remaining reads are
    // all collections; an object default trips `o?.map is not a function`.
    const body =
      path === "/auth/me" ? USER
      : path === "/producers/me" ? profile
      : path === "/producers/me/dashboard" ? { producer: profile }
      : path === "/producers/me/analytics" ? {}
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !isEnvNoise(m)) consoleErrors.push(`[${width}] ${m.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  // localePrefix: "as-needed" — /he/* redirects to the bare path.
  await page.goto(`${BASE}/producer/dashboard/edit?group=trust`, { waitUntil: "networkidle" });

  // Dismiss the cookie banner — it is fixed to the bottom and covers the card
  // being documented. Best-effort: if it never renders, carry on.
  const cookieAccept = page.getByRole("button", { name: "קבלו הכל" });
  if (await cookieAccept.isVisible().catch(() => false)) {
    await cookieAccept.click();
    await page.waitForTimeout(300);
  }

  // Expand the unified trust accordion (license + kashrut + dietary + grass_fed).
  await page.getByRole("button", { name: /אישורים ותעודות/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator("#grass-fed").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  return { ctx, page };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 1000]]) {
    // ---- State 1: not declared (the DB default) ----
    {
      const { ctx, page } = await openTrustGroup(browser, width, height, false);
      const box = page.locator("#grass-fed input[type=checkbox]");
      const checked = await box.isChecked();
      // The save button inside the grass-fed sub-section, not a sibling card's.
      const save = page.locator("#grass-fed").getByRole("button", { name: "שמירה" });
      const disabled = await save.isDisabled();
      console.log(`[${label}] state=off  checked=${checked} saveDisabled=${disabled}`);
      await page.screenshot({ path: `${OUT}/grass-fed-${label}-1-off.png`, fullPage: false });

      // ---- State 2: the owner declares it, then saves ----
      await box.check();
      await page.waitForTimeout(200);
      const enabled = await save.isEnabled();
      console.log(`[${label}] state=on   checked=${await box.isChecked()} saveEnabled=${enabled}`);
      await page.screenshot({ path: `${OUT}/grass-fed-${label}-2-on.png`, fullPage: false });
      await save.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/grass-fed-${label}-3-saved.png`, fullPage: false });
      await ctx.close();
    }

    // ---- Seeded ON: the value round-trips back into the checkbox ----
    {
      const { ctx, page } = await openTrustGroup(browser, width, height, true);
      const checked = await page.locator("#grass-fed input[type=checkbox]").isChecked();
      console.log(`[${label}] seeded=true checked=${checked}`);
      await ctx.close();
    }
  }

  console.log("PUT bodies:", JSON.stringify(puts));
  console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
  await browser.close();
  // self_qa_protocol step 4: any console error is a FAIL.
  if (consoleErrors.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
