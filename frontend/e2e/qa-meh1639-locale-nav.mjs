/**
 * MEH-1639 pins — dashboard navigation is locale-aware.
 *
 * The dashboard spokes imported Link/useRouter from next/link and
 * next/navigation, which are locale-blind: on /en/... they navigate to the
 * unprefixed (default-locale) path and silently drop the visitor's locale.
 * The shell itself already used @/i18n/navigation (layout.js), so the tab bar
 * kept the locale while the cards inside did not.
 *
 * Pin A: /en/producer/dashboard/tools -> each spoke card -> URL stays under /en/.
 * Pin B: default-he navigation is regression-free (no /he/ prefix appears,
 *        localePrefix is "as-needed").
 *
 * Usage: node e2e/qa-meh1639-locale-nav.mjs [outDir] [baseUrl]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "../qa-artifacts/MEH-1639";
// REUSES: e2e/qa-meh1611-map-focus.mjs:25-29 — constant + argv override, never
// an environment read (the "Env drift" gate blocks undocumented ones).
const BASE = process.argv[3] || "http://localhost:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const SPOKES = ["events", "experiences", "group-buys", "recipes"];

mkdirSync(OUT, { recursive: true });
const results = [];
const record = (pin, pass, detail) => {
  results.push({ pin, verdict: pass ? "PASS" : "FAIL", detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${pin}\n      ${detail}`);
};

const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});

// A fresh context per walk (no state shared between the /en and default-he
// runs). The he-IL browser locale is deliberate for BOTH: routing.js sets
// localeDetection:false, so next-intl ignores Accept-Language entirely and the
// URL prefix is the only signal — keeping the header constant isolates the
// prefix as the single variable under test.
async function walk(localePrefix) {
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("token", "owner-token"));
  const page = await ctx.newPage();
  const out = [];
  for (const spoke of SPOKES) {
    await page.goto(`${BASE}${localePrefix}/producer/dashboard/tools`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector('a[href*="/producer/dashboard/group-buys"]', { timeout: 25000 });
    const link = page
      .locator(`div.grid.md\\:grid-cols-3 > a[href$="/producer/dashboard/${spoke}"]`)
      .first();
    if ((await link.count()) === 0) { out.push(`${spoke}: CARD NOT FOUND`); continue; }
    await link.click();
    // Wait for the URL to actually LEAVE the tools page rather than sleeping a
    // fixed interval. With a fixed wait, a slow navigation records the
    // pre-click URL — and /en/producer/dashboard/tools itself contains "/en/",
    // so pin A would report a false PASS on the page it never left.
    try {
      await page.waitForURL((u) => !u.pathname.endsWith("/tools"), { timeout: 20000 });
    } catch {
      out.push(`${spoke}: NAVIGATION DID NOT LEAVE /tools (still ${page.url().replace(BASE, "")})`);
      continue;
    }
    out.push(`${spoke} -> ${page.url().replace(BASE, "")}`);
  }
  await ctx.close();
  return out;
}

// Pin A — /en must survive every spoke hop.
{
  const hops = await walk("/en");
  const ok = hops.every((h) => h.includes("-> /en/producer/dashboard/"));  // a NAVIGATION-DID-NOT-LEAVE line fails this
  record("A /en/producer/dashboard/tools -> every spoke stays under /en/", ok, hops.join(" | "));
}

// Pin B — default locale (he) stays unprefixed; localePrefix is "as-needed".
{
  const hops = await walk("");
  const ok = hops.every((h) => h.includes("-> /producer/dashboard/") && !h.includes("/he/"));
  record("B default-he navigation unchanged (no /he/ prefix)", ok, hops.join(" | "));
}

await browser.close();
console.log(`\n${results.filter((r) => r.verdict === "PASS").length}/${results.length} pins pass`);
console.log(JSON.stringify(results, null, 2));
