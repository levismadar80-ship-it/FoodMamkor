/**
 * MEH-2033 — behavioural half of the file-input keyboard fix, in a real
 * browser (jsdom computes `hidden` and `sr-only` identically; see the unit
 * suite's honest-limit note).
 *
 * Probes the RecipeForm surface (/he/producer/dashboard/recipes, empty state
 * -> add CTA -> form). The other three fixed inputs carry the byte-identical
 * class recipe, guarded by the unit suite's source-scan leg; sr-only is one
 * global Tailwind utility, so its computed effect cannot differ per site.
 * Stated as the evidence boundary, not glossed.
 *
 * The three checks, per the card's DoD:
 *   1. getComputedStyle(input).display !== "none"
 *   2. input.focus() actually lands (activeElement) — the discriminating one
 *   3. the wrapping label renders a visible focus ring (boxShadow ALONE — the
 *      `|| borderColor` form signs off on broken markup; card §6 trap 2)
 *
 * waitForSelector uses state:"attached" (card §6 trap 1 — against pre-fix
 * markup a visible-wait dies on TimeoutError before any named assertion).
 *
 * Artifact generation, NOT a spec (testMatch covers e2e/flows + e2e/visual).
 * Run manually:  node e2e/qa-meh2033-file-inputs.mjs
 * REUSES: e2e/qa-meh2031-eventform-upload-a11y.mjs (context + auth + mocks).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2033";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const OWNER = {
  id: 43,
  name: "דמו בעלת עסק",
  email: "owner@example.com",
  role: "producer",
  is_verified: true,
  email_verified: true,
};

const VIEWPORTS = [
  { tag: "375", width: 375, height: 812 },
  { tag: "1440", width: 1440, height: 900 },
];

let failures = 0;
function check(ok, label, detail) {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function run(browser, vp) {
  console.log(`\n  === ${vp.tag} (${vp.width}x${vp.height}) ===`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("token", "qa-owner-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/auth/me" ? JSON.stringify(OWNER)
      : path === "/producers/me/recipes/7"
        ? JSON.stringify({ id: 7, title: "עוגיות טחינה", body: "מערבבים הכל", category: "baking", image_url: "" })
      : path === "/producers/me/recipes" ? "[]"
      // RecipeForm's product picker does `r.data || []` then .map — the
      // catch-all "{}" is truthy, so it must be a real array here or the
      // page dies in the error boundary (measured: "משהו השתבש").
      : path === "/producers/me/products" ? "[]"
      : path.startsWith("/cities") ? "[]"
      : "{}";
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // The recipe EDIT route mounts RecipeForm statically once its fetch lands —
  // no CTA interaction. (The create path needs a click on the recipes-index
  // empty-state CTA, which proved unstable to drive headlessly: the locator
  // counted 1 but click's resolution never saw it, across retries. The form
  // under test is the same component either way; edit mode with image_url:""
  // renders the exact upload label being probed.)
  await page.goto(`${BASE}/he/producer/dashboard/recipes/7/edit`, { waitUntil: "load" });
  // CONTROL first: the form must be present before anything below is trusted —
  // a dead/bounced page makes every later "not found" void.
  // state:"attached", NOT "visible" — card §6 trap 1.
  await page.waitForSelector('input[type="file"]', { state: "attached", timeout: 20_000 });
  const bodyHead = await page.evaluate(() => document.body.innerText.slice(0, 300));
  // No `||` escape here (testing.md's two-cue trap): one discriminating cue —
  // the edit heading, which the error boundary ("משהו השתבש") never renders.
  // (The mocked recipe TITLE is the wrong cue: it lives in an <input> value,
  // which innerText excludes — measured, first version of this control.)
  check(bodyHead.includes("עריכת מתכון"), "edit page rendered, not the error boundary (control)", bodyHead.slice(0, 100).replace(/\n+/g, " | "));

  const input = page.locator('input[type="file"]');

  const display = await input.evaluate((el) => getComputedStyle(el).display);
  check(display !== "none", "file input is not display:none", `display=${display}`);

  const focusable = await input.evaluate((el) => {
    el.focus();
    return document.activeElement === el;
  });
  check(focusable, "file input takes keyboard focus (WCAG 2.1.1)");

  const ring = await input.evaluate((el) => {
    el.focus();
    return getComputedStyle(el.closest("label")).boxShadow;
  });
  // boxShadow ALONE — card §6 trap 2.
  check(ring !== "none", "label renders a visible focus ring", `boxShadow=${ring}`);

  check(pageErrors.length === 0, `0 page errors (got ${pageErrors.length})`);

  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/recipe-upload-focused-${vp.tag}.png` });
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of VIEWPORTS) await run(browser, vp);
  await browser.close();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR (every result above/below is void):", e);
  process.exit(2);
});
