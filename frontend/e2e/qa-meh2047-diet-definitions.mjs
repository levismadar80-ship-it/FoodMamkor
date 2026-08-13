/**
 * MEH-2047 self-QA — the "מה הסימונים אומרים?" disclosure in the owner product
 * form, and (PR-B) the absence of the "דל פחמימות" chip.
 *
 * Drives the REAL /producer/dashboard/edit page in Chromium against a
 * `next start` server, with every /api/** call fulfilled from fixtures (the CC
 * sandbox has no backend and cannot reach Railway — CLAUDE.md "Known Bug
 * Patterns"). Captures 390px + 1440px in three states: disclosure closed,
 * disclosure open, and the chip row itself.
 *
 * ── The control runs FIRST, and its failure voids every null below it ───────
 * A screenshot harness that photographs an error boundary still writes files,
 * logs successes and exits 0 (#2786). So before any capture this asserts the
 * product form actually rendered — by requiring a chip the form has carried
 * since MEH-1934 and that neither PR touches (טבעוני). If that is missing, the
 * run aborts: a "no low-carb chip found" result from a page that never showed
 * the form is the reassuring null, not a finding.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2047-diet-definitions.mjs
 * REUSES: e2e/qa-meh1539-categories.mjs (fixture-route + auth-stub harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2047";
// Hard-coded, not env-driven: the env-drift gate treats any process.env read in
// the repo as an undeclared var (regression rule 8).
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PROFILE = {
  id: 42,
  name: "מאפיית שדה",
  is_approved: true,
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
};

const PRODUCTS = [
  {
    id: 101,
    name: "לחם כוסמין מחמצת",
    description: "",
    price_min: 32,
    price_max: null,
    image_url: "",
    is_gluten_free: false,
    is_vegan: true,
    is_vegetarian: false,
    is_lactose_free: false,
    is_no_added_sugar: false,
  },
];

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const findings = [];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const [label, width, height] of [["390", 390, 844], ["1440", 1440, 1000]]) {
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
        : path === "/producers/me" ? PROFILE
        : path === "/producers/me/products" ? PRODUCTS
        : path === "/producers/me/dashboard" ? { producer: PROFILE }
        : path === "/producers/me/analytics" ? {}
        : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
    await page.goto(`${BASE}/producer/dashboard/edit?group=profile`, { waitUntil: "domcontentloaded" });

    // Open the products accordion, then the add-product form.
    await page.getByRole("button", { name: /מוצרים/ }).first().click();
    await page.getByRole("button", { name: /הוספת מוצר|הוסיפו מוצר|מוצר ראשון/ }).first().click();

    // ── CONTROL ────────────────────────────────────────────────────────────
    // A chip both PRs leave alone. If this is absent the form did not render
    // and every assertion below is void — abort rather than report.
    const control = page.getByRole("button", { name: "טבעוני", exact: true });
    await control.waitFor({ state: "visible", timeout: 15_000 });
    console.log(`[${label}] CONTROL ok — the diet chip row rendered`);

    const trigger = page.getByRole("button", { name: /מה הסימונים אומרים/ });
    await trigger.waitFor({ state: "visible", timeout: 10_000 });

    // State 1 — collapsed (default).
    const closedExpanded = await trigger.getAttribute("aria-expanded");
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/diet-definitions-${label}-1-closed.png`, fullPage: false });

    // State 2 — open.
    await trigger.click();
    await page.waitForTimeout(250);
    const openExpanded = await trigger.getAttribute("aria-expanded");
    await trigger.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/diet-definitions-${label}-2-open.png`, fullPage: false });

    // State 3 — the chip row itself (PR-B evidence: no "דל פחמימות").
    const lowCarbChips = await page.getByRole("button", { name: "דל פחמימות", exact: true }).count();
    const panelText = (await page.locator("#add-diet-definitions").textContent()) || "";
    await page.screenshot({ path: `${OUT}/diet-definitions-${label}-3-chip-row.png`, fullPage: false });

    findings.push({
      label,
      closedExpanded,
      openExpanded,
      lowCarbChips,
      definitionsRendered: panelText.trim().length,
      mentionsCarbs: panelText.includes("פחמימות"),
    });
    console.log(
      `[${label}] aria-expanded closed=${closedExpanded} open=${openExpanded} · ` +
        `low-carb chips=${lowCarbChips} · panel chars=${panelText.trim().length} · ` +
        `panel mentions פחמימות=${panelText.includes("פחמימות")}`,
    );

    await ctx.close();
  }

  await browser.close();
  console.log("\nSUMMARY", JSON.stringify(findings, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
