/**
 * MEH-2108 — is the CitySearch suggestion list actually OCCLUDED by map chrome,
 * and does z-[1000] → z-[1010] actually clear it?
 *
 * WHY THIS FILE EXISTS AT ALL. PR #2989 reported "9 of 15 samples covered → 0 of
 * 15" from a hit-test probe that was never committed. The tree is clean and the
 * #2102 harness contains no `elementFromPoint`, so that number cannot be re-run,
 * re-read, or falsified by anyone. An artifact whose as-of is unrecoverable can
 * only be replaced, not ratified (.claude/rules/testing.md). This replaces it.
 *
 * WHY A HIT TEST AND NOT A BOX INTERSECTION. The #2102 harness answers "do the
 * boxes overlap" — geometry. A z-index change does not move geometry: the boxes
 * still intersect by the same 72px afterwards. The quantity that must reach zero
 * is OCCLUSION — who paints on top — and only `elementFromPoint` reads that.
 * Reporting "overlap 72px → 0" would be reporting a number this change cannot
 * move, which is why the card's DoD wording is corrected rather than satisfied.
 *
 * ── CONTROLS. Read this before believing any number below. ───────────────────
 * Every null in this probe has a reassuring twin: a dropdown that never opened,
 * a sample point below the fold, and a genuinely clear list ALL yield "nothing
 * covering the list". Three controls separate them, and the run prints VOID
 * rather than a verdict if any fails.
 *
 *   C0 LIVE     every sample point returns a non-null element. A point outside
 *               the viewport returns null, which would otherwise score as clear.
 *   C1 SELF     a point inside the list but OUTSIDE the map's box must resolve
 *               to the list itself. If it does not, the locator is wrong or the
 *               list never opened, and every "clear" in the run is meaningless.
 *   C2 CHROME   the SAME band points, re-sampled with the list hidden, must
 *               reveal map chrome. This proves the chrome is still physically
 *               there and the list is on top of it — rather than the band
 *               simply containing no chrome at all.
 *
 * C2 is the one that is easy to get wrong, and PR #2989 got it wrong: it
 * anchored C2 to the zoom control, which sits INSIDE the band the fix now
 * covers, so after the fix C2 resolved to the list and the control invalidated
 * itself, leaving the AFTER number resting on nothing.
 *
 * Anchoring to a chrome element chosen for being DISJOINT from the list box was
 * tried here first and is also wrong — it only moves the problem. On a surface
 * where no chrome sits outside the list box there is nothing to anchor to and
 * C2 degrades to n/a: measured `no-disjoint-chrome` on BOTH register viewports,
 * i.e. it would have reproduced #2989's silent gap exactly. Hiding the list is
 * what stays valid in both states, and it is why the AFTER number here means
 * something.
 *
 * DISCRIMINATION. `--self-test` runs the classifier against synthetic layers
 * (list on top / chrome on top / neither / dead point) AND reads a committed
 * file from this repo — `components/MiniMap.jsx` — to assert the shape those
 * synthetic cases are modelled on is still the shape the repo actually has.
 * Synthetic fixtures only prove the probe works on shapes you invented
 * (MEH-1909); the corpus-anchored case is what catches the repo moving. It
 * exits 1 if the classifier cannot tell a covered list from a clear one. Run it
 * FIRST: if the instrument cannot fail, nothing it reports afterwards is worth
 * reading.
 *
 * Usage:
 *   node e2e/qa-meh2108-citysearch-occlusion.mjs --self-test
 *   node e2e/qa-meh2108-citysearch-occlusion.mjs [--surface=register|map|absence] [--label=before] [--force-z=1000]
 *
 * Needs `next start` on :3000.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3000";
// Output dir is overridable so a later ticket's artifacts do not land in the
// folder of the ticket that first wrote this harness (--out=qa-artifacts/MEH-2115).
const OUT = (process.argv.find((a) => a.startsWith("--out=")) || "--out=qa-artifacts/MEH-2108").split("=")[1];
// The grid IS the sample count — SAMPLES is derived from it, not a cap on it.
// Two rounds got this wrong in the same way: first a hardcoded 3x5 with
// `slice(0, SAMPLES)`, then GRID_ROWS = ceil(SAMPLES/GRID_COLS), which still
// yields exactly SAMPLES points whenever SAMPLES is a multiple of GRID_COLS —
// i.e. still entailed at the values actually shipped. A cap that can never
// remove anything reads as a control and is not one, so there is now no cap:
// change the grid to change the count. (CI reviewer, PR #2990, twice.)
const GRID_COLS = 5;
const GRID_ROWS = 3;
const SAMPLES = GRID_ROWS * GRID_COLS;

// Enough matches to fill the list to its max-height (max-h-72 = 288px). A short
// stub sizes the list to the stub and understates the band — the #2102 harness
// records this as one of the two errors its own controls caught.
const CITIES = [
  "תל אביב-יפו", "תל מונד", "תל ציון", "תל עדשים", "כפר תלמים", "בית תלמה",
  "נתל", "תל שבע", "גבעת תל", "תל חי", "מתלול", "תל יוסף",
];

const rect = (b) =>
  b ? `x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.width)} h=${Math.round(b.height)}` : "MISSING";
const live = (b) => Boolean(b) && b.width > 0 && b.height > 0;
const intersect = (a, b) => {
  if (!live(a) || !live(b)) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const bot = Math.min(a.y + a.height, b.y + b.height);
  return r > x && bot > y ? { x, y, width: r - x, height: bot - y } : null;
};

/**
 * The classifier. Given the element stack at a point, decide who owns the pixel.
 * Exported shape is a pure function of a descriptor list so --self-test can feed
 * it synthetic stacks and assert how it sorts them — the real implementation,
 * not a copy.
 */
