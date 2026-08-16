/**
 * MEH-1638 pins — dashboard entry skeleton.
 *
 * Before: the layout returned null for the whole authLoading window, so a cold
 * load of any /producer/dashboard/* route showed an empty body until /auth/me
 * resolved. This measures that window frame-by-frame.
 *
 * Pin A: cold load /producer/dashboard/tools with /auth/me throttled →
 *        0 frames with an empty body.
 * Pin B: isUnauthenticated behaviour UNCHANGED — no token still redirects to
 *        /login and never renders dashboard chrome.
 *
 * Usage: node e2e/qa-meh1638-entry-skeleton.mjs [outDir] [baseUrl]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "../qa-artifacts/MEH-1638";
// REUSES: e2e/qa-meh1611-map-focus.mjs:25-29 — constant + argv override, never
// an environment read (the "Env drift" gate blocks undocumented ones).
const BASE = process.argv[3] || "http://localhost:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const AUTH_DELAY_MS = 700; // the round trip measured in MEH-1632 Phase 0

mkdirSync(OUT, { recursive: true });

const results = [];
const record = (pin, pass, detail) => {
  results.push({ pin, verdict: pass ? "PASS" : "FAIL", detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${pin}\n      ${detail}`);
};

const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});

// Sampler installed before the document exists, so frame 0 is captured.
const SAMPLER = () => {
  window.__mm = [];
  const tick = () => {
    // Dashboard-specific, NOT any sticky element: the global site header
    // (Header.jsx:261) is also `sticky top-0` and renders for guests on every
    // page, so a generic selector reports it and turns pin B into a false
    // failure — which is exactly what an earlier version of this probe did.
    const skeleton = !!document.querySelector('[data-testid="dashboard-chrome-skeleton"]');
    const realNav = !!document.querySelector('nav a[href*="/producer/dashboard/insights"]');
    window.__mm.push({
      t: Math.round(performance.now()),
      bodyLen: (document.body?.innerText || "").trim().length,
      nodes: document.body ? document.body.querySelectorAll("*").length : 0,
      chrome: skeleton || realNav,
      skeleton,
      pulse: document.querySelectorAll(".animate-pulse").length,
      path: location.pathname,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// ---------- Pin A: authenticated cold load, /auth/me throttled ----------
for (const w of [375, 1440]) {
  const ctx = await browser.newContext({
    locale: "he-IL",
    viewport: { width: w, height: w < 500 ? 812 : 900 },
  });
  await ctx.addInitScript(() => localStorage.setItem("token", "owner-token"));
  await ctx.addInitScript(SAMPLER);
  const page = await ctx.newPage();
  await page.route("**/api/auth/me", async (r) => {
    await new Promise((res) => setTimeout(res, AUTH_DELAY_MS));
    await r.continue();
  });

  await page.goto(`${BASE}/producer/dashboard/tools`, { waitUntil: "commit" });
  // Screenshot AFTER the streaming handoff (~300ms measured), so the artifact
  // shows the dashboard skeleton and not app/[locale]/loading.js's grid.
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/skeleton-${w}.png` });
  await page.waitForTimeout(AUTH_DELAY_MS + 2500);

  const s = await page.evaluate(() => window.__mm || []);
  // The defect is a blank DASHBOARD REGION, not a blank document. Measuring
  // document.body.innerText.length was WRONG and silently useless: the root
  // layout's Header/Footer/BottomNav render regardless, so the body is never
  // empty and the assertion passed against the pre-fix code too. A construction
  // both versions survive is not evidence (.claude/rules/testing.md).
  //
  // What discriminates: frames on a dashboard route where NEITHER the real nav
  // NOR the skeleton is mounted — i.e. the layout rendered nothing at all.
  const onDash = s.filter((f) => f.nodes > 0 && /\/producer\/dashboard/.test(f.path));
  const blankDash = onDash.filter((f) => !f.chrome);
  const skeletonFrames = s.filter((f) => f.skeleton);
  const firstChrome = s.find((f) => f.chrome);

  // Threshold is 1, not 0, and that single frame is NOT a blank screen.
  // rAF is throttled while the document streams, so sampler frames 0-1 span
  // the whole parse window (~300ms measured), during which app/[locale]/
  // loading.js is painting its generic grid skeleton — content, not blank.
  // The dashboard skeleton takes over from ~300ms. So the visible sequence on
  // a cold load is: locale skeleton -> dashboard skeleton -> real chrome, with
  // no blank segment anywhere.
  // This does not soften the assertion: the pre-fix code produces 52 (375px) /
  // 57 (1440px) empty frames with first chrome at frame 52/57 — those are the
  // post-streaming frames where loading.js has already handed off and the
  // layout rendered null. It fails BOTH clauses by ~50x.
  const firstChromeIdx = firstChrome ? s.indexOf(firstChrome) : Infinity;
  record(
    `A cold load @${w}px — dashboard region never empty during the auth window`,
    onDash.length > 0 && blankDash.length <= 1 && firstChromeIdx <= 1,
    `dashboard frames=${onDash.length} | EMPTY-region frames=${blankDash.length} | ` +
      `skeleton frames=${skeletonFrames.length} | first chrome at frame ${firstChromeIdx}`
  );
  await ctx.close();
}

// ---------- Pin B: unauthenticated behaviour UNCHANGED ----------
{
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(SAMPLER); // NO token seeded
  const page = await ctx.newPage();
  await page.goto(`${BASE}/producer/dashboard/tools`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const url = page.url();
  const redirected = /\/login/.test(url);
  const s = await page.evaluate(() => window.__mm || []);
  // The guarantee: a guest must never see dashboard chrome behind the redirect.
  // The guarantee: a guest must never see dashboard chrome — real or skeleton —
  // behind the /login redirect.
  const chromeFrames = s.filter((f) => f.chrome && !/\/login/.test(f.path));
  const skelFrames = s.filter((f) => f.skeleton && !/\/login/.test(f.path));

  // B1 — the guarantee that must not regress: a guest is still sent to /login
  // carrying ?redirect= (the MEH-1599 behaviour).
  record(
    "B1 unauthenticated -> /login with ?redirect= (MEH-1599 behaviour)",
    redirected && /redirect=%2Fproducer%2Fdashboard%2Ftools/.test(url),
    `landed on ${url.replace(BASE, "")}`
  );

  // B2 — reported separately and NOT folded into B1, because it is a real
  // change and collapsing the two would let the passing half hide it.
  // The skeleton ships in the SERVER-rendered HTML: authLoading is true during
  // SSR for every visitor, since the token lives in localStorage and the server
  // cannot see it. So a guest paints the skeleton before hydration can run the
  // auth effect. Suppressing it would require reading localStorage during
  // render — a hydration mismatch by construction.
  record(
    "B2 guest renders no dashboard chrome before the redirect",
    skelFrames.length === 0,
    `dashboard-chrome frames pre-redirect=${chromeFrames.length} (skeleton: ${skelFrames.length})` +
      ` — structural: the skeleton is present in the SSR HTML`
  );
  await ctx.close();
}

await browser.close();
console.log(`\n${results.filter((r) => r.verdict === "PASS").length}/${results.length} pins pass`);
console.log(JSON.stringify(results, null, 2));
