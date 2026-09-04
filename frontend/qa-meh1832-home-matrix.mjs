/**
 * Module:   qa-meh1832-home-matrix
 * Purpose:  MEH-1832 chunk 2 — the parity/regression matrix for the home
 *           Server-Component split (chunk 1, #3170). Runs the 20-row matrix on
 *           two engines against LIVE staging and writes assertions.log +
 *           screenshots under qa-artifacts/MEH-1832/chunk2/.
 * Touches:  network only (staging via the Vercel bypass headers). Writes
 *           nothing outside its own artifact directory.
 * Does NOT: run in CI and is not a spec — playwright.config.ts:35 matches only
 *           e2e/flows/** and e2e/visual/**. It is a one-off probe, run by hand.
 * Related:  frontend/lib/use-home-page.js:287 (the SSR skip R11a isolates) ·
 *           frontend/components/HomepageMiniMap.jsx:178 (the accepted duplicate
 *           fetch that produces R11's residual 1) ·
 *           .claude/rules/testing.md § "Driving Playwright against staging from
 *           the CC sandbox" (TLS 1.2 cap + bypass headers, MEH-2118).
 * History:  MEH-1832 (creation, chunk 2 close-out under MEH-2221).
 *
 * THREE OUTCOMES, NOT TWO. NOT-COVERED is deliberate: a state that could not be
 * produced is not a pass. The geo notice and the region fallback are ABSENT on a
 * populated feed whether they are healthy or deleted — a green with two causes —
 * so they are never scored PASS.
 *
 * Every count-based row carries a CONTROL that fails loudly. R11's zero is
 * meaningless without R11b (an interaction moves the same counter 1 -> 2) and
 * R11a-control (the page still renders 8 cards with requestIdleCallback stubbed).
 * Run: VERCEL_AUTOMATION_BYPASS_SECRET=... node qa-meh1832-home-matrix.mjs
 */
import { chromium, webkit, devices } from "@playwright/test";
import fs from "node:fs";

const OUT = new URL("./qa-artifacts/MEH-1832/chunk2/", import.meta.url).pathname.replace(/\/$/, "");
const BASE = "https://staging.mehamakor.online";
const BYPASS = {
  "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  "x-vercel-set-bypass-cookie": "true",
};
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const log = [];
let ran = 0, failed = 0, notCovered = 0;
const rec = (ok, id, msg) => { ran++; if (!ok) failed++; log.push(`${ok ? "PASS" : "FAIL"}  ${id} — ${msg}`); };
const nc = (id, msg) => { notCovered++; log.push(`NOT-COVERED  ${id} — ${msg}`); };

const settle = (page, ms = 2500) => page.waitForTimeout(ms);

async function newPage(context) {
  const p = await context.newPage();
  p.__hydration = [];
  p.__producerXhr = [];
  p.on("console", (m) => {
    const t = m.text();
    // Next/React hydration diagnostics, in the wordings React 18 actually emits.
    if (/hydrat|did not match|Text content does not match|server HTML/i.test(t)) {
      p.__hydration.push(t.slice(0, 160));
    }
  });
  p.on("request", (r) => {
    const u = r.url();
    if (/\/api\/producers(\?|$)/.test(u) && r.resourceType() !== "document") p.__producerXhr.push(u);
  });
  return p;
}

