/**
 * MEH-2927 — the AFTER measurement for B3c, B3b and B3d, at the iPhone VISUAL
 * viewport (390x664 and 375x667), which is what the fixes were sized against.
 * The before numbers are in qa-meh2927-register-v2.mjs and in MEH-2927.
 *
 * Local `next start` only. Backend stubbed with page.route().
 *
 * Run from frontend/:  node e2e/qa-meh2927-register-chrome.mjs
 *   QA_BASE_URL / PLAYWRIGHT_CHROMIUM_PATH override the target and the browser.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2] || "qa-artifacts/MEH-2927/after"; // repo root
mkdirSync(OUT, { recursive: true });

// Real slugs: CategorySelector's popular-6 grid is keyed on `slug`, so a
// made-up one collapses the card behind the «עוד קטגוריות» expander.
const CATEGORIES = [
  { id: 1, name: "ירקות", slug: "veg", icon: "🥬" },
  { id: 3, name: "לחמים ואפייה", slug: "bread", icon: "🍞" }, // licence-required
];

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});

/**
 * Fire `beforeinstallprompt` repeatedly over 3s.
 *
 * One dispatch is not enough and the reason is a trap worth naming: the
 * component attaches its listener in an effect, so an event fired before
 * hydration is simply dropped — and waiting for a `data-testid` does NOT
 * prove hydration, because Next server-renders client components and the
 * markup is in the HTML long before React attaches anything. Measured: a
 * single dispatch after `[data-testid="bottom-nav"]` resolved produced 0
 * prompts on the home page, while the same dispatch after a plain 3s wait
 * produced 1. The listener is `{ once: true }`, so the extra dispatches are
 * free.
 */
async function fireInstallPrompt(page) {
  for (let i = 0; i < 12; i += 1) {
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      e.prompt = () => {};
      e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    });
    await page.waitForTimeout(250);
  }
}

async function newPage({ width, height, visits = 0 }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  await ctx.route("**/categories*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATEGORIES) }),
  );
  await ctx.route("**/cities*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["זכרון יעקב"]) }),
  );
  await ctx.addInitScript((v) => {
    try { localStorage.setItem("pwa_visits", String(v)); } catch {}
  }, visits);
  return { ctx, page: await ctx.newPage() };
}

// ------------------------------------------------- B3c, both visual viewports
for (const [w, h] of [[390, 664], [375, 667]]) {
  const { ctx, page } = await newPage({ width: w, height: h });
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  const cta = page.locator('[data-testid="register-preflight-start"]');
  await cta.waitFor({ timeout: 20000 });

  const navCount = await page.locator('[data-testid="bottom-nav"]').count();
  const box = await cta.boundingBox();
  const cookie = await page.locator('[data-testid="cookie-banner"]').boundingBox().catch(() => null);
  // How much of the CTA a person can see and tap: inside the viewport, and
  // behind neither the nav (now gone) nor the cookie banner.
  let usable = 0;
  for (let y = Math.max(0, box.y); y < Math.min(box.y + box.height, h); y += 1) {
    const inCookie = cookie && y >= cookie.y && y < cookie.y + cookie.height;
    if (!inCookie) usable += 1;
  }
  await page.screenshot({ path: `${OUT}/b3c-after-${w}x${h}.png` });

  // Control. Without it `navCount === 0` is a null that is also the
  // reassuring output: a typo in the selector, a render crash or a desktop
  // viewport all produce 0 and PASS. The home page at the same size must
  // still have exactly one.
  const { ctx: ctrlCtx, page: ctrlPage } = await newPage({ width: w, height: h });
  await ctrlPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await ctrlPage.locator('[data-testid="bottom-nav"]').waitFor({ timeout: 20000 });
  const controlCount = await ctrlPage.locator('[data-testid="bottom-nav"]').count();
  await ctrlCtx.close();
  check(
    `B3c control @ ${w}x${h} — the home page still has the nav`,
    controlCount === 1,
    `bottom-nav elements on /: ${controlCount} (0 here would mean the probe, not the gate, is what measured nothing)`,
  );

  check(
    `B3c @ ${w}x${h} — the BottomNav is gone from the registration flow`,
    navCount === 0,
    `bottom-nav elements: ${navCount}; «מתחילים» y=${box.y.toFixed(0)}..${(box.y + box.height).toFixed(0)}; ` +
      `unobstructed ${usable}px of ${box.height.toFixed(0)}px (cookie banner ${cookie ? "present" : "absent"})`,
  );
  await ctx.close();
}