const classify = (stack) => {
  if (!stack || stack.length === 0) return "null";
  const top = stack[0];
  if (top.inList) return "list";
  if (top.isChrome) return "chrome";
  return "other";
};

/**
 * The DOM-side helpers below all used `document.querySelector(sel)` — the first
 * match in DOM order — while `measure()` resolves the list with `firstVisible()`,
 * the first RENDERED match. Where a selector matches more than once those are
 * different elements, and the band would then be computed from one while
 * occlusion was classified against another. Unique selectors hide it today.
 *
 * `markList` stamps the resolved element with a unique attribute and every
 * helper selects by that attribute, so there is exactly one subject per run.
 */
const LIST_MARK = "data-qa-meh2108-list";
const markList = async (page, listLocator) => {
  await listLocator.evaluate((el, attr) => el.setAttribute(attr, "1"), LIST_MARK);
  return `[${LIST_MARK}]`;
};

/** Read the element stack at a viewport point, tagged for the classifier. */
const stackAt = (page, x, y, listSelector) =>
  page.evaluate(
    ([px, py, sel]) => {
      const els = document.elementsFromPoint(px, py);
      const listEl = document.querySelector(sel);
      // Map chrome = anything Leaflet owns, plus the app's own map-surface
      // controls, which live OUTSIDE .leaflet-container and would otherwise be
      // filed as "other" — PR #2989's classifier undercounted 9 as 5 for exactly
      // this reason (the MiniMap fullscreen button).
      const CHROME = [
        ".leaflet-container", ".leaflet-control", ".leaflet-top", ".leaflet-bottom",
        "[data-testid=minimap-fullscreen]", "[data-testid=map-search-area]",
        "[data-testid=near-me-pill]",
      ];
      return els.map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined
          ? el.className.baseVal
          : String(el.className || "")).slice(0, 70),
        testid: el.getAttribute?.("data-testid") || null,
        inList: Boolean(listEl && (el === listEl || listEl.contains(el))),
        isChrome: CHROME.some((c) => el.closest?.(c)),
      }));
    },
    [x, y, listSelector]
  );

/**
 * C2, done properly: re-sample the SAME band points with the list removed from
 * hit-testing, and count how many then read as map chrome.
 *
 * PR #2989 anchored its C2 to the zoom control — an element inside the very band
 * the fix covers — so after the fix C2 resolved to the list and invalidated
 * itself, leaving the AFTER number resting on nothing. Anchoring to a "disjoint"
 * chrome element instead only moves the problem: on a surface where no chrome
 * sits outside the list box there is nothing to anchor to, and C2 silently
 * reports n/a (measured: `no-disjoint-chrome` on both register viewports).
 *
 * Hiding the list is the control that stays valid in BOTH states, because it
 * asks the question that actually matters: is there map chrome at this point at
 * all? If chromeUnderneath is 15 and covered is 0, the chrome is demonstrably
 * still there and the list is demonstrably on top of it. If chromeUnderneath is
 * 0, the sample band contains no chrome and a "0 covered" means nothing.
 */
const chromeUnderneath = async (page, listSelector, pts) => {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.setAttribute("data-qa-hidden-was", el.style.display || ""), (el.style.display = "none");
  }, listSelector);
  let n = 0;
  for (const [x, y] of pts) {
    const stack = await stackAt(page, x, y, listSelector);
    if (classify(stack) === "chrome") n += 1;
  }
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.style.display = el.getAttribute("data-qa-hidden-was") || "";
  }, listSelector);
  return n;
};

