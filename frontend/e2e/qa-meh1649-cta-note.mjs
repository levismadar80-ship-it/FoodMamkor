/**
 * MEH-1649 self-QA — the closed-window CTA note moves INSIDE ContactCard.
 *
 * The producer page is SERVER-rendered (`page.js` → `serverFetch(API_URL)`),
 * so browser-side route interception cannot feed it. This harness starts its
 * own mock backend on the port the bundle already points at (NEXT_PUBLIC_* are
 * inlined at BUILD time, so a runtime override would NOT reach serverFetch) —
 * the page under test is the real one, SSR included.
 * REUSES: e2e/qa-meh1546-order-window.mjs (dual-viewport capture harness).
 *
 * What it asserts, per state x viewport:
 *   - POSITIVE LOCATION (the point of the ticket): the note is a DOM
 *     descendant of [data-testid="contact-card"]. "Not floating above the
 *     card" is NOT sufficient — a note flung anywhere else on the page would
 *     pass that negative check while being just as wrong (MEH-1592 lesson).
 *   - notesOutsideCard === 0 — the negative half, kept as a pair.
 *   - visible note count === 1 on a closed window, 0 on open / null.
 *
 * NOTE ON DOM COUNT: ContactCard is rendered TWICE by ProducerDetail — once
 * inline for mobile (`lg:hidden`) and once in the sticky sidebar
 * (`hidden lg:block`). Both are in the DOM at every viewport; CSS hides one.
 * So a closed window yields 2 notes in the DOM and 1 VISIBLE. That count is
 * unchanged by this ticket: before it, the two mounts were ProducerDetail:208
 * and ContactSidebar:22. The ticket's "exactly ONE note in the DOM" was
 * written assuming a single mount; the invariant that actually holds — and
 * that this harness pins — is exactly one VISIBLE note, inside the card.
 *
 * Run manually:  node e2e/qa-meh1649-cta-note.mjs
 */
import { chromium } from "@playwright/test";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1649";
const API_PORT = 8000;
const APP_PORT = 3200 + (process.pid % 300);
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
  { key: "closed", clock: "2026-07-26T12:00:00Z", window: WINDOW, expectVisible: 1 },
  { key: "open", clock: "2026-07-26T08:00:00Z", window: WINDOW, expectVisible: 0 },
  { key: "null", clock: "2026-07-26T08:00:00Z", window: null, expectVisible: 0 },
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
 * Self-test: feed the locator logic three synthetic DOM shapes — correct,
 * regression-shaped, and neutral — and assert it sorts them. Run FIRST: if the
 * classifier cannot tell a note-inside-the-card from a note-above-it, nothing
 * it reports afterwards is worth reading (.claude/rules/testing.md, MEH-1619).
 * Exercises the REAL measure() body, never a copy.
 */
async function selfTest(browser) {
  const cases = [
    {
      name: "correct (note inside card, under CTA)",
      html: `<div data-testid="contact-card"><button>CTA</button>
             <p data-testid="order-window-cta-note">note</p></div>`,
      expect: { visible: 1, outside: 0, descendant: true },
    },
    {
      name: "regression-shaped (note above/outside card)",
      html: `<p data-testid="order-window-cta-note">note</p>
             <div data-testid="contact-card"><button>CTA</button></div>`,
      expect: { visible: 1, outside: 1, descendant: false },
    },
    {
      name: "neutral (no note at all)",
      html: `<div data-testid="contact-card"><button>CTA</button></div>`,
      expect: { visible: 0, outside: 0, descendant: null },
    },
  ];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const failures = [];
  for (const c of cases) {
    await page.setContent(`<body dir="rtl">${c.html}</body>`);
    const got = await measure(page);
    const ok =
      got.visible === c.expect.visible &&
      got.outside === c.expect.outside &&
      got.descendant === c.expect.descendant;
    failures.push(`  ${ok ? "PASS" : "FAIL"} self-test: ${c.name} → ${JSON.stringify(got)}`);
    if (!ok) failures.push(`       expected ${JSON.stringify(c.expect)}`);
  }
  await ctx.close();
  const bad = failures.filter((l) => l.includes("FAIL"));
  return { lines: failures, ok: bad.length === 0 };
}

/**
 * The single measurement used by BOTH the self-test and the real capture.
 * `descendant` is the positive-location answer: is the (first) visible note
 * actually inside a contact card? null when there is no note to ask about.
 */
