/**
 * MEH-1862 — local QA capture for the /producers filter surface.
 *
 * Emulation only, and that boundary is stated in the PR rather than glossed:
 * Chromium device emulation is LAYOUT evidence, not engine evidence. It says
 * nothing about iOS Safari's handling of `dvh`, safe-area insets, or touch
 * scrolling — and this sheet uses `max-h-[80dvh]` and
 * `pb-[calc(env(safe-area-inset-bottom)+16px)]`, both inherited unchanged from
 * the /map mount that has been live since MEH-1075.
 *
 * Captures, per device: the surface with the sheet CLOSED (the chip-count
 * reduction this ticket is about) and OPEN (where the axes went). Asserts no
 * horizontal scroll in both states — the failure mode a new inline-flex row
 * beside a scrollable chip row would actually produce.
 *
 * Run: node e2e/qa-meh1862-filter-sheet.mjs [baseURL]
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = "../qa-artifacts/MEH-1862";

// he-IL + RTL on both. 390x844 is the iPhone-class viewport the QA protocol
// names; Pixel 5 is the Android-class twin.
const TARGETS = [
  { name: "iphone-390x844", viewport: { width: 390, height: 844 }, ua: devices["iPhone 13"].userAgent, scale: 3 },
  { name: "pixel5-393x851", viewport: { width: 393, height: 851 }, ua: devices["Pixel 5"].userAgent, scale: 2.75 },
];

const failures = [];

async function assertNoHorizontalScroll(page, label) {
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  // 1px tolerance for sub-pixel rounding at fractional DPR; anything above is
  // a real overflow, not noise.
  if (overflow.doc > 1 || overflow.body > 1) {
    failures.push(`${label}: horizontal overflow doc=${overflow.doc}px body=${overflow.body}px`);
  }
  return overflow;
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  // The sandbox ships a Chromium that does not match this repo's pinned
  // @playwright/test revision, so the bundled resolver reports "please run
  // npx playwright install" — which the environment explicitly forbids.
  // Point at the preinstalled binary instead when it is present.
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
  });

  for (const t of TARGETS) {
    const ctx = await browser.newContext({
      viewport: t.viewport,
      userAgent: t.ua,
      deviceScaleFactor: t.scale,
      isMobile: true,
      hasTouch: true,
      locale: "he-IL",
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/producers`, { waitUntil: "networkidle" });

    const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
    if (dir !== "rtl") failures.push(`${t.name}: expected dir=rtl, got ${dir}`);

    // CLOSED — the state this ticket changes on the surface.
    const closedOverflow = await assertNoHorizontalScroll(page, `${t.name} closed`);
    await page.screenshot({ path: `${OUT}/${t.name}-closed.png`, fullPage: true });

    // The attribute axes must not be on the surface while closed.
    const surfaceSwitches = await page.locator('[role="switch"]').count();

    const trigger = page.getByTestId("producers-filters-button");
    if ((await trigger.count()) !== 1) {
      failures.push(`${t.name}: expected exactly 1 filters trigger, got ${await trigger.count()}`);
    }
    await trigger.click();
    await page.waitForSelector("#filter-sheet-panel", { state: "visible", timeout: 5000 });

    const openOverflow = await assertNoHorizontalScroll(page, `${t.name} open`);
    const sheetSwitches = await page.locator('#filter-sheet-panel [role="switch"]').count();
    if (sheetSwitches === 0) failures.push(`${t.name}: sheet opened with zero axes`);

    // The apply/clear footer is the sheet's only exit besides the backdrop, so
    // "is it actually on screen" is a real question, not a formality. It is
    // asserted rather than eyeballed because the OPEN capture below is
    // viewport-only: the panel is `fixed ... bottom-0`, and a fullPage
    // screenshot paints a fixed element at its scroll-0 position against a
    // document several times taller — which makes a perfectly visible footer
    // look absent. That is a capture artifact, and the way to know it is one is
    // to measure the element instead of reading the picture.
    // The contract is REACHABLE, not "above the fold on first paint".
    //
    // The first version of this check demanded the footer sit inside the
    // viewport and reported 4 failures. Measuring before believing it showed the
    // assertion was wrong, not the page: the panel is correctly `fixed` and
    // pinned (top 169 → bottom 844 at 390x844, height 675 = 80dvh), its content
    // is 749px, and the footer lands at y≈859 INSIDE the panel's own
    // `overflow-y-auto` area. A scroll reaches it.
    //
    // That the mobile footer is not sticky is a deliberate, documented choice —
    // MEH-1481 made it `lg:sticky` and says in FilterSheet.jsx that the "Mobile
    // footer (mt-6, non-sticky) unchanged". It is inherited from the /map mount,
    // where the sheet carries MORE axes than /producers does, so this is not
    // something this ticket introduced. Recorded in the PR rather than silently
    // asserted away.
    const footer = { apply: "בתי עסק", clear: "ניקוי הכל" };
    for (const [label, text] of Object.entries(footer)) {
      const loc = page.locator("#filter-sheet-panel button", { hasText: text }).first();
      if ((await loc.count()) !== 1) {
        failures.push(`${t.name}: sheet ${label} control missing`);
        continue;
      }
      await loc.scrollIntoViewIfNeeded();
      if (!(await loc.isVisible())) {
        failures.push(`${t.name}: sheet ${label} control unreachable even after scrolling`);
      }
    }
    // The panel must actually BE scrollable when its content overflows —
    // otherwise "reachable by scrolling" is a claim with no mechanism.
    const scrollable = await page.evaluate(() => {
      const p = document.getElementById("filter-sheet-panel");
      return { over: p.scrollHeight > p.clientHeight, canScroll: getComputedStyle(p).overflowY };
    });
    if (scrollable.over && !["auto", "scroll"].includes(scrollable.canScroll)) {
      failures.push(`${t.name}: panel content overflows but overflow-y is ${scrollable.canScroll}`);
    }

    await page.screenshot({ path: `${OUT}/${t.name}-open.png` });

    console.log(
      `${t.name}: dir=${dir} · switches on surface(closed)=${surfaceSwitches} · ` +
        `axes in sheet(open)=${sheetSwitches} · overflow closed=${closedOverflow.doc}px open=${openOverflow.doc}px`,
    );
    await ctx.close();
  }

  await browser.close();
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