/**
 * THE PRIMARY MEASUREMENT. Enumerate every element whose computed z-index is in
 * the contested band [1000..1009] and whose box intersects the open list, then
 * hit-test the centre of each intersection to see who actually paints on top.
 *
 * This replaced a blind 5×3 grid sweep, which had two defects its own output
 * exposed — both worth keeping written down, because both are the failure this
 * file exists to avoid:
 *
 *  1. ALIASING. At 1440 the five sample columns landed at x=490..950 while the
 *     Leaflet zoom control sits at x≈443..487. The grid missed it entirely and
 *     reported "0 / 15 covered" — a clean-looking number produced by sampling,
 *     not by clearance. At 375 the same grid happened to hit it and reported 3.
 *     The two viewports were not measuring the same thing.
 *  2. CLASSIFIER UNDERCOUNT. The MiniMap fullscreen button carries no testid and
 *     sits outside `.leaflet-container`, so a selector-keyed classifier files it
 *     as "other" — exactly the undercount PR #2989 made (9 reported as 5). Here
 *     membership is decided by COMPUTED z-index, which no markup change can slip
 *     past, so the button is caught whether or not anyone gives it an attribute.
 *
 * Enumerating the contested band is also the only form that answers the ledger
 * question directly: every tenant that can possibly contest the list is in it by
 * construction.
 */
const findContestedOccluders = (page, listSelector) =>
  page.evaluate((sel) => {
    const list = document.querySelector(sel);
    if (!list) return [];
    const lb = list.getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      if (el === list || list.contains(el) || el.contains(list)) continue;
      const cs = getComputedStyle(el);
      const z = parseInt(cs.zIndex, 10);
      if (!Number.isFinite(z) || z < 1000 || z > 1009) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const ix = Math.max(lb.left, b.left);
      const iy = Math.max(lb.top, b.top);
      const ir = Math.min(lb.right, b.right);
      const ib = Math.min(lb.bottom, b.bottom);
      if (ir <= ix || ib <= iy) continue;
      el.setAttribute("data-qa-occluder", String(out.length));
      out.push({
        z,
        id: String(out.length),
        desc: `${el.tagName.toLowerCase()}.${String(el.className || "").slice(0, 48)}`,
        cx: (ix + ir) / 2,
        cy: (iy + ib) / 2,
        // Only the CENTRE is hit-tested, so only the centre must be on-screen.
        // Requiring the whole intersection dropped partly-below-fold occluders
        // out of `lost` while leaving them in the denominator — a quiet nudge
        // toward the reassuring answer.
        inViewport:
          (iy + ib) / 2 >= 0 && (iy + ib) / 2 <= window.innerHeight &&
          (ix + ir) / 2 >= 0 && (ix + ir) / 2 <= window.innerWidth,
      });
    }
    return out;
  }, listSelector);

/**
 * A list that never OPENED produces `band: null`, which report() prints as
 * "NO INTERSECTION — nothing to occlude" and scores as a valid run.
 *
 * That is not a hypothetical: `/map` desktop legitimately reports exactly that
 * string, because its list pane really is a sibling column beside the map. So a
 * broken run on any surface is character-for-character identical to a real
 * finding this PR reports. The whole file exists to not do this.
 *
 * Every surface therefore proves the list is open BEFORE measuring, and a
 * failure to open is loud and non-zero rather than a quiet "nothing here".
 * (CI reviewer, PR #2990 — doAbsence already had this guard; the other two
 * surfaces did not.)
 */
const assertListOpen = async (page, listSelector, tag) => {
  const box = await (await firstVisible(page, listSelector)).boundingBox().catch(() => null);
  if (live(box)) return true;
  console.log(`\n──────── ${tag} ────────`);
  console.log("  !! THE LIST NEVER OPENED — no measurement is possible here.");
  console.log("     This is NOT 'nothing to occlude'. Nothing was measured at all.");
  return false;
};

/**
 * Pick the first match that is actually RENDERED.
 *
 * `/map` keeps BOTH shells in the DOM and hides one per breakpoint, so
 * `.leaflet-container` matches twice and `.first()` is the DESKTOP one — which
 * at 375px is display:none and returns a null box. That surfaced as
 * "map: MISSING → NO INTERSECTION → nothing to occlude": a probe failure
 * wearing the exact shape of a clean result. Resolve by box, not by order.
 */
const firstVisible = async (page, selector) => {
  const loc = page.locator(selector);
  const n = await loc.count();
  for (let i = 0; i < n; i += 1) {
    const b = await loc.nth(i).boundingBox().catch(() => null);
    if (live(b)) return loc.nth(i);
  }
  return loc.first();
};

/**
 * Core measurement for one open dropdown over one map.
 * Returns { covered, total, controls } — never a verdict on its own.
 */
