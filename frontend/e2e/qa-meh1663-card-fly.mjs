// MEH-1663 local-stack QA. Phase A (pre-fix discriminator) + Phase B (post-fix AC).
// Usage (from frontend/): node e2e/qa-meh1663-card-fly.mjs <phase: a|b> <width>
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PHASE = process.argv[2];
const WIDTH = parseInt(process.argv[3] || "1440", 10);
// Fail fast: an unrecognised phase used to fall silently into the Phase-B branch,
// so a typo produced a full run of the wrong assertions.
if (!["a", "b"].includes(PHASE)) {
  console.error("usage: node e2e/qa-meh1663-card-fly.mjs <a|b> [width]");
  process.exit(1);
}
// Resolved from this file's own location, not the sandbox's absolute path — an
// earlier version hard-coded /home/user/... and would have written somewhere
// unintended on any other machine, silently.
const OUT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../qa-artifacts/MEH-1663");
fs.mkdirSync(OUT, { recursive: true });

const DELIVERY_NAME = "משק החלב של דנה";       // demo-delivery-pickup, lat/lng NULL
const MULTI_NAME = "רוח השדה";                  // ruach-hasadeh, 10 locations
const PICKUP = { lat: 32.519, lng: 34.953 };

const log = [];
const rec = (name, verdict, detail) => {
  log.push({ name, verdict, detail });
  console.log(`${verdict === true ? "PASS" : verdict === false ? "FAIL" : verdict}  ${name}  ${detail ?? ""}`);
};

