/**
 * MEH-1682 — self-QA for the business-page mini-map tooltip under RTL.
 *
 * Leaflet's default `direction: 'auto'` chooses a horizontal side from the
 * marker's container x, and that choice is broken under `html { direction: rtl }`
 * (Leaflet #7201, open upstream, present in 1.9.4): the tooltip renders detached
 * beside the pin, with a lateral gap and no arrow touching it. The fix pins an
 * explicit vertical direction, so this harness measures the LIVE geometry rather
 * than reading the JSX.
 *
 * Why a browser probe and not only the vitest guard: `.leaflet-tooltip-*` is DOM
 * Leaflet owns and positions with inline `transform`, so the placement that
 * actually ships is only observable from a real layout pass
 * (.claude/rules/frontend.md — "CSS on third-party-managed DOM needs a browser
 * probe"). The vitest guard asserts the props; this asserts the pixels.
 *
 * Asserted on the live DOM, at 1440 (hover is a desktop affordance):
 *   0. the document really is RTL — otherwise the probe measures the wrong bug;
 *   1. the tooltip carries `leaflet-tooltip-top`, never `-left` / `-right`;
 *   2. NO lateral gap — tooltip and pin share a horizontal centre (≤ 2px);
 *   3. the tooltip sits ABOVE the pin, clear of the circle, with the arrow
 *      within a few px of the pin's top edge (not floating off in space);
 *   4. the same holds for a SECONDARY (24px) pin, whose offset differs.
 *
 * Route mocks + the demo fixture mirror e2e/qa-meh1611-producer-locations.mjs
 * (same component, same producer shape) so the two harnesses can't drift.
 *
 * Run: node e2e/qa-meh1682-tooltip-rtl.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "../qa-artifacts/MEH-1682");
const BASE = process.argv[3] || "http://127.0.0.1:3000";
// CC-sandbox only — see qa-meh1611-producer-locations.mjs:26 for the rationale.
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const DEMO_ID = "1a1a1a1a-1111-4111-8111-111111111111";

// Pin sizes from MiniMap.jsx:32-33. The tooltip must clear half of each.
const PRIMARY_PIN_PX = 32;
const SECONDARY_PIN_PX = 24;
// The tooltip's arrow should touch the pin's neighbourhood, not float away.
// Generous enough to absorb the arrow's own height + sub-pixel layout.
const MAX_VERTICAL_SLACK_PX = 24;
const MAX_LATERAL_OFFSET_PX = 2;

const demoLocations = [
  {
    id: "loc-0",
    kind: "branch",
    label: "המאפייה (הסניף המרכזי)",
    city: "זכרון יעקב",
    lat: 32.5732,
    lng: 34.9519,
    is_primary: true,
    precision: "exact",
    opening_hours: "א׳–ה׳ 08:00–17:00",
  },
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `loc-${i + 1}`,
    kind: i % 2 === 0 ? "pickup" : "market_stand",
    label: `איסוף — נקודה ${i + 1}`,
    city: "זכרון יעקב",
    lat: 32.55 + i * 0.012,
    lng: 34.93 + (i % 3) * 0.015,
    is_primary: false,
    precision: "exact",
    opening_hours: i % 2 === 0 ? "ו׳ 08:00–13:00" : null,
  })),
];

const baseProducer = {
  id: DEMO_ID,
  name: "מאפיית הדגמה",
  slug: "demo-bakery",
  city: "זכרון יעקב",
  description: "עסק הדגמה לבדיקת המפה",
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  images: [],
  lat: 32.5732,
  lng: 34.9519,
  locations: demoLocations,
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  avg_rating: 4.8,
  reviews_count: 27,
  plan: "free",
  verification_tier: null,
};

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/**
 * Hover one pin and measure the tooltip Leaflet actually drew against the pin
 * it belongs to. Returns rects in viewport px plus the tooltip's class list —
 * `leaflet-tooltip-top` is what Leaflet stamps once a direction is pinned.
 */
const measureHovered = (page, selector) =>
  page.evaluate((sel) => {
    const pin = document.querySelector(sel);
    const tip = document.querySelector(".leaflet-tooltip");
    if (!pin || !tip) return { pin: !!pin, tip: !!tip };
    const p = pin.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    return {
      pin: true,
      tip: true,
      openTooltips: document.querySelectorAll(".leaflet-tooltip").length,
      classes: [...tip.classList],
      // Leaflet positions tooltips with an inline transform — recorded so the
      // artifact shows the mechanism, not just the outcome.
      transform: tip.style.transform,
      pinRect: { x: p.x, y: p.y, w: p.width, h: p.height, cx: p.x + p.width / 2, top: p.top },
      tipRect: {
        x: t.x,
        y: t.y,
        w: t.width,
        h: t.height,
        cx: t.x + t.width / 2,
        bottom: t.bottom,
      },
    };
  }, selector);