const measure = async (page, listSelector, mapSelector, tag) => {
  const list = await firstVisible(page, listSelector);
  const map = await firstVisible(page, mapSelector);

  // Bring the whole intersection band inside the viewport BEFORE sampling.
  // boundingBox() is viewport-relative, so a band that runs past the fold yields
  // null hit-tests — which read as "clear". C0 catches that, but catching it
  // every run is not a measurement; scrolling first is. Boxes are re-read after
  // the scroll because both origins move.
  let listBox = await list.boundingBox().catch(() => null);
  let mapBox = await map.boundingBox().catch(() => null);
  // viewportSize() returns null when no explicit viewport is set. Every caller
  // here goes through newPage(), which always sets one, so this is belt-and-braces
  // — but an unguarded deref would throw rather than degrade, and a harness that
  // dies on an unrelated call path is a harness nobody reruns. (CI reviewer.)
  const vh = page.viewportSize()?.height ?? 0;
  const pre = intersect(listBox, mapBox);
  if (vh && pre && pre.y + pre.height > vh - 8) {
    await page.evaluate((dy) => window.scrollBy(0, dy), pre.y + pre.height - vh + 60);
    await page.waitForTimeout(350);
    listBox = await list.boundingBox().catch(() => null);
    mapBox = await map.boundingBox().catch(() => null);
  }
  const band = intersect(listBox, mapBox);

  const out = { tag, listBox, mapBox, band, covered: 0, total: 0, samples: [], controls: {} };
  if (!band) return out;

  // Record the z-index actually in force. With --force-z this is the whole
  // point of the run; without it, it pins which state produced the number, so a
  // BEFORE/AFTER pair can never be mixed up after the fact.
  out.zIndex = await page.evaluate(
    (s) => (document.querySelector(s) ? getComputedStyle(document.querySelector(s)).zIndex : "no-list"),
    listSelector
  );

  // ---- primary: contested-band occluders, hit-tested at their intersections ----
  out.occluders = [];
  for (const o of await findContestedOccluders(page, listSelector)) {
    if (!o.inViewport) { out.occluders.push({ ...o, winner: "off-screen" }); continue; }
    const stack = await stackAt(page, o.cx, o.cy, listSelector);
    let winner = classify(stack);
    // "not the list" is NOT the same as "this occluder". A third element over
    // the same point — the cookie banner (1100) or the header (1050), both
    // on-screen at 375 — would otherwise be scored as this occluder winning,
    // inflating `lost` with something the ledger band does not even contain.
    if (winner !== "list") {
      const isThisOne = await page.evaluate(
        ([x, y, id]) =>
          document.elementsFromPoint(x, y).some((e) => e.closest?.(`[data-qa-occluder="${id}"]`)),
        [o.cx, o.cy, o.id]
      );
      if (!isThisOne) winner = "third-party";
    }
    out.occluders.push({ ...o, winner, top: stack[0] || null });
  }
  out.lost = out.occluders.filter((o) => o.winner !== "list" && o.winner !== "off-screen" && o.winner !== "third-party").length;

  // Sample across the intersection band — a horizontal sweep at three heights,
  // so a control anchored at one corner cannot dominate the count.
  const pts = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    const y = band.y + (band.height * (row + 0.5)) / GRID_ROWS;
    for (let col = 0; col < GRID_COLS; col += 1) {
      pts.push([band.x + (band.width * (col + 0.5)) / GRID_COLS, y]);
    }
  }
  for (const [x, y] of pts) {
    const stack = await stackAt(page, x, y, listSelector);
    const verdict = classify(stack);
    out.samples.push({ x: Math.round(x), y: Math.round(y), verdict, top: stack[0] || null });
    out.total += 1;
    if (verdict === "chrome") out.covered += 1;
  }

  // C0 — every sample returned a real element. A point past the fold returns
  // null, and null would otherwise score as "nothing covering the list".
  out.controls.C0 = out.samples.every((s) => s.top !== null);
  // C1 — a point in the list but outside the map resolves to the list.
  const c1y = listBox.y + 6;
  const c1x = listBox.x + listBox.width / 2;
  const c1Outside = !mapBox || c1y < mapBox.y;
  out.controls.C1 = c1Outside ? classify(await stackAt(page, c1x, c1y, listSelector)) === "list" : "n/a";
  // C2 — with the list hidden, the same points must reveal map chrome.
  out.chromeUnderneath = await chromeUnderneath(page, listSelector, pts);
  out.controls.C2 = out.chromeUnderneath > 0;
  return out;
};

