/**
 * MEH-2186 — the delivery-day chip + inline panel, captured on BOTH listing
 * surfaces at BOTH breakpoints in ALL FOUR states the ticket names.
 *
 * 2 viewports × 2 surfaces × 4 states = 16 frames.
 *
 * WHY THIS IS A CHECK AND NOT A SCREENSHOT SCRIPT
 *
 * A capture harness that writes N PNGs, logs N successes and exits 0 having
 * photographed an error boundary is a documented failure in this repo (#2786).
 * So every frame is GATED on an assertion about the DOM it is about to
 * photograph, and the run exits non-zero if any gate fails:
 *
 *   closed  → exactly 1 day chip, exactly 0 pills anywhere in the document
 *   open    → exactly 7 pills, not 6 and not 8, plus the panel hint
 *   1-day   → chip carries the bare day name, ✕ present
 *   2-days  → chip carries the COLLAPSED "{first-by-week} +1" form, ✕ present
 *
 * The pill count is the ticket's own verification step 3, and it is asserted
 * as a COUNT rather than as "some pills exist" — "at least one" would pass on
 * a duplicated panel, which is exactly the MEH-1583 orphan-cell shape.
 *
 * A CONTROL RUNS FIRST. Before any frame is captured the harness loads home
 * and requires that the day chip exists at all. If it does not, the page is an
 * error boundary or the server is serving something else, and EVERY later
 * assertion in the run is void — so it aborts rather than reporting sixteen
 * green captures of a broken page.
 *
 * Run:  node e2e/qa-meh2186-day-chip.mjs [baseURL]
 * PNGs are raw; compress before staging (2 MB per-PR cap, MEH-1156):
 *   node scripts/compress-qa-screenshots.mjs ../qa-artifacts/meh-2186/
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync, existsSync, readdirSync } from "node:fs";

/**
 * Resolve a Chromium binary WITHOUT reading an environment variable.
 * REUSES: frontend/e2e/qa-meh2169-sheet-height.mjs:38-47 — same sandbox
 * constraint, same reasoning (a bespoke env var trips the "Env drift" gate).
 */
