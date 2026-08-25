/**
 * MEH-2173 self-QA — homepage promoted chips + FilterSheet.
 *
 * Run against a LOCAL `next start` fed by qa-meh2173-mockapi.mjs:
 *
 *   node qa-meh2173-mockapi.mjs &
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:8799 npm run build
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:8799 npx next start -p 3311
 *   QA_LABEL=after node qa-meh2173-promoted-filters.mjs
 *
 * NEVER run `npm run build` while that server is up — a build that rewrites
 * `.next` underneath a live server voids every measurement in the same run
 * (HANDOFF 21/08 §3: a harness reported 0px overflow and one control failed
 * until the server was restarted).
 *
 * ── What this measures ──
 *
 * The card asks for a META-ROW COUNT: how many stacked lines sit between the
 * section heading and the first producer card. Counting DOM containers answers
 * the wrong question — the day row is ONE container holding TWO stacked lines
 * (pills, then the ghost hint), so a container count reports "no change" for
 * exactly the edit that removes a line. So this collects every TEXT-BEARING
 * element between the heading and the grid, takes its rect, and merges
 * y-overlapping rects into bands. Chips side by side merge into one band; a
 * hint on its own line does not.
 *
 * ── Why "text-bearing" and not "leaf" (the bug this file already had) ──
 *
 * The first version collected LEAF elements — no element children. It reported
 * a confident, plausible "4 bands" that silently OMITTED the entire attribute
 * chip row, because a chip is `<button><span>{icon}</span>{label}</button>`:
 * the button has an element child so it is not a leaf, the icon span is not a
 * leaf either, and the `<svg>` has `<path>` children so it is not a leaf. Every
 * chip fell through all three tests. The day pills (`<button>{day}</button>`)
 * ARE leaves, so the one row that does NOT change was the only row counted —
 * the number was wrong in the direction that flatters the change.
 *
 * The fix is the predicate: an element counts when it owns a direct non-empty
 * TEXT NODE. Control C3 below is what makes the old blindness impossible to
 * reintroduce silently — it fails against the old walker and passes against
 * this one.
 *
 * ── CONTROLS (read these before believing any number) ──
 *
 * A probe whose null output is also its reassuring output is not evidence
 * (.claude/rules/testing.md). Each control separates a boring twin:
 *
 *   C1 cards > 0          — an empty grid makes every band count meaningless
 *                           AND makes a low band count look like a win.
 *   C2 bands > 0          — zero bands = the walker is dead, not a clean page.
 *   C3 chip row measured  — the walker can SEE the row under test. This is the
 *                           one that catches the leaf-blindness above.
 *   C4 filter narrows set — the filter param actually reached the API. Without
 *                           it, "applied" and "did nothing" are one screenshot.
 *
 * A failed control voids the whole run; the script says so and exits 1.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://127.0.0.1:3311";
const LABEL = process.env.QA_LABEL || "after";
const OUT = `qa-artifacts/meh-2173`;
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844, isMobile: true },
  { name: "1440x900", width: 1440, height: 900, isMobile: false },
];

const failures = [];
const ran = [];
/** Derived, never stated — a hardcoded total goes stale the moment a case is
 *  added, and a passing run would then misreport its own coverage (MEH-1976). */