async function probe(page, selector, label, pinPx, shotName) {
  const pin = page.locator(selector).first();
  await pin.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await pin.hover({ force: true });
  await page.waitForSelector(".leaflet-tooltip", { timeout: 10_000 });
  await page.waitForTimeout(400);

  const m = await measureHovered(page, selector);
  if (!m.tip) {
    check(`[${label}] tooltip appears on hover`, false, `pin=${m.pin} tooltip=${m.tip}`);
    return;
  }

  // Leaflet renders tooltips into a shared pane, NOT inside the marker, so the
  // measurement above can only address them by document order. Asserting that
  // exactly one is open is what makes "the first tooltip" unambiguously "the
  // tooltip for the pin we just hovered" — with a lingering second one the
  // rects below would silently describe the wrong pair.
  check(`[${label}] exactly ONE tooltip open while hovering`, m.openTooltips === 1,
    `open=${m.openTooltips}`);

  const vertical = m.pinRect.top - m.tipRect.bottom;
  const lateral = Math.abs(m.tipRect.cx - m.pinRect.cx);

  // 1 — direction is vertical. `-left` / `-right` are the RTL bug; `-auto` never
  // survives to the class list, it resolves to one of the horizontal two.
  check(
    `[${label}] tooltip is anchored TOP (never left/right)`,
    m.classes.includes("leaflet-tooltip-top") &&
      !m.classes.includes("leaflet-tooltip-left") &&
      !m.classes.includes("leaflet-tooltip-right"),
    m.classes.join(" "),
  );

  // 2 — no lateral gap. This is the symptom Smadar reported: the tooltip
  // floating off to the side of the pin instead of over it.
  check(
    `[${label}] no lateral gap — tooltip centred over the pin`,
    lateral <= MAX_LATERAL_OFFSET_PX,
    `|Δcentre| = ${lateral.toFixed(1)}px (max ${MAX_LATERAL_OFFSET_PX})`,
  );

  // 3 — above the pin AND touching it. Two-sided: `> 0` alone would accept a
  // tooltip floating 200px up the page, which is not "attached to the pin".
  check(
    `[${label}] sits ABOVE the pin, arrow touching (0 < gap ≤ ${MAX_VERTICAL_SLACK_PX}px)`,
    vertical >= 0 && vertical <= MAX_VERTICAL_SLACK_PX,
    `gap = ${vertical.toFixed(1)}px, pin ${pinPx}px`,
  );

  await page.screenshot({ path: path.join(OUT, shotName) });
  console.log(`      transform=${m.transform} classes=${m.classes.join(",")}`);
}

async function run(width, height, label) {
  const browser = await chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width, height } });

  await page.route(new RegExp(`/api/producers/${DEMO_ID}(?:\\?[^#]*)?$`), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(baseProducer),
    }),
  );
  await page.route(
    /\/api\/(reviews|producers\/[^/]+\/(products|events|recipes|experiences))/,
    (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.goto(`${BASE}/producer/${DEMO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mehamakor-minimap-pin", { timeout: 30_000 });
  await page.waitForTimeout(1500);

  // 0 — the precondition. Every assertion below is about RTL specifically, so a
  // run that silently measured an LTR document would be green and meaningless.
  const dir = await page.evaluate(() =>
    getComputedStyle(document.documentElement).direction,
  );
  check(`[${label}] document is RTL (the condition the bug needs)`, dir === "rtl", `dir=${dir}`);

  await probe(
    page,
    ".mehamakor-minimap-pin:not(.mehamakor-minimap-pin-secondary)",
    `${label} inline primary`,
    PRIMARY_PIN_PX,
    `minimap-tooltip-${label}-01-primary.png`,
  );
  await probe(
    page,
    ".mehamakor-minimap-pin-secondary",
    `${label} inline secondary`,
    SECONDARY_PIN_PX,
    `minimap-tooltip-${label}-02-secondary.png`,
  );

  // The fullscreen overlay (MEH-1659) is a SECOND reveal state rendering the
  // same pins through a fresh MapContainer. CLAUDE.md's 5-state rule counts
  // cells, not lists: (primary | secondary) × (inline | overlay) is four, and
  // stopping at the two inline ones is exactly the orphan-cell shape MEH-1583
  // let reach production. The overlay is also where a tooltip has the most room
  // to be wrong, since Leaflet re-measures against a full-viewport container.
  await page.getByRole("button", { name: "הגדלת המפה למסך מלא" }).first().click();
  await page.waitForSelector('[role="dialog"] .mehamakor-minimap-pin', { timeout: 30_000 });
  await page.waitForTimeout(1200);

  await probe(
    page,
    '[role="dialog"] .mehamakor-minimap-pin:not(.mehamakor-minimap-pin-secondary)',
    `${label} overlay primary`,
    PRIMARY_PIN_PX,
    `minimap-tooltip-${label}-04-overlay-primary.png`,
  );
  await probe(
    page,
    '[role="dialog"] .mehamakor-minimap-pin-secondary',
    `${label} overlay secondary`,
    SECONDARY_PIN_PX,
    `minimap-tooltip-${label}-05-overlay-secondary.png`,
  );

  await browser.close();
}

fs.mkdirSync(OUT, { recursive: true });
await run(1440, 900, "1440");

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
