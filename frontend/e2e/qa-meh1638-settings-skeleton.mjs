/**
 * MEH-1638 pins — /settings entry skeleton (the second surface of the ticket;
 * the dashboard-layout surface shipped in PR #2300 with its own harness,
 * qa-meh1638-entry-skeleton.mjs, which this mirrors).
 *
 * Before: SettingsPageBody returned null for the whole authLoading window, so
 * a cold load of /settings showed an empty content region until /auth/me
 * resolved.
 *
 * Pin A: cold load /settings with /auth/me throttled → 0 frames with an empty
 *        settings region (skeleton or real tablist always mounted).
 * Pin B: unauthenticated behaviour UNCHANGED — no token still redirects to
 *        /login and never renders the real settings content.
 *
 * Usage: node e2e/qa-meh1638-settings-skeleton.mjs [outDir] [baseUrl]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "../qa-artifacts/MEH-1638";
// REUSES: e2e/qa-meh1638-entry-skeleton.mjs:18-21 — constant + argv override,
// never an environment read (the "Env drift" gate blocks undocumented ones).
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
// Settings-region discriminator (NOT whole-body innerText — the root layout's
// Header/Footer render regardless; see qa-meh1638-entry-skeleton.mjs:83-90):
// a frame counts as "content" only if the skeleton OR the real tab bar is up.
const SAMPLER = () => {
  window.__mm = [];
  const tick = () => {
    const skeleton = !!document.querySelector('[data-testid="settings-skeleton"]');
    const real = !!document.querySelector('div[role="tablist"]');
    window.__mm.push({
      t: Math.round(performance.now()),
      nodes: document.body ? document.body.querySelectorAll("*").length : 0,
      content: skeleton || real,
      skeleton,
      real,
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
    await r.fulfill({
      json: { id: "u1", email: "qa@example.com", name: "QA", role: "consumer" },
    });
  });

  await page.goto(`${BASE}/settings`, { waitUntil: "commit" });
  // Screenshot after the streaming handoff so the artifact shows the settings
  // skeleton, not app/[locale]/loading.js's generic grid.
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/settings-skeleton-${w}.png` });
  await page.waitForTimeout(AUTH_DELAY_MS + 2500);

  const s = await page.evaluate(() => window.__mm || []);
  const onSettings = s.filter((f) => f.nodes > 0 && /\/settings/.test(f.path));
  const blank = onSettings.filter((f) => !f.content);
  const skeletonFrames = s.filter((f) => f.skeleton);
  const firstContent = s.find((f) => f.content);
  const firstContentIdx = firstContent ? s.indexOf(firstContent) : Infinity;

  // Threshold ≤1 + first content by frame 1: rAF is throttled while the
  // document streams and app/[locale]/loading.js paints that window — same
  // reasoning as qa-meh1638-entry-skeleton.mjs:96-106. The pre-fix code
  // fails by dozens of frames (null through the whole 700ms auth window).
  record(
    `A cold load @${w}px — settings region never empty during the auth window`,
    onSettings.length > 0 && blank.length <= 1 && firstContentIdx <= 1,
    `settings frames=${onSettings.length} | EMPTY-region frames=${blank.length} | ` +
      `skeleton frames=${skeletonFrames.length} | first content at frame ${firstContentIdx}`
  );
  await ctx.close();
}

// ---------- Pin B: unauthenticated behaviour UNCHANGED ----------
{
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(SAMPLER); // NO token seeded
  const page = await ctx.newPage();
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const url = page.url();
  const s = await page.evaluate(() => window.__mm || []);
  // The guarantee that must not regress: a guest is still sent to /login
  // (settings uses a bare push("/login") — no ?redirect=, unchanged) and the
  // REAL settings content never mounts. The skeleton may paint pre-redirect —
  // structural, it ships in the SSR HTML (authLoading is true during SSR for
  // every visitor); same finding as qa-meh1638-entry-skeleton.mjs pin B2.
  const realFrames = s.filter((f) => f.real && !/\/login/.test(f.path));
  record(
    "B unauthenticated -> /login, real settings content never mounts",
    /\/login/.test(url) && realFrames.length === 0,
    `landed on ${url.replace(BASE, "")} | real-content frames pre-redirect=${realFrames.length}`
  );
  await ctx.close();
}

await browser.close();
const passCount = results.filter((r) => r.verdict === "PASS").length;
console.log(`\n${passCount}/${results.length} pins pass`);
process.exit(passCount === results.length ? 0 : 1);
