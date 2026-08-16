/**
 * MEH-1853 self-QA — the reserved box is the box that ARRIVES.
 *
 * The CLS numbers themselves come from CI against staging
 * (`.github/workflows/cls-measure.yml` → `qa-meh1853-cls.mjs`); a browser in
 * the CC sandbox cannot reach staging at all. This harness answers the one
 * question those numbers cannot answer on their own:
 *
 *     does `MiniMapPlaceholder` reserve the SAME height that `MiniMap`
 *     occupies once its chunk lands?
 *
 * WHY THAT IS THE QUESTION, AND WHY THE OBVIOUS FIX FAILS IT
 * ---------------------------------------------------------
 * `MiniMap` is not a 300px map. It is a 300px map box (`MiniMap.jsx:502`)
 * PLUS a navigation row that is on by default (`showNavigation` defaults true,
 * `MiniMap.jsx:546`) — `mt-3` and a `min-h-[44px]` pill pair, ~56px more.
 *
 * A placeholder that reserves only `height: 300` — which is what "reserve the
 * map's height" reads as, and what the ticket's own phrasing suggests — leaves
 * ~56px of the original shift in place. CLS would improve a lot and still not
 * be right, and no assertion built from "CLS went down" could tell the two
 * apart. This one can: it measures both boxes and compares them.
 *
 * The delta tolerance is 2px, for sub-pixel rounding only.
 *
 * HOW THE PLACEHOLDER IS MADE OBSERVABLE
 * --------------------------------------
 * `dynamic(..., { ssr: false })` swaps the placeholder for the real component
 * as soon as the chunk resolves, which on localhost is too fast to sample. So
 * the chunk request is delayed deliberately via `page.route`. That is a
 * measurement aid, not a simulation of production: the ORDER of events is what
 * is under test (placeholder first, component second, same height), and the
 * delay only widens the window in which the first can be read.
 *
 * REUSES: e2e/qa-meh1652-cta-note-removed.mjs — mock-API + real-SSR harness
 * shape, the dual-viewport loop, and the "fail loud if the mock never bound"
 * rule. Same reason as there: NEXT_PUBLIC_* are inlined at BUILD time, so the
 * page must be served the real way and fed by a real server on the port the
 * bundle already points at.
 *
 * Run manually:  node e2e/qa-meh1853-placeholder-fit.mjs
 */
import { chromium } from "@playwright/test";
import http from "node:http";
import { spawn } from "node:child_process";