// ----------------------------------------------------------------- B3b
{
  const { ctx, page } = await newPage({ width: 390, height: 664, visits: 5 });
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').click();
  await fireInstallPrompt(page);
  console.log("    …b3b: waiting 31s for the 30s timer");
  await page.waitForTimeout(31000);
  const shown = await page.locator('[role="dialog"][aria-modal="false"]').count();
  await page.screenshot({ path: `${OUT}/b3b-after-390x664.png` });
  check(
    "B3b — no install prompt on the registration flow, 31s after a synthetic beforeinstallprompt",
    shown === 0,
    `install-prompt dialogs on /register/producer: ${shown}`,
  );
  await ctx.close();
}

// control: the prompt still exists off the flow, so the gate is a gate and
// not a component that stopped working.
{
  const { ctx, page } = await newPage({ width: 390, height: 664, visits: 5 });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await fireInstallPrompt(page);
  console.log("    …b3b control: waiting 31s");
  await page.waitForTimeout(31000);
  const shown = await page.locator('[role="dialog"][aria-modal="false"]').count();
  check(
    "B3b control — it still appears on the home page",
    shown > 0,
    `install-prompt dialogs on /: ${shown} (0 here would mean the gate broke the component)`,
  );
  await ctx.close();
}

// ----------------------------------------------------------------- B3d
{
  const { ctx, page } = await newPage({ width: 390, height: 664 });
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').click();
  await page.locator('[data-testid="register-account-name"]').fill("דנה בדיקה");
  await page.locator('[data-testid="register-account-email"]').fill(`d.${Date.now()}@example.com`);
  await page.locator('[data-testid="register-account-password"]').fill("Str0ngPassw0rd!x");
  await page.locator('[data-testid="register-account-next"]').click();
  await page.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid="register-details-name"]').fill("משק בדיקה");
  await page.locator('[data-testid="register-details-phone"]').fill("0501234567");
  await page.locator("#producer-city").fill("זכרון יעקב");
  await page.locator("#producer-city-option-0").click({ timeout: 8000 });
  await page.locator('[data-testid="register-fulfilment-onsite"]').click();
  await page.locator('[data-testid="register-details-next"]').click();
  await page.locator('[data-testid="register-frame-category"]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid="category-chip-3"]').click();

  const next = page.locator('[data-testid="register-category-next"]');
  const licence = page.locator('[data-testid="register-license-pending-optin"]');
  await licence.waitFor({ timeout: 10000 });

  const docY = async () => {
    const b = await next.boundingBox();
    return b.y + (await page.evaluate(() => window.scrollY));
  };
  const before = await docY();
  await page.screenshot({ path: `${OUT}/b3d-after-unticked-390x664.png` });
  await licence.click();
  await page.waitForTimeout(400);
  const after = await docY();
  await page.screenshot({ path: `${OUT}/b3d-after-ticked-390x664.png` });

  const dy = Math.abs(after - before);
  check(
    "B3d — «הבא» does not move when the licence box is ticked",
    dy <= 1,
    `«הבא» document y: ${before.toFixed(0)} -> ${after.toFixed(0)} (Δ${dy.toFixed(0)}px; was Δ36px before the fix)`,
  );
  await ctx.close();
}

await browser.close();
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
