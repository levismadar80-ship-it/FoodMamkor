/**
 * MEH-2927 (C13) — reproduce-or-drop probe for the four B3 findings.
 *
 * Target: a LOCAL `next start` (http://127.0.0.1:3100), never staging or
 * production — Sapir's rule 11/11. The backend is stubbed with page.route()
 * so the category-dependent fields render without a server.
 *
 * Prints a verdict line per finding. Anything that does not reproduce is
 * reported and NOT fixed.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2] || "qa-artifacts/MEH-2927";
mkdirSync(OUT, { recursive: true });

const CATEGORIES = [
  { id: 1, name: "ירקות", slug: "vegetables", icon: "🥬" },
  { id: 2, name: "פירות", slug: "fruits", icon: "🍓" },
  { id: 3, name: "לחמים ואפייה", slug: "breads", icon: "🍞" },
  { id: 4, name: "בשר", slug: "meat", icon: "🥩" },
];

const results = [];
const record = (id, reproduced, detail) => {
  results.push({ id, reproduced, detail });
  console.log(`${reproduced ? "REPRODUCED" : "did NOT reproduce"}  ${id}\n    ${detail}`);
};

const box = async (page, sel) => {
  const el = page.locator(sel).first();
  if ((await el.count()) === 0) return null;
  if (!(await el.isVisible().catch(() => false))) return null;
  return el.boundingBox();
};

async function newPage(browser, { visits = 0 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  // Stub every backend call the register flow makes.
  await ctx.route("**/categories*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATEGORIES) }),
  );
  await ctx.route("**/cities*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["זכרון יעקב", "בנימינה-גבעת עדה"]) }),
  );
  await ctx.addInitScript((v) => {
    try { localStorage.setItem("pwa_visits", String(v)); } catch {}
  }, visits);
  const page = await ctx.newPage();
  return { ctx, page };
}

// The repo pins a @playwright/test version whose browser build differs from the
// sandbox's pre-installed one, so point at that binary rather than downloading
// a second copy. --no-sandbox because this runs as root in the container.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--ssl-version-max=tls1.2"],
});

