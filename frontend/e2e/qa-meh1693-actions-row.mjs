/**
 * MEH-1693 self-QA — actions-row restructure + the lifted post-save panel.
 *
 * What this proves, and why each leg is separate:
 *   1. @375 the hero carries TWO white circles (share + heart) and the quiet
 *      actions row does NOT render.
 *   2. @1440 the row renders exactly TWO actions with VISIBLE text labels, and
 *      the hero heart is hidden (the row owns it there).
 *   3. On BOTH viewports, saving via the heart opens AlertPrefsPanel — this is
 *      the whole point of the ticket, and the half that Phase 0 proved was
 *      broken. FavoriteButton.jsx suppressed the inline panel for `quiet` AND
 *      `gallery`, which are exactly the two variants this page uses, so before
 *      the lift BOTH viewports opened nothing.
 *   4. Exactly ONE panel in the DOM at any moment (the MEH-1609 guard).
 *   5. Un-saving while it is open closes it cleanly.
 *   6. The retired bell is gone.
 *
 * Each is asserted independently with its own failure message — no `||`
 * between cues, so a leg that stops working says which one it was.
 *
 * The producer page is SERVER-rendered (`page.js` → serverFetch), so this
 * starts a mock backend on the port the bundle baked in at BUILD time and
 * drives the real page. Auth is a real localStorage token + a mocked
 * GET /auth/me, because the panel only exists for a logged-in saver.
 *
 * Run manually:  node e2e/qa-meh1693-actions-row.mjs
 * REUSES: e2e/qa-meh1691-order-window-single-source.mjs (mock-API harness).
 */
