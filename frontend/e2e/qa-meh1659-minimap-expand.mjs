/**
 * MEH-1659 — self-QA for the business page's mini-map zoom + fullscreen expand.
 *
 * Drives a real Chromium against a local `next start` with the producer
 * endpoint route-mocked, and asserts on the LIVE DOM:
 *
 *   1. the INLINE map carries a +/− control and an OSM attribution, and is NOT
 *      draggable — Leaflet adds `leaflet-grab` to the container in
 *      `Draggable.addHooks` (leaflet-src.js:13770) and removes it in
 *      `removeHooks` (:13777), so the class IS the gesture state, measured
 *      rather than inferred from the props we passed;
 *   2. a tap on the map CANVAS opens a fullscreen dialog;
 *   3. the OVERLAY map is draggable, carries its own attribution (ODbL —
 *      MEH-1633's failure mode was 0 attribution elements while the source
 *      still read correct), and locks body scroll;
 *   4. Esc closes it and the scroll lock is released.
 *
 * The dragging pair is asserted on BOTH surfaces in the same run: an
 * overlay-only check would pass just as well if the inline map had become
 * draggable too, which is the scroll-trap this ticket exists to avoid.
 *
 * Route regexes are anchored the same way as parity.spec.ts:60-61 — a
 * `**​/producers?*` glob would also swallow the collection endpoint and the
 * /count, /cities, /random siblings.
 *
 * REUSES: frontend/e2e/qa-meh1611-producer-locations.mjs (mock shape + runner).
 * Run: node e2e/qa-meh1659-minimap-expand.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "../qa-artifacts/MEH-1659");
const BASE = process.argv[3] || "http://127.0.0.1:3000";
// CC-sandbox only: the container ships Chromium at a fixed path, which may not
// match the revision this repo's @playwright/test pins. Absent elsewhere — the
// launch below falls back to Playwright's own resolution.
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const DEMO_ID = "1a1a1a1a-1111-4111-8111-111111111111";

const producer = {
  id: DEMO_ID,
  name: "מאפיית הדגמה",
  slug: "demo-bakery",
  city: "זכרון יעקב",
  description: "עסק הדגמה לבדיקת המפה",
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  images: [],
  lat: 32.5732,
  lng: 34.9519,
  locations: [
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
  ],
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

// One read of everything the acceptance criteria talk about, straight off the
// rendered DOM. `dialog` is scoped so the overlay's own map/attribution are
// counted separately from the inline ones.
const readState = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const containers = [...document.querySelectorAll(".leaflet-container")];
    const inline = containers.find((c) => !dialog?.contains(c)) ?? null;
    const overlay = dialog?.querySelector(".leaflet-container") ?? null;
    const draggable = (el) => (el ? el.classList.contains("leaflet-grab") : null);
    return {
      maps: containers.length,
      inlineDraggable: draggable(inline),
      overlayDraggable: draggable(overlay),
      inlineZoomControls: inline ? inline.querySelectorAll(".leaflet-control-zoom").length : 0,
      overlayZoomControls: overlay ? overlay.querySelectorAll(".leaflet-control-zoom").length : 0,
      inlineAttribution: inline
        ? inline.querySelectorAll(".leaflet-control-attribution").length
        : 0,
      overlayAttribution: overlay
        ? overlay.querySelectorAll(".leaflet-control-attribution").length
        : 0,
      dialogOpen: !!dialog,
      bodyOverflow: document.body.style.overflow,
      expandButtons: document.querySelectorAll('button[aria-label="הגדלת המפה למסך מלא"]').length,
      closeButtons: document.querySelectorAll('button[aria-label="סגירת המפה במסך מלא"]').length,
    };
  });

async function run(width, height, label, touch = false) {
  const browser = await chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
  });
  // `touch` runs the mobile pass as a real touch device: page.tap() dispatches
  // touchstart/touchend, not a mouse click. Worth a separate mode because the
  // whole canvas-open path rests on a claim about touch — Leaflet 1.9.4 ships
  // no `tap` handler, so nothing of its own intercepts the gesture and the
  // browser's synthesized click reaches map.on("click"). A mouse-only run
  // would assert the desktop half twice and call it mobile coverage.
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });

  await page.route(new RegExp(`/api/producers/${DEMO_ID}(?:\\?[^#]*)?$`), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(producer),
    }),
  );
  await page.route(/\/api\/(reviews|producers\/[^/]+\/(products|events|recipes|experiences))/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.goto(`${BASE}/producer/${DEMO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".leaflet-container", { timeout: 30_000 });
  await page.locator(".leaflet-container").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);

  // ── inline preview ────────────────────────────────────────────────────────
  const inline = await readState(page);
  check(`[${label}] inline: one map, one expand button`,
    inline.maps === 1 && inline.expandButtons === 1,
    `maps=${inline.maps} expand=${inline.expandButtons}`);
  check(`[${label}] inline: +/− zoom control rendered`, inline.inlineZoomControls === 1,
    `controls=${inline.inlineZoomControls}`);
  check(`[${label}] inline: OSM attribution rendered (ODbL)`, inline.inlineAttribution === 1,
    `attribution=${inline.inlineAttribution}`);
  check(`[${label}] inline: NOT draggable (no scroll-trap)`, inline.inlineDraggable === false,
    `leaflet-grab=${inline.inlineDraggable}`);
  await page.screenshot({ path: path.join(OUT, `minimap-${label}-01-inline.png`) });

  // ── canvas tap → overlay ──────────────────────────────────────────────────
  // Deliberate coordinates, not "click the middle": the container also hosts
  // the +/− control (top, physical left — Leaflet's position is physical in
  // both directions), the attribution (bottom, physical right), the expand
  // button (top, physical right) and the pin (dead centre). Landing on any of
  // those would open the overlay through a path other than the canvas one and
  // make this step prove nothing. x=60,y=150 is below the control column,
  // above the attribution strip, and away from the centre pin.
  const canvas = page.locator(".leaflet-container").first();
  await (touch
    ? canvas.tap({ position: { x: 60, y: 150 } })
    : canvas.click({ position: { x: 60, y: 150 } }));
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
  await page.waitForTimeout(1200);

  const open = await readState(page);
  check(`[${label}] canvas ${touch ? "TAP (touch)" : "click"} opens the fullscreen dialog`,
    open.dialogOpen, touch ? "real touchstart/touchend, no synthetic mouse click" : "");
  check(`[${label}] overlay: a SECOND map instance`, open.maps === 2, `maps=${open.maps}`);
  check(`[${label}] overlay: draggable (all gestures live)`, open.overlayDraggable === true,
    `leaflet-grab=${open.overlayDraggable}`);
  check(`[${label}] overlay: +/− control rendered`, open.overlayZoomControls === 1,
    `controls=${open.overlayZoomControls}`);
  check(`[${label}] overlay: OSM attribution rendered (ODbL)`, open.overlayAttribution === 1,
    `attribution=${open.overlayAttribution}`);
  check(`[${label}] overlay: close button present`, open.closeButtons === 1,
    `close=${open.closeButtons}`);
  check(`[${label}] overlay: body scroll locked`, open.bodyOverflow === "hidden",
    `overflow="${open.bodyOverflow}"`);
  await page.screenshot({ path: path.join(OUT, `minimap-${label}-02-overlay.png`) });

  // ── Esc closes + scroll lock released ─────────────────────────────────────
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const closed = await readState(page);
  check(`[${label}] Esc closes the overlay`, !closed.dialogOpen && closed.maps === 1,
    `dialog=${closed.dialogOpen} maps=${closed.maps}`);
  check(`[${label}] body scroll lock released on close`, closed.bodyOverflow !== "hidden",
    `overflow="${closed.bodyOverflow}"`);

  await browser.close();
}

fs.mkdirSync(OUT, { recursive: true });
await run(1440, 900, "1440");
await run(375, 812, "375", true);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