// Read the live camera from the rendered TILE GRID.
//
// Leaflet does not expose its map instance on the container, and MapComponent
// keeps it in a closure — an earlier version of this probe reached for
// `el._leaflet_map` and silently returned null, which reads exactly like "the
// camera did not move". Tile srcs are the observable that always exists:
// https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png. They are present even
// though the sandbox cannot fetch OSM, so this works offline.
//
// Averaging the tile x/y at zoom z and inverting the Web-Mercator tile formula
// gives the viewport centre; z is the zoom exactly.
const camera = (page) =>
  page.evaluate(() => {
    // /map mounts TWO MapComponents (desktop split-pane + mobile sheet shell);
    // one is display:none with a 0x0 box. Read only the pane the user can see,
    // the same visible-instance discipline as useMapSync.registerMapApi.
    const pane = [...document.querySelectorAll(".leaflet-container")].find((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!pane) return null;
    const srcs = [...pane.querySelectorAll("img.leaflet-tile")]
      .map((i) => i.src.match(/\/(\d+)\/(\d+)\/(\d+)\.png/))
      .filter(Boolean);
    if (!srcs.length) return null;
    const z = Math.max(...srcs.map((m) => +m[1]));
    const at = srcs.filter((m) => +m[1] === z);
    const n = 2 ** z;
    // +0.5 → tile centre; average over the loaded grid ≈ viewport centre.
    const x = at.reduce((s, m) => s + +m[2] + 0.5, 0) / at.length;
    const y = at.reduce((s, m) => s + +m[3] + 0.5, 0) / at.length;
    const lng = (x / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
    return { lat: (latRad * 180) / Math.PI, lng, zoom: z, tiles: at.length };
  });

// MEH-1619: a probe that cannot tell a moved camera from a broken read is not
// evidence. Run it FIRST — drive Leaflet directly through a known displacement
// and assert the probe follows. If this fails, nothing below is worth reading.
async function selfTestCamera(page) {
  const before = await camera(page);
  if (!before) return { ok: false, why: "probe returned null on a live map" };
  // Move the map by a large, unambiguous amount via a real user gesture
  // (drag), so no app code is involved in the displacement. Coordinates come
  // from the VISIBLE pane's own box — hardcoded ones fall outside a 375px
  // viewport, which made this self-test abort (correctly) at mobile width.
  const box = await page.evaluate(() => {
    const pane = [...document.querySelectorAll(".leaflet-container")].find((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!pane) return null;
    const r = pane.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!box) return { ok: false, why: "no visible map pane to drag" };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = Math.min(box.w * 0.3, 250);
  const dy = Math.min(box.h * 0.2, 150);
  await page.mouse.move(cx + dx / 2, cy + dy / 2);
  await page.mouse.down();
  await page.mouse.move(cx - dx / 2, cy - dy / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(2000);
  const after = await camera(page);
  if (!after) return { ok: false, why: "probe returned null after a drag" };
  const moved = Math.hypot((after.lat - before.lat) * 111, (after.lng - before.lng) * 93);
  // And confirm it reports STILL when nothing happens.
  const again = await camera(page);
  const still = Math.hypot((again.lat - after.lat) * 111, (again.lng - after.lng) * 93);
  return {
    ok: moved > 1 && still < 0.01,
    why: `drag moved probe ${moved.toFixed(2)}km (want >1), idle drift ${still.toFixed(4)}km (want ~0)`,
    before, after,
  };
}

// The card list ALSO renders twice (desktop sidebar + mobile sheet, MEH-1010).
// `:visible` picks the mount the user can actually click.
const cardHandle = async (page, name) =>
  page.locator('[data-testid="map-card"]:visible', { hasText: name }).first();

// Pin-Echo = inline borderWidth 2px + category-tinted background (MapProducerCard.jsx:106-114)
const selectionState = async (card) =>
  card.evaluate((el) => ({
    borderWidth: getComputedStyle(el).borderWidth,
    background: getComputedStyle(el).backgroundColor,
    padding: getComputedStyle(el).padding,
  }));


// Tap a card the way a user would. On mobile the sheet's card can sit under the
// BottomNav pill (z-1000), which intercepts the pointer — centring the card in
// its scroll container clears it without resorting to force:true (which would
// bypass actionability and could hide a real overlap bug).
async function clickCard(card) {
  await card.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await card.page().waitForTimeout(400);
  await card.click({ timeout: 15000 });
}

// Below lg the list lives in MapBottomSheet, which starts at PEEK (14vh) — too
// short to tap a card without the BottomNav pill (z-1000) intercepting. The
// sheet only responds to TOUCH events (MapBottomSheet.jsx:107-112), so raise it
// to HALF with synthetic touches; Playwright's mouse API cannot drive it.
async function expandSheet(page) {
  if (WIDTH >= 1024) return "n/a (desktop split-pane)";
  // Open the sheet the way the APP does: handleMarkerClick sets snap = HALF
  // (useMapSync.js:137-139). Dragging the handle was tried first — both a
  // synthetic TouchEvent and real CDP touch events reached the document (verified
  // touchstart/touchmove/touchend firing) but never moved the sheet off PEEK, so
  // the drag path is not usable from this harness. The marker tap is a genuine
  // user gesture and needs no app internals.
  //
  // Zoom in until markers un-cluster: at the default zoom every pin is inside a
  // cluster, and a cluster click zooms rather than selecting a producer.
  for (let i = 0; i < 5; i++) {
    await page.locator(".leaflet-control-zoom-in").first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  const pin = page.locator(".leaflet-marker-icon:not(.mehamakor-cluster)").first();
  if (!(await pin.count())) return "no un-clustered marker to tap";
  await pin.click({ timeout: 8000 });
  await page.waitForTimeout(1400);
  // The marker tap also SELECTED that producer — clear it so each card
  // assertion below starts from an unselected state (handleMapCanvasClick).
  const pane = await page.locator(".leaflet-container").filter({ visible: true }).first().boundingBox();
  if (pane) await page.mouse.click(pane.x + 12, pane.y + 12);
  const ok = true;
  await page.waitForTimeout(1200);
  const h = await page.evaluate(() => {
    const s = document.querySelector('.fixed.inset-x-0.bottom-0.z-\\[600\\]');
    return s ? Math.round(s.getBoundingClientRect().height / window.innerHeight * 100) : null;
  });
  return `dispatched=${ok} sheetHeight=${h}vh`;
}

const shot = async (page, file) => {
  await page.screenshot({ path: `${OUT}/${file.replace(/\.webp$/, ".png")}`, fullPage: false });
  return file;
};

const dist = (a, b) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 93); // rough km

(async () => {
  // The CC sandbox ships Chromium build 1194 while this Playwright expects 1228,
  // so it needs an explicit executablePath (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is
  // set there and `playwright install` is not to be run). Everywhere else that
  // binary does not exist and Playwright's own resolution is correct — so probe
  // rather than hard-wire, otherwise this fails to launch with no hint why.
  const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch({
    ...(fs.existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
    // TLS 1.2 cap is the sandbox-vs-Vercel-edge workaround (.claude/rules/testing.md);
    // harmless against a local next start.
    args: ["--ssl-version-max=tls1.2", "--no-sandbox"],
  });
  // hasTouch matters: MapBottomSheet listens for touch events only, and the
  // sheet must be raised before a card is tappable at 375.
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: WIDTH < 500 ? 812 : 900 },
    hasTouch: WIDTH < 1024,
    isMobile: WIDTH < 1024,
  });
  const tag = `${PHASE}-${WIDTH}`;

  await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
  // Wait for a VISIBLE map pane (two mount at <lg; the other is 0x0).
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".leaflet-container")].some((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }), { timeout: 30000 });
  await page.waitForSelector('[data-testid="map-card"]:visible', { timeout: 20000 });
  await page.waitForTimeout(2500);

  // Gate everything on the probe proving it discriminates.
  const st = await selfTestCamera(page);
  rec("SELF-TEST camera probe discriminates", st.ok, st.why);
  if (!st.ok) { console.log("ABORT: camera probe unreliable"); await browser.close(); process.exit(2); }
  // Reset to the default view after the self-test drag.
  await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="map-card"]:visible', { timeout: 20000 });
  await page.waitForTimeout(3000);
  rec("SETUP sheet raised for tapping", "INFO", await expandSheet(page));
  await page.waitForTimeout(800);

  if (PHASE === "a") {
    // ---- Phase A: what does the PRE-fix click actually do? ----
    const card = await cardHandle(page, DELIVERY_NAME);
    const before = await selectionState(card);
    const camBefore = await camera(page);
    await shot(page, `a-${WIDTH}-01-before.webp`);

    await clickCard(card);
    await page.waitForTimeout(2500); // 250ms hop + 1.2s flyTo + settle

    const after = await selectionState(card);
    const camAfter = await camera(page);
    const f = await shot(page, `a-${WIDTH}-02-after-click.webp`);

    const selected = before.borderWidth !== after.borderWidth || before.background !== after.background;
    const moved = camBefore && camAfter && dist(camBefore, camAfter) > 0.5;

    rec("A1 card receives selection treatment", selected,
      `border ${before.borderWidth}→${after.borderWidth} · bg ${before.background}→${after.background} · ${f}`);
    rec("A2 map camera moves", moved,
      `center ${JSON.stringify(camBefore)} → ${JSON.stringify(camAfter)} · ${f}`);
    console.log("PHASE_A_SELECTED=" + selected);
    console.log("PHASE_A_MOVED=" + moved);
  } else {
    // ---- Phase B: post-fix acceptance criteria ----
    let pass = 0;

    // B1 — delivery-only card flies to the pickup point + selects
    let card = await cardHandle(page, DELIVERY_NAME);
    const b1Before = await selectionState(card);
    await clickCard(card);
    await page.waitForTimeout(2500);
    const camB1 = await camera(page);
    const b1After = await selectionState(card);
    const f1 = await shot(page, `b-${WIDTH}-01-delivery-only.webp`);
    const near = camB1 && dist(camB1, PICKUP) < 2;
    const sel1 = b1Before.borderWidth !== b1After.borderWidth || b1Before.background !== b1After.background;
    const b1 = near && sel1;
    if (b1) pass++;
    rec("B1 delivery-only → camera on pickup + selected", b1,
      `camera ${JSON.stringify(camB1)} vs ${JSON.stringify(PICKUP)} · selected=${sel1} · ${f1}`);

    // B4 — "חפשי באזור זה" banner must NOT appear after a programmatic fly
    const bannerCount = await page.locator('text=חפשי באזור זה').count();
    const b4 = bannerCount === 0;
    if (b4) pass++;
    const f4 = await shot(page, `b-${WIDTH}-02-no-search-banner.webp`);
    rec("B4 search-this-area banner absent after fly", b4, `matches=${bannerCount} · ${f4}`);

    // B2 — multi-location card frames all points, zoom capped (FIT_MAX_ZOOM 15)
    card = await cardHandle(page, MULTI_NAME);
    await clickCard(card);
    await page.waitForTimeout(2500);
    const camB2 = await camera(page);
    const f2 = await shot(page, `b-${WIDTH}-03-multi-location.webp`);
    const b2 = camB2 && camB2.zoom <= 15;
    if (b2) pass++;
    rec("B2 multi-location → framed, zoom capped ≤15", b2,
      `camera ${JSON.stringify(camB2)} · ${f2}`);

    // B3 — a single-point regular business still flies (zoom 14 path)
    // Named explicitly. Picking "the first other card" first landed on
    // demo-diet-unknown, which has lat/lng NULL *and* zero locations — a genuinely
    // PINLESS business, so its camera correctly does not move. That is the
    // "0 usable points → keep selection, no camera move" case, not a regression;
    // it is asserted separately as B6. teva-pure is the real single-point shape:
    // own Producer.lat/lng, no location rows.
    const single = "טבע פור";
    card = await cardHandle(page, single);
    await clickCard(card);
    await page.waitForTimeout(2500);
    const camB3 = await camera(page);
    const f3 = await shot(page, `b-${WIDTH}-04-single-point.webp`);
    const b3 = camB3 && camB3.zoom === 14;
    if (b3) pass++;
    rec("B3 single-point regular business → flyTo zoom 14", b3,
      `business=${single} camera ${JSON.stringify(camB3)} · ${f3}`);

    // B5 — second click on an already-selected card navigates to /{slug}
    card = await cardHandle(page, DELIVERY_NAME);
    await clickCard(card);           // select
    await page.waitForTimeout(1800);
    await clickCard(card);           // second tap → navigate
    await page.waitForTimeout(3000);
    const url = page.url();
    const f5 = await shot(page, `b-${WIDTH}-05-second-click-nav.webp`);
    const b5 = url.includes("demo-delivery-pickup");
    if (b5) pass++;
    rec("B5 second click navigates to /{slug}", b5, `url=${url} · ${f5}`);

    // B6 — pinless business: selects, camera holds, and the map is NOT demoted
    // (MapComponent.jsx:465 hasPins — otherwise every marker greys with nothing lit).
    // B5 navigated off /map, so come back and re-open the sheet first.
    await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="map-card"]:visible', { timeout: 20000 });
    await page.waitForTimeout(2500);
    await expandSheet(page);
    card = await cardHandle(page, "מצב לא ידוע");
    const camBefore6 = await camera(page);
    const s6Before = await selectionState(card);
    await clickCard(card);
    await page.waitForTimeout(2500);
    const camAfter6 = await camera(page);
    const s6After = await selectionState(card);
    const demoted = await page.evaluate(() =>
      [...document.querySelectorAll(".leaflet-container")].some((c) => c.className.includes("focused")));
    const f6 = await shot(page, `b-${WIDTH}-06-pinless.webp`);
    const sel6 = s6Before.borderWidth !== s6After.borderWidth || s6Before.background !== s6After.background;
    const held = camBefore6 && camAfter6 && dist(camBefore6, camAfter6) < 0.1;
    const b6 = sel6 && held && !demoted;
    rec("B6 pinless business → selected, camera holds, map not demoted", b6,
      `selected=${sel6} cameraHeld=${held} demoted=${demoted} · ${f6}`);

    console.log(`PHASE_B_PASS_COUNT=${pass}/5 @${WIDTH} (+B6 ${b6 ? "PASS" : "FAIL"})`);
  }

  fs.writeFileSync(`${OUT}/report-${tag}.json`, JSON.stringify(log, null, 2));
  await browser.close();
})().catch((e) => { console.error("HARNESS ERROR:", e.message); process.exit(1); });