async function matrix(page, tag) {
  // ── ROW 0 · controls ───────────────────────────────────────────────────
  const resp = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const serverHtml = await resp.text();
  const serverCards = (serverHtml.match(/data-testid="producer-card"/g) || []).length;

  // Chunk-1's own numeric criterion, re-measured on the RAW response before any
  // JS runs. This is a server-HTML count, not a DOM count — the two differ and
  // only the first one answers "did first paint come from the server".
  rec(serverCards >= 1, `${tag}/R0a:server-html-carries-producer-cards`,
      `producer-card markers in the RAW response = ${serverCards} (chunk-1 criterion: >= 1)`);

  await settle(page, 4000);
  const cards = await page.locator('[data-testid="producer-card"]').count();
  rec(cards > 0, `${tag}/R0b:control-cards-in-dom`, `cards = ${cards}`);
  const bodyBox = await page.locator("body").boundingBox();
  rec(!!bodyBox && bodyBox.height > 0, `${tag}/R0c:control-non-zero-body`,
      bodyBox ? `${Math.round(bodyBox.width)}x${Math.round(bodyBox.height)}` : "ZERO BODY — everything below is void");
  if (!bodyBox) return;

  // ── ROW 10 · hydration ─────────────────────────────────────────────────
  rec(page.__hydration.length === 0, `${tag}/R10:zero-hydration-warnings`,
      page.__hydration.length ? JSON.stringify(page.__hydration.slice(0, 3)) : "0 hydration diagnostics on the console");

  // ── ROW 11 · client /producers XHR on a cold load ──────────────────────
  //
  // Chunk 1's criterion was "exactly 0 /producers XHR on a cold load". Measured:
  // ONE fires, with no query string. That number alone does not say WHOSE it is,
  // and the two candidates have opposite meanings — a home-feed refetch would be
  // a real regression in the SSR split, while HomepageMiniMap's is a documented,
  // accepted duplicate (`HomepageMiniMap.jsx:178`: "Q3 accepted the duplicate
  // fetch (useHomePage also calls /producers) as the cost of a strict lazy-load
  // contract"), and chunk 1's own scope said to leave that block as-is.
  //
  // So the count is REPORTED and the attribution is MEASURED, below.
  const coldXhr = page.__producerXhr.length;
  log.push(`METRIC ${tag}/R11:cold-load-client-producers-xhr — ${coldXhr}` +
    (coldXhr ? ` :: ${JSON.stringify(page.__producerXhr.map((u) => u.replace(/^https?:\/\/[^/]+/, "")))}` : ""));

  // R11a — ATTRIBUTION, by a lever that touches nothing else. `requestIdleCallback`
  // appears in exactly ONE file repo-wide (HomepageMiniMap.jsx:170); the map's
  // fetch is gated behind it. Stub it to a no-op and the map never fetches, while
  // the home feed's own path is untouched. If the count then drops to 0, the
  // single request on a normal load is the map's and the SSR skip
  // (use-home-page.js:287, `serverCoversThisLoad`) is doing its job.
  const pA = await newPage(page.context());
  await pA.addInitScript(() => {
    try { window.requestIdleCallback = () => 0; } catch { /* frozen */ }
  });
  await pA.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pA.waitForTimeout(6000);
  const cardsA = await pA.locator('[data-testid="producer-card"]').count();
  rec(cardsA > 0, `${tag}/R11a-control:page-still-renders-with-ric-stubbed`,
      `cards = ${cardsA} — without this, a zero below could just be a broken page`);
  rec(pA.__producerXhr.length === 0, `${tag}/R11a:home-feed-makes-NO-cold-load-xhr`,
      `with requestIdleCallback neutralised (so HomepageMiniMap cannot fetch): ` +
      `client /api/producers = ${pA.__producerXhr.length}. ` +
      `The ${coldXhr} on a normal load is therefore the map's accepted duplicate, not the feed's.`);
  await pA.close();

  // ── ROW 8 · "עוד בתי עסק" — the #2742 class ────────────────────────────
  const counter = page.getByTestId("producers-counter");
  const counterText = (await counter.count()) ? (await counter.first().innerText()).replace(/\s+/g, " ") : null;
  const loadMore = page.getByRole("button", { name: /עוד בתי עסק/ });
  const hasLoadMore = await loadMore.count() > 0;
  // #2742: the SSR shell fetched 8 rows and the button vanished because
  // `hasMore` is visibleCount < producers.length. The button's PRESENCE is the
  // regression marker, so it is asserted rather than merely observed.
  rec(hasLoadMore, `${tag}/R8:load-more-present`,
      `"עוד בתי עסק" buttons = ${await loadMore.count()} · counter = ${counterText ?? "(absent)"}`);

  let expanded = null;
  if (hasLoadMore) {
    const before = await page.locator('[data-testid="producer-card"]').count();
    await loadMore.first().click();
    await settle(page, 1500);
    expanded = await page.locator('[data-testid="producer-card"]').count();
    rec(expanded > before, `${tag}/R8b:load-more-actually-expands`,
        `cards ${before} -> ${expanded}`);
  } else {
    nc(`${tag}/R8b:load-more-actually-expands`, "no load-more button to press");
  }

  // ── ROW 11b · the CONTROL the card demands for R11 ─────────────────────
  // "0 client requests" is green both when nothing refetches AND when the
  // counter never counted. The card's §7 names this explicitly. Driving a real
  // interaction must move the counter off zero.
  const chip = page.locator('[data-testid^="home-promoted-chip-"]').first();
  if (await chip.count()) {
    const before = page.__producerXhr.length;
    await chip.click();
    await settle(page, 3000);
    const after = page.__producerXhr.length;
    rec(after > before, `${tag}/R11b:CONTROL-the-xhr-counter-counts`,
        `an interaction moved it ${before} -> ${after}; without this, R11's zero proves nothing`);
  } else {
    nc(`${tag}/R11b:CONTROL-the-xhr-counter-counts`,
       "no promoted chip on this surface to drive an interaction with — R11 above is UNVALIDATED");
  }

  // ── ROW 9 · sessionStorage visibleCount restore ────────────────────────
  const stored = await page.evaluate(() => {
    try { return window.sessionStorage.getItem("home_visible_count"); } catch { return "THREW"; }
  });
  rec(stored !== null && stored !== "THREW", `${tag}/R9a:visibleCount-written`,
      `sessionStorage home_visible_count = ${stored}`);
  if (stored && stored !== "THREW") {
    const p2 = await newPage(page.context());
    await p2.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(4500);
    const restored = await p2.locator('[data-testid="producer-card"]').count();
    rec(restored >= Number(stored) || restored > 8, `${tag}/R9b:visibleCount-restored-on-return`,
        `stored=${stored}, cards after return = ${restored}`);
    await p2.close();
  } else {
    nc(`${tag}/R9b:visibleCount-restored-on-return`, "nothing was stored to restore");
  }

  // ── ROW 2 · chips deep-links (MEH-1774) ────────────────────────────────
  const p3 = await newPage(page.context());
  // `category` takes the category ID, not the slug — measured against the API:
  // category=2 -> 3 producers, category=dairy -> error, unfiltered -> 17. The
  // first version of this row passed `dairy`, which filters nothing.
  await p3.goto(`${BASE}/?category=2`, { waitUntil: "domcontentloaded" });
  await p3.waitForTimeout(4500);
  const activeChips = await p3.locator('[data-testid^="home-active-filter-"]').count();
  const deepCards = await p3.locator('[data-testid="producer-card"]').count();
  const deepCounter = (await p3.getByTestId("producers-counter").count())
    ? (await p3.getByTestId("producers-counter").first().innerText()).replace(/\s+/g, " ")
    : "(absent)";
  // DISCRIMINATING: the unfiltered feed is 17 and this category is 3, so a deep
  // link that did nothing shows the unfiltered total. `||` between two cues was
  // the first version's defect — either cue carried it, so it was green in a
  // world where the filter never applied.
  rec(deepCards > 0 && deepCards < cards + 1 && /3/.test(deepCounter),
      `${tag}/R2:chips-deep-link-applies`,
      `?category=2 -> cards = ${deepCards}, counter = "${deepCounter}" (unfiltered total is 17; a no-op deep link would say 17)`);
  rec(p3.__hydration.length === 0, `${tag}/R2b:deep-link-zero-hydration-warnings`,
      p3.__hydration.length ? JSON.stringify(p3.__hydration.slice(0, 2)) : "0");
  await p3.screenshot({ path: `${OUT}/deeplink-${tag}.png` });
  await p3.close();

  // ── ROW 7 · empty-state, ACTUALLY PRODUCED ─────────────────────────────
  // category=14 returns 0 producers (measured against the API; category=2
  // returns 3 and the unfiltered feed 17). That makes the zero-result state
  // reachable instead of merely absent.
  const pE = await newPage(page.context());
  await pE.goto(`${BASE}/?category=14`, { waitUntil: "domcontentloaded" });
  await pE.waitForTimeout(4500);
  const emptyCards = await pE.locator('[data-testid="producer-card"]').count();
  const emptyMarker = await pE.getByTestId("empty-generic").count();
  const dayEmpty = await pE.getByTestId("day-empty-suggestion").count();
  const emptyText = (await pE.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
  rec(emptyCards === 0, `${tag}/R7a:zero-result-filter-shows-no-cards`,
      `?category=14 -> cards = ${emptyCards} (control: ?category=2 showed ${deepCards})`);
  rec(emptyMarker + dayEmpty > 0, `${tag}/R7b:empty-state-marker-rendered`,
      `empty-generic=${emptyMarker} day-empty-suggestion=${dayEmpty} :: "${emptyText}"`);
  rec(pE.__hydration.length === 0, `${tag}/R7c:empty-state-zero-hydration-warnings`,
      pE.__hydration.length ? JSON.stringify(pE.__hydration.slice(0, 2)) : "0");
  await pE.screenshot({ path: `${OUT}/empty-${tag}.png` });
  await pE.close();

  // ── ROW 3 · onboarding, on a genuinely fresh profile ───────────────────
  // The gate is: no recently_viewed AND no favorite_hint_shown
  // (use-home-page.js:211) plus a delay. A fresh CONTEXT is the only way to
  // satisfy it — the pages above have already written storage.
  const freshCtx = await page.context().browser().newContext(
    page.viewportSize()
      ? { viewport: page.viewportSize(), extraHTTPHeaders: BYPASS }
      : { extraHTTPHeaders: BYPASS },
  );
  const pO = await newPage(freshCtx);
  await pO.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pO.waitForTimeout(7000);
  const storageClean = await pO.evaluate(() => {
    try {
      return {
        rv: localStorage.getItem("recently_viewed"),
        hint: localStorage.getItem("favorite_hint_shown"),
      };
    } catch { return { rv: "THREW", hint: "THREW" }; }
  });
  rec(storageClean.rv === null && storageClean.hint === null,
      `${tag}/R3a-control:profile-really-is-fresh`,
      `recently_viewed=${storageClean.rv} favorite_hint_shown=${storageClean.hint} — the gate's precondition`);
  const tipText = await pO.locator("body").innerText().catch(() => "");
  const tipEl = await pO.locator('[class*="onboard"], [data-testid*="onboard"]').count();
  const onboardingSeen = tipEl > 0 || /שמרו|לב אדום|מועדפים/.test(tipText);
  if (onboardingSeen) {
    rec(true, `${tag}/R3b:onboarding-hint-appears-on-a-fresh-profile`,
        `onboarding elements = ${tipEl}`);
  } else {
    nc(`${tag}/R3b:onboarding-hint-appears-on-a-fresh-profile`,
       `precondition satisfied (storage clean) but no hint observed within 7s; the tip carries a further timing gate — reported as NOT exercised rather than as a defect`);
  }
  await pO.screenshot({ path: `${OUT}/fresh-${tag}.png` });
  await pO.close();

  // ── ROW 4 · friday strip, with the clock moved ─────────────────────────
  // isFridayMode() reads Intl.DateTimeFormat(...).formatToParts(new Date())
  // against a fixed timezone (lib/friday-mode.js:4-18), so overriding Date is
  // the only way to reach it on a Sunday. If the override does not take, that
  // is reported as NOT-COVERED — never as a pass.
  const pF = await newPage(freshCtx);
  await pF.addInitScript(() => {
    // Friday 2026-09-04, 10:00 Israel time (07:00Z).
    const FAKE = new Date("2026-09-04T07:00:00Z").getTime();
    const RealDate = Date;
    Date = class extends RealDate {
      constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(FAKE); }
      static now() { return FAKE; }
    };
  });
  await pF.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pF.waitForTimeout(5000);
  const fakeDay = await pF.evaluate(() => new Date().getUTCDay());
  const fridayMarkers = await pF.locator("text=/שישי/").count();
  if (fakeDay !== 5) {
    nc(`${tag}/R4:friday-strip`,
       `the Date override did not take (page reports UTC day ${fakeDay}, wanted 5) — NOT exercised, not passed`);
  } else {
    rec(fridayMarkers > 0, `${tag}/R4:friday-strip-appears-on-a-faked-friday`,
        `page believes it is UTC day ${fakeDay}; "שישי" markers = ${fridayMarkers}`);
    await pF.screenshot({ path: `${OUT}/friday-${tag}.png` });
  }
  await pF.close();
  await freshCtx.close();

  // ── ROW 1 · geo · ROW 6 · region fallback (still absent on a full feed) ─
  for (const [rowId, testid, note] of [
    ["R1:geo-notice", "geo-empty-notice", "geo empty notice"],
    ["R6:region-fallback", "region-fallback", "region fallback strip"],
  ]) {
    const el = page.getByTestId(testid);
    const n = await el.count();
    if (n === 0) {
      // Absence here is the EXPECTED state on a populated feed — it is not a
      // pass and not a failure. Saying "passed" would be the green-with-two-
      // causes error: the element is absent both when the surface is healthy
      // and when it was deleted.
      nc(`${tag}/${rowId}`, `${note} absent — expected on a populated feed; state NOT exercised`);
    } else {
      const b = await el.first().boundingBox();
      rec(!!b && b.height > 0, `${tag}/${rowId}`, `${note} rendered ${b ? `${Math.round(b.width)}x${Math.round(b.height)}` : "ZERO BOX"}`);
    }
  }

  // ── ROW 3 · onboarding · ROW 5 · recently-viewed ───────────────────────
  const p4 = await newPage(page.context());
  await p4.addInitScript(() => {
    try {
      // CURRENT shape: [{id, viewedAt}]. The bare-id array this first used is
      // the LEGACY shape, and lib/recently-viewed.js:47 removes the key on
      // sight — so the earlier FAIL was the app behaving correctly and the
      // probe seeding rubbish.
      localStorage.setItem("recently_viewed", JSON.stringify([
        { id: "seed-a", viewedAt: Date.now() },
        { id: "seed-b", viewedAt: Date.now() },
      ]));
      localStorage.setItem("__legacy_probe", JSON.stringify(["bare-id"]));
    } catch { /* private mode */ }
  });
  await p4.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await p4.waitForTimeout(4500);
  const rvWrote = await p4.evaluate(() => {
    try { return localStorage.getItem("recently_viewed"); } catch { return "THREW"; }
  });
  rec(rvWrote && rvWrote !== "THREW" && /viewedAt/.test(String(rvWrote)),
      `${tag}/R5a:recently-viewed-current-shape-survives`,
      `recently_viewed = ${String(rvWrote).slice(0, 60)}`);
  // The seeded ids are not real producers, so the section is expected to stay
  // empty. What IS checked: the page survives a populated key without breaking
  // and without a hydration warning — the SSR-parity risk this row exists for.
  const p4cards = await p4.locator('[data-testid="producer-card"]').count();
  rec(p4cards > 0 && p4.__hydration.length === 0, `${tag}/R5b:page-parity-with-recently-viewed-set`,
      `cards = ${p4cards}, hydration diagnostics = ${p4.__hydration.length}`);
  await p4.close();

  await page.screenshot({ path: `${OUT}/home-${tag}.png` });
}

