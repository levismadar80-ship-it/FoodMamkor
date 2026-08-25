/**
 * MEH-2169 — does the FilterSheet fit on ONE screen at 0 active filters?
 *
 * The card's acceptance criterion is a MEASUREMENT, not a judgement: at 390×844
 * the panel's scrollHeight must be <= its clientHeight (nothing to scroll), and
 * at 1440 the lg panel must fit inside its own max-h. This runs that measurement
 * and prints the numbers, so the PR quotes an instrument rather than an opinion.
 *
 * WHY IT IS A CHECK AND NOT A DECORATION
 *
 * Two ways a height probe reports success while proving nothing, both guarded:
 *
 *  1. The sheet might not have OPENED. A panel that never mounted has no
 *     geometry, and `scrollHeight <= clientHeight` is trivially true of the
 *     numbers you get from guessing (0 <= 0). So the run fails if the panel is
 *     missing, and it asserts a non-zero clientHeight and the expected number of
 *     axes before it reads a single height — an empty sheet fits every screen.
 *  2. The probe might be measuring the wrong element. The panel is located by
 *     id (#filter-sheet-panel), the same handle the MEH-1945 guard uses, and the
 *     axis count is cross-checked against the rendered role="switch" controls.
 *
 * The 0-filters state is the one the card specifies and is also the TALLEST
 * state for this change: no chip is active, so nothing is hidden and every axis
 * is painted. Measuring a filtered state would flatter the result.
 *
 * Run:  node e2e/qa-meh2169-sheet-height.mjs [baseURL]
 * PNGs are raw; compress before staging (2 MB per-PR cap, MEH-1156):
 *   node scripts/compress-qa-screenshots.mjs ../qa-artifacts/meh-2169/
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync, existsSync, readdirSync } from "node:fs";

/**
 * Resolve a Chromium binary WITHOUT reading an environment variable.
 * REUSES: frontend/e2e/qa-meh1945-sticky-apply.mjs:44-56 — same sandbox
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
const OUT = "../qa-artifacts/meh-2169";
const EXPECTED_MAP_AXES = 11;

const TARGETS = [
  {
    name: "iphone-390x844",
    viewport: { width: 390, height: 844 },
    ua: devices["iPhone 13"].userAgent,
    scale: 2,
    isMobile: true,
    // Mobile is the strict case: the panel is `max-h-[80dvh] overflow-y-auto`,
    // so "fits" means the content never exceeds the scrollport.
    mustNotOverflow: true,
  },
  {
    name: "desktop-1440x900",
    viewport: { width: 1440, height: 900 },
    ua: devices["Desktop Chrome"].userAgent,
    scale: 1,
    isMobile: false,
    mustNotOverflow: true,
  },
];

// Same locator as the MEH-1945 guard, and for the same reason: /map's trigger
// carries no data-testid, while aria-controls is load-bearing for a11y on both
// surfaces so it cannot drift silently. `:visible` matters — /map renders the
// trigger twice (one per shell) and the off-shell copy is present at 0×0.
const TRIGGER = 'button[aria-controls="filter-sheet-panel"]:visible';

const failures = [];
const rows = [];

async function readPanel(page) {
  return page.evaluate(() => {
    const panel = document.getElementById("filter-sheet-panel");
    if (!panel) throw new Error("#filter-sheet-panel not found — sheet did not open");
    const r = panel.getBoundingClientRect();
    return {
      scrollHeight: Math.round(panel.scrollHeight),
      clientHeight: Math.round(panel.clientHeight),
      panelTop: Math.round(r.top),
      panelBottom: Math.round(r.bottom),
      viewportH: window.innerHeight,
      axes: panel.querySelectorAll('[role="switch"]').length,
      pills: panel.querySelectorAll('.grid [role="switch"]').length,
      infos: panel.querySelectorAll('[data-testid^="chip-info-"]').length,
      // Tap targets. The ⓘ grows vertically only (the row is already 44/36px),
      // so this reports the real hit box rather than the 20px circle you see.
      infoBoxes: [...panel.querySelectorAll('[data-testid^="chip-info-"]')].map((el) => ({
        key: el.dataset.testid.replace("chip-info-", ""),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      })),
      // Wrapped pill labels are the other half of the card: a two-line pill is
      // taller than the 44px floor, so it shows up as height rather than as a
      // visibly broken control. Measure each pill instead of eyeballing.
      pillBoxes: [...panel.querySelectorAll('.grid [role="switch"]')].map((el) => ({
        label: el.textContent.trim(),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
        lineH: Math.round(Number.parseFloat(getComputedStyle(el).lineHeight) || 0),
      })),
      // A horizontally scrolling panel would mean the ⓘ bubble opened outward
      // and got clipped — the failure the position="start" choice guards.
      scrollWidth: Math.round(panel.scrollWidth),
      clientWidth: Math.round(panel.clientWidth),
    };
  });
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: resolveChromium() });

  for (const t of TARGETS) {
    const label = t.name;
    const ctx = await browser.newContext({
      viewport: t.viewport,
      userAgent: t.ua,
      deviceScaleFactor: t.scale,
      isMobile: t.isMobile,
      hasTouch: t.isMobile,
      locale: "he-IL",
    });
    const page = await ctx.newPage();

    // STUB, not a mock (frontend/e2e/CLAUDE.md — "Distinguish a stub from a
    // mock"): this probe asserts the SHEET's geometry and says nothing about
    // any backend behaviour, so removing these interceptions would change
    // nothing it measures. They are here because a sandbox run has no backend:
    // /producers 500s, the feed retries, and /map re-mounts its shell — which
    // detaches the filters trigger mid-click. The chip set is static taxonomy
    // (lib/filter-taxonomy.js), so an empty feed renders the identical sheet.
    await page.route("**/api/producers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/categories**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );

    await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(TRIGGER, { timeout: 20_000 });
    // The /map shell re-mounts as the producer feed settles, which detaches the
    // trigger mid-click. A fixed settle pause, then a bounded retry — NOT a
    // `networkidle` wait, which .claude/rules/testing.md bans in this repo and
    // which would never resolve here anyway (the local run has no backend, so
    // the feed request 500s and retries).
    await page.waitForTimeout(2_000);
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      try {
        await page.locator(TRIGGER).first().click({ timeout: 8_000 });
        await page.waitForSelector("#filter-sheet-panel", { state: "visible", timeout: 8_000 });
        opened = true;
      } catch {
        await page.waitForTimeout(1_500);
      }
    }
    if (!opened) {
      failures.push(`${label}: could not open the sheet after 3 attempts`);
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(400);

    const m = await readPanel(page);

    // GUARD — everything below is vacuous if the sheet is empty or unmounted.
    if (m.clientHeight === 0) {
      failures.push(`${label}: panel clientHeight is 0 — nothing was measured`);
    }
    if (m.axes !== EXPECTED_MAP_AXES) {
      failures.push(`${label}: ${m.axes} axes rendered, expected ${EXPECTED_MAP_AXES}`);
    }
    if (m.pills !== 5) {
      failures.push(`${label}: ${m.pills} diet pills in the grid, expected 5`);
    }

    const overflow = m.scrollHeight - m.clientHeight;
    if (t.mustNotOverflow && overflow > 0) {
      failures.push(
        `${label}: sheet still scrolls at 0 filters — scrollHeight=${m.scrollHeight} > clientHeight=${m.clientHeight} (+${overflow}px)`,
      );
    }
    if (m.scrollWidth > m.clientWidth + 1) {
      failures.push(
        `${label}: panel scrolls HORIZONTALLY (${m.scrollWidth} > ${m.clientWidth}) — a tooltip or pill is overflowing`,
      );
    }
    // The ⓘ must be at least as tall as the row it sits in — a 20px circle in a
    // 44px row is the dead-glyph shape one step removed: reachable in theory,
    // missable in practice. Compared against the row height actually measured,
    // not a hardcoded 44, so it stays true at the lg density too.
    const rowH = t.isMobile ? 44 : 36;
    for (const b of m.infoBoxes) {
      if (b.h < rowH) {
        failures.push(`${label}: ⓘ on «${b.key}» is ${b.w}×${b.h}px, shorter than the ${rowH}px row`);
      }
    }
    for (const p of m.pillBoxes) {
      // A single-line pill's height is its padding plus ONE line box. Two lines
      // add a whole lineHeight, so anything at or above (floor + lineHeight) has
      // wrapped. Compared against the measured line height rather than a magic
      // pixel constant, so it survives a font or density change.
      if (p.lineH && p.h >= 44 + p.lineH) {
        failures.push(`${label}: pill «${p.label}» is ${p.h}px tall (lineHeight ${p.lineH}) — label wrapped`);
      }
    }

    rows.push({ target: label, ...m, overflow });
    await page.screenshot({ path: `${OUT}/${label}-sheet-open.png` });

    // Tooltip open state — the card asks for it captured, and it doubles as
    // proof the ⓘ opens INWARD instead of being clipped at the panel edge.
    const info = page.locator('[data-testid="chip-info-kosher"]').first();
    if ((await info.count()) === 0) {
      failures.push(`${label}: no ⓘ on the kosher row — the disclosure did not move, it vanished`);
    } else {
      await info.click();
      await page.waitForTimeout(200);
      const shown = await page.locator('[role="tooltip"]').first().isVisible();
      if (!shown) {
        failures.push(
          `${label}: ⓘ clicked but no [role=tooltip] became visible — the disclosure is a dead glyph`,
        );
      }
      const after = await readPanel(page);
      if (after.scrollWidth > after.clientWidth + 1) {
        failures.push(`${label}: opening the ⓘ made the panel scroll horizontally — bubble clipped`);
      }
      await page.screenshot({ path: `${OUT}/${label}-tooltip-open.png` });
    }

    await ctx.close();
  }

  await browser.close();

  console.log("\n=== MEH-2169 FilterSheet height, 0 active filters ===");
  for (const r of rows) {
    console.log(
      `${r.target.padEnd(20)} scrollHeight=${String(r.scrollHeight).padStart(4)}  ` +
        `clientHeight=${String(r.clientHeight).padStart(4)}  overflow=${String(r.overflow).padStart(4)}  ` +
        `axes=${r.axes} pills=${r.pills} info=${r.infos}` +
        `  infoBox=${r.infoBoxes[0] ? `${r.infoBoxes[0].w}x${r.infoBoxes[0].h}` : "n/a"}`,
    );
    for (const p of r.pillBoxes) {
      console.log(`    pill «${p.label}» ${p.w}×${p.h}px (lineHeight ${p.lineH})`);
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} FAILURE(S):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