const API_PORT = 8000;
const APP_PORT = 3900 + (process.pid % 90);
const BASE = `http://localhost:${APP_PORT}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PRODUCER_ID = "11111111-1111-4111-8111-111111111111";

// Sub-pixel rounding only. Anything larger is a real difference in reserved
// height, which is exactly the defect this harness exists to catch.
const TOLERANCE_PX = 2;
// Long enough to sample the placeholder without making the run tedious.
const CHUNK_DELAY_MS = 1500;

function baseProducer() {
  return {
    id: PRODUCER_ID,
    name: "מאפיית שדה",
    slug: null,
    description: "לחם מחמצת בתנור אבן, אפייה יומית.",
    short_description: "מאפיית בוטיק",
    city: "רמת השרון",
    status: "approved",
    availability_state: "accepting_orders",
    phone: "0501234567",
    primary_contact_method: "whatsapp",
    // The MiniMap mount is gated on parseHasLocation(): has_physical_location
    // !== false AND lat AND lng (ProducerSections.jsx:52). All three, or the
    // component never mounts and the harness measures an empty page.
    has_physical_location: true,
    lat: 32.1461,
    lng: 34.8404,
    images: [],
    products: [],
    categories: [{ id: 2, name: "לחמים ואפייה" }],
    delivery_areas: [],
    locations: [],
    kashrut_badges: [],
    custom_questions: [],
    avg_rating: 0,
    reviews_count: 0,
    offers_delivery: false,
    order_window: null,
  };
}

function startMockApi() {
  const server = http.createServer((req, res) => {
    const path = req.url.split("?")[0];
    res.setHeader("content-type", "application/json");
    if (path === `/producers/${PRODUCER_ID}`) return res.end(JSON.stringify(baseProducer()));
    return res.end("[]");
  });
  return new Promise((resolve, reject) => {
    // Fail LOUD: a silently-unbound mock means the page falls back to the real
    // API and the whole capture is meaningless.
    server.once("error", reject);
    server.listen(API_PORT, () => resolve(server));
  });
}

function startApp() {
  return spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    env: { ...process.env },
    stdio: "ignore",
    detached: true,
  });
}

async function waitForApp() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("next start never became ready");
}

/**
 * The single measurement, used by BOTH the self-test and the real capture, so
 * the two cannot drift (MEH-1619).
 *
 * Returns the outer height of whichever of the two is present. `offsetHeight`
 * rather than getBoundingClientRect().height because it is the layout box the
 * document actually reserves — a transform on an ancestor would change the
 * rect without changing what the page reserves, and reserved space is the
 * subject here.
 */
async function measure(page) {
  return page.evaluate(() => {
    const ph = document.querySelector('[data-testid="minimap-placeholder"]');
    // The real MiniMap has no testid, so it is located from the inside out:
    // find the .leaflet-container it mounts, walk UP to the map box — the one
    // element carrying the inline `height: 300px` from MiniMap.jsx:502 — and
    // take that box's parent, which is MiniMap's outer wrapper and therefore
    // the element the placeholder stands in for.
    //
    // The walk is written against the inline style rather than a class because
    // the height is what is being measured; a Tailwind class list can be
    // reshuffled by a refactor without changing the box, and a selector built
    // on it would then match nothing and report "component absent".
    //
    // AN EARLIER VERSION READ `leaflet.closest("div").parentElement` AND WAS
    // WRONG: `closest()` matches the element ITSELF first, so on a
    // `.leaflet-container` that is a <div> it returned the container, and the
    // parent of that is still inside the 300px box. It reported realH=300 and
    // therefore a 56px delta — a FAILING verdict on a CORRECT fix. Case 2 of
    // the self-test caught it before the number reached a ticket.
    const leaflet = document.querySelector(".leaflet-container");
    let box = leaflet;
    while (box && box.style.height !== "300px") box = box.parentElement;
    const real = box ? box.parentElement : null;
    return {
      placeholderPresent: !!ph,
      placeholderHeight: ph ? ph.offsetHeight : null,
      realPresent: !!real,
      realHeight: real ? real.offsetHeight : null,
    };
  });
}

/**
 * Self-test FIRST, on synthetic DOM, exercising the REAL measure().
 *
 * Case 3 is the one that earns its keep: it feeds the measure a placeholder
 * built the NAIVE way — 300px map box, no nav row — and asserts the harness
 * reports a height that does NOT match the full component. A harness that only
 * checked "a placeholder exists" would pass that case, and passing it is the
 * exact failure this file was written to prevent.
 */
async function selfTest(browser) {
  const NAV_ROW = `<div style="display:flex;gap:12px;margin-top:12px">
      <div style="flex:1;min-height:44px"></div><div style="flex:1;min-height:44px"></div></div>`;
  const cases = [
    {
      name: "placeholder only (chunk still loading)",
      html: `<div data-testid="minimap-placeholder">
               <div style="height:300px"></div>${NAV_ROW}</div>`,
      expect: { placeholderPresent: true, placeholderHeight: 356, realPresent: false },
    },
    {
      name: "component only (chunk landed)",
      html: `<div><div style="height:300px"><div class="leaflet-container"></div></div>${NAV_ROW}</div>`,
      expect: { placeholderPresent: false, realPresent: true, realHeight: 356 },
    },
    {
      name: "NAIVE placeholder — 300px map box only, nav row missing",
      html: `<div data-testid="minimap-placeholder"><div style="height:300px"></div></div>`,
      // 300, not 356 — the 56px the naive fix leaves behind. The harness must
      // REPORT this difference rather than smooth it over.
      expect: { placeholderPresent: true, placeholderHeight: 300, realPresent: false },
    },
  ];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const lines = [];
  for (const c of cases) {
    await page.setContent(`<body dir="rtl" style="margin:0">${c.html}</body>`);
    const got = await measure(page);
    const ok = Object.entries(c.expect).every(([k, v]) => got[k] === v);
    lines.push(`  ${ok ? "PASS" : "FAIL"} self-test: ${c.name} → ${JSON.stringify(got)}`);
    if (!ok) lines.push(`       expected ${JSON.stringify(c.expect)}`);
  }
  // The discrimination, stated rather than implied: case 1 and case 3 differ by
  // exactly the nav row, and the harness separates them.
  lines.push(`  (cases 1 and 3 differ by 56px — that gap IS the naive fix)`);
  await ctx.close();
  return { lines, ok: !lines.some((l) => l.includes("FAIL")) };
}

async function main() {
  const api = await startMockApi();
  const app = startApp();
  await waitForApp();

  const browser = await chromium.launch({ executablePath: CHROME });
  const findings = [];

  const st = await selfTest(browser);
  findings.push("=== self-test (does the measure discriminate?) ===", ...st.lines, "");
  if (!st.ok) findings.push("SELF-TEST FAILED — measurements below are not trustworthy.");

  findings.push("=== real page (chunk delayed so the placeholder is observable) ===");
  let allPass = st.ok;

  for (const [label, width, height] of [
    ["390", 390, 844],
    ["1280", 1280, 900],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      locale: "he-IL",
      timezoneId: "Asia/Jerusalem",
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await ctx.addInitScript(() => localStorage.setItem("cookieConsent", "all"));

    // Delay every JS chunk that carries leaflet/MiniMap. Matching on the URL
    // rather than a chunk name because Next's chunk names are build-generated
    // and would silently stop matching after any refactor — a route that
    // matches nothing would make the placeholder unobservable and this test
    // would report "placeholder absent" as though the fix were missing.
    let delayed = 0;
    await page.route(/_next\/static\/chunks\/.*\.js/, async (route) => {
      const url = route.request().url();
      const res = await route.fetch();
      const body = await res.text();
      if (body.includes("leaflet-container") || body.includes("leaflet")) {
        delayed += 1;
        await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
      await route.fulfill({ response: res, body });
      void url;
    });

    await page.goto(`${BASE}/producer/${PRODUCER_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByText("מאפיית שדה").first().waitFor({ timeout: 30000 });

    // Sample 1 — while the chunk is held.
    await page.waitForTimeout(400);
    const whileLoading = await measure(page);

    // Sample 2 — after it lands.
    await page.waitForSelector(".leaflet-container", { timeout: 30000 });
    await page.waitForTimeout(600);
    const afterLoad = await measure(page);

    const delta =
      whileLoading.placeholderHeight != null && afterLoad.realHeight != null
        ? Math.abs(whileLoading.placeholderHeight - afterLoad.realHeight)
        : null;

    // Three separate conjuncts, never an `||`: "the placeholder appeared",
    // "the component replaced it", and "they are the same height" are three
    // different failures and each has to be nameable on its own.
    const sawPlaceholder = whileLoading.placeholderPresent === true;
    const componentLanded = afterLoad.realPresent === true;
    const fits = delta !== null && delta <= TOLERANCE_PX;
    const pass = sawPlaceholder && componentLanded && fits;
    if (!pass) allPass = false;

    findings.push(
      `[@${label}] ${pass ? "PASS" : "FAIL"} ` +
        `chunksDelayed=${delayed} placeholderSeen=${sawPlaceholder} ` +
        `placeholderH=${whileLoading.placeholderHeight} ` +
        `componentLanded=${componentLanded} realH=${afterLoad.realHeight} ` +
        `delta=${delta}px (tolerance ${TOLERANCE_PX}px)`
    );

    await ctx.close();
  }

  await browser.close();
  try {
    process.kill(-app.pid, "SIGKILL");
  } catch {
    /* already gone */
  }
  api.close();

  console.log(findings.join("\n"));
  console.log(`\n${allPass ? "ALL PASS" : "FAILURES PRESENT"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
