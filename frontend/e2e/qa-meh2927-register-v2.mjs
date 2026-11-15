/**
 * MEH-2927 (C13) v2 — re-measurement of the three findings the first probe
 * could not settle (Sapir, 11/11):
 *
 *   B3c — measure at the iPhone VISUAL viewport (390×664, 375×667), not the
 *         device height (390×844). The browser bars eat ~180px.
 *   B3d — reach step 3 properly, pick a LICENCE-REQUIRED category, and measure
 *         «הבא» before and after the licence box is ticked.
 *   B3b — headless Chromium fires no `beforeinstallprompt`, so dispatch a
 *         synthetic one (Android arm) and also run the iOS arm via UA.
 *
 * Local `next start` only. Backend stubbed with page.route().
 * Prints a verdict line per finding; anything that does not reproduce is
 * reported and NOT fixed.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2] || "qa-artifacts/MEH-2927/v2"; // run from the repo root
mkdirSync(OUT, { recursive: true });

// Slugs must be the REAL ones (backend/app/services/category_slug.NAME_TO_SLUG):
// CategorySelector's popular-6 grid is keyed on `slug`, so a made-up slug
// collapses the card behind the «עוד קטגוריות» expander and the chip is not
// clickable at rest. "bread" is in LICENSE_REQUIRED_CATEGORIES, "veg" is not.
const CATEGORIES = [
  { id: 1, name: "ירקות", slug: "veg", icon: "🥬" },
  { id: 2, name: "פירות", slug: "fruit", icon: "🍓" },
  { id: 3, name: "לחמים ואפייה", slug: "bread", icon: "🍞" },  // licence-required
  { id: 4, name: "בשר", slug: "meat", icon: "🥩" },            // licence-required
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

async function newPage(browser, { width, height, visits = 0, userAgent } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "he-IL",
    ...(userAgent ? { userAgent } : {}),
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

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--ssl-version-max=tls1.2"],
});

// ============================================================ B3c, both sizes
const b3c = [];
for (const [w, h] of [[390, 664], [375, 667], [390, 844]]) {
  const { ctx, page } = await newPage(browser, { width: w, height: h });
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/b3c-preflight-${w}x${h}.png` });

  const cta = await box(page, '[data-testid="register-preflight-start"]');
  const nav = await box(page, '[data-testid="bottom-nav"]');
  // The nav is not the only fixed chrome on that edge: a first-time visitor
  // also has the cookie banner (z-1100, above the nav). Measuring the nav
  // alone understates what a person actually sees.
  const cookie = await box(page, '[data-testid="cookie-banner"]');
  const scroll = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
  }));
  const ov = (a, b) =>
    a && b ? Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) : 0;
  const overlap = ov(cta, nav);
  // How much of the CTA a person can actually see and tap on first paint:
  // inside the viewport, and behind neither the nav nor the cookie banner.
  let usable = 0;
  if (cta) {
    const step = 1;
    for (let y = Math.max(0, cta.y); y < Math.min(cta.y + cta.height, h); y += step) {
      const inNav = nav && y >= nav.y && y < nav.y + nav.height;
      const inCookie = cookie && y >= cookie.y && y < cookie.y + cookie.height;
      if (!inNav && !inCookie) usable += step;
    }
  }
  b3c.push({ w, h, cta, nav, cookie, overlap, usable, scroll });
  console.log(
    `  ${w}×${h}: CTA y=${cta ? `${cta.y.toFixed(0)}..${(cta.y + cta.height).toFixed(0)} (h=${cta.height.toFixed(0)})` : "n/a"}` +
    `  nav y=${nav ? `${nav.y.toFixed(0)}..${(nav.y + nav.height).toFixed(0)}` : "NOT RENDERED"}` +
    `  cookie y=${cookie ? `${cookie.y.toFixed(0)}..${(cookie.y + cookie.height).toFixed(0)}` : "none"}` +
    `  nav-overlap=${overlap.toFixed(0)}px  UNOBSTRUCTED CTA=${usable}px` +
    `  scrollH=${scroll.scrollH}/${scroll.clientH}`,
  );
  await ctx.close();
}
{
  // The finding is "the CTA is not reachable on first paint", so the verdict
  // gates on the unobstructed height, not on the nav overlap alone: a CTA
  // pushed below the fold is just as unreachable as one behind the nav.
  const bad = b3c.filter((r) => r.cta && r.usable < r.cta.height - 1);
  record(
    "B3c the preflight CTA is obstructed / below the fold at the iPhone visual viewport",
    bad.length > 0,
    b3c
      .map((r) =>
        `${r.w}×${r.h}: ${r.usable}px of ${r.cta ? r.cta.height.toFixed(0) : "?"}px of «מתחילים» ` +
        `visible and unobstructed (nav covers ${r.overlap.toFixed(0)}px` +
        `${r.cookie ? `, cookie banner present` : ""})`,
      )
      .join("\n    "),
  );
}

// ==================================================== helper: reach step 3
async function reachCategory(page) {
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').click();
  await page.locator('[data-testid="register-account-name"]').fill("דנה בדיקה");
  await page.locator('[data-testid="register-account-email"]').fill(`dana.v2.${Date.now()}@example.com`);
  await page.locator('[data-testid="register-account-password"]').fill("Str0ngPassw0rd!x");
  await page.locator('[data-testid="register-account-next"]').click();
  await page.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="register-details-name"]').fill("משק בדיקה");
  await page.locator('[data-testid="register-details-phone"]').fill("0501234567");
  // CitySearch: type, then click the first option by its own id (MEH-2195).
  await page.locator("#producer-city").fill("זכרון יעקב");
  await page.locator("#producer-city-option-0").click({ timeout: 6000 });
  await page.locator('[data-testid="register-fulfilment-onsite"]').click();
  await page.locator('[data-testid="register-details-next"]').click();
  await page.locator('[data-testid="register-frame-category"]').waitFor({ timeout: 10000 });
}

// ================================================================= B3d
{
  const { ctx, page } = await newPage(browser, { width: 390, height: 664 });
  let reached = true;
  try {
    await reachCategory(page);
  } catch (e) {
    reached = false;
    record("B3d «הבא» jumps when the licence box is ticked", false,
      `could not reach step 3 (CATEGORY): ${String(e).split("\n")[0]} — NOT a verdict on the finding`);
  }
  if (reached) {
    // Pick the licence-required category («לחמים ואפייה», id 3).
    await page.locator('[data-testid="category-chip-3"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/b3d-01-category-picked.png` });

    const licence = page.locator('[data-testid="register-license-pending-optin"]');
    const licCount = await licence.count();
    if (licCount === 0) {
      record("B3d «הבא» jumps when the licence box is ticked", false,
        "a licence-required category («לחמים ואפייה») is selected but [register-license-pending-optin] did not render — not measured");
    } else {
      const next = page.locator('[data-testid="register-category-next"]');
      const before = await next.boundingBox();
      const beforeScroll = await page.evaluate(() => window.scrollY);
      await licence.click();
      await page.waitForTimeout(500);
      const after = await next.boundingBox();
      const afterScroll = await page.evaluate(() => window.scrollY);
      await page.screenshot({ path: `${OUT}/b3d-02-licence-ticked.png` });
      // Document-space delta, so a scroll of the page is not read as a jump.
      const docBefore = before.y + beforeScroll;
      const docAfter = after.y + afterScroll;
      const dy = Math.abs(docAfter - docBefore);
      record("B3d «הבא» jumps when the licence box is ticked", dy > 8,
        `«הבא» document y: ${docBefore.toFixed(0)} -> ${docAfter.toFixed(0)} (Δ${dy.toFixed(0)}px); ` +
        `viewport y ${before.y.toFixed(0)} -> ${after.y.toFixed(0)}; scrollY ${beforeScroll} -> ${afterScroll}`);
    }
  }
  await ctx.close();
}

// ================================================================= B3b
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function measureInstallPrompt(label, { synthetic, userAgent }) {
  const { ctx, page } = await newPage(browser, {
    width: 390, height: 664, visits: 5, userAgent,
  });
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').click();
  await page.locator('[data-testid="register-frame-account"]').waitFor({ timeout: 10000 });

  if (synthetic) {
    // The component listens for `beforeinstallprompt` and only then arms its
    // 30s timer. Headless Chromium never fires it, so dispatch one.
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      e.prompt = () => {};
      e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    });
  }
  console.log(`    …${label}: waiting 31s for the 30s timer`);
  await page.waitForTimeout(31000);

  const prompt = page.locator('[role="dialog"][aria-modal="false"]').first();
  const visible = (await prompt.count()) > 0 && (await prompt.isVisible().catch(() => false));
  // No capture here: the loop below shoots the same frame at `top`, so this one
  // was a byte-identical third copy of every arm (measured by md5).
  let detail = "the prompt never appeared";
  let overlaps = false;
  if (visible) {
    const pb = await prompt.boundingBox();
    const over = (a) =>
      a && Math.max(0, Math.min(a.y + a.height, pb.y + pb.height) - Math.max(a.y, pb.y)) > 0;
    // The prompt is `position: fixed`, so a measurement taken at scrollY=0 only
    // says what happens to be under that band on first paint. Scroll the step's
    // own CTA into view — what a person filling the last field does — and
    // re-measure against every control on the step.
    const lines = [];
    for (const where of ["top", "scrolled"]) {
      if (where === "scrolled") {
        await page.locator('[data-testid="register-account-next"]').scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
      const controls = {
        name: await box(page, '[data-testid="register-account-name"]'),
        email: await box(page, '[data-testid="register-account-email"]'),
        password: await box(page, '[data-testid="register-account-password"]'),
        next: await box(page, '[data-testid="register-account-next"]'),
      };
      const hit = Object.entries(controls).filter(([, b]) => over(b)).map(([k]) => k);
      if (hit.length > 0) overlaps = true;
      lines.push(
        `${where}: prompt y=${pb.y.toFixed(0)}..${(pb.y + pb.height).toFixed(0)}; ` +
        Object.entries(controls)
          .map(([k, b]) => `${k}=${b ? `${b.y.toFixed(0)}..${(b.y + b.height).toFixed(0)}` : "off-screen"}`)
          .join(" ") +
        `; covered: ${hit.length > 0 ? hit.join("+") : "none"}`,
      );
      await page.screenshot({ path: `${OUT}/b3b-${label}-${where}.png` });
    }
    detail = lines.join("\n        ");
  }
  await ctx.close();
  return { visible, overlaps, detail };
}

{
  const android = await measureInstallPrompt("android-synthetic-bip", { synthetic: true });
  const ios = await measureInstallPrompt("ios-ua", { synthetic: false, userAgent: IPHONE_UA });
  record(
    "B3b «הוספה למסך הבית» covers the register form",
    (android.visible && android.overlaps) || (ios.visible && ios.overlaps),
    `android (synthetic beforeinstallprompt): shown=${android.visible} — ${android.detail}\n` +
    `    ios (iPhone UA): shown=${ios.visible} — ${ios.detail}`,
  );
}

// ------- B3b, taller step: the ACCOUNT step is 4 controls and fits above the
// band. The question the pilot's wording raises is whether a control on a
// TALLER step lands under it, so measure the DETAILS step scrolled to its end.
{
  const { ctx, page } = await newPage(browser, { width: 390, height: 664, visits: 5 });
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="register-preflight-start"]').click();
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () => {};
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(e);
  });
  await page.locator('[data-testid="register-account-name"]').fill("דנה בדיקה");
  await page.locator('[data-testid="register-account-email"]').fill(`dana.tall.${Date.now()}@example.com`);
  await page.locator('[data-testid="register-account-password"]').fill("Str0ngPassw0rd!x");
  await page.locator('[data-testid="register-account-next"]').click();
  await page.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 10000 });
  console.log("    …b3b tall step: waiting for the 30s timer");
  await page.waitForTimeout(31000);
  const prompt = page.locator('[role="dialog"][aria-modal="false"]').first();
  const shown = (await prompt.count()) > 0 && (await prompt.isVisible().catch(() => false));
  let detail = "the prompt never appeared on the DETAILS step";
  let covered = false;
  let sweepNote = "";
  if (shown) {
    const pb = await prompt.boundingBox();
    await page.locator('[data-testid="register-details-next"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const hits = await page.evaluate((band) => {
      const sels = [
        '[data-testid="register-details-name"]',
        '[data-testid="register-details-phone"]',
        "#producer-city",
        '[data-testid="register-fulfilment-onsite"]',
        '[data-testid="register-fulfilment-delivery"]',
        '[data-testid="register-details-next"]',
      ];
      return sels
        .map((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const o = Math.max(0, Math.min(r.bottom, band.bottom) - Math.max(r.top, band.top));
          return { sel, top: Math.round(r.top), bottom: Math.round(r.bottom), overlap: Math.round(o) };
        })
        .filter(Boolean);
    }, { top: pb.y, bottom: pb.y + pb.height });
    const hit = hits.filter((h) => h.overlap > 0);
    covered = hit.length > 0;
    await page.screenshot({ path: `${OUT}/b3b-details-scrolled.png` });
    // The prompt is `fixed`: the two samples above are two points on a
    // continuum. Sweep every scroll position in 50px steps and count the ones
    // where a control lands in the band, so the negative is not an artifact of
    // where the sweep happened to stop.
    const sweep = await page.evaluate(async (band) => {
      const sels = [
        '[data-testid="register-details-name"]',
        '[data-testid="register-details-phone"]',
        "#producer-city",
        '[data-testid="register-fulfilment-onsite"]',
        '[data-testid="register-fulfilment-delivery"]',
        '[data-testid="register-details-next"]',
      ];
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const out = [];
      for (let y = 0; y <= max; y += 50) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          const o = Math.min(r.bottom, band.bottom) - Math.max(r.top, band.top);
          if (o > 0) out.push({ y, sel, overlap: Math.round(o) });
        }
      }
      return { max, out };
    }, { top: pb.y, bottom: pb.y + pb.height });
    console.log(
      `    sweep: ${sweep.out.length} (scroll position × control) hits over ` +
      `0..${sweep.max}px in 50px steps` +
      (sweep.out.length
        ? ` — e.g. ${sweep.out.slice(0, 4).map((h) => `y=${h.y} ${h.sel.replace(/\[data-testid="register-|"\]/g, "")} ${h.overlap}px`).join(", ")}`
        : ""),
    );
    if (sweep.out.length > 0) covered = true;
    if (sweep.out.length > 0) {
      // Capture the worst position, so the artifact shows the overlap rather
      // than the one scroll offset where nothing happened to be in the band.
      const worst = sweep.out.reduce((a, b) => (b.overlap > a.overlap ? b : a));
      await page.evaluate((y) => window.scrollTo(0, y), worst.y);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/b3b-details-worst-y${worst.y}.png` });
    }
    sweepNote =
      `\n        sweep over 0..${sweep.max}px in 50px steps: ${sweep.out.length} ` +
      `(scroll position × control) hits` +
      (sweep.out.length
        ? ` — worst ${Math.max(...sweep.out.map((h) => h.overlap))}px; ` +
          `${[...new Set(sweep.out.map((h) => h.sel))].join(", ")}`
        : "");
    detail =
      `prompt y=${pb.y.toFixed(0)}..${(pb.y + pb.height).toFixed(0)}; ` +
      hits.map((h) => `${h.sel.replace(/\[data-testid="register-|"\]/g, "")}=${h.top}..${h.bottom}`).join(" ") +
      `; at this scroll position: ${hit.length ? hit.map((h) => `${h.sel} by ${h.overlap}px`).join(", ") : "nothing covered"}` +
      sweepNote;
  }
  record("B3b (taller step) install prompt covers a DETAILS control", covered, detail);
  await ctx.close();
}

await browser.close();

console.log("\n=== VERDICT ===");
for (const r of results) console.log(`${r.reproduced ? "FIX" : "DROP/REPORT"}  ${r.id}`);