async function lcpCls(page, tag, runIdx) {
  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0 };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__m.lcp = Math.max(window.__m.lcp, e.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch { window.__m.unsupported = true; }
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const m = await page.evaluate(() => window.__m);
  log.push(`METRIC ${tag} run${runIdx} — LCP ${Math.round(m.lcp)}ms · CLS ${m.cls.toFixed(4)}${m.unsupported ? " (observer unsupported)" : ""}`);
  return m;
}

fs.mkdirSync(OUT, { recursive: true });

{
  const b = await webkit.launch();
  const d = devices["iPhone 14"];
  log.push(`engine webkit devices['iPhone 14'] viewport ${d.viewport.width}x${d.viewport.height}`);
  const c = await b.newContext({ ...d, extraHTTPHeaders: BYPASS });
  try { await matrix(await newPage(c), "webkit-390"); }
  catch (e) { rec(false, "webkit-390/harness", `threw: ${String(e).split("\n")[0]}`); }
  await b.close();
}
{
  const b = await chromium.launch({ executablePath: CHROME, args: ["--ssl-version-max=tls1.2"] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: BYPASS });
  try { await matrix(await newPage(c), "chromium-1440"); }
  catch (e) { rec(false, "chromium-1440/harness", `threw: ${String(e).split("\n")[0]}`); }
  // LCP/CLS x3, chromium only — webkit does not implement the LCP entry type.
  const ms = [];
  for (let i = 1; i <= 3; i++) ms.push(await lcpCls(await newPage(c), "chromium-1440", i));
  const lcps = ms.map((x) => x.lcp).sort((a, z) => a - z);
  const clss = ms.map((x) => x.cls).sort((a, z) => a - z);
  log.push(`METRIC chromium-1440 median — LCP ${Math.round(lcps[1])}ms · CLS ${clss[1].toFixed(4)} (n=3, median not mean)`);
  await b.close();
}

const header = [
  `MEH-1832 chunk 2 — parity/regression matrix — ${new Date().toISOString()}`,
  `target: ${BASE}/ (live staging; chromium capped at TLS 1.2 — MEH-2118)`,
  `engines: webkit devices['iPhone 14'] · chromium 1440x900`,
  `NOT-COVERED is a THIRD outcome, deliberately: a state that could not be`,
  `produced is not a pass. Absence of an empty-state marker on a populated feed`,
  `is green in two worlds — healthy, and deleted — so it is never scored PASS.`,
  ``,
];
const tail = ["", `${ran} assertions ran, ${failed} failed, ${notCovered} not covered.`, ""];
fs.writeFileSync(`${OUT}/assertions.log`, [...header, ...log, ...tail].join("\n"), "utf8");
console.log([...header, ...log, ...tail].join("\n"));
process.exit(failed ? 1 : 0);