function resolveChromium() {
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  for (const entry of readdirSync(root)) {
    const candidate = `${root}/${entry}/chrome-linux/chrome`;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = "../qa-artifacts/meh-2186";
const CITY = "חיפה";

const VIEWPORTS = [
  {
    name: "375",
    viewport: { width: 375, height: 812 },
    ua: devices["iPhone 13"].userAgent,
    isMobile: true,
  },
  {
    name: "1440",
    viewport: { width: 1440, height: 900 },
    ua: devices["Desktop Chrome"].userAgent,
    isMobile: false,
  },
];

/** Home serializes the day axis as ?day=, /producers as ?delivery_days= — the
 *  MEH-1826 split this ticket does NOT touch. Each surface is driven through
 *  its OWN param name, so a frame that renders is also evidence the existing
 *  URL contract still hydrates. */
const SURFACES = [
  {
    name: "home",
    url: (days) =>
      `${BASE}/he?city=${encodeURIComponent(CITY)}` +
      days.map((d) => `&day=${encodeURIComponent(d)}`).join(""),
    noCityUrl: `${BASE}/he`,
  },
  {
    name: "producers",
    url: (days) =>
      `${BASE}/he/producers?city=${encodeURIComponent(CITY)}` +
      days.map((d) => `&delivery_days=${encodeURIComponent(d)}`).join(""),
    noCityUrl: `${BASE}/he/producers`,
  },
];

const failures = [];
/** Derived, never stated — a hard-coded total goes stale the moment a state is
 *  added, and a passing run would then misreport its own coverage (MEH-1976). */
const ran = [];

function check(label, condition, detail) {
  ran.push(label);
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

/** Everything the gates read, in ONE evaluate so the numbers cannot disagree
 *  about which render they describe. */
const probe = (page) =>
  page.evaluate(() => {
    const chip = document.querySelector('[data-testid="delivery-day-chip"]');
    return {
      chips: document.querySelectorAll('[data-testid="delivery-day-chip"]').length,
      pills: document.querySelectorAll('[data-testid^="delivery-day-pill-"]').length,
      panels: document.querySelectorAll('[data-testid="delivery-day-panel"]').length,
      hint:
        document.querySelector('[data-testid="delivery-day-panel-hint"]')?.textContent?.trim() ??
        null,
      clears: document.querySelectorAll('[data-testid="delivery-day-clear"]').length,
      chipText: chip?.textContent?.trim() ?? null,
      expanded: chip?.getAttribute("aria-expanded") ?? null,
      ghost:
        document.querySelector('[data-testid="delivery-day-row"]')?.getAttribute("data-ghost") ??
        null,
      // The defect this ticket closes: nothing in the row may claim to be
      // disabled while remaining clickable.
      ariaDisabled: document.querySelectorAll('[data-testid="delivery-day-row"] [aria-disabled]')
        .length,
      cards: document.querySelectorAll('[data-testid="producer-card"], article').length,
      // VISIBLE heading text only, never `body.textContent`. The first version
      // of this probe read `document.body.textContent.includes("משהו השתבש")`
      // and reported an error boundary on a perfectly healthy page: next-intl
      // ships the whole Hebrew message bundle inside a <script> in the body,
      // that bundle contains the string a dozen times (he.json:420, :1939,
      // :2600, …), and `textContent` descends into <script>. The control below
      // is the only reason that was caught rather than shipped as a finding —
      // it is recorded here so the next reader does not re-simplify it back.
      errorBoundary: [...document.querySelectorAll("h1, h2, p")].some(
        (el) => el.textContent.includes("משהו השתבש") && el.offsetParent !== null,
      ),
    };
  });

async function settle(page) {
  await page.waitForSelector('[data-testid="delivery-day-chip"]', { timeout: 15_000 });
  // Bounded and caught — `networkidle` is banned in specs and this bound is
  // far above a healthy settle, so a good run is unchanged and only the
  // pathological one is capped (.claude/rules/testing.md, MEH-215).
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => {});
}

/**
 * Put the SUBJECT in frame, and dismiss the cookie banner that is fixed to the
 * bottom edge and otherwise covers a third of the 375px viewport.
 *
 * The first version of this harness took a plain viewport screenshot and
 * produced sixteen photographs of the HERO. Every assertion passed, correctly:
 * they read the DOM, and the DOM was right. The images simply showed nothing
 * the ticket is about. A gate that measures the right thing does not make the
 * picture show it, and only the eye pass caught it — which is the MEH-1552
 * point about an image being a candidate until a human looks at it.
 */
async function frameSubject(page) {
  const accept = page.locator('button:has-text("קבלו הכל")');
  if (await accept.count()) await accept.first().click().catch(() => {});
  await page
    .locator('[data-testid="delivery-day-row"]')
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  // A fixed cost on every frame for the scroll and the sticky header to
  // settle — not a wait on a condition that might never arrive.
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({
  executablePath: resolveChromium(),
  args: ["--no-sandbox"],
});
mkdirSync(OUT, { recursive: true });

// ── CONTROL ────────────────────────────────────────────────────────────────
// If this fails, every "0 pills" below is the reassuring null, not a finding.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/he?city=${encodeURIComponent(CITY)}`, { waitUntil: "domcontentloaded" });
  let ok = true;
  try {
    await settle(page);
  } catch {
    ok = false;
  }
  const p = ok ? await probe(page) : null;
  await ctx.close();
  if (!ok || p.chips !== 1 || p.errorBoundary) {
    console.error(
      "CONTROL FAILED — the day chip did not render on home. Every null this " +
        "run would report afterwards is void, so nothing was captured.",
      JSON.stringify(p),
    );
    await browser.close();
    process.exit(2);
  }
  console.log(`CONTROL ok — chip present, ${p.cards} card(s) rendered\n`);
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: vp.viewport,
    userAgent: vp.ua,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
    deviceScaleFactor: 1,
    locale: "he-IL",
  });
  const page = await ctx.newPage();

  for (const surface of SURFACES) {
    const tag = `${surface.name}-${vp.name}`;

    // ── closed ────────────────────────────────────────────────────────────
    await page.goto(surface.url([]), { waitUntil: "domcontentloaded" });
    await settle(page);
    let p = await probe(page);
    console.log(`${tag} · closed`);
    check(`${tag}/closed: exactly 1 chip`, p.chips === 1, `got ${p.chips}`);
    check(`${tag}/closed: exactly 0 pills`, p.pills === 0, `got ${p.pills}`);
    check(`${tag}/closed: no panel`, p.panels === 0, `got ${p.panels}`);
    check(`${tag}/closed: aria-expanded=false`, p.expanded === "false", `got ${p.expanded}`);
    check(`${tag}/closed: nothing marked disabled`, p.ariaDisabled === 0, `got ${p.ariaDisabled}`);
    check(`${tag}/closed: no ✕ without days`, p.clears === 0, `got ${p.clears}`);
    await frameSubject(page);
    await page.screenshot({ path: `${OUT}/${tag}-closed.png` });

    // ── open ──────────────────────────────────────────────────────────────
    // Frame FIRST, then click. The outside-click handler closes the panel on
    // any mousedown outside the row, so dismissing the cookie banner after
    // opening would shut the very panel being photographed.
    await frameSubject(page);
    await page.click('[data-testid="delivery-day-chip"]');
    await page.waitForSelector('[data-testid="delivery-day-panel"]', { timeout: 5_000 });
    p = await probe(page);
    console.log(`${tag} · open`);
    check(`${tag}/open: exactly 7 pills (not 6, not 8)`, p.pills === 7, `got ${p.pills}`);
    check(`${tag}/open: exactly 1 panel`, p.panels === 1, `got ${p.panels}`);
    check(`${tag}/open: hint names the city`, Boolean(p.hint?.includes(CITY)), `got ${p.hint}`);
    check(`${tag}/open: aria-expanded=true`, p.expanded === "true", `got ${p.expanded}`);
    await page.screenshot({ path: `${OUT}/${tag}-open.png` });

    // ── 1 day (deep-linked through the surface's own URL param) ───────────
    await page.goto(surface.url(["שישי"]), { waitUntil: "domcontentloaded" });
    await settle(page);
    p = await probe(page);
    console.log(`${tag} · 1-day`);
    check(`${tag}/1-day: chip carries the day`, Boolean(p.chipText?.includes("שישי")), p.chipText);
    check(`${tag}/1-day: ✕ present`, p.clears === 1, `got ${p.clears}`);
    check(`${tag}/1-day: still 0 pills while closed`, p.pills === 0, `got ${p.pills}`);
    await frameSubject(page);
    await page.screenshot({ path: `${OUT}/${tag}-1day.png` });

    // ── 2 days: the DoD case — ?…=שישי&…=רביעי must read "רביעי +1" ───────
    await page.goto(surface.url(["שישי", "רביעי"]), { waitUntil: "domcontentloaded" });
    await settle(page);
    p = await probe(page);
    console.log(`${tag} · 2-days`);
    check(
      `${tag}/2-days: collapses to the first BY WEEK + a count`,
      Boolean(p.chipText?.includes("רביעי")) &&
        p.chipText.includes("1") &&
        !p.chipText.includes("שישי"),
      p.chipText,
    );
    check(`${tag}/2-days: ✕ present`, p.clears === 1, `got ${p.clears}`);
    await frameSubject(page);
    await page.screenshot({ path: `${OUT}/${tag}-2days.png` });
    console.log("");
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${ran.length} assertions, ${failures.length} failed.`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("MEH-2186 QA: all green.");
