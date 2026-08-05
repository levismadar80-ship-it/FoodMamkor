/**
 * MEH-1652 self-QA — the closed-window CTA note is GONE, and nothing else is.
 *
 * The producer page is SERVER-rendered (`page.js` → `serverFetch(API_URL)`), so
 * browser-side route interception cannot feed it. This harness starts its own
 * mock backend on the port the bundle already points at (NEXT_PUBLIC_* are
 * inlined at BUILD time, so a runtime override would NOT reach serverFetch) —
 * the page under test is the real one, SSR included.
 * REUSES: e2e/qa-meh1649-cta-note.mjs (mock-API + dual-viewport harness, the
 * clock pinning, and the visibility measure). That harness asserted the note
 * was inside ContactCard; this one asserts it does not exist at all, which is
 * why it is a new file rather than an edit — the old capture stays valid as a
 * record of what the page looked like before.
 *
 * What it asserts, per state x viewport:
 *   - ZERO `order-window-cta-note` nodes in the DOM, on a CLOSED window. That
 *     is the state that used to render the note (2 in DOM / 1 visible, because
 *     ContactCard mounts twice — mobile inline + sticky sidebar). Open and null
 *     windows never rendered it and must stay at zero too.
 *   - THE CTA SURVIVES: `primary-contact-button` is present, visible, and NOT
 *     disabled. This is the half that matters — deleting a note must not take
 *     the button with it, and "the note is gone" would be trivially satisfied
 *     by a page that failed to render at all.
 *   - The order window is still SAID, as a schedule: the
 *     `order-window-schedule` block (MEH-1875) still renders. §7 removed the
 *     promise, not the information.
 *
 * Run manually:  node e2e/qa-meh1652-cta-note-removed.mjs
 */
import { chromium } from "@playwright/test";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1652";
const API_PORT = 8000;
const APP_PORT = 3600 + (process.pid % 300);
const BASE = `http://localhost:${APP_PORT}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PRODUCER_ID = "11111111-1111-4111-8111-111111111111";

// 2026-07-26 is a Sunday. IDT = UTC+3.
//   08:00Z = 11:00 Israel → inside 09:00-14:00 → OPEN
//   12:00Z = 15:00 Israel → after close        → CLOSED (next: Monday 09:00)
const WINDOW = {
  sunday: { open: "09:00", close: "14:00" },
  monday: { open: "09:00", close: "14:00" },
  tuesday: { open: "09:00", close: "14:00" },
  thursday: { open: "10:00", close: "23:00" },
};

const STATES = [
  { key: "closed", clock: "2026-07-26T12:00:00Z", window: WINDOW },
  { key: "open", clock: "2026-07-26T08:00:00Z", window: WINDOW },
  { key: "null", clock: "2026-07-26T08:00:00Z", window: null },
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
 * The single measurement used by BOTH the self-test and the real capture.
 * Never re-implemented, so the two cannot drift (MEH-1619).
 */
async function measure(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const notes = [...document.querySelectorAll('[data-testid="order-window-cta-note"]')];
    const ctas = [...document.querySelectorAll('[data-testid="primary-contact-button"]')];
    const visibleCtas = ctas.filter(isVisible);
    return {
      notesInDom: notes.length,
      ctaInDom: ctas.length,
      ctaVisible: visibleCtas.length,
      // A button that renders but is inert is not a surviving CTA. §7's whole
      // point is that the send is never blocked.
      ctaDisabled: visibleCtas.some(
        (el) => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true"
      ),
      scheduleInDom: document.querySelectorAll('[data-testid="order-window-schedule"]').length,
    };
  });
}

/**
 * Self-test FIRST: feed the REAL measure() three synthetic DOM shapes — the
 * expected end state, the regression it must catch, and the failure mode that
 * would fake a pass. If it cannot sort these, nothing below is worth reading
 * (.claude/rules/testing.md, MEH-1619).
 *
 * The third case is the one that earns its keep. "Zero notes" is satisfied by
 * an EMPTY PAGE, so a harness that only counted notes would report a clean
 * PASS against a page that failed to render. Pairing it with a CTA assertion
 * is what makes the green mean something.
 */
async function selfTest(browser) {
  const CTA = '<a data-testid="primary-contact-button" href="#">שליחת הודעה</a>';
  const cases = [
    {
      name: "expected end state (CTA present, no note)",
      html: `<div data-testid="contact-card">${CTA}</div>
             <div data-testid="order-window-schedule">schedule</div>`,
      expect: { notesInDom: 0, ctaVisible: 1, ctaDisabled: false, scheduleInDom: 1 },
    },
    {
      name: "regression (the note came back)",
      html: `<div data-testid="contact-card">${CTA}
             <p data-testid="order-window-cta-note">היא תמתין לבית העסק</p></div>
             <div data-testid="order-window-schedule">schedule</div>`,
      expect: { notesInDom: 1, ctaVisible: 1, ctaDisabled: false, scheduleInDom: 1 },
    },
    {
      name: "fake pass (empty page — zero notes, but zero CTA too)",
      html: `<div></div>`,
      expect: { notesInDom: 0, ctaVisible: 0, ctaDisabled: false, scheduleInDom: 0 },
    },
  ];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const lines = [];
  for (const c of cases) {
    await page.setContent(`<body dir="rtl">${c.html}</body>`);
    const got = await measure(page);
    const ok = Object.entries(c.expect).every(([k, v]) => got[k] === v);
    lines.push(`  ${ok ? "PASS" : "FAIL"} self-test: ${c.name} → ${JSON.stringify(got)}`);
    if (!ok) lines.push(`       expected ${JSON.stringify(c.expect)}`);
  }
  await ctx.close();
  return { lines, ok: !lines.some((l) => l.includes("FAIL")) };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const api = await startMockApi();
  const app = startApp();
  await waitForApp();

  const browser = await chromium.launch({ executablePath: CHROME });
  const findings = [];

  const st = await selfTest(browser);
  findings.push("=== self-test (classifier discriminates?) ===", ...st.lines, "");
  if (!st.ok) findings.push("SELF-TEST FAILED — measurements below are not trustworthy.");

  findings.push("=== real page ===");
  let allPass = st.ok;
  for (const state of STATES) {
    currentWindow = state.window;
    // 390 = the mobile width this repo's self-QA standard asks for; 1280 = desktop.
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
      await page.clock.install({ time: new Date(state.clock) });
      await page.goto(`${BASE}/producer/${PRODUCER_ID}`, { waitUntil: "domcontentloaded" });
      // Readiness beat: real content, not a testid — ProducerDetail is
      // client-rendered, so testids appear only after hydration.
      await page.getByText("מאפיית שדה").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(900);

      const m = await measure(page);
      // The note is gone AND the CTA survived, as separate conjuncts rather
      // than an `||` — losing either one must be nameable on its own.
      const pass = m.notesInDom === 0 && m.ctaVisible >= 1 && m.ctaDisabled === false;
      if (!pass) allPass = false;

      findings.push(
        `[${state.key} @${label}] ${pass ? "PASS" : "FAIL"} ` +
          `notesInDom=${m.notesInDom} ctaInDom=${m.ctaInDom} ctaVisible=${m.ctaVisible} ` +
          `ctaDisabled=${m.ctaDisabled} scheduleInDom=${m.scheduleInDom}`
      );

      await page.screenshot({ path: `${OUT}/producer-${label}-${state.key}.png`, fullPage: false });
      await ctx.close();
    }
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