const report = (m) => {
  console.log(`\n──────── ${m.tag} ────────`);
  console.log(`  list : ${rect(m.listBox)}`);
  console.log(`  map  : ${rect(m.mapBox)}`);
  console.log(`  band : ${m.band ? rect(m.band) : "NO INTERSECTION — nothing to occlude"}`);
  console.log(`  z-index in force on the list: ${m.zIndex}`);
  if (!m.band) return true;
  console.log(`  contested band [1000..1009] overlapping the list: ${m.occluders.length} element(s)`);
  for (const o of m.occluders) {
    console.log(`      z=${o.z} ${o.desc}`);
    console.log(`         at (${Math.round(o.cx)},${Math.round(o.cy)}) -> ${o.winner === "list" ? "LIST ON TOP" : o.winner === "third-party" ? "THIRD-PARTY on top (not this occluder — not counted)" : o.winner.toUpperCase()}`);
  }
  console.log(`  >>> OCCLUDING THE LIST: ${m.lost} / ${m.occluders.length}`);
  console.log(`  --- secondary grid sweep (aliasing-prone, kept for continuity) ---`);
  console.log(`  C0 live samples   : ${m.controls.C0 ? "OK" : "FAILED"}`);
  console.log(`  C1 list-self      : ${m.controls.C1 === true ? "OK" : m.controls.C1}`);
  console.log(`  C2 chrome present : ${m.controls.C2 === true ? "OK" : "FAILED"} (${m.chromeUnderneath}/${m.total} points show chrome with the list hidden)`);
  const bad = m.controls.C0 !== true || m.controls.C1 === false || m.controls.C2 === false;
  console.log(bad ? "  !! CONTROLS FAILED — the number below is VOID" : "  controls OK");
  console.log(`  COVERED BY MAP CHROME: ${m.covered} / ${m.total}`);
  for (const s of m.samples.filter((x) => x.verdict !== "list")) {
    console.log(`      (${s.x},${s.y}) -> ${s.verdict}  ${s.top ? `${s.top.tag}.${s.top.cls}` : "null"}`);
  }
  return !bad;
};

// ───────────────────────── self-test (discrimination) ─────────────────────────
const selfTest = () => {
  const cases = [
    { name: "list on top", stack: [{ inList: true, isChrome: false }, { inList: false, isChrome: true }], want: "list" },
    { name: "chrome on top", stack: [{ inList: false, isChrome: true }, { inList: true, isChrome: false }], want: "chrome" },
    { name: "neither", stack: [{ inList: false, isChrome: false }], want: "other" },
    { name: "dead point", stack: [], want: "null" },
    // Anchored to a real shape from this repo: the MiniMap fullscreen button is
    // OUTSIDE .leaflet-container, so a classifier keyed only on Leaflet internals
    // files it as "other" and undercounts. This case pins that it reads as chrome.
    { name: "MiniMap fullscreen (shape)", stack: [{ inList: false, isChrome: true, testid: "minimap-fullscreen" }], want: "chrome" },
  ];
  let failed = 0;
  let ran = 0;

  // CORPUS-ANCHORED CASE (MEH-1909). The synthetic cases above only prove the
  // classifier sorts shapes I invented. This one reads a committed file and
  // asserts the repo still HAS the shape they model: the MiniMap control sits in
  // the contested band and carries no testid, which is exactly why membership is
  // decided by computed z-index rather than by selector. If someone gives it a
  // testid or moves it off 1000, this case fails and the reasoning above is stale.
  try {
    const mini = fs.readFileSync("components/MiniMap.jsx", "utf8");
    const inBand = /MAP_BUTTON_STYLE[\s\S]{0,200}?z-\[1000\]/.test(mini);
    const noTestId = !/MAP_BUTTON_STYLE[\s\S]{0,200}?data-testid/.test(mini);
    const ok = inBand && noTestId;
    ran += 1;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  MiniMap control is still z-[1000] and still has no testid (components/MiniMap.jsx)`);
    console.log(`        in-band=${inBand} no-testid=${noTestId}`);
  } catch (e) {
    ran += 1;
    failed += 1;
    console.log(`  FAIL  could not read components/MiniMap.jsx — run from frontend/ (${e.code || e.message})`);
  }
  for (const c of cases) {
    const got = classify(c.stack);
    const ok = got === c.want;
    ran += 1;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}: want=${c.want} got=${got}`);
  }
  // Derived from what actually ran. `cases.length` was wrong the moment the
  // corpus-anchored check was added above — it reported 5 while 6 checks ran,
  // which is the stated-vs-derived count defect this harness exists to avoid.
  console.log(`\n${ran} checks, ${failed} failed`);
  if (failed) {
    console.error("SELF-TEST FAILED — classifier cannot discriminate; every number it reports is void.");
    process.exit(1);
  }
  console.log("self-test OK — classifier discriminates covered from clear.");
  process.exit(0);
};

if (process.argv.includes("--self-test")) selfTest();

// ───────────────────────────────── surfaces ──────────────────────────────────
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=")[1];
const SURFACE = arg("surface", "register");
const KNOWN_SURFACES = ["register", "map", "absence", "confinement"];
if (!KNOWN_SURFACES.includes(SURFACE)) {
  // Without this, a typo'd surface runs nothing, measures nothing, and still
  // prints "=== RUN VALID ===" with exit 0 — a null wearing the reassuring
  // answer, which is the exact failure this whole harness exists to prevent.
  console.error(`unknown --surface=${SURFACE}. Known: ${KNOWN_SURFACES.join(" | ")}`);
  process.exit(2);
}
const FORCE_Z = arg("force-z", "");
// MEH-2115: reconstruct the PRE-FIX state on the fixed build by putting the
// stacking context back on the mobile filter bar. This is how a before/after
// pair is produced from ONE build — the alternative is comparing two builds and
// hoping nothing else moved between them.
const SIM_BAR_Z = arg("sim-bar-z", "");
const LABEL = arg("label", "run");

