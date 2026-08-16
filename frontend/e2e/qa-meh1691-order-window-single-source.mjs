/**
 * MEH-1691 self-QA — the order window is stated exactly ONCE on the producer page.
 *
 * MEH-1546 shipped two renders of the same fact: the derived status inside
 * ProducerHeader's meta line, and a floating weekly-schedule strip that landed
 * between the reviews block and the "אודות" heading with no heading and no
 * container. This harness proves the strip is gone and the meta line is not.
 *
 * The producer page is SERVER-rendered (`page.js` → `serverFetch(API_URL)`), so
 * browser-side route interception cannot feed it. Like the MEH-1546 harness this
 * starts its own mock backend on the port the bundle already points at
 * (NEXT_PUBLIC_* are inlined at BUILD time, so a runtime override would NOT reach
 * serverFetch) — the page under test is the real one, SSR included.
 *
 * WHY THE ASSERTION DISCRIMINATES (MEH-1619). `strip === 0` is not a claim about
 * the page in general — it is a claim about exactly the render this PR removed,
 * addressed by its own testid. Run this same file against origin/staging and it
 * reports strip=1 and exits 1; against this branch it reports strip=0 and exits 0.
 * The `status === 1` leg is the other half and fails independently: it catches a
 * "fix" that deleted the meta line instead of the strip. Neither leg can carry the
 * other — they are separate named checks, not an `||`.
 *
 * Run manually:  node e2e/qa-meh1691-order-window-single-source.mjs
 * REUSES: e2e/qa-meh1546-order-window.mjs (mock-API + dual-viewport harness).
 */
import { chromium } from "@playwright/test";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1691";
// The build inlines NEXT_PUBLIC_* at BUILD time (lib/env.client.js:53-54), so
// the mock must serve on exactly the port the bundle baked in.
const API_PORT = 8000;
// Unique per run: spawn() returns the `npx` wrapper, and killing it leaves the
// real next-server holding the port — a stale listener would answer with an OLD
// build and the capture would be meaningless.
const APP_PORT = 3600 + (process.pid % 300);
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
  wednesday: { open: "09:00", close: "14:00" },
  thursday: { open: "09:00", close: "14:00" },
};

const STATES = [
  { key: "1-open", clock: "2026-07-26T08:00:00Z" },
  { key: "2-closed", clock: "2026-07-26T12:00:00Z" },
];

function baseProducer() {
  return {
    id: PRODUCER_ID,
    name: "מאפיית רוח השדה",
    slug: null,
    // A populated bio so the "אודות" heading renders — the strip used to float
    // directly above it, so the gap between reviews and אודות is the region
    // these screenshots have to document.
    description:
      "לחם מחמצת בתנור אבן, אפייה יומית משעות הבוקר המוקדמות. עובדים עם קמח מקומי טחון במקום.",
    short_description: "מאפיית בוטיק",
    city: "זכרון יעקב",
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
    avg_rating: 4.8,
    reviews_count: 12,
    has_physical_location: true,
    offers_delivery: false,
    order_window: WINDOW,
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
    detached: true, // own process group, so we can kill the whole tree
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const api = await startMockApi();
  const app = startApp();
  await waitForApp();

  const browser = await chromium.launch({ executablePath: CHROME });
  const findings = [];
  const failures = [];

  for (const state of STATES) {
    for (const [label, width, height] of [
      ["375", 375, 812],
      ["1440", 1440, 1000],
    ]) {
      const ctx = await browser.newContext({
        viewport: { width, height },
        locale: "he-IL",
        timezoneId: "Asia/Jerusalem",
        reducedMotion: "reduce",
      });
      // Pre-consent so the fixed-bottom cookie banner never covers the region
      // being documented (CookieBanner.jsx:11 — localStorage key).
      await ctx.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
      const page = await ctx.newPage();
      // Deterministic "now" — the status is time-derived (MEH-1531 lesson).
      await page.clock.install({ time: new Date(state.clock) });
      await page.goto(`${BASE}/producer/${PRODUCER_ID}`, { waitUntil: "domcontentloaded" });
      // Readiness beat: wait for real page content, not a testid — ProducerDetail
      // is client-rendered, so testids appear only after hydration.
      await page.getByText("מאפיית רוח השדה").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);

      // CHECK 1 — the removed render is absent, addressed by its own testid.
      const stripCount = await page.getByTestId("order-window-strip").count();
      // CHECK 2 — the surviving single source is present (exactly one status).
      const statusCount =
        (await page.getByTestId("status-open").count()) +
        (await page.getByTestId("status-orders-closed").count()) +
        (await page.getByTestId("status-closed").count()) +
        (await page.getByTestId("status-vacation").count());
      const statusText = (
        (await page.getByTestId("status-open").first().textContent().catch(() => null)) ??
        (await page
          .getByTestId("status-orders-closed")
          .first()
          .textContent()
          .catch(() => null)) ??
        ""
      ).trim();
      // CHECK 3 — the strip's copy is gone from the rendered page entirely.
      // Scoped to the label the strip owned; DeliveryBlock's cutoff line reads
      // "מקבלים הזמנות עד …" and is a DIFFERENT render that must survive.
      const bodyText = await page.locator("body").innerText();
      const stripLabelHits = (bodyText.match(/מקבלים הזמנות:/g) || []).length;
      // CHECK 4 — the CTA note (MEH-1649) is untouched by this PR.
      const noteCount = await page.getByTestId("order-window-cta-note").count();

      const tag = `${state.key}@${label}`;
      findings.push(
        `[${tag}] strip=${stripCount} stripLabel=${stripLabelHits} status=${statusCount} text="${statusText}" ctaNote=${noteCount}`
      );
      if (stripCount !== 0) failures.push(`${tag}: order-window-strip still renders (${stripCount})`);
      if (stripLabelHits !== 0) failures.push(`${tag}: strip copy "מקבלים הזמנות:" still on page`);
      if (statusCount !== 1) failures.push(`${tag}: expected exactly 1 status element, got ${statusCount}`);

      await page.screenshot({ path: `${OUT}/producer-${label}-${state.key}.png`, fullPage: true });
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

  console.log(findings.join("\n"));
  if (failures.length > 0) {
    console.error("\nFAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("\nOK — order window stated exactly once on every captured state.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