import { chromium } from "@playwright/test";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1693";
const API_PORT = 8000; // lib/env.client.js:53-54 fallback, inlined at build time
const APP_PORT = 3900 + (process.pid % 300);
const BASE = `http://localhost:${APP_PORT}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PRODUCER_ID = "11111111-1111-4111-8111-111111111111";

// Server-side favourite state, flipped by the POST/DELETE the heart fires.
let favorited = false;

function baseProducer() {
  return {
    id: PRODUCER_ID,
    name: "מאפיית רוח השדה",
    slug: null,
    description: "לחם מחמצת בתנור אבן, אפייה יומית משעות הבוקר המוקדמות.",
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
    order_window: null,
  };
}

function startMockApi() {
  const server = http.createServer((req, res) => {
    const path = req.url.split("?")[0];
    res.setHeader("content-type", "application/json");
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.end("{}");

    if (path === `/producers/${PRODUCER_ID}`) return res.end(JSON.stringify(baseProducer()));
    if (path === "/auth/me")
      return res.end(JSON.stringify({ id: "u-1", email: "qa@example.com", role: "user" }));
    // Favourites collection — the cache hydrates from here.
    if (path === "/users/me/favorites" && req.method === "GET")
      return res.end(JSON.stringify(favorited ? [baseProducer()] : []));
    if (path === `/users/me/favorites/${PRODUCER_ID}`) {
      if (req.method === "POST") favorited = true;
      if (req.method === "DELETE") favorited = false;
      return res.end("{}");
    }
    // AlertPrefsPanel's own read/write — kept trivial; its internals are out of
    // scope for this ticket and untouched by the diff.
    if (path.endsWith("/alerts"))
      return res.end(JSON.stringify({ channels: [], events: [] }));
    return res.end("[]");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject); // fail LOUD — a silent fallback to the real API is meaningless
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

/** Both hero circles share this anatomy — ShareButton's overlay variant was
 *  written to mirror FavoriteButton's gallery circle, so counting the shape
 *  counts the cluster without depending on either component's internals.
 *
 *  `:visible` is load-bearing, not decoration. The cluster is hidden by
 *  `lg:hidden`, which is `display:none` — the nodes still EXIST in the DOM at
 *  1440. A bare `.count()` therefore returns 2 on desktop and the "hidden on
 *  desktop" leg passes for the wrong reason, or fails a correct build. Caught
 *  by this harness on its first run against the finished code. */
const CIRCLE = ".lg\\:hidden button.rounded-full.w-11.h-11:visible";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const api = await startMockApi();
  const app = startApp();
  await waitForApp();

  const browser = await chromium.launch({ executablePath: CHROME });
  const findings = [];
  const failures = [];

  for (const [label, width, height] of [
    ["375", 375, 812],
    ["1440", 1440, 1000],
  ]) {
    favorited = false; // fresh per viewport — each must open the panel on its own
    const isMobile = label === "375";
    const ctx = await browser.newContext({
      viewport: { width, height },
      locale: "he-IL",
      timezoneId: "Asia/Jerusalem",
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("cookieConsent", "all");
      localStorage.setItem("token", "qa-token"); // auth-context.js:61
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/producer/${PRODUCER_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByText("מאפיית רוח השדה").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200); // let the favourites cache hydrate

    const tag = `@${label}`;

    // ---- CHECK 1: the retired bell is gone, on every viewport ----
    const bellCount = await page.getByTestId("alerts-reentry").count();
    if (bellCount !== 0) failures.push(`${tag}: bell still renders (${bellCount})`);

    // ---- CHECK 2: hero circles ----
    const circles = await page.locator(CIRCLE).count();
    if (isMobile && circles !== 2)
      failures.push(`${tag}: expected 2 hero circles (share+heart), got ${circles}`);
    if (!isMobile && circles !== 0)
      failures.push(`${tag}: hero circles must be hidden on desktop, got ${circles}`);

    // ---- CHECK 3: the quiet row, desktop-only, two VISIBLE labels ----
    const saveLabel = page.getByText("שמירה", { exact: true });
    const shareLabel = page.getByText("שיתוף", { exact: true });
    const saveVisible = await saveLabel.first().isVisible().catch(() => false);
    const shareVisible = await shareLabel.first().isVisible().catch(() => false);
    if (!isMobile) {
      // Separate assertions: a single "row has 2 actions" count would stay green
      // if one label rendered icon-only, which is the thing the spec forbids.
      if (!saveVisible) failures.push(`${tag}: desktop save label not VISIBLE`);
      if (!shareVisible) failures.push(`${tag}: desktop share label not VISIBLE`);
    } else if (saveVisible || shareVisible) {
      failures.push(
        `${tag}: actions row must not render on mobile (save=${saveVisible} share=${shareVisible})`
      );
    }

    // ---- CHECK 4: saving opens the panel — the heart for THIS viewport ----
    // The click is guarded: a MISSING heart must be reported as a named failure,
    // not a 30s timeout stack trace that aborts the remaining legs. That is not
    // hypothetical — it is exactly what the pre-MEH-1693 code does on mobile
    // (share circle only, no heart), and a crash there would have hidden the
    // panelAfterSave=0 evidence that matters most.
    const heart = isMobile
      ? page.locator(CIRCLE).nth(1) // [share, heart] — heart is second in the cluster
      : page.getByRole("button", { name: "הוסיפו למועדפים" }).first();
    const heartPresent = (await heart.count()) > 0;
    if (!heartPresent) failures.push(`${tag}: no save heart found on this viewport`);
    let panelCount = 0;
    if (heartPresent) {
      await heart.click({ timeout: 8000 }).catch(() => {});
      try {
        await page.getByTestId("alerts-reentry-panel").waitFor({ timeout: 8000 });
        panelCount = await page.getByTestId("alerts-reentry-panel").count();
      } catch {
        panelCount = 0;
      }
      if (panelCount !== 1)
        failures.push(`${tag}: save should open EXACTLY 1 panel, got ${panelCount}`);
    }

    await page.screenshot({ path: `${OUT}/saved-panel-${label}.png`, fullPage: true });

    // ---- CHECK 5: un-saving closes it cleanly ----
    const unheart = isMobile
      ? page.locator(CIRCLE).nth(1)
      : page.getByRole("button", { name: "הסר ממועדפים" }).first();
    let afterUnfav = panelCount;
    if ((await unheart.count()) > 0) {
      await unheart.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(900);
      afterUnfav = await page.getByTestId("alerts-reentry-panel").count();
      if (afterUnfav !== 0)
        failures.push(`${tag}: unfavorite must close the panel, still ${afterUnfav}`);
    }

    findings.push(
      `[${tag}] bell=${bellCount} heroCircles=${circles} saveLabelVisible=${saveVisible} ` +
        `shareLabelVisible=${shareVisible} panelAfterSave=${panelCount} panelAfterUnsave=${afterUnfav}`
    );

    await page.screenshot({ path: `${OUT}/layout-${label}.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  try {
    process.kill(-app.pid, "SIGKILL");
  } catch {
    app.kill("SIGKILL");
  }
  api.close();

  console.log(findings.join("\n"));
  if (failures.length > 0) {
    console.error("\nFAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("\nOK — bell retired; two circles @375, two labels @1440; save opens one panel on both.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
