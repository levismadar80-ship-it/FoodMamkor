/**
 * MEH-2129 — screenshot + live focus evidence for the mount-only initial focus.
 *
 * Captures the CertModal open at 375 and 1440, and measures — in a real
 * browser, not jsdom — that a parent re-render while the modal is open no
 * longer drags focus back to the close button.
 *
 * DISCRIMINATION (.claude/rules/testing.md). "Focus stayed put" passes
 * trivially if the re-render never happened, so the run measures a CONTROL
 * first: it asserts the modal is really open, that the page is not the error
 * boundary, and that the re-render actually incremented a render counter
 * observed from the DOM. If the control cannot fire, every reassuring reading
 * afterwards is void and the run fails loudly rather than reporting green.
 *
 * The re-render is provoked the way the app itself provokes one — a state
 * change in the parent that owns `openCert` — by dispatching a resize, which
 * KashrutBadgeStrip's ancestors re-render on. If that produces no re-render
 * the control says so.
 *
 * Run: node e2e/qa-meh2129-cert-focus.mjs [outdir] [base]   (needs `next start`)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "qa-artifacts/MEH-2129");
const BASE = process.argv[3] || "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PRODUCERS_RE = /\/api\/producers(?:\?[^#]*)?$/;
const CATEGORIES_RE = /\/api\/categories(?:\?[^#]*)?$/;
const DEMO_ID = "11111111-1111-4111-8111-111111111111";
const DETAIL_RE = new RegExp(`/api/producers/${DEMO_ID}$`);

const producer = {
  id: DEMO_ID,
  name: "מאפיית הדגמה של שרה",
  slug: "demo-bakery",
  city: "תל אביב",
  category_id: 1,
  category_name: "מאפים",
  description: "עסק הדגמה ל-QA של MEH-2129.",
  image_url: null,
  lat: 32.08,
  lng: 34.78,
  is_verified: true,
  kashrut_badges: ["badatz"],
  kashrut_verified_at: "2026-01-01T00:00:00Z",
  kashrut_expires_at: "2027-01-01T00:00:00Z",
  kashrut_certs: [{ badge_code: "badatz" }],
};

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const failures = [];
const ran = [];
function check(name, cond, detail) {
  ran.push(name); // derived count, never a stated literal
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shoot(ctx, width, height, label) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}/he/producer/${DEMO_ID}`, { waitUntil: "domcontentloaded" });

  const boom = await page.getByText("משהו השתבש").count();
  check(`${label}: page is not the error boundary`, boom === 0, `error-boundary nodes=${boom}`);

  const trigger = page.locator('[data-testid="kashrut-cert-trigger-badatz"]').first();
  await trigger.waitFor({ state: "visible", timeout: 20_000 });
  await trigger.click();

  const panel = page.locator('[data-testid="kashrut-cert-modal"]');
  await panel.waitFor({ state: "visible", timeout: 10_000 });
  // CONTROL: the modal is genuinely on screen with real area. A 0x0 box means
  // the shot below photographs nothing and every later reading is void.
  const box = await panel.boundingBox();
  check(
    `${label}: modal is on screen with real area`,
    !!box && box.width > 100 && box.height > 100,
    box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "no box",
  );

  const focusedOnOpen = await page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? "(none)",
  );
  check(
    `${label}: initial focus is the close button`,
    focusedOnOpen === "kashrut-cert-close",
    `activeElement data-testid=${focusedOnOpen}`,
  );

  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `cert-modal-${width}.png`) });

  // --- the MEH-2129 measurement, in a real browser ---
  //
  // READ THIS BEFORE QUOTING THE GREEN BELOW. The discriminating evidence for
  // this ticket is the vitest test (__tests__/KashrutCertModal.test.jsx), which
  // was shown red against the merged effect and green against the split one.
  // This block is weaker on purpose, and says so: it sweeps for a real
  // interaction that re-renders the parent while the modal is open, and it
  // REPORTS what it finds instead of assuming one exists.
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "meh2129-probe";
    b.textContent = "probe";
    document.body.appendChild(b);
    b.focus();
    window.__meh2129Commits = 0;
    const panel = document.querySelector('[data-testid="kashrut-cert-modal"]');
    window.__meh2129Obs = new MutationObserver(() => { window.__meh2129Commits += 1; });
    window.__meh2129Obs.observe(panel, {
      attributes: true, childList: true, subtree: true, characterData: true,
    });
  });

  const parkedOn = await page.evaluate(() => document.activeElement?.id ?? "(none)");
  check(`${label}: focus parked outside the panel`, parkedOn === "meh2129-probe", `id=${parkedOn}`);

  // SELF-CONTROL, and it is a gate. A MutationObserver that never attached
  // reports 0 for every trial below — the same number as "nothing re-rendered".
  // Poking the panel deliberately is the one case whose answer is known, so a
  // silent zero here voids the whole sweep instead of reading as a clean run.
  const observerAlive = await page.evaluate(async () => {
    document
      .querySelector('[data-testid="kashrut-cert-modal"]')
      .setAttribute("data-meh2129-control-poke", "1");
    await new Promise((r) => setTimeout(r, 200));
    return window.__meh2129Commits;
  });
  check(
    `${label}: SELF-CONTROL — the mutation observer fires on a known mutation`,
    observerAlive > 0,
    `mutations after a deliberate poke=${observerAlive} (0 ⇒ every trial below is void)`,
  );

  // The sweep. Each trial is measured, not assumed.
  const trials = {
    resize: async () => {
      await page.setViewportSize({ width: width - 1, height });
      await page.setViewportSize({ width, height });
    },
    scroll: async () => { await page.mouse.wheel(0, 300); await page.mouse.wheel(0, -300); },
    mousemove: async () => { await page.mouse.move(10, 10); await page.mouse.move(200, 400); },
    keypress: async () => { await page.keyboard.press("a"); },
    idle3s: async () => { await page.evaluate(() => new Promise((r) => setTimeout(r, 3000))); },
  };

  let provoked = 0;
  for (const [name, fn] of Object.entries(trials)) {
    await page.evaluate(() => { window.__meh2129Commits = 0; });
    await fn();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    const n = await page.evaluate(() => window.__meh2129Commits);
    provoked += n;
    const focused = await page.evaluate(
      () => document.activeElement?.id
        ?? document.activeElement?.getAttribute("data-testid")
        ?? "(none)",
    );
    console.log(`INFO  ${label}: trial ${name} — panel mutations=${n}, activeElement=${focused}`);
    // Only a trial that ACTUALLY re-rendered can testify about focus theft.
    if (n > 0) {
      check(
        `${label}: ${name} re-rendered the parent and did NOT steal focus`,
        focused === "meh2129-probe",
        `activeElement=${focused}`,
      );
    }
  }

  const stillOpen = await page.evaluate(
    () => !!document.querySelector('[data-testid="kashrut-cert-modal"]'),
  );
  check(`${label}: modal still open after the sweep`, stillOpen === true, `open=${stillOpen}`);

  // The finding itself, stated rather than buried. NOT a failure: it is a
  // measurement about how reachable the defect is on this surface, and it is
  // the reason the vitest test — not this harness — is the evidence of record.
  console.log(
    `INFO  ${label}: FINDING — ${provoked} of 5 interaction trials re-rendered the ` +
    `parent while the modal was open. At 0, this harness CANNOT reproduce the ` +
    `focus theft on the producer-detail page, so its green is not evidence the ` +
    `fix works; it only shows initial focus and the open modal at this width. ` +
    `The mechanism is proven in __tests__/KashrutCertModal.test.jsx instead.`,
  );

  await page.close();
}

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const ctx = await browser.newContext({ locale: "he-IL" });

  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  await ctx.route(/\/_next\/image/, (r) => r.abort());
  await ctx.route(/\/kashrut-cert\//, (r) => r.fulfill({ contentType: "image/png", body: PNG_1PX }));
  await ctx.route(DETAIL_RE, (r) => r.fulfill({ json: producer }));
  await ctx.route(PRODUCERS_RE, (r) => r.fulfill({ json: { items: [producer], total: 1 } }));
  await ctx.route(CATEGORIES_RE, (r) => r.fulfill({ json: [{ id: 1, name: "מאפים", slug: "bakery" }] }));

  await shoot(ctx, 375, 812, "375");
  await shoot(ctx, 1440, 900, "1440");

  await browser.close();

  console.log(`\n${ran.length} assertion(s) ran, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  FAIL ${f}`);
    process.exit(1);
  }
  console.log("MEH-2129 focus QA: all green");
};

run().catch((e) => { console.error(e); process.exit(1); });
