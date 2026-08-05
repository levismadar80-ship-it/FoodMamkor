/**
 * MEH-1684 self-QA harness — hero search-zone screenshots + the ticket's
 * numeric absence probes, run against a real browser (the vitest guards run in
 * jsdom, which cannot see layout or computed style).
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1684-hero-search-zone.mjs [baseURL] [chromiumPath]
 *
 * Captures 375px + 1440px of the hero zone, the Header search circle at both
 * widths (verification_step #6 — must be unchanged vs staging), and probes:
 *   #1 exactly 1 filled-primary control in the hero zone (not 2)
 *   #2 0 occurrences of the solid "גלו בתי עסק" button in the chips row
 *   #4 focus pauses the placeholder rotation; reduced-motion keeps it static
 *   #5 typing 2+ chars opens the dropdown aligned to the pill
 *
 * REUSES: frontend/e2e/qa-meh1643-hero-delivery-cta.mjs (manual QA-harness
 * pattern — argv baseURL + chromiumPath, never process.env: the MEH-491
 * env-drift gate blocks undocumented env reads).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1684", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

const PRIMARY_FILL = "rgb(46, 104, 83)"; // #2e6853 ≡ the action-primary token

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({
    viewport,
    locale: "he",
    reducedMotion: opts.reducedMotion,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForSelector('[data-testid="hero-search"]', { timeout: 20_000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

const results = [];
const record = (label, value) => {
  results.push(`${label}: ${JSON.stringify(value)}`);
  console.log(label, value);
};

for (const [name, viewport] of [
  ["375", { width: 375, height: 900 }],
  ["1440", { width: 1440, height: 950 }],
]) {
  const { ctx, page } = await open(viewport);

  await page.screenshot({ path: `${OUT}/hero-${name}.png`, fullPage: false });

  // Header search circle — verification_step #6. Scoped to <header> so the
  // shot is comparable against staging independently of the hero below it.
  await page
    .locator("header")
    .first()
    .screenshot({ path: `${OUT}/header-${name}.png` })
    .catch((e) => console.log("header shot failed:", e.message));

  // ---- Assertion #1: exactly ONE filled-primary control in the hero zone ----
  // Measured on COMPUTED background-color, not class names: this is the probe
  // that would catch a second primary re-entering by any route, including one
  // styled without the token class.
  //
  // SCOPE — HomeHero returns a FRAGMENT, so there is no wrapper element to
  // query and `chipsRow.parentElement` is the whole page (an earlier revision
  // of this probe did exactly that and reported 3, counting "גלו על המפה" and
  // "הוסיפו את העסק שלכם" from sections far below the fold). The zone is
  // therefore reconstructed as the hero <section> plus its following siblings
  // up to and including the one holding the "how it works" link — precisely
  // what HomeHero renders, and nothing after it.
  const filled = await page.evaluate((fill) => {
    const heroSection = document.querySelector('[role="search"]')?.previousElementSibling;
    const trustLine = document.querySelector('[data-testid="hero-trust-line"]');
    if (!heroSection || !trustLine) return ["ZONE-NOT-FOUND"];
    const zone = [];
    for (let el = heroSection; el; el = el.nextElementSibling) {
      zone.push(el);
      // the link block is the sibling immediately after the trust line
      if (el === trustLine.nextElementSibling) break;
    }
    return zone
      .flatMap((el) => [el, ...el.querySelectorAll("button, a")])
      .filter((el) => getComputedStyle(el).backgroundColor === fill)
      .map((el) => el.getAttribute("data-testid") || el.textContent.trim().slice(0, 30));
  }, PRIMARY_FILL);
  record(`[${name}] filled-primary controls in hero zone`, filled);
  record(`[${name}] filled-primary COUNT (expect 1)`, filled.length);

  // ---- Assertion #2: the solid "גלו בתי עסק" button is gone from the row ----
  const rowProbe = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="hero-chips-row"]');
    if (!row) return { missing: true };
    return {
      discoverOccurrences: (row.textContent.match(/גלו בתי עסק/g) || []).length,
      underlinedLinks: [...row.querySelectorAll("*")].filter(
        (el) => getComputedStyle(el).textDecorationLine.includes("underline")
      ).length,
      chipCount: row.querySelectorAll("button").length,
      chipRadii: [...row.querySelectorAll("button")].map(
        (el) => getComputedStyle(el).borderRadius
      ),
      prefix: row.firstElementChild?.textContent,
    };
  });
  record(`[${name}] chips row`, rowProbe);

  // ---- Pill + circular submit geometry ----
  const geometry = await page.evaluate(() => {
    const pill = document.querySelector('[role="search"]');
    const btn = document.querySelector('[data-testid="hero-search-submit"]');
    const box = btn?.getBoundingClientRect();
    return {
      pillRadius: pill && getComputedStyle(pill).borderRadius,
      pillBg: pill && getComputedStyle(pill).backgroundColor,
      submitRadius: btn && getComputedStyle(btn).borderRadius,
      submitSize: box && { w: Math.round(box.width), h: Math.round(box.height) },
      submitBg: btn && getComputedStyle(btn).backgroundColor,
    };
  });
  record(`[${name}] pill + submit geometry`, geometry);

  // ---- Trust line ----
  const trust = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="hero-trust-line"]');
    if (!el) return { missing: true };
    const icon = el.querySelector("svg");
    return {
      text: el.textContent.trim(),
      iconFill: icon && getComputedStyle(icon).color,
      svgCount: el.querySelectorAll("svg").length,
    };
  });
  record(`[${name}] trust line`, trust);

  // ---- Assertion #5: 2+ chars opens the dropdown, aligned to the pill ----
  const input = page.locator('[data-testid="hero-search"]');
  await input.click();
  await input.type("גב", { delay: 80 });
  await page.waitForTimeout(1200);
  const dropdown = await page.evaluate(() => {
    const dd = document.querySelector('[data-testid="hero-search-dropdown"]');
    const pill = document.querySelector('[role="search"]');
    if (!dd || !pill) return { open: false };
    const d = dd.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    return {
      open: true,
      zIndex: getComputedStyle(dd).zIndex,
      // Alignment: the dropdown must start/end within a couple of px of the
      // pill's inner edges, i.e. it still hangs off the pill after the reshape.
      leftDelta: Math.round(d.left - p.left),
      rightDelta: Math.round(p.right - d.right),
      belowPill: Math.round(d.top - p.bottom),
    };
  });
  record(`[${name}] autocomplete dropdown vs pill`, dropdown);
  await page.screenshot({ path: `${OUT}/hero-${name}-dropdown.png`, fullPage: false });

  await ctx.close();
}

// ---- Assertion #4a: focus pauses the rotating placeholder ----
{
  const { ctx, page } = await open({ width: 1440, height: 950 });
  const read = () => page.getAttribute('[data-testid="hero-search"]', "placeholder");
  const first = await read();
  await page.waitForTimeout(4200);
  const afterTick = await read();
  record("rotation: swaps while idle", { first, afterTick, changed: first !== afterTick });

  await page.locator('[data-testid="hero-search"]').focus();
  const atFocus = await read();
  await page.waitForTimeout(8000);
  const afterFocusWait = await read();
  record("rotation: PAUSED while focused", {
    atFocus,
    afterFocusWait,
    frozen: atFocus === afterFocusWait,
  });
  await ctx.close();
}

// ---- Assertion #4b: prefers-reduced-motion → static first string ----
{
  const { ctx, page } = await open({ width: 1440, height: 950 }, { reducedMotion: "reduce" });
  const read = () => page.getAttribute('[data-testid="hero-search"]', "placeholder");
  const first = await read();
  await page.waitForTimeout(9000);
  const later = await read();
  record("rotation: STATIC under prefers-reduced-motion", {
    first,
    later,
    frozen: first === later,
  });
  await ctx.close();
}

fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("\nartifacts →", OUT);
