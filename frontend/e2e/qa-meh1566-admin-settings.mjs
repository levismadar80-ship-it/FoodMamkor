/**
 * MEH-1566 self-QA — /admin/settings after the notifications section removal.
 *
 * Drives the REAL /he/admin/settings page in Chromium against a `next start`
 * server, with every /api/** call fulfilled from fixtures (the CC sandbox has
 * no backend and cannot reach Railway — CLAUDE.md "Known Bug Patterns").
 * Captures 375px + 1440px and asserts the removed surface is gone while every
 * surviving section still renders.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1566-admin-settings.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

// Repo-root qa-artifacts/ (the path the MEH-1156 size-cap gate scans).
const OUT = "../qa-artifacts/MEH-1566";
// Hard-coded, not env-driven: the env-drift gate (.env.example) treats any
// process.env read in the repo as an undeclared var, and a one-off QA harness
// is not worth a new documented env var (regression rule 8).
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const USER = { id: 1, email: "admin@example.com", role: "admin", name: "ספיר" };

// Post-MEH-1566 DEFAULT_SETTINGS shape: no admin_email / admin_whatsapp.
const SETTINGS = {
  holiday_override_enabled: "false",
  holiday_override_key: "",
  friday_mode_override: "false",
  vacation_mode_active: "false",
  vacation_return_date: "",
};

// The removed surface as it would RENDER. Asserted against visible text, not
// page.content(): next-intl serializes the whole message catalog into the
// flight payload, so a raw HTML substring check matches unrelated namespaces
// that legitimately still carry the same word (e.g. a "התראות" label elsewhere).
const REMOVED_STRINGS = ["התראות", "אימייל אדמין לקבלת התראות", "מספר וואטסאפ אדמין (E.164)"];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  let failures = 0;

  for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 1000]]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      locale: "he-IL",
      timezoneId: "Asia/Jerusalem",
      reducedMotion: "reduce",
    });

    await ctx.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      if (!url.includes("/api/")) return route.continue();
      const path = new URL(url).pathname.replace(/^\/api/, "");

      const body =
        path === "/auth/me" ? USER
        : path === "/admin/settings" ? SETTINGS
        : path === "/admin/settings/vacation" ? { active: false, return_date: null }
        : {};
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
    // localePrefix: "as-needed" — /he/* redirects to the bare path.
    await page.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    await page.screenshot({ path: `${OUT}/admin-settings-${label}.png`, fullPage: true });

    // Visible-text assertions (see REMOVED_STRINGS note above).
    const stillPresent = [];
    for (const s of REMOVED_STRINGS) {
      if (await page.getByText(s, { exact: false }).count()) stillPresent.push(s);
    }
    // Sections that must survive the removal.
    const survivors = ["חלון חג", "מצב חופשה", "בדיקות חיבור", "ניהול קטגוריות"];
    const missing = [];
    for (const s of survivors) {
      if (!(await page.getByText(s, { exact: false }).count())) missing.push(s);
    }
    // The two removed inputs must have no rendered placeholder either.
    for (const ph of ["admin@mehamakor.co.il", "+972501234567"]) {
      if (await page.getByPlaceholder(ph).count()) stillPresent.push(`placeholder:${ph}`);
    }

    if (stillPresent.length) { failures++; console.error(`[${label}] REMOVED STRING STILL RENDERED: ${stillPresent.join(", ")}`); }
    if (missing.length) { failures++; console.error(`[${label}] SURVIVING SECTION MISSING: ${missing.join(", ")}`); }
    if (pageErrors.length) { failures++; console.error(`[${label}] PAGE ERRORS: ${pageErrors.join(" | ")}`); }

    console.log(`[${label}] removed-strings-present=${stillPresent.length} surviving-sections-missing=${missing.length} pageErrors=${pageErrors.length}`);
    await ctx.close();
  }

  await browser.close();
  if (failures) process.exit(1);
  console.log("QA OK — notifications section gone, all other sections intact, no page errors.");
}

main().catch((e) => { console.error(e); process.exit(1); });
