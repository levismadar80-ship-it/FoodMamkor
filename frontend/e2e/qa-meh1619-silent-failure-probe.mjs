/**
 * MEH-1619 Phase 0 — computed-style / rendered-DOM probe.
 *
 * The audit's verdicts come from here, NOT from reading CSS. A rule can look
 * correct in `globals.css` and still be dead (selector never matches) or
 * overridden (the library writes the same property inline, and inline beats a
 * class rule). Both failure modes are invisible to grep and to the type system,
 * which is the whole point of the ticket.
 *
 * Prints a table per class; the audit doc quotes these numbers verbatim.
 *
 * Run: node e2e/qa-meh1619-silent-failure-probe.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PRODUCERS_RE = /\/api\/producers(?:\?[^#]*)?$/;
const DEMO_ID = "1a1a1a1a-1111-4111-8111-111111111111";
const PRODUCER_DETAIL_RE = new RegExp(`/api/producers/${DEMO_ID}(?:\\?[^#]*)?$`);

const demoLocations = [
  { kind: "branch", label: "הסניף", lat: 32.08, lng: 34.78, is_primary: true, precision: "exact" },
  ...Array.from({ length: 9 }, (_, i) => ({
    kind: i % 2 === 0 ? "pickup" : "market_stand",
    label: `איסוף ${i + 1}`,
    lat: 32.0 + i * 0.045,
    lng: 34.72 + (i % 3) * 0.06,
    is_primary: false,
    precision: "exact",
  })),
];
const mapProducers = [
  {
    id: DEMO_ID, name: "עסק הדגמה — עשר נקודות", slug: "demo-ten", city: "תל אביב",
    lat: 32.08, lng: 34.78, categories: [{ id: 4, name: "לחמים ואפייה" }], images: [],
    locations: demoLocations, plan: "free", verification_tier: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222", name: "עסק שכן", slug: "nb", city: "רמת גן",
    lat: 32.05, lng: 34.95, categories: [{ id: 4, name: "לחמים ואפייה" }], images: [],
    locations: [], plan: "free", verification_tier: null,
  },
];

const launch = () =>
  chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
  });

const rows = [];
const row = (cls, subject, finding) => {
  rows.push({ cls, subject, finding });
  console.log(`[${cls}] ${subject}\n      ${finding}`);
};

async function probeMap() {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route(PRODUCERS_RE, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mapProducers) }),
  );
  await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__MAP_CENTER__ !== undefined, { timeout: 45_000 });
  await page.waitForSelector(".mehamakor-marker-wrap, .mehamakor-cluster", { timeout: 30_000 });
  await page.waitForTimeout(1500);

  // At the initial zoom 8 every pin is inside a cluster, so `.mehamakor-marker-wrap`
  // matches ZERO elements and every marker-level verdict below would read
  // "(missing)" — a measurement artifact, not a finding. Select the demo business
  // first: focusProducer fitBounds over its ten points, which un-clusters them.
  const cards = page.getByText("עסק הדגמה — עשר נקודות");
  for (let i = 0; i < (await cards.count()); i += 1) {
    if (await cards.nth(i).isVisible()) {
      await cards.nth(i).click({ timeout: 5_000 }).catch(() => cards.nth(i).dispatchEvent("click"));
      break;
    }
  }
  await page.waitForTimeout(2500);
  const wrapCount = await page.locator(".mehamakor-marker-wrap").count();
  if (wrapCount === 0) throw new Error("probe precondition failed: still zero un-clustered markers");
  console.log(`  (precondition: ${wrapCount} un-clustered marker elements in the DOM)\n`);

  // ── CLASS A ──────────────────────────────────────────────────────────────
  // A-10: does `.mehamakor-marker` (no -wrap) match ANY element, ever? And does
  // the hover rule's transform survive Leaflet's inline positioning transform?
  const a10 = await page.evaluate(() => {
    const bare = document.querySelectorAll(".mehamakor-marker").length;
    const wrap = document.querySelectorAll(".mehamakor-marker-wrap").length;
    const selected = document.querySelectorAll(".selected").length;
    const visited = document.querySelectorAll(".visited").length;
    const el = document.querySelector(".mehamakor-marker-wrap");
    return {
      bare, wrap, selected, visited,
      inlineTransform: el?.style.transform || "(none)",
      computedTransform: el ? getComputedStyle(el).transform : "(no element)",
    };
  });
  row("A-10", ".mehamakor-marker:not(.selected):not(.visited):hover { transform: scale(1.15) } (globals.css:303)",
    `elements matching '.mehamakor-marker' = ${a10.bare} · matching '.mehamakor-marker-wrap' = ${a10.wrap} · ` +
    `'.selected' = ${a10.selected} · '.visited' = ${a10.visited} · ` +
    `inline transform on wrap = "${a10.inlineTransform}" · computed = "${a10.computedTransform}"`);

  // Hover a real marker: does anything about it change? Decides delete vs re-target.
  const hoverEffect = await page.evaluate(async () => {
    // Compare the icon's rendered HTML, not one hand-picked descendant: the ring
    // lives in an inline box-shadow whose depth differs between the primary and
    // secondary marker shapes, so picking a node by position measures the wrong
    // element for one of them. setIcon() rewrites innerHTML, so an HTML diff
    // catches a ring regardless of which shape it is.
    const el = document.querySelector(".mehamakor-marker-wrap");
    if (!el) return "(no marker)";
    const beforeHtml = el.innerHTML;
    const beforeTransform = getComputedStyle(el).transform;
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));
    const el2 = document.querySelector(".mehamakor-marker-wrap");
    return {
      transformChanged: beforeTransform !== getComputedStyle(el2).transform,
      iconHtmlChanged: beforeHtml !== el2.innerHTML,
      beforeHadRing: /0 0 0 3px/.test(beforeHtml),
      afterHasRing: /0 0 0 3px/.test(el2.innerHTML),
    };
  });
  row("A-10b", "hover affordance actually rendered on a /map marker",
    JSON.stringify(hoverEffect));

  // A-2/A-3: filter rules on panes — is `filter` ever written inline by Leaflet?
  const panes = await page.evaluate(() => {
    const t = document.querySelector(".leaflet-tile-pane");
    const m = document.querySelector(".leaflet-marker-pane");
    return {
      tileInlineFilter: t?.style.filter || "(none)",
      tileComputedFilter: t ? getComputedStyle(t).filter : "(missing)",
      markerInlineFilter: m?.style.filter || "(none)",
      markerComputedFilter: m ? getComputedStyle(m).filter : "(missing)",
      markerInlineTransform: m?.style.transform || "(none)",
    };
  });
  row("A-2/A-3", ".leaflet-tile-pane { filter } (:178) · .leaflet-marker-pane { filter: none } (:183)",
    JSON.stringify(panes));

  // A-9/A-11: background/border !important on wrap + cluster.
  const wrapBg = await page.evaluate(() => {
    const w = document.querySelector(".mehamakor-marker-wrap");
    const c = document.querySelector(".mehamakor-cluster");
    const g = (el) => (el ? { bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth,
      inlineBg: el.style.background || "(none)" } : "(missing)");
    return { wrap: g(w), cluster: g(c) };
  });
  row("A-9/A-11", ".mehamakor-marker-wrap / .mehamakor-cluster { background+border !important } (:298,:307)",
    JSON.stringify(wrapBg));

  // A-4/A-5/A-6: z-index !important on controls.
  const zed = await page.evaluate(() => {
    const g = (sel) => {
      const el = document.querySelector(sel);
      return el ? { computed: getComputedStyle(el).zIndex, inline: el.style.zIndex || "(none)" } : "(missing)";
    };
    return { zoom: g(".leaflet-control-zoom"), topLeft: g(".leaflet-top.leaflet-left"),
      attribution: g(".leaflet-control-attribution") };
  });
  row("A-4/A-5/A-6", "z-index !important on .leaflet-control-* (:198,:201,:216)", JSON.stringify(zed));

  // A-1: .leaflet-container sizing vs Leaflet's own inline width/height writes
  // (Leaflet writes those on TILES, not the container — confirm, don't assume).
  const a1 = await page.evaluate(() => {
    const c = document.querySelector(".leaflet-container");
    const tile = document.querySelector(".leaflet-tile");
    return {
      containerInlineW: c?.style.width || "(none)", containerInlineH: c?.style.height || "(none)",
      containerComputedRadius: c ? getComputedStyle(c).borderTopLeftRadius : "(missing)",
      tileInlineW: tile?.style.width || "(none)", tileInlineH: tile?.style.height || "(none)",
    };
  });
  row("A-1", ".leaflet-container { height/width/border-radius } (:168)", JSON.stringify(a1));

  // A-12: the MEH-1611 demote rule — re-verified here so the audit's own table
  // rests on a fresh measurement, not on the previous ticket's word.
  const a12 = await page.evaluate(() => {
    const demoted = [...document.querySelectorAll(".mehamakor-marker-wrap")].find(
      (el) => !el.classList.contains("mehamakor-marker-focused"),
    );
    return demoted
      ? { computedFilter: getComputedStyle(demoted).filter, inlineOpacity: demoted.style.opacity || "(none)",
          computedOpacity: getComputedStyle(demoted).opacity }
      : "(no demoted marker)";
  });
  row("A-12", ".mehamakor-map-focused .mehamakor-marker-wrap:not(.focused) { filter } (:338)",
    JSON.stringify(a12));

  // Hover affordance, card path: does hovering a CARD ring its marker? This is
  // what decides whether deleting the dead :hover rule loses anything.
  const cardHover = await page.evaluate(async () => {
    const html = () => [...document.querySelectorAll(".mehamakor-marker-wrap")].map((el) => el.innerHTML);
    const before = html();
    const card = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes("עסק שכן"));
    if (!card) return "(no card)";
    // React's onMouseEnter is synthesised from native mouseover; the handler is
    // debounced 400ms (HOVER_DEBOUNCE_MS), so wait past it.
    card.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
    const after = html();
    return {
      anyIconRebuilt: JSON.stringify(before) !== JSON.stringify(after),
      ringsBefore: before.filter((h) => /0 0 0 3px/.test(h)).length,
      ringsAfter: after.filter((h) => /0 0 0 3px/.test(h)).length,
    };
  });
  row("A-10c", "card-hover → marker ring (the JS hover path, useMapSync.js:162-168)",
    JSON.stringify(cardHover));

  // ── CLASS B (on /map, raw-Leaflet markers) ───────────────────────────────
  const bMap = await page.evaluate(() => {
    const el = document.querySelector(".mehamakor-marker-wrap");
    return el
      ? { tag: el.tagName, hasAltAttr: el.hasAttribute("alt"), altValue: el.getAttribute("alt"),
          hasTitleAttr: el.hasAttribute("title"), titleValue: el.getAttribute("title"),
          tabIndex: el.getAttribute("tabindex"), role: el.getAttribute("role"),
          ariaLabel: el.getAttribute("aria-label") }
      : "(missing)";
  });
  row("B-2", "MapComponent.jsx:781 `alt: markerLabel` on L.marker with a divIcon",
    JSON.stringify(bMap));

  await browser.close();
}

async function probeProducerPage() {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route(PRODUCER_DETAIL_RE, (r) =>
    r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        id: DEMO_ID, name: "מאפיית הדגמה", slug: "demo-bakery", city: "זכרון יעקב",
        description: "בדיקה", categories: [{ id: 4, name: "לחמים ואפייה" }], images: [],
        lat: 32.5732, lng: 34.9519, locations: demoLocations, delivery_areas: [],
        plan: "free", verification_tier: null, primary_contact_method: "whatsapp", phone: "0501110001",
      }),
    }),
  );
  await page.goto(`${BASE}/producer/${DEMO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mehamakor-minimap-pin", { timeout: 30_000 });
  await page.waitForTimeout(1000);

  const bMini = await page.evaluate(() => {
    const el = document.querySelector(".mehamakor-minimap-pin");
    return el
      ? { tag: el.tagName, hasAltAttr: el.hasAttribute("alt"), altValue: el.getAttribute("alt"),
          hasTitleAttr: el.hasAttribute("title"), titleValue: el.getAttribute("title") }
      : "(missing)";
  });
  row("B-1", "MiniMap.jsx:126 `alt={label}` on <Marker> with a divIcon",
    JSON.stringify(bMini));

  await browser.close();
}

// A-7: the attribution margin rule is mobile-only (<1024px) and is the one
// !important in globals.css carrying a "measured" note. Probe it at 375 so the
// audit can say whether that note still holds, rather than trusting the comment.
async function probeAttributionMobile() {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.route(PRODUCERS_RE, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mapProducers) }),
  );
  await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__MAP_CENTER__ !== undefined, { timeout: 45_000 });
  await page.waitForTimeout(2000);
  const a7 = await page.evaluate(() => {
    const el = document.querySelector(".leaflet-control-attribution");
    if (!el) return "(missing)";
    return {
      computedMarginBottom: getComputedStyle(el).marginBottom,
      inlineMarginBottom: el.style.marginBottom || "(none)",
      sheetVar: getComputedStyle(document.documentElement).getPropertyValue("--map-sheet-h") || "(unset)",
      computedZ: getComputedStyle(el).zIndex,
    };
  });
  row("A-7", ".leaflet-control-attribution { margin-bottom !important } @<1024px (:238)",
    JSON.stringify(a7));
  await browser.close();
}

await probeMap();
await probeAttributionMobile();
await probeProducerPage();
console.log(`\n${rows.length} probe rows recorded.`);