function check(name, ok, detail = "") {
  ran.push(name);
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  process.stdout.write(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? ` — ${detail}` : ""}\n`);
}

const BAND_SCRIPT = () => {
  const section = document.querySelector("#producers-grid");
  if (!section) return { error: "no #producers-grid" };
  const grid = section.querySelector(".grid.grid-cols-2");
  const heading = section.querySelector("h2");
  const headingBottom = heading ? heading.getBoundingClientRect().bottom : -Infinity;
  const gridTop = grid ? grid.getBoundingClientRect().top : Infinity;

  // An element "owns a line" when it has a direct, non-whitespace text node.
  const ownsText = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const items = [];
  for (const el of section.querySelectorAll("*")) {
    if (!ownsText(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.top < headingBottom || rect.top >= gridTop) continue;
    items.push({
      text: (el.textContent || "").trim().slice(0, 30),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
    });
  }
  items.sort((a, b) => a.top - b.top);

  const bands = [];
  for (const it of items) {
    const last = bands[bands.length - 1];
    if (last && it.top < last.bottom) {
      last.bottom = Math.max(last.bottom, it.bottom);
      last.items.push(it.text);
    } else {
      bands.push({ top: it.top, bottom: it.bottom, items: [it.text] });
    }
  }
  return {
    bandCount: bands.length,
    bands: bands.map((b) => ({
      top: b.top,
      height: b.bottom - b.top,
      items: [...new Set(b.items)].slice(0, 10),
    })),
    cards: grid ? grid.children.length : 0,
    // C3's subject: is the attribute-filter control row inside the measured
    // range at all? Anchored to the row's own testid, with the pre-change
    // ChipScrollRow container as the fallback so the control is meaningful on
    // BOTH sides of this ticket.
    filterRowInRange: (() => {
      const row =
        section.querySelector('[data-testid="home-filter-row"]') ||
        section.querySelector('[class*="overflow-x"]');
      if (!row) return false;
      const r = row.getBoundingClientRect();
      return r.height > 0 && r.top >= headingBottom && r.top < gridTop;
    })(),
  };
};

/** Returning visitor: the onboarding tour is a first-visit overlay and is not
 *  one of the four meta layers the card counts. `step: null` = dismissed
 *  (lib/use-onboarding.js:18 — `step ?? null`). */
const SEED_RETURNING = () => {
  try {
    localStorage.setItem("meh_onboarding_v1", JSON.stringify({ step: null, ts: Date.now() }));
  } catch {}
};

const report = {};

// The repo pins a Playwright whose bundled Chromium build is not the one
// preinstalled in this sandbox, and the download host is blocked. Launch the
// preinstalled binary — the environment's documented path for this mismatch.
const EXECUTABLE = process.env.QA_CHROMIUM || "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: EXECUTABLE });

const settle = async (page) => {
  await page.locator("#producers-grid .grid.grid-cols-2 > *").first().waitFor({ timeout: 20_000 });
  // Bring the section into frame BEFORE measuring or capturing — the grid sits
  // ~2800px down, so an un-scrolled screenshot photographs the hero while
  // logging success (the #2786 failure this repo has already paid for).
  // `scrollIntoView({block:"start"})`, NOT `scrollIntoViewIfNeeded()`. The
  // section is taller than the viewport, so "if needed" satisfies itself by
  // aligning the section's BOTTOM — which puts the filter row under test above
  // the fold and photographs the card grid instead. Caught by opening the PNG,
  // which is the only thing that catches it: the band numbers are computed from
  // rects and stayed correct throughout, so every assertion was green while the
  // images showed the wrong half of the page.
  await page.evaluate(() =>
    document.querySelector("#producers-grid")?.scrollIntoView({ block: "start" }),
  );
  await page.waitForTimeout(400);
};

try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      deviceScaleFactor: 2,
      locale: "he-IL",
    });
    await ctx.addInitScript(SEED_RETURNING);
    const page = await ctx.newPage();

    // ── 0 active filters ────────────────────────────────────────────────
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page);

    const zero = await page.evaluate(BAND_SCRIPT);
    check(`[${vp.name}] C1 cards rendered`, zero.cards > 0, `cards=${zero.cards}`);
    check(`[${vp.name}] C2 bands found`, zero.bandCount > 0, `bands=${zero.bandCount}`);
    check(
      `[${vp.name}] C3 attribute-filter row is INSIDE the measured range`,
      zero.filterRowInRange === true,
      "if false, every band number in this run omits the row under test",
    );

    process.stdout.write(
      `  [${vp.name}] meta bands @0 filters = ${zero.bandCount}\n` +
        zero.bands
          .map((b, i) => `      ${i + 1}. y=${b.top} h=${b.height} :: ${b.items.join(" | ")}\n`)
          .join(""),
    );
    report[`${vp.name}:zero`] = zero;
    await page.screenshot({ path: `${OUT}/${LABEL}-${vp.name}-0filters.png` });

    // ── the sheet opens and offers every home axis ───────────────────────
    const trigger = page.locator('[data-testid="home-filters-button"]');
    if (await trigger.count()) {
      await trigger.click();
      await page.waitForTimeout(500);
      check(`[${vp.name}] "סינון" opens the FilterSheet`, (await page.locator("#filter-sheet-panel").count()) === 1);
      const sheetKeys = await page.evaluate(() =>
        [...document.querySelectorAll('#filter-sheet-panel [data-testid^="chip-"]')].map((e) =>
          e.getAttribute("data-testid").replace("chip-", ""),
        ),
      );
      process.stdout.write(`      sheet axes: ${sheetKeys.join(", ")}\n`);
      report[`${vp.name}:sheetKeys`] = sheetKeys;
      // No filter capability may be lost: every axis the old row rendered must
      // stay reachable. The two promoted ones are ALSO on the surface.
      for (const key of [
        "vegan",
        "vegetarian",
        "gluten_free",
        "lactose_free",
        "kosher",
        "verified",
        "has_delivery",
        "pickup_points",
      ]) {
        check(`[${vp.name}] sheet offers ${key}`, sheetKeys.includes(key));
      }
      check(
        `[${vp.name}] MEH-1934 gate still withholds no_added_sugar`,
        !sheetKeys.includes("no_added_sugar"),
        "0 fixtures carry the flag, so the gate must keep it out",
      );
      await page.screenshot({ path: `${OUT}/${LABEL}-${vp.name}-sheet-open.png` });

      // toggle a NON-promoted axis inside the sheet → state → tag
      await page.locator('#filter-sheet-panel [data-testid="chip-vegan"]').click();
      await page.waitForTimeout(1400);
      const afterToggle = await page.evaluate(BAND_SCRIPT);
      check(
        `[${vp.name}] C4 sheet toggle narrows the result set`,
        afterToggle.cards > 0 && afterToggle.cards < zero.cards,
        `before=${zero.cards} after=${afterToggle.cards}`,
      );
      check(`[${vp.name}] sheet toggle writes the URL (?vegan=1)`, page.url().includes("vegan=1"), page.url());
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      check(
        `[${vp.name}] sheet-selected non-promoted axis shows as a removable tag`,
        (await page.locator('[data-testid="home-active-filter-vegan"]').count()) === 1,
      );
      await page.evaluate(() =>
        document.querySelector("#producers-grid")?.scrollIntoView({ block: "start" }),
      );
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${LABEL}-${vp.name}-sheet-toggle-tag.png` });

      // promoted chip toggles in place and shows active state on the chip
      const promoted = page.locator('[data-testid="home-promoted-chip-verified"]');
      if (await promoted.count()) {
        await promoted.click();
        await page.waitForTimeout(1400);
        check(
          `[${vp.name}] promoted chip shows active state in place`,
          (await promoted.getAttribute("aria-pressed")) === "true",
        );
        check(
          `[${vp.name}] promoted chip does NOT duplicate itself as a tag`,
          (await page.locator('[data-testid="home-active-filter-verified"]').count()) === 0,
        );
        await promoted.click();
        await page.waitForTimeout(1200);
      }
    }

    // ── deep link: a NON-promoted axis (?vegan=1) ───────────────────────
    await page.goto(`${BASE}/?vegan=1`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.waitForTimeout(900);
    const deep = await page.evaluate(BAND_SCRIPT);
    check(
      `[${vp.name}] C4 deep-link ?vegan=1 narrows the set`,
      deep.cards > 0 && deep.cards < zero.cards,
      `unfiltered=${zero.cards} filtered=${deep.cards}`,
    );
    const tag = page.locator('[data-testid="home-active-filter-vegan"]');
    check(`[${vp.name}] deep-linked axis surfaces as a removable tag`, (await tag.count()) === 1);
    await page.screenshot({ path: `${OUT}/${LABEL}-${vp.name}-vegan-tag.png` });

    if (await tag.count()) {
      await tag.click();
      await page.waitForTimeout(1400);
      const cleared = await page.evaluate(BAND_SCRIPT);
      check(
        `[${vp.name}] tag × clears the filter (set widens back)`,
        cleared.cards === zero.cards,
        `after=${cleared.cards} expected=${zero.cards}`,
      );
      check(`[${vp.name}] tag × drops ?vegan= from the URL`, !page.url().includes("vegan"), page.url());
    }

    // ── the day row keeps its MEH-1771 ghost behaviour ───────────────────
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const dayRow = page.locator('[data-testid="delivery-day-row"]');
    check(`[${vp.name}] day row is ghost without a city`, (await dayRow.getAttribute("data-ghost")) === "true");
    check(
      `[${vp.name}] ghost hint still renders (same key, moved inline)`,
      (await page.locator('[data-testid="delivery-day-hint"]').count()) === 1,
    );
    const pill = page.locator('[data-testid^="delivery-day-pill-"]').first();
    check(
      `[${vp.name}] ghost pills stay aria-disabled + focusable`,
      (await pill.getAttribute("aria-disabled")) === "true",
    );
    // `force` is REQUIRED and is not a workaround. MEH-1771 marks the ghost
    // pills `aria-disabled` and deliberately NOT `disabled`, so they stay
    // focusable and clickable — that tap IS the discovery path into the
    // LocationModal. Playwright's actionability check treats aria-disabled as
    // "not enabled" and would refuse the click, which would make the harness
    // report a failure the browser does not have.
    await pill.click({ force: true });
    await page.waitForTimeout(700);
    check(
      `[${vp.name}] ghost pill tap opens the LocationModal (MEH-1771 precondition)`,
      (await page.locator('[role="dialog"]').count()) > 0,
    );
    await page.screenshot({ path: `${OUT}/${LABEL}-${vp.name}-day-ghost-modal.png` });

    await ctx.close();
  }
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/${LABEL}-bands.json`, JSON.stringify(report, null, 2));

process.stdout.write(`\n${ran.length} assertions ran (derived, not stated)\n`);
if (failures.length) {
  process.stdout.write(`\nFAILURES (${failures.length}):\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  process.stdout.write("\nIf a CONTROL (C1-C4) is among these, every other result in this run is void.\n");
  process.exit(1);
}
process.stdout.write("all green\n");