const newPage = async (browser, w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.route("**/api/cities**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(CITIES) }));
  await page.route("**/api/categories**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: 1, name: "מאפים" }]) }));
  await page.route("**/api/auth/me**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: 1, email: "qa@mehamakor.test", name: "בדיקה", role: "user" }) }));
  if (SIM_BAR_Z) {
    await page.addInitScript((z) => {
      const apply = () => {
        const el = document.querySelector("div.absolute.top-0.inset-x-0");
        if (el) el.style.setProperty("z-index", z, "important");
      };
      document.addEventListener("DOMContentLoaded", apply);
      setTimeout(apply, 1500);
      setTimeout(apply, 3000);
    }, SIM_BAR_Z);
  }
  if (FORCE_Z) {
    await page.addStyleTag({
      content: `ul[role="listbox"]{z-index:${FORCE_Z} !important;}`,
    }).catch(() => {});
    await page.addInitScript((z) => {
      const st = document.createElement("style");
      st.textContent = `ul[role="listbox"]{z-index:${z} !important;}`;
      document.addEventListener("DOMContentLoaded", () => document.head.appendChild(st));
    }, FORCE_Z);
  }
  return page;
};

const seedRegistrationDraft = (page) =>
  page.addInitScript(() => {
    localStorage.setItem("token", "qa-meh2108");
    localStorage.setItem("producer_registration_draft", JSON.stringify({
      v: 2, savedAt: Date.now(), step: null,
      form: {
        producer_name: "בדיקת מהמקור", phone: "0501234567", city: "תל אביב-יפו",
        address: "הרצל 1, תל אביב", lat: 32.0668, lng: 34.7647,
        delivery_nationwide: false, delivery_cities: [],
      },
    }));
  });

/**
 * Prove --force-z actually landed. If the override silently fails to apply, the
 * run reproduces the AFTER numbers and reads as "the change made no difference"
 * — a no-op that looks exactly like a finding. Fail loudly instead.
 */
/**
 * Prove --sim-bar-z landed. Without this, a failed injection reproduces the
 * AFTER numbers and reads as "the fix made no difference" — a no-op wearing the
 * shape of a finding, which is the exact class this harness exists to refuse.
 */
const assertSimBarZ = async (page) => {
  if (!SIM_BAR_Z) return;
  const got = await page.evaluate(() => {
    const el = document.querySelector("div.absolute.top-0.inset-x-0");
    return el ? getComputedStyle(el).zIndex : "bar-not-found";
  });
  if (String(got) !== String(SIM_BAR_Z)) {
    console.error(`!! --sim-bar-z=${SIM_BAR_Z} DID NOT APPLY (bar z-index=${got}). Run is void.`);
    process.exit(2);
  }
  console.log(`  [sim-bar-z] pre-fix state reconstructed: bar z-index = ${got}`);
};

const assertForcedZ = async (page, listSelector) => {
  if (!FORCE_Z) return;
  const got = await page.evaluate(
    (s) => (document.querySelector(s) ? getComputedStyle(document.querySelector(s)).zIndex : "no-list"),
    listSelector
  );
  if (String(got) !== String(FORCE_Z)) {
    console.error(`!! --force-z=${FORCE_Z} DID NOT APPLY (computed z-index=${got}). Run is void.`);
    process.exit(2);
  }
  console.log(`  [force-z] override verified: computed z-index = ${got}`);
};

const clickIfPresent = async (page, id) => {
  const el = page.getByTestId(id);
  if (await el.count().then((n) => n > 0).catch(() => false)) {
    await el.click({ timeout: 5_000 }).catch(() => {});
  }
};

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // The CC sandbox pins a Chromium build that Playwright's own resolver does not
  // find; every other machine has the opposite problem. Hard-coding the sandbox
  // path made this file crash for everyone else — which contradicted the reason
  // it exists, that these numbers can be re-run and falsified by anyone.
  //
  // REUSES: frontend/e2e/qa-meh1619-visual-noop.mjs:64 — use the sandbox build
  // only IF PRESENT, else let Playwright resolve its own. That is the house
  // pattern across ~20 harnesses here.
  //
  // An env-var override was written first (the CI reviewer's suggested form) and
  // reverted: it reddened `Env drift (.env.example)`, which flags any env var
  // read in code but undocumented. Documenting it would mean adding an env var,
  // and regression rule 8 requires those be listed and confirmed first — for a
  // portability fallback the repo already solves without one.
  // `check_env_drift.sh:60` excludes PLAYWRIGHT_CHROMIUM_PATH, not this name.
  //
  // Do not spell that override out here, even in prose: `check_env_drift.sh:89`
  // greps the raw text for an env read and cannot tell code from a comment, so
  // naming it literally re-reds the gate. Writing the sentence that way is what
  // failed the second attempt.
  const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch({
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
    args: ["--ssl-version-max=tls1.2"],
  });
  let allOk = true;
  let measured = 0;

  const doRegister = async (w, h) => {
    const page = await newPage(browser, w, h);
    await seedRegistrationDraft(page);
    await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await clickIfPresent(page, "register-preflight-start");
    await page.waitForTimeout(1500);
    await clickIfPresent(page, "register-draft-continue");
    await page.waitForTimeout(1000);
    await page.getByTestId("register-frame-details").waitFor({ timeout: 20_000 });
    await page.locator(".leaflet-container").first().waitFor({ timeout: 20_000 });
    const field = page.getByTestId("register-details-city");
    const input = field.locator("input").first();
    await input.click();
    await input.fill("תל");
    await field.locator("ul[role=listbox]").waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    const REG_SEL = "[data-testid=register-details-city] ul[role=listbox]";
    if (!(await assertListOpen(page, REG_SEL, `register @ ${w}x${h} [${LABEL}]`))) {
      allOk = false;
      await page.close();
      return;
    }
    await assertForcedZ(page, REG_SEL);
    const m = await measure(page, "[data-testid=register-details-city] ul[role=listbox]", ".leaflet-container", `register @ ${w}x${h} [${LABEL}]`);
    measured += 1;
    allOk = report(m) && allOk;
    await page.screenshot({ path: `${OUT}/${LABEL}-register-${w}.png` });
    await page.close();
  };

  const doMap = async (w, h, which) => {
    const page = await newPage(browser, w, h);
    await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.locator(".leaflet-container").first().waitFor({ timeout: 25_000 }).catch(() => {});
    const sel = `#map-city-search-${which}`;
    const input = page.locator(`${sel} input, input#map-city-search-${which}`).first();
    await input.click({ timeout: 10_000 }).catch(() => {});
    await input.fill("תל").catch(() => {});
    const listSel = `ul#map-city-search-${which}-listbox`;
    // A fixed 600ms delay was the only thing standing in for "the list opened".
    // Wait on the element, then PROVE it rendered — a swallowed timeout here used
    // to flow straight into a void measure() that printed a clean-looking verdict.
    await page.locator(listSel).first().waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(300);
    if (!(await assertListOpen(page, listSel, `map ${which} @ ${w}x${h} [${LABEL}]`))) {
      allOk = false;
      await page.close();
      return;
    }
    await assertSimBarZ(page);
    await assertForcedZ(page, listSel);
    const m = await measure(page, listSel, ".leaflet-container", `map ${which} @ ${w}x${h} [${LABEL}]`);
    measured += 1;
    allOk = report(m) && allOk;
    // The stacking-context question this surface actually turns on.
    const ctx = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "list not found";
      const chain = [];
      let n = el.parentElement;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (cs.zIndex !== "auto" && cs.position !== "static") {
          chain.push(`${n.tagName.toLowerCase()}.${String(n.className).slice(0, 40)} z=${cs.zIndex} pos=${cs.position}`);
        }
        n = n.parentElement;
      }
      return chain.length ? chain.join(" <- ") : "no stacking-context ancestor";
    }, listSel);
    console.log(`  stacking-context ancestors of the list: ${ctx}`);
    await page.screenshot({ path: `${OUT}/${LABEL}-map-${which}-${w}.png` });
    await page.close();
  };

  /**
   * ABSENCE ASSERTION for the no-map consumers.
   *
   * "Looks unchanged" is not assertable from a screenshot pair — a 2% VRT
   * tolerance swallows more ink than this list occupies. What IS assertable is
   * the mechanism: the ONLY thing this diff changes is which elements in
   * z 1000..1009 the list out-paints. So enumerate exactly those, per page, and
   * compare the winner before and after. If the contested set is empty, the
   * change is inert there by construction — a stronger statement than a photo.
   *
   * Note this deliberately does NOT restrict itself to maps: BottomNav (1000)
   * and BackToTop (1000) are page-level and CAN meet a dropdown on a mapless
   * page. If one of them flips owner, that is a real visual delta and it must
   * show up here rather than be assumed away.
   */
  const doAbsence = async (path, w, h) => {
    const page = await newPage(browser, w, h);
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const input = page.locator("input[role=combobox], [data-testid*=city] input").first();
    if (!(await input.count().then((n) => n > 0).catch(() => false))) {
      console.log(`\n──────── absence ${path} @ ${w} [${LABEL}] ────────\n  no city field found on this route — skipped`);
      await page.close();
      return;
    }
    await input.click({ timeout: 8_000 }).catch(() => {});
    await input.fill("תל").catch(() => {});
    await page.waitForTimeout(500);
    // Same first-DOM-match vs first-RENDERED-match divergence REFEREE finding 6
    // fixed inside measure(). It survived here because doAbsence does not call
    // measure() — a fix applied at the site a review named, not to the class.
    // (CI reviewer found the residual; "when a reviewer names two sites, grep
    // for the third".) These routes carry no map and one listbox, so it changes
    // no number reported so far — it removes the way it could silently change one.
    const listSel = "ul[role=listbox]";
    const has = await page.locator(listSel).count();
    console.log(`\n──────── absence ${path} @ ${w} [${LABEL}] ────────`);
    if (!has) { console.log("  list did not open — no assertion possible (NOT a pass)"); await page.close(); return; }
    const resolved = await markList(page, await firstVisible(page, listSel));
    await assertForcedZ(page, resolved);
    const z = await page.evaluate((sl) => getComputedStyle(document.querySelector(sl)).zIndex, resolved);
    const occ = await findContestedOccluders(page, resolved);
    console.log(`  list z-index: ${z}`);
    console.log(`  contested band [1000..1009] overlapping the list: ${occ.length}`);
    for (const o of occ) {
      const st = o.inViewport ? classify(await stackAt(page, o.cx, o.cy, resolved)) : "off-screen";
      console.log(`      z=${o.z} ${o.desc} -> ${st === "list" ? "LIST ON TOP" : st.toUpperCase()}`);
    }
    measured += 1;
    if (!occ.length) console.log("  => nothing in the contested band overlaps the list: change is INERT on this route");
    // The committed absence-* artifacts were originally captured by an ad-hoc
    // inline script, so re-running this harness could not regenerate them — their
    // as-of was unrecoverable from the committed code alone. That is precisely the
    // defect this PR exists to correct in #2989's probe, reproduced here in the
    // supporting evidence rather than the primary. Caught by the CI reviewer.
    const slug = path.replace(/\W+/g, "") || "root";
    await page.screenshot({ path: `${OUT}/absence-${slug}-${w}-${LABEL}.png` });
    await page.close();
  };

  if (SURFACE === "register") { await doRegister(375, 812); await doRegister(1440, 900); }
  if (SURFACE === "map") { await doMap(375, 812, "mobile"); await doMap(1440, 900, "desktop"); }
  if (SURFACE === "absence") {
    for (const path of ["/events", "/experiences", "/group-buys"]) {
      await doAbsence(path, 375, 812);
    }
  }

  /**
   * MEH-2115 absence assertion. The diff removes a z token from ONE JSX element,
   * `MapClient.jsx:770`, the mobile /map filter bar. A consumer that never
   * renders that element cannot be affected by the change — so the assertion
   * that actually discriminates is: is the changed node PRESENT on this route?
   *
   * That is a positive, falsifiable claim. "Screenshots look the same" is not:
   * at a 2% VRT tolerance it would swallow the whole list. Present + unchanged
   * owners, or absent — either is a pass; anything else is a STOP.
   */
  const doConfinement = async (route, w, h) => {
    const page = await newPage(browser, w, h);
    let ok = true;
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(2000);
      const status = resp ? resp.status() : 0;
      const bars = await page.locator("div.absolute.top-0.inset-x-0").count();
      const hasCity = await page.locator("input[role=combobox], [data-testid*=city] input, #map-city-search-mobile").count();
      const verdict = bars === 0 ? "CHANGED NODE ABSENT — cannot be affected" : `changed node PRESENT x${bars}`;
      console.log(`  ${String(route).padEnd(34)} http=${status} citySearch=${hasCity > 0 ? "yes" : "no "} ${verdict}`);
      if (bars > 0 && route !== "/map") { console.log("     !! STOP — the changed node appears on a route other than /map"); ok = false; }
    } catch (e) {
      console.log(`  ${String(route).padEnd(34)} UNREACHABLE (${String(e.message).slice(0, 60)})`);
    }
    await page.close();
    return ok;
  };

  if (SURFACE === "confinement") {
    console.log("\n──── MEH-2115 confinement: is the changed node (MapClient.jsx:770 bar) on this route? ────");
    for (const route of [
      "/map", "/events", "/experiences", "/group-buys", "/register/producer",
      "/settings", "/producer/dashboard/edit", "/producer/dashboard/group-buys",
    ]) {
      allOk = (await doConfinement(route, 375, 812)) && allOk;
      measured += 1;
    }
  }

  await browser.close();
  if (measured === 0) {
    console.error("\n=== RUN VOID — zero surfaces measured. Exit 0 here would be a null reporting as a pass. ===");
    process.exit(3);
  }
  console.log(`\n=== RUN ${allOk ? "VALID" : "VOID (a control failed)"} === (${measured} surface measurement(s))`);
  process.exit(allOk ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