// ---------------------------------------------------------------- (c) BottomNav
{
  const { ctx, page } = await newPage(browser);
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/01-preflight-390.png`, fullPage: false });

  const cta = await box(page, '[data-testid="register-preflight-start"]');
  const nav = await box(page, '[data-testid="bottom-nav"]');
  if (!nav) {
    record("B3c BottomNav covers «מתחילים»", false, "no [data-testid=bottom-nav] rendered on /register/producer at 390px");
  } else if (!cta) {
    record("B3c BottomNav covers «מתחילים»", false, "the preflight CTA was not visible — could not compare");
  } else {
    const overlap = cta.y + cta.height > nav.y && cta.y < nav.y + nav.height;
    record(
      "B3c BottomNav covers «מתחילים»",
      overlap,
      `CTA y=${cta.y.toFixed(0)}..${(cta.y + cta.height).toFixed(0)}  nav y=${nav.y.toFixed(0)}..${(nav.y + nav.height).toFixed(0)}  viewport=844`,
    );
  }
  await ctx.close();
}

// ------------------------------------------------------- (a) step 2 opens scrolled
{
  const { ctx, page } = await newPage(browser);
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').click();
  await page.locator('[data-testid="register-account-name"]').fill("דנה בדיקה");
  await page.locator('[data-testid="register-account-email"]').fill("dana.probe@example.com");
  await page.locator('[data-testid="register-account-password"]').fill("Str0ngPassw0rd!x");

  // Scroll to the bottom, as a person filling the last field would be.
  await page.locator('[data-testid="register-account-next"]').scrollIntoViewIfNeeded();
  const beforeY = await page.evaluate(() => window.scrollY);
  await page.locator('[data-testid="register-account-next"]').click();
  await page.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 10000 });
  const afterY = await page.evaluate(() => window.scrollY);
  const heading = await box(page, '[data-testid="register-hero-heading"]');
  await page.screenshot({ path: `${OUT}/02-step2-on-entry-390.png` });

  const headingOffscreen = heading ? heading.y < 0 : afterY > 0;
  record(
    "B3a steps 2–4 open scrolled below the heading",
    afterY > 0 || headingOffscreen,
    `scrollY before=${beforeY} after=${afterY}; heading y=${heading ? heading.y.toFixed(0) : "not rendered"}`,
  );

  // ------------------------------------------------- (d) «הבא» jumps on the license box
  await page.locator('[data-testid="register-details-name"]').fill("משק בדיקה");
  await page.locator('[data-testid="register-details-phone"]').fill("0501234567");
  const next = page.locator('[data-testid="register-details-next"]');
  const dBefore = await next.boundingBox().catch(() => null);
  record(
    "B3d «הבא» jumps when the license box is ticked",
    false,
    dBefore
      ? "NOT MEASURED on step 2 — the license checkbox lives on step 3 (CATEGORY). See the second pass below."
      : "step-2 next button not visible",
  );
  await ctx.close();
}

// ------------------------------------------------- (d) proper: step 3 license box
{
  const { ctx, page } = await newPage(browser);
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').click();
  await page.locator('[data-testid="register-account-name"]').fill("דנה בדיקה");
  await page.locator('[data-testid="register-account-email"]').fill("dana.probe2@example.com");
  await page.locator('[data-testid="register-account-password"]').fill("Str0ngPassw0rd!x");
  await page.locator('[data-testid="register-account-next"]').click();
  await page.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="register-details-name"]').fill("משק בדיקה");
  await page.locator('[data-testid="register-details-phone"]').fill("0501234567");

  let reachedCategory = false;
  try {
    await page.locator('#producer-city').fill("זכרון יעקב");
    await page.locator('text=זכרון יעקב').last().click({ timeout: 4000 });
  } catch {}
  try {
    await page.locator('[data-testid="register-fulfilment-onsite"]').click({ timeout: 4000 });
  } catch {}
  try {
    await page.locator('[data-testid="register-details-next"]').click();
    await page.locator('[data-testid="register-frame-category"]').waitFor({ timeout: 8000 });
    reachedCategory = true;
  } catch {}

  if (!reachedCategory) {
    record("B3d «הבא» jumps when the license box is ticked", false,
      "could not reach step 3 (CATEGORY) with a stubbed backend — not measured, NOT a verdict on the finding");
  } else {
    await page.screenshot({ path: `${OUT}/03-step3-390.png` });
    const licence = page.locator('[data-testid="register-license-pending-optin"]');
    if ((await licence.count()) === 0) {
      record("B3d «הבא» jumps when the license box is ticked", false,
        "the license opt-in checkbox did not render for the selected categories — not measured");
    } else {
      const btn = page.locator('[data-testid="register-category-next"], [data-testid="register-details-next"]').first();
      const before = await btn.boundingBox();
      await licence.click();
      await page.waitForTimeout(400);
      const after = await btn.boundingBox();
      const dy = before && after ? Math.abs(after.y - before.y) : 0;
      await page.screenshot({ path: `${OUT}/04-step3-license-ticked-390.png` });
      record("B3d «הבא» jumps when the license box is ticked", dy > 8,
        `next button y: ${before?.y.toFixed(0)} -> ${after?.y.toFixed(0)} (Δ${dy.toFixed(0)}px)`);
    }
  }
  await ctx.close();
}

// -------------------------------------------------------- (b) install prompt
{
  const { ctx, page } = await newPage(browser, { visits: 5 });
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').click();
  console.log("    …waiting 32s for the install prompt timer");
  await page.waitForTimeout(32000);
  const prompt = page.locator('text=/הוספה למסך הבית|התקינו|Add to Home/i').first();
  const visible = (await prompt.count()) > 0 && (await prompt.isVisible().catch(() => false));
  await page.screenshot({ path: `${OUT}/05-install-prompt-390.png` });
  record("B3b «הוספה למסך הבית» covers the form", visible,
    visible
      ? "the prompt is on screen 30s after load on a 2nd+ visit, with no route exclusion"
      : "no install prompt appeared after 32s (headless Chromium fires no beforeinstallprompt; the iOS arm needs a WebKit UA)");
  await ctx.close();
}

await browser.close();

console.log("\n=== VERDICT ===");
for (const r of results) console.log(`${r.reproduced ? "FIX" : "DROP/REPORT"}  ${r.id}`);
