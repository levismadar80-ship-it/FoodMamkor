/**
 * MEH-1945 — the FilterSheet apply footer is sticky on mobile, on both surfaces.
 *
 * Emulation only, and that boundary is stated in the PR rather than glossed:
 * Chromium device emulation is LAYOUT evidence, not engine evidence. This change
 * touches `position: sticky` inside an `overflow-y-auto` container and moves an
 * `env(safe-area-inset-bottom)` payment from that container onto the footer —
 * both are areas where iOS Safari differs from Chromium. The PR does not claim
 * "נבדק בנייד".
 *
 * WHAT MAKES THIS A CHECK AND NOT A DECORATION
 *
 * Two ways this could report green while proving nothing, both guarded:
 *
 *  1. The panel might not overflow at all — a footer that fits is trivially
 *     visible and says nothing about stickiness. So `assertOverflows()` runs
 *     FIRST and fails the run when scrollHeight <= clientHeight. Without it the
 *     suite would pass on a surface where the bug cannot occur, which is the
 *     "green with two causes" shape.
 *  2. The assertion might pass against the pre-change markup too. So every
 *     surface is measured a second time with `sticky`/`bottom-0` stripped from
 *     the footer at runtime — reproducing exactly the lg:-gated state MEH-1481
 *     left behind — and the run FAILS if that counterfactual still looks good.
 *     That isolates the one changed condition rather than reacting to any
 *     breakage.
 *
 * The discriminating measurement is taken at scrollTop = 0. At the bottom of the
 * scroll range a non-sticky footer is visible too (you scrolled to it), so a
 * check that only looked there could not tell the two implementations apart.
 *
 * Run: node e2e/qa-meh1945-sticky-apply.mjs [baseURL]
 *
 * This writes raw PNGs (~1.8 MB for the eight captures), which is most of the
 * 2 MB per-PR budget the `qa-artifacts size cap` job enforces. ALWAYS follow a
 * run with the compress step before staging — a re-run silently re-creates the
 * PNGs next to the .webp files and pushes the total over the cap:
 *
 *   node scripts/compress-qa-screenshots.mjs ../qa-artifacts/MEH-1945/
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync, existsSync, readdirSync } from "node:fs";

/**
 * Resolve a Chromium binary WITHOUT reading an environment variable.
 * REUSES: frontend/e2e/qa-meh1862-filter-sheet.mjs:39-47 — same sandbox
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

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = "../qa-artifacts/MEH-1945";

const TARGETS = [
  { name: "iphone-390x844", viewport: { width: 390, height: 844 }, ua: devices["iPhone 13"].userAgent, scale: 3 },
  { name: "pixel5-393x851", viewport: { width: 393, height: 851 }, ua: devices["Pixel 5"].userAgent, scale: 2.75 },
];

// Both surfaces mount the SAME component; the card treats parity between them
// as the feature, so both are measured rather than one being assumed from the
// other.
//
// Located by `aria-controls`, not by data-testid: /producers has
// `producers-filters-button` but the /map trigger
// (app/[locale]/map/components/FilterChipsBar.jsx:77-95) carries none, and
// adding one would put this PR outside the card's single-file scope. The
// aria-controls handle is the better locator here anyway — it is load-bearing
// for a11y on both surfaces, so it cannot drift silently the way a testid can.
const SURFACES = [{ route: "/producers" }, { route: "/map" }];
// `:visible` is load-bearing, not defensive. /map renders the trigger TWICE —
// once per shell (`hidden lg:grid` / `lg:hidden`, MapClient.jsx) — and at 390px
// the desktop copy is present in the DOM at 0×0. A bare `.first()` resolves to
// that one and hangs on a click that can never land. Measured, not guessed:
// the probe reported w=0 h=0 for the first match and 83×42 for the second.
const TRIGGER = 'button[aria-controls="filter-sheet-panel"]:visible';

const failures = [];
const rows = [];

/** Geometry of the footer relative to the viewport, at the current scroll. */
async function readFooter(page) {
  return page.evaluate(() => {
    const panel = document.getElementById("filter-sheet-panel");
    // The footer is the panel's last element child — the apply/clear row.
    const footer = panel.lastElementChild;
    const f = footer.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const apply = footer.querySelector("button");
    return {
      position: getComputedStyle(footer).position,
      footerTop: Math.round(f.top),
      footerBottom: Math.round(f.bottom),
      panelTop: Math.round(p.top),
      panelBottom: Math.round(p.bottom),
      viewportH: window.innerHeight,
      scrollTop: Math.round(panel.scrollTop),
      scrollHeight: Math.round(panel.scrollHeight),
      clientHeight: Math.round(panel.clientHeight),
      applyH: apply ? Math.round(apply.getBoundingClientRect().height) : 0,
      // An opaque background is what makes a sticky footer readable over the
      // content sliding beneath it. Transparent = the fix looks right in a
      // rect measurement and unreadable to a human.
      bg: getComputedStyle(footer).backgroundColor,
    };
  });
}

