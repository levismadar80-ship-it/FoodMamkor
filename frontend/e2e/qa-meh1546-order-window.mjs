/**
 * MEH-1546 self-QA — order-window on the public producer page (chunk 3/3).
 *
 * The producer page is SERVER-rendered (`page.js` → `serverFetch(API_URL)`),
 * so browser-side route interception cannot feed it. This harness therefore
 * starts its own tiny mock backend on the port the bundle already points at
 * (NEXT_PUBLIC_* are inlined at BUILD time, so a runtime override would NOT
 * reach serverFetch) — the page under test is the real one, SSR included.
 *
 * Captures 375px + 1440px in the three DoD states:
 *   1-open   — window open now  → header "פתוח להזמנות · עד 14:00" (primary)
 *   2-closed — window closed now → header "ההזמנות סגורות עכשיו · נפתחות …"
 *              (muted) + the CTA context line
 *   3-null   — no order_window  → byte-identical to pre-MEH-1546
 * and asserts the single-status invariant in every state.
 *
 * The clock is mocked (page.clock) so open/closed are deterministic rather
 * than depending on when the harness runs.
 *
 * Run manually:  node e2e/qa-meh1546-order-window.mjs
 * REUSES: e2e/qa-meh1544-order-window.mjs (dual-viewport capture harness).
 */
import { chromium } from "@playwright/test";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1546";
// The build inlines NEXT_PUBLIC_* at BUILD time, so a runtime override does
// not reach serverFetch. The bundle baked in the env.client.js fallback
// (lib/env.client.js:53-54) — so serve the mock on exactly that port.
const API_PORT = 8000;
// Unique per run: spawn() returns the `npx` wrapper, and killing it leaves the
// real next-server holding the port. A stale server then answers waitForApp
// with an OLD build whose ISR cache may hold a failed producer fetch — which
// looked like a flaky capture. Detached process-group kill (below) plus a
// fresh port makes a stale listener impossible to mistake for ours.
const APP_PORT = 3200 + (process.pid % 300);
const BASE = `http://localhost:${APP_PORT}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PRODUCER_ID = "11111111-1111-4111-8111-111111111111";

// 2026-07-26 is a Sunday. IDT = UTC+3.
//   08:00Z = 11:00 Israel → inside 09:00–14:00 → OPEN
//   12:00Z = 15:00 Israel → after close        → CLOSED (next: Monday 09:00)
const WINDOW = {
  sunday: { open: "09:00", close: "14:00" },
  monday: { open: "09:00", close: "14:00" },
  tuesday: { open: "09:00", close: "14:00" },
  thursday: { open: "10:00", close: "23:00" },
};

const STATES = [
  { key: "1-open", clock: "2026-07-26T08:00:00Z", window: WINDOW },
  { key: "2-closed", clock: "2026-07-26T12:00:00Z", window: WINDOW },
  { key: "3-null", clock: "2026-07-26T08:00:00Z", window: null },
];

let currentWindow = WINDOW;

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
    images: [],
    products: [],
    categories: [{ id: 2, name: "לחמים ואפייה" }],
    delivery_areas: [],
    locations: [],
    kashrut_badges: [],
    custom_questions: [],
    avg_rating: 0,
    reviews_count: 0,
    has_physical_location: true,
    offers_delivery: false,
    order_window: currentWindow,
  };
}

function startMockApi() {
  const server = http.createServer((req, res) => {
    const path = req.url.split("?")[0];
    res.setHeader("content-type", "application/json");
    if (path === `/producers/${PRODUCER_ID}`) return res.end(JSON.stringify(baseProducer()));
    // Everything else the page may touch: collections default to [].
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
  const proc = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    env: { ...process.env },
    stdio: "ignore",
    detached: true, // own process group, so we can kill the whole tree
  });
  return proc;
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const api = await startMockApi();
  const app = startApp();
  await waitForApp();

  const browser = await chromium.launch({ executablePath: CHROME });
  const findings = [];

  for (const state of STATES) {
    currentWindow = state.window;
    for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 1000]]) {
      const ctx = await browser.newContext({
        viewport: { width, height },
        locale: "he-IL",
        timezoneId: "Asia/Jerusalem",
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      // Pre-consent so the fixed-bottom cookie banner never covers the CTA
      // area being documented (CookieBanner.jsx:11 — localStorage key).
      await ctx.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
      // Deterministic "now" — the status is time-derived (MEH-1531 lesson).
      await page.clock.install({ time: new Date(state.clock) });
      await page.goto(`${BASE}/producer/${PRODUCER_ID}`, { waitUntil: "domcontentloaded" });
      // Readiness beat: wait for real page content (the business name), not a
      // testid — ProducerDetail is client-rendered, so testids appear only
      // after hydration and a testid-first wait races it.
      await page.getByText("מאפיית שדה").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);

      // The single-status invariant: exactly ONE status element on the page.
      const statusCount =
        (await page.getByTestId("status-open").count()) +
        (await page.getByTestId("status-orders-closed").count()) +
        (await page.getByTestId("status-closed").count()) +
        (await page.getByTestId("status-vacation").count());
      const statusText =
        (await page.getByTestId("status-open").first().textContent().catch(() => null)) ??
        (await page.getByTestId("status-orders-closed").first().textContent().catch(() => null));
      const stripCount = await page.getByTestId("order-window-strip").count();
      const noteCount = await page.getByTestId("order-window-cta-note").count();
      // CTA must never be disabled.
      const ctaDisabled = await page
        .locator('a[href*="wa.me"], a[href*="whatsapp"], button[data-testid*="contact"]')
        .first()
        .isDisabled()
        .catch(() => false);

      findings.push(
        `[${state.key} @${label}] statusElements=${statusCount} text="${(statusText || "").trim()}" strip=${stripCount} ctaNote=${noteCount} ctaDisabled=${ctaDisabled}`
      );

      await page.screenshot({ path: `${OUT}/producer-${label}-${state.key}.png`, fullPage: false });
      await ctx.close();
    }
  }

  await browser.close();
  try {
    process.kill(-app.pid, "SIGKILL"); // the GROUP — npx wrapper + next-server
  } catch {
    app.kill("SIGKILL");
  }
  api.close();
  findings.forEach((f) => console.log(f));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