async function measure(page) {
  return page.evaluate(() => {
    const notes = [...document.querySelectorAll('[data-testid="order-window-cta-note"]')];
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const vis = notes.filter(isVisible);
    return {
      inDom: notes.length,
      visible: vis.length,
      // Negative half: any note NOT inside a card is a floating note.
      outside: notes.filter((n) => !n.closest('[data-testid="contact-card"]')).length,
      // Positive half: the visible note IS where it belongs.
      descendant: vis.length ? Boolean(vis[0].closest('[data-testid="contact-card"]')) : null,
      // Adjacency: does the CTA button precede the note inside the same card?
      afterCta: vis.length
        ? (() => {
            const card = vis[0].closest('[data-testid="contact-card"]');
            if (!card) return null;
            const cta = card.querySelector("a,button");
            return cta
              ? Boolean(
                  cta.compareDocumentPosition(vis[0]) & Node.DOCUMENT_POSITION_FOLLOWING
                )
              : null;
          })()
        : null,
      noteText: vis.length ? vis[0].textContent.trim() : null,
    };
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const api = await startMockApi();
  const app = startApp();
  await waitForApp();

  const browser = await chromium.launch({ executablePath: CHROME });
  const findings = [];

  // Classifier self-test FIRST.
  const st = await selfTest(browser);
  findings.push("=== self-test (classifier discriminates?) ===", ...st.lines, "");
  if (!st.ok) {
    findings.push("SELF-TEST FAILED — measurements below are not trustworthy.");
  }

  findings.push("=== real page ===");
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
      await ctx.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
      await page.clock.install({ time: new Date(state.clock) });
      await page.goto(`${BASE}/producer/${PRODUCER_ID}`, { waitUntil: "domcontentloaded" });
      // Readiness beat: real content, not a testid — ProducerDetail is
      // client-rendered, so testids appear only after hydration.
      await page.getByText("מאפיית שדה").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(900);

      const m = await measure(page);
      const pass =
        m.visible === state.expectVisible &&
        m.outside === 0 &&
        (state.expectVisible === 0 || (m.descendant === true && m.afterCta === true));

      findings.push(
        `[${state.key} @${label}] ${pass ? "PASS" : "FAIL"} ` +
          `inDom=${m.inDom} visible=${m.visible} outsideCard=${m.outside} ` +
          `descendantOfCard=${m.descendant} afterCta=${m.afterCta}` +
          (m.noteText ? ` text="${m.noteText}"` : "")
      );

      await page.screenshot({ path: `${OUT}/producer-${label}-${state.key}.png`, fullPage: false });

      // Sticky travel must survive the mount change (MEH-1546 constraint).
      if (label === "1440") {
        const before = await page
          .locator("aside .lg\\:sticky")
          .first()
          .boundingBox()
          .catch(() => null);
        await page.evaluate(() => window.scrollTo(0, 900));
        await page.waitForTimeout(600);
        const after = await page
          .locator("aside .lg\\:sticky")
          .first()
          .boundingBox()
          .catch(() => null);
        // Compare travel against the scroll that ACTUALLY happened — the page
        // may be shorter than the requested 900px, in which case a full-travel
        // element would look "stuck" purely because nothing scrolled.
        const scrolled = await page.evaluate(() => window.scrollY);
        const travelled = before && after ? Math.abs(before.y - after.y) : null;
        // Sticky engaged => the element travelled materially LESS than the
        // viewport did, and came to rest at the lg:top-24 offset (96px).
        const engaged =
          travelled !== null && scrolled > 0 && travelled < scrolled - 20 && after.y >= 90;
        findings.push(
          `        sticky@1440 ${state.key}: y ${before?.y?.toFixed(0)} → ${after?.y?.toFixed(0)} ` +
            `(travel ${travelled?.toFixed(0)}px vs actual scroll ${scrolled}px; ` +
            `rest offset ${after?.y?.toFixed(0)}px vs lg:top-24=96px) ` +
            `${engaged ? "ENGAGED" : "NOT ENGAGED"}`
        );
        await page.screenshot({ path: `${OUT}/producer-1440-${state.key}-scrolled.png` });
      }

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

  const report = findings.join("\n");
  fs.writeFileSync(`${OUT}/findings.txt`, `${report}\n`);
  console.log(report);
  const failed = findings.some((l) => l.includes("FAIL"));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