/** Fully inside the viewport, with a 1px tolerance for sub-pixel rounding. */
const onScreen = (m) => m.footerBottom <= m.viewportH + 1 && m.footerTop >= 0;

async function scrollPanel(page, to) {
  await page.evaluate((target) => {
    const p = document.getElementById("filter-sheet-panel");
    p.scrollTop = target === "bottom" ? p.scrollHeight : 0;
  }, to);
  await page.waitForTimeout(120);
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: resolveChromium() });

  for (const t of TARGETS) {
    for (const s of SURFACES) {
      const label = `${t.name} ${s.route}`;
      const ctx = await browser.newContext({
        viewport: t.viewport,
        userAgent: t.ua,
        deviceScaleFactor: t.scale,
        isMobile: true,
        hasTouch: true,
        locale: "he-IL",
      });
      const page = await ctx.newPage();
      await page.goto(`${BASE}${s.route}`, { waitUntil: "networkidle" });

      const trigger = page.locator(TRIGGER);
      if ((await trigger.count()) < 1) {
        failures.push(`${label}: filters trigger ${TRIGGER} not found`);
        await ctx.close();
        continue;
      }
      await trigger.first().click();
      await page.waitForSelector("#filter-sheet-panel", { state: "visible", timeout: 5000 });
      await page.waitForTimeout(200);

      // GUARD 1 — the panel must actually overflow, or everything below is vacuous.
      const top = await readFooter(page);
      if (top.scrollHeight <= top.clientHeight) {
        failures.push(
          `${label}: panel does NOT overflow (scrollHeight=${top.scrollHeight} <= clientHeight=${top.clientHeight}) — ` +
            `a visible footer here proves nothing about stickiness`,
        );
        await ctx.close();
        continue;
      }

      // The contract: visible at the TOP of the scroll range (the pre-fix bug),
      // and still visible at the BOTTOM.
      if (top.position !== "sticky") {
        failures.push(`${label}: footer position is ${top.position}, expected sticky`);
      }
      if (!onScreen(top)) {
        failures.push(
          `${label}: footer OFF-SCREEN at scrollTop=0 — bottom=${top.footerBottom} > viewport=${top.viewportH}`,
        );
      }
      if (top.applyH < 44) {
        failures.push(`${label}: apply button ${top.applyH}px tall, below the 44px touch target`);
      }
      if (/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(top.bg)) {
        failures.push(`${label}: footer background is ${top.bg} — content will scroll through it`);
      }

      await page.screenshot({ path: `${OUT}/${t.name}-${s.route.slice(1)}-open-top.png` });

      await scrollPanel(page, "bottom");
      const bottom = await readFooter(page);
      if (!onScreen(bottom)) {
        failures.push(
          `${label}: footer OFF-SCREEN at scrollTop=max — bottom=${bottom.footerBottom} > viewport=${bottom.viewportH}`,
        );
      }
      // The safe-area inset moved onto the footer, so the footer must reach the
      // panel's bottom edge rather than float above a leftover pad.
      const gap = bottom.panelBottom - bottom.footerBottom;
      if (gap > 1) {
        failures.push(`${label}: ${gap}px gap between footer bottom and panel bottom — leftover container padding`);
      }
      await page.screenshot({ path: `${OUT}/${t.name}-${s.route.slice(1)}-open-bottom.png` });

      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      if (overflow.doc > 1 || overflow.body > 1) {
        failures.push(`${label}: horizontal overflow doc=${overflow.doc}px body=${overflow.body}px`);
      }

      // GUARD 2 — the counterfactual. Strip exactly what this ticket added and
      // require the scrollTop=0 assertion to go RED. If it stays green, the
      // assertion is not measuring the change.
      await scrollPanel(page, "top");
      await page.evaluate(() => {
        const f = document.getElementById("filter-sheet-panel").lastElementChild;
        f.classList.remove("sticky", "bottom-0");
      });
      await page.waitForTimeout(120);
      const cf = await readFooter(page);
      if (onScreen(cf)) {
        failures.push(
          `${label}: COUNTERFACTUAL STILL PASSES — footer visible at scrollTop=0 with sticky removed ` +
            `(bottom=${cf.footerBottom}, viewport=${cf.viewportH}). The assertion does not discriminate.`,
        );
      }

      rows.push(
        `${label.padEnd(30)} overflow=${top.scrollHeight}/${top.clientHeight} ` +
          `top:${top.footerBottom}<=${top.viewportH} bottom:${bottom.footerBottom} ` +
          `gap=${gap} apply=${top.applyH}px | no-sticky:${cf.footerBottom} (${onScreen(cf) ? "VISIBLE ✗" : "off-screen ✓"})`,
      );

      await ctx.close();
    }
  }

  await browser.close();
  console.log("\n" + rows.join("\n"));
  if (failures.length) {
    console.error("\nFAILURES:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
