/**
 * MEH-2313 — /about hero subheading + the JSON-LD description, 375 + 1440.
 *
 * /api/* is answered in-page with empty bodies (the about hero needs no
 * data). For he and en it reads the rendered hero subheading and the
 * Organization JSON-LD `description` on the home page, then screenshots the
 * hero.
 *
 * Control (run first): the about page's <h1> must be found and non-empty —
 * if the probe cannot read that, every text check below is void.
 *
 * Usage: node e2e/qa-meh2313-canonical-sentence.mjs [outDir] [baseUrl]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "../qa-artifacts/MEH-2313";
// REUSES: e2e/qa-meh2311-footer-social.mjs — argv override, no env read.
const BASE = process.argv[3] || "http://localhost:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium"; // the sandbox build; CI falls back to the default
const EXPECTED = {
  he: "אוכל מבתי עסק מקומיים שבחרנו אישית — קרוב אלייך, בלי לחפש שעות.",
  en: "Food from local businesses we've personally chosen — close to you, without searching for hours.",
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};

for (const locale of ["he", "en"]) {
  for (const w of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 } });
    const page = await ctx.newPage();
    await page.route("**/api/**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto(`${BASE}/${locale}/about`);
    const h1 = page.locator("h1").first();
    await h1.waitFor({ timeout: 15_000 });
    const tag = `${locale} @${w}`;
    const h1Text = (await h1.innerText()).trim();
    if (!h1Text) {
      console.log(`CONTROL FAIL ${tag}: <h1> empty — results below are void`);
      failures++;
    }
    const sub = page.getByText(EXPECTED[locale], { exact: true });
    check((await sub.count()) === 1, `${tag}: hero subheading is the approved sentence`);
    if (locale === "he") {
      check((await page.getByText("עסק קטנים שבדקנו").count()) === 0, `${tag}: old wording gone from the page`);
    }
    await page.locator('button:has-text("קבלו הכל"), button:has-text("Accept all")').first().click({ timeout: 3_000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/about-hero-${locale}-${w}.png` });
    await ctx.close();
  }
}

// The Organization node on the home page carries the same sentence.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto(`${BASE}/he`);
  const descs = await page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')]
      .flatMap((s) => { try { const j = JSON.parse(s.textContent); return Array.isArray(j) ? j : j["@graph"] || [j]; } catch { return []; } })
      .filter((n) => n && n["@type"] === "Organization")
      .map((n) => n.description),
  );
  check(descs.length > 0 && descs.every((d) => d === EXPECTED.he), `home JSON-LD Organization.description (${descs.length} node(s))`);
  await ctx.close();
}

await browser.close();
process.exit(failures ? 1 : 0);
