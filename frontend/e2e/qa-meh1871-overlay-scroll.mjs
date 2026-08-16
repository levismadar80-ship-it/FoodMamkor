/**
 * MEH-1871 self-QA harness — overlay Popover/Tooltip dismiss on scroll.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1871-overlay-scroll.mjs [baseURL] [chromiumPath]
 *
 * The backend is unreachable from the CC sandbox (MEH-360), so the producers
 * feed is intercepted at the Playwright layer and served a fixture.
 *
 * Two surfaces, because they present differently by viewport:
 *   375  — a BADGE PILL popover (BadgeRow.jsx:281, `overlay` whenever avoidRef
 *          is passed, i.e. on every card at every width). This is Sapir's
 *          03/08 repro surface ("מהדרין").
 *   1440 — the +N overflow panel (ProducerCard.jsx:311). Below lg it is a
 *          bottom SHEET (`sheetOnMobile`), which is fixed BY DESIGN and is
 *          deliberately NOT covered by this change.
 *
 * REUSES: frontend/e2e/qa-meh1646-deliveryblock.mjs (manual QA-harness pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1871", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// Enough badges that the +N overflow chip appears (visible cap is 2).
const producer = {
  id: 501,
  name: "מאפיית הגליל",
  slug: null,
  description: "לחם מחמצת ומאפים מקמח מקומי",
  city: "כרמיאל",
  phone: "0501112233",
  // Category rows are OBJECTS in ProducerSchema (schemas.js:53) — a bare
  // string array fails the Rule-19 safeParse and the grid silently renders
  // empty, which reads exactly like "the fixture never arrived".
  categories: [{ id: 3, name: "מאפים", emoji: "🥖" }],
  images: [],
  image_url: null,
  is_approved: true,
  verification_tier: "verified",
  verified_at: "2026-05-01",
  kosher: true,
  kashrut_authority: "מהדרין",
  kashrut_verified_at: "2026-05-01",
  vegan: true,
  vegetarian: true,
  gluten_free: true,
  lactose_free: true,
  grass_fed: true,
  offers_delivery: true,
  delivery_nationwide: true,
  delivery_excluded_cities: [],
  pickup_points: false,
  rating: 4.8,
  reviews_count: 12,
  locations: [],
  delivery_areas: [],
};

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

// Click normally first. `force: true` bypasses actionability and, on the +N
// trigger (a 44px hit-area with a -m-2.5 negative margin), it lands outside the
// React handler — the panel silently does not open and the scroll check then
// "passes" against a closed panel. Measured 03/08: forced click left
// aria-expanded="false"; a normal click set it to "true".
async function openBy(locator, page) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click().catch(() => locator.click({ force: true }).catch(() => {}));
  await page.waitForTimeout(400);
}

// The generic badge pill (BadgeRow.jsx:300 `Badge`) marks its trigger with
// `data-badge=<key>` and names its panel `badge-tooltip-<key>` — so the panel
// id is derived from whichever pill actually rendered, rather than guessed.
async function runBadgePill(label, viewport) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    if (/^\/producers/.test(path)) return route.fulfill({ json: [producer] });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);

  // Not every pill is a disclosure: `verified` with no tooltip renders the
  // seal-only branch (BadgeRow.jsx:286) with no Popover at all — clicking it
  // opens nothing. Pick the first pill that actually discloses, rather than
  // assuming the first pill does.
  const keys = await page
    .locator("[data-badge]")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.badge));
  console.log(`\n[${label}] pills on card:`, keys.join(", ") || "(none)");

  let panel = null;
  for (const key of keys) {
    const candidate = page.locator(`[data-badge="${key}"]`).first();
    await openBy(candidate, page);
    const p = page.getByTestId(`badge-tooltip-${key}`);
    if ((await p.count()) > 0) {
      panel = p;
      console.log(`[${label}] disclosing pill: "${key}"`);
      break;
    }
  }
  if (!panel) {
    console.log(`[${label}] VERDICT: INVALID — no pill opened a panel; nothing tested.`);
    await ctx.close();
    return;
  }

  const before = await panel.count();
  const boxBefore = before ? await panel.first().boundingBox() : null;
  console.log(`[${label}] BEFORE scroll — open:`, before > 0, "box:", boxBefore);
  await page.screenshot({ path: `${OUT}/${label}-1-open.png` });

  // A panel that never opened would make the after-scroll check trivially
  // "closed" — a green with two causes. The open state is a PRECONDITION and
  // its absence is a harness failure, never a pass.
  if (before === 0) {
    console.log(`[${label}] VERDICT: INVALID — panel never opened; nothing was tested.`);
    await ctx.close();
    return;
  }

  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(500);
  const after = await panel.count();
  console.log(`[${label}] AFTER scroll  — open:`, after > 0);
  await page.screenshot({ path: `${OUT}/${label}-2-after-scroll.png` });
  console.log(`[${label}] VERDICT:`, after === 0 ? "PASS — dismissed on scroll" : "FAIL — survived scroll");
  await ctx.close();
}

async function run(label, viewport, triggerTestId, panelTestId) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();

  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    if (/^\/producers\/random/.test(path)) return route.fulfill({ json: [producer] });
    if (/^\/producers/.test(path)) return route.fulfill({ json: [producer] });
    return route.fulfill({ json: {} });
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
  // Give the client-side feed a beat to hydrate the grid.
  await page.waitForTimeout(1500);

  const trigger = page.getByTestId(triggerTestId).first();
  const found = await trigger.count();
  console.log(`\n[${label}] trigger "${triggerTestId}" present:`, found > 0);
  if (!found) {
    console.log(`[${label}] SKIP — trigger not rendered; nothing to prove here.`);
    await ctx.close();
    return;
  }

  await openBy(trigger, page);

  const panel = page.getByTestId(panelTestId);
  const openCount = await panel.count();
  const boxBefore = openCount ? await panel.first().boundingBox() : null;
  console.log(`[${label}] BEFORE scroll — panel open:`, openCount > 0, "box:", boxBefore);
  await page.screenshot({ path: `${OUT}/${label}-1-open.png` });

  // Same precondition as above: "closed after scroll" proves nothing if the
  // panel was never open. Absence of the open state is INVALID, not a pass.
  if (openCount === 0) {
    console.log(`[${label}] VERDICT: INVALID — panel never opened; nothing tested.`);
    await ctx.close();
    return;
  }

  // The real gesture: scroll the page while the panel is open.
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(500);

  const afterCount = await panel.count();
  const boxAfter = afterCount ? await panel.first().boundingBox() : null;
  console.log(`[${label}] AFTER scroll  — panel open:`, afterCount > 0, "box:", boxAfter);
  await page.screenshot({ path: `${OUT}/${label}-2-after-scroll.png` });

  console.log(
    `[${label}] VERDICT:`,
    afterCount === 0 ? "PASS — dismissed on scroll" : "FAIL — panel survived the scroll",
  );
  await ctx.close();
}

// 375: the badge pill popover — overlay at every width, Sapir's repro surface.
await runBadgePill("375-badge-pill", { width: 375, height: 780 });
await runBadgePill("1440-badge-pill", { width: 1440, height: 900 });
// 1440: the +N overflow panel in overlay mode.
await run("1440-overflow-panel", { width: 1440, height: 900 }, "badge-overflow", "badge-overflow-popover");

await browser.close();
