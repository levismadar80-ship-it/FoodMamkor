import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import he from "../../../messages/he.json";
import en from "../../../messages/en.json";

/**
 * Spec:     manual/about
 * Purpose:  docs/MANUAL_TESTING.md — the /about page family, converted under
 *           MEH-1249 stage 2 (chunk 3 — one route family per PR):
 *             § `MEH-841 — comparison moved home→/about + layout A + copy refresh`
 *             § `MEH-534 — /about/process "תהליך הקבלה" (S11 Direction D)`
 *             § `MEH-1289 — דף /about/why-local "למה מקומי?" (17/07)`
 *           Every test carries `// MT:<section id>:<n>` — the checklist row it
 *           discharges (docs/qa/manual-testing-matrix.md for MEH-841 / MEH-534,
 *           all CONVERT-PW, destructive = no; MEH-1289 has no matrix rows and is
 *           numbered by its checklist order).
 * Touches:  static SSG routes only — `/about`, `/about/process`,
 *           `/about/why-local` and their `/en/` twins. No API writes, no auth,
 *           nothing is submitted. The one navigation away from the family is
 *           MT:MEH-534:9, which only READS the CTA's href.
 * Locators: `getByTestId` first (docs/E2E-LOCATORS.md). This chunk adds
 *           attribute-only ids — `about-comparison`, `about-close-process-link`,
 *           `about-close-why-local-link` (AboutClient.jsx); `process-hero`,
 *           `process-steps`, `process-badge-aside`, `process-everyone`,
 *           `process-badge`, `process-badge-tooltip`, `process-matrix`,
 *           `process-matrix-a`, `process-matrix-b`, `process-matrix-row`,
 *           `process-closing`, `process-cta` (AboutProcessClient.jsx);
 *           `why-local-article`, `why-local-cta`, `why-local-sources`
 *           (why-local/page.js). `verification-process-link` already shipped
 *           (MEH-1840). Inside a section the spec scopes by element/role
 *           (`h1`, `h2`, `li`, `blockquote`, `link`), never by literal text.
 * Copy:     every expected string is read from messages/he.json — and from
 *           messages/en.json for the `/en/` rows — so a copy edit moves the
 *           expectation with it. Counts are DERIVED from the copy objects
 *           (`Object.keys(...)`), never typed in: the matrix has 9 group-A and
 *           7 group-B rows today, not the 8 + 8 the checklist names (MEH-927
 *           split meat/fish and removed herbal), and /about/why-local renders 7
 *           `<h2>`s, not 6 (MEH-1810 added «מה שמשתנה בדרך»). Those are
 *           doc-vs-code drifts recorded in docs/qa/conversion-progress.md;
 *           the spec asserts the live page. The only literals in this file are
 *           the two external source URLs (they are literals in the page too)
 *           and the illustrative badge date `5.6.2026` (AboutProcessClient.jsx
 *           `EXAMPLE_DATE` — editorial chrome, not copy).
 * Reveal:   /about's chapters are scroll-reveal sections (FadeInSection —
 *           computed opacity 0 until in view; see e2e/visual/parity.spec.ts
 *           `revealScrollSections`). Playwright's `toBeVisible` treats
 *           opacity 0 as visible and text/attribute assertions are unaffected,
 *           so every /about test scrolls its section into view first and
 *           asserts nothing about the animation itself.
 * Does NOT: assert MT:MEH-841:3 (the HOME teaser «גלו את ההבדל» on `/`) or
 *           the `/en/` half of MT:MEH-841:4 — both live on the home surface,
 *           which is chunk 7's route (producer fixture, 184 items) and whose
 *           teaser (HomeStaticBlocks.jsx `HomeComparisonTeaser`) carries no
 *           testid yet; recorded as residuals, not silently dropped. Does NOT
 *           duplicate MT:MEH-534:10 / MT:MEH-1289:5's footer half (the footer
 *           nav hrefs) — COVERED at component level by
 *           frontend/__tests__/FooterNavGroups.test.jsx:61-62. Does NOT convert
 *           § `MEH-1227` (founder-portrait screen-reader rows): the portrait is
 *           GONE from /about (MEH-1130, «face-not-focal») and the surviving
 *           aria property is guarded by
 *           frontend/__tests__/AboutPortraitAriaRole.test.jsx (+ the axe net,
 *           e2e/flows/12-axe-a11y.spec.ts:181 covers /about) — STALE, reported.
 *           Does NOT assert fonts (serif/DM-Sans rows) — next/font hashes the
 *           family name, so a computed-style check would pin a build artefact.
 * Related:  e2e/flows/13-static-pages-render.spec.ts:7 (/about renders h1 +
 *           main — cited, not duplicated), e2e/flows/12-axe-a11y.spec.ts:181-182
 *           (/about + /about/process in the axe net), e2e/visual/parity.spec.ts:838
 *           (/about fullPage VRT), frontend/__tests__/AboutProcessVerifiedTagContrast.test.jsx
 *           (the matrix chip's AA fix), docs/qa/conversion-page-map.md.
 * History:  MEH-1249 chunk 3 (creation, 04/09).
 */

const FIRST_PAINT = { timeout: 15_000 };

// MEH-1792 (re-measured 2026-09-04 on chunks 1 and 2): during the app's
// page-transition window a second copy of the page tree exists briefly OUTSIDE
// `#main-content`, so a page-wide `getByTestId` can resolve to TWO elements and
// fail strict mode ("resolved to 2 elements … unexpected value hidden") — seen
// on the mobile project in both a red-control run and a green run. Scoping every
// locator to the `#main-content` landmark (layout.js) names the live tree only.
// Same fix as e2e/flows/27-delivery-day-discoverability.spec.ts:73.
const scope = (page: Page) => page.locator("#main-content");

// ── copy ────────────────────────────────────────────────────────────────────
const ABOUT_HE = he.about;
const ABOUT_EN = en.about;
const COMPARE_HE = he.about.comparison;
const COMPARE_EN = en.about.comparison;
const PROCESS_HE = he.process;
const PROCESS_EN = en.process;
const WHY_HE = he.about_why_local;
const WHY_EN = en.about_why_local;
/** Live tier-1 tooltip key the page reuses with a literal example date (AboutProcessClient.jsx `EXAMPLE_DATE`). */
const TOOLTIP_TEMPLATE_HE = he.producer.badge.verified_tooltip_license;
const EXAMPLE_DATE = "5.6.2026";

// The page's two external evidence links (literals in why-local/page.js:21-23).
const NEF_URL = "https://www.sustainweb.org/blogs/jul25-what-is-local-food/";
const COLLECTIVECROP_URL =
  "https://collectivecrop.com/guides/fresh-picked-vs-supermarket-produce-does-it-matter";

/** Derived, not stated: the three comparison stops are `row1..row3` in he.json. */
const COMPARE_ROWS = ["row1", "row2", "row3"] as const;

/** Derived: the step count is the number of `s<n>_title` keys in the copy. */
const STEP_TITLES_HE = Object.keys(PROCESS_HE.steps)
  .filter((k) => /^s\d+_title$/.test(k))
  .sort()
  .map((k) => (PROCESS_HE.steps as Record<string, string>)[k]);

/** Derived: the "checked for everyone" cards are the `c<n>_title` keys. */
const EVERYONE_TITLES_HE = Object.keys(PROCESS_HE.everyone)
  .filter((k) => /^c\d+_title$/.test(k))
  .sort()
  .map((k) => (PROCESS_HE.everyone as Record<string, string>)[k]);

type CatB = { label: string; doc?: string; declare?: string; note?: string };
const CAT_A_HE = PROCESS_HE.matrix.catA as Record<string, string>;
const CAT_B_HE = PROCESS_HE.matrix.catB as Record<string, CatB>;

/**
 * /about/why-local h2 order — the locked editorial order from
 * why-local/page.js `SECTIONS` + the MEH-1810 closing block. The KEYS are stated
 * (order is a page decision, not a copy decision); the STRINGS are read from
 * the copy.
 */
const WHY_H2_KEYS = [
  "taste_h",
  "money_h",
  "fairness_h",
  "provenance_h",
  "env_h",
  "start_h",
  "changes_h",
] as const;

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
const richChunk = (s: string, tag: string) =>
  new RegExp(`<${tag}>(.*?)</${tag}>`).exec(s)?.[1] ?? "";

// ── helpers ─────────────────────────────────────────────────────────────────
async function noHorizontalOverflow(el: Locator): Promise<void> {
  const [scrollWidth, clientWidth] = await el.evaluate((node: HTMLElement) => [
    node.scrollWidth,
    node.clientWidth,
  ]);
  expect(scrollWidth, "element must not overflow its own box horizontally").toBeLessThanOrEqual(
    clientWidth + 1,
  );
}

async function noPageHorizontalScroll(page: Page): Promise<void> {
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth, "the document must not scroll horizontally").toBeLessThanOrEqual(
    clientWidth + 1,
  );
}

async function computed(el: Locator, prop: string): Promise<string> {
  return el.evaluate((node: Element, p: string) => getComputedStyle(node).getPropertyValue(p), prop);
}

async function box(el: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await el.boundingBox();
  expect(b, "element must render a box").not.toBeNull();
  return b!;
}

/** `a` precedes `b` in document order. */
async function precedes(a: Locator, b: Locator): Promise<boolean> {
  const [ha, hb] = await Promise.all([a.elementHandle(), b.elementHandle()]);
  return ha!.evaluate(
    (na, nb) => Boolean(na.compareDocumentPosition(nb as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    hb,
  );
}

async function gotoAbout(page: Page, path = "/about"): Promise<void> {
  await page.goto(path);
  // Count gate first (retries; the strict checks below would throw instead of
  // waiting if a stray copy ever landed INSIDE the landmark).
  await expect(scope(page).getByTestId("about-comparison")).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId("about-comparison")).toBeAttached(FIRST_PAINT);
}

async function gotoProcess(page: Page, path = "/about/process"): Promise<void> {
  await page.goto(path);
  await expect(scope(page).getByTestId("process-hero")).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId("process-hero")).toBeVisible(FIRST_PAINT);
}

async function gotoWhyLocal(page: Page, path = "/about/why-local"): Promise<void> {
  await page.goto(path);
  await expect(scope(page).getByTestId("why-local-article")).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId("why-local-article")).toBeVisible(FIRST_PAINT);
}

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /about (MEH-841)", () => {
  // MT:MEH-841:1 — /about comparison strip: between the pull-quote and Benefits, a vertical spine with 3 gold dots; each stop = big green line + small grey "בסופר —" line; no shadow, no icons, hairline; RTL dots on the start (right) side.
  test("comparison strip: 3 stops on a hairline spine between the quote and Benefits, dots at the RTL start edge, no icons, no shadow", async ({
    page,
  }) => {
    await gotoAbout(page);
    const section = scope(page).getByTestId("about-comparison");
    await section.scrollIntoViewIfNeeded(); // scroll-reveal section (opacity 0 until in view)

    // Chapter mark + the section lead read from copy.
    await expect(section).toContainText(ABOUT_HE.chapter[2].label);
    await expect(section).toContainText(COMPARE_HE.heading);

    // Placement: the pull-quote is this chapter's h2 and sits ABOVE the spine;
    // the Benefits chapter (h2 = chapter 03's label) comes AFTER the section.
    const quote = section.getByRole("heading", { level: 2 });
    await expect(quote).toHaveCount(1);
    await expect(quote).toHaveText(he.about.consumer.parallax.quote);
    const spine = section.locator("ol");
    await expect(spine).toHaveCount(1);
    expect(await precedes(quote, spine), "the quote must precede the spine").toBe(true);
    const benefits = scope(page).getByRole("heading", { level: 2, name: ABOUT_HE.chapter[3].label });
    await expect(benefits).toHaveCount(1);
    expect(await precedes(section, benefits), "Benefits must follow the comparison").toBe(true);

    // Three stops, each exactly two lines (brand line + supermarket line).
    const stops = spine.locator("li");
    await expect(stops).toHaveCount(COMPARE_ROWS.length);
    // No icons anywhere on the spine (the dots are CSS), and no shadow on a stop.
    await expect(spine.locator("svg")).toHaveCount(0);
    expect(await computed(spine, "border-inline-start-width"), "hairline spine").toBe("1px");
    expect(await computed(spine, "direction")).toBe("rtl");

    for (let i = 0; i < COMPARE_ROWS.length; i += 1) {
      const stop = stops.nth(i);
      await expect(stop.locator("p")).toHaveCount(2);
      expect(await computed(stop, "box-shadow"), `stop ${i + 1} must cast no shadow`).toBe("none");
      const dot = stop.locator("span[aria-hidden]").first();
      await expect(dot).toHaveCount(1);
      // RTL: the dot sits on the START edge, which is the RIGHT half of the stop.
      const [stopBox, dotBox] = await Promise.all([box(stop), box(dot)]);
      const dotCenter = dotBox.x + dotBox.width / 2;
      const stopCenter = stopBox.x + stopBox.width / 2;
      expect(dotCenter, `stop ${i + 1}: dot must be on the right (start) side in RTL`).toBeGreaterThan(
        stopCenter,
      );
      // The brand line is the big one, the supermarket line the small one.
      const [brand, superLine] = [stop.locator("p").nth(0), stop.locator("p").nth(1)];
      const brandSize = parseFloat(await computed(brand, "font-size"));
      const superSize = parseFloat(await computed(superLine, "font-size"));
      expect(brandSize, `stop ${i + 1}: brand line must be the larger line`).toBeGreaterThan(superSize);
    }
  });

  // MT:MEH-841:2 — /about exact copy: the 3 brand/supermarket pairs, no trailing period on the brand lines.
  test("comparison copy: three brand/supermarket pairs verbatim from he.json, brand lines without a trailing period", async ({
    page,
  }) => {
    await gotoAbout(page);
    const section = scope(page).getByTestId("about-comparison");
    await section.scrollIntoViewIfNeeded();
    const stops = section.locator("ol li");
    await expect(stops).toHaveCount(COMPARE_ROWS.length);
    for (let i = 0; i < COMPARE_ROWS.length; i += 1) {
      const row = COMPARE_ROWS[i];
      const brand = stops.nth(i).locator("p").nth(0);
      const superLine = stops.nth(i).locator("p").nth(1);
      await expect(brand).toHaveText(COMPARE_HE[`${row}_brand`]);
      await expect(superLine).toHaveText(COMPARE_HE[`${row}_super`]);
      const brandText = ((await brand.textContent()) ?? "").trim();
      expect(brandText, `brand line ${i + 1} must not end with a period`).not.toMatch(/\.$/);
    }
  });

  // MT:MEH-841:3 — HOME teaser «ההבדל / מה שמשתנה בדרך / גלו את ההבדל» → /about, no supermarket table on `/`:
  //   NOT converted here — lives on `/` (chunk 7's route, home fixture); the teaser has no testid. Residual.

  // MT:MEH-841:4 — EN mirror: /en/about (+ /en/ — residual, see above). The checklist expects a HE-mirror
  //   ("הטקסט עדיין בעברית, TODO i18n EN"); en.json now carries real English copy for the strip, so the
  //   LIVE expectation is English text, LTR — asserted here, drift recorded in docs/qa/conversion-progress.md.
  test("EN twin: /en/about renders the strip in English, LTR, dots on the left (start) edge", async ({
    page,
  }) => {
    await gotoAbout(page, "/en/about");
    await expect(page).toHaveURL(/\/en\/about(?:[/?#]|$)/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const section = scope(page).getByTestId("about-comparison");
    await section.scrollIntoViewIfNeeded();
    await expect(section).toContainText(ABOUT_EN.chapter[2].label);
    await expect(section).toContainText(COMPARE_EN.heading);
    const stops = section.locator("ol li");
    await expect(stops).toHaveCount(COMPARE_ROWS.length);
    expect(await computed(section.locator("ol"), "direction")).toBe("ltr");
    for (let i = 0; i < COMPARE_ROWS.length; i += 1) {
      const row = COMPARE_ROWS[i];
      await expect(stops.nth(i).locator("p").nth(0)).toHaveText(COMPARE_EN[`${row}_brand`]);
      await expect(stops.nth(i).locator("p").nth(1)).toHaveText(COMPARE_EN[`${row}_super`]);
      const [stopBox, dotBox] = await Promise.all([
        box(stops.nth(i)),
        box(stops.nth(i).locator("span[aria-hidden]").first()),
      ]);
      expect(dotBox.x + dotBox.width / 2, `stop ${i + 1}: LTR dot on the left (start) side`).toBeLessThan(
        stopBox.x + stopBox.width / 2,
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /about/process (MEH-534)", () => {
  // MT:MEH-534:1 — route renders (SSG) in both locales with the per-locale tab title.
  test("route renders in he + en with the locked <title>", async ({ page }) => {
    await gotoProcess(page);
    await expect(page).toHaveURL(/\/about\/process(?:[/?#]|$)/);
    await expect(page).toHaveTitle(PROCESS_HE.meta.title);
    await expect(scope(page).getByTestId("process-hero").getByRole("heading", { level: 1 })).toBeVisible();

    await gotoProcess(page, "/en/about/process");
    await expect(page).toHaveURL(/\/en\/about\/process(?:[/?#]|$)/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle(PROCESS_EN.meta.title);
    await expect(scope(page).getByTestId("process-hero").getByRole("heading", { level: 1 })).toHaveText(
      stripTags(PROCESS_EN.hero.h1),
    );
  });

  // MT:MEH-534:2 — hero H1 with the <em> phrase in gold italic; not clipped; RTL.
  test("hero: h1 from copy with the <em> phrase italic in the accent colour, unclipped, RTL", async ({
    page,
  }) => {
    const emText = richChunk(PROCESS_HE.hero.h1, "em");
    expect(emText, "the h1 copy must carry an <em> phrase (derivation control)").not.toBe("");
    await gotoProcess(page);
    const hero = scope(page).getByTestId("process-hero");
    const h1 = hero.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(stripTags(PROCESS_HE.hero.h1));
    const em = h1.locator("em");
    await expect(em).toHaveCount(1);
    await expect(em).toHaveText(emText);
    expect(await computed(em, "font-style")).toBe("italic");
    // "gold": the em shares the accent token with the eyebrow and differs from the h1's own ink.
    const eyebrow = hero.getByText(PROCESS_HE.hero.eyebrow, { exact: true });
    await expect(eyebrow).toHaveCount(1);
    expect(await computed(em, "color")).toBe(await computed(eyebrow, "color"));
    expect(await computed(em, "color")).not.toBe(await computed(h1, "color"));
    // Unclipped: inside the viewport on both edges, no internal overflow.
    const vw = page.viewportSize()!.width;
    const b = await box(h1);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vw);
    await noHorizontalOverflow(h1);
    expect(await computed(h1, "direction")).toBe("rtl");
    await expect(hero).toContainText(PROCESS_HE.hero.sub);
  });

  // MT:MEH-534:3 — 4 steps: mobile vertical list with numerals 01–04, desktop 4 columns; one icon per step; the "מאומת is a separate step" aside below.
  test("four steps: numerals 01–04, titles from copy, an icon each, stacked on mobile / 4 columns on desktop, badge aside below", async ({
    page,
  }, testInfo) => {
    await gotoProcess(page);
    const steps = scope(page).getByTestId("process-steps");
    await steps.scrollIntoViewIfNeeded();
    const items = steps.locator("li");
    await expect(items).toHaveCount(STEP_TITLES_HE.length);
    await expect(steps.locator("li svg")).toHaveCount(STEP_TITLES_HE.length);
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < STEP_TITLES_HE.length; i += 1) {
      const item = items.nth(i);
      await expect(item.locator("span[aria-hidden]").first()).toHaveText(`0${i + 1}`);
      await expect(item.getByRole("heading", { level: 3 })).toHaveText(STEP_TITLES_HE[i]);
      await expect(item.locator("svg")).toHaveCount(1);
      boxes.push(await box(item));
    }
    if (testInfo.project.name === "mobile") {
      // Vertical list: each step starts below the previous one, sharing the same start edge.
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i].y, `step ${i + 1} must sit below step ${i}`).toBeGreaterThanOrEqual(
          boxes[i - 1].y + boxes[i - 1].height - 1,
        );
        expect(Math.abs(boxes[i].x - boxes[0].x), `step ${i + 1} must share the column`).toBeLessThan(2);
      }
    } else {
      // Four columns: all on one row, each in its own horizontal slot.
      for (let i = 1; i < boxes.length; i += 1) {
        expect(Math.abs(boxes[i].y - boxes[0].y), `step ${i + 1} must sit on the same row`).toBeLessThan(2);
        expect(boxes[i].x, `step ${i + 1} must occupy its own column`).not.toBe(boxes[i - 1].x);
      }
    }
    const aside = scope(page).getByTestId("process-badge-aside");
    await expect(aside).toContainText(PROCESS_HE.steps.badge_aside_title);
    await expect(aside).toContainText(PROCESS_HE.steps.badge_aside_body);
    const [stepsBox, asideBox] = await Promise.all([box(steps), box(aside)]);
    expect(asideBox.y, "the badge aside must sit below the steps").toBeGreaterThanOrEqual(
      stepsBox.y + stepsBox.height - 1,
    );
  });

  // MT:MEH-534:4 — "What's checked": 3 cards (זהות · סיפור · שיחה) on the alt background, gold numerals 01–03.
  test("what's checked: three cards from copy on the alt-tone band, accent numerals 01–03", async ({
    page,
  }) => {
    await gotoProcess(page);
    const everyone = scope(page).getByTestId("process-everyone");
    await everyone.scrollIntoViewIfNeeded();
    await expect(everyone.getByRole("heading", { level: 2 })).toHaveText(PROCESS_HE.everyone.h2);
    const cards = everyone.getByRole("heading", { level: 3 });
    await expect(cards).toHaveCount(EVERYONE_TITLES_HE.length);
    // The band also carries the section Marker's own numeral ("02"); the CARD
    // numerals are the ones that wrap the trailing "—" in a child span.
    const numerals = everyone.locator("span[aria-hidden].numeric", { has: page.locator("span") });
    await expect(numerals).toHaveCount(EVERYONE_TITLES_HE.length);
    for (let i = 0; i < EVERYONE_TITLES_HE.length; i += 1) {
      await expect(cards.nth(i)).toHaveText(EVERYONE_TITLES_HE[i]);
      await expect(numerals.nth(i)).toContainText(`0${i + 1}`);
    }
    // "gold": the numerals share the accent token with the hero's <em>.
    const heroEm = scope(page).getByTestId("process-hero").locator("h1 em");
    expect(await computed(numerals.first(), "color")).toBe(await computed(heroEm, "color"));
    // "background-alt": this band shares its fill with the matrix band and differs from the hero's.
    const bg = (el: Locator) => computed(el, "background-color");
    const [everyoneBg, matrixBg, heroBg] = await Promise.all([
      bg(everyone),
      bg(scope(page).getByTestId("process-matrix")),
      bg(scope(page).getByTestId("process-hero")),
    ]);
    expect(everyoneBg).toBe(matrixBg);
    expect(everyoneBg).not.toBe(heroBg);
  });

  // MT:MEH-534:5 — badge section: «מאומת» chip with the seal icon + the illustrative tooltip (date isolated so it does not flip); the "אין תג מאומת? זה לא אומר פחות" block with its kicker.
  //   (The checklist calls the kicker gold; the page renders it `text-primary-dark` — colour not asserted, drift recorded.)
  test("badge section: verified chip with icon, tooltip with a bidi-isolated example date, the affirmative-absence block", async ({
    page,
  }) => {
    await gotoProcess(page);
    const badge = scope(page).getByTestId("process-badge");
    await badge.scrollIntoViewIfNeeded();
    const chipLabel = badge.getByText(PROCESS_HE.tier.verified, { exact: true });
    await expect(chipLabel).toHaveCount(1);
    await expect(chipLabel.locator("..").locator("svg")).toHaveCount(1);

    const tooltip = badge.getByTestId("process-badge-tooltip");
    await expect(tooltip).toHaveText(TOOLTIP_TEMPLATE_HE.replace("{date}", EXAMPLE_DATE));
    const date = tooltip.locator("span");
    await expect(date).toHaveText(EXAMPLE_DATE);
    // `.numeric` = `unicode-bidi: isolate` (globals.css) — the run of digits and dots is
    // isolated from the surrounding RTL paragraph, which is what keeps 5.6.2026 in order.
    expect(await computed(date, "unicode-bidi")).toMatch(/isolate/);

    await expect(badge.getByRole("heading", { level: 3 })).toHaveText(PROCESS_HE.badge.absence_h3);
    await expect(badge).toContainText(PROCESS_HE.badge.absence_body);
    await expect(badge).toContainText(PROCESS_HE.badge.absence_kicker);
  });

  // MT:MEH-534:6 — matrix group A: every category carries the «מאומת» tag; the honey row reads "שלושה רישיונות יחד…".
  //   Count is DERIVED (9 today — the checklist's "8" predates MEH-927's meat/fish split).
  test("matrix group A: one row per licensed category, all tagged verified, honey's three-licence line", async ({
    page,
  }) => {
    await gotoProcess(page);
    const groupA = scope(page).getByTestId("process-matrix-a");
    await groupA.scrollIntoViewIfNeeded();
    await expect(groupA).toContainText(PROCESS_HE.matrix.groupA_title);
    const rows = groupA.getByTestId("process-matrix-row");
    const expectedLabels = Object.values(CAT_A_HE);
    await expect(rows).toHaveCount(expectedLabels.length);
    const seen: string[] = [];
    for (let i = 0; i < expectedLabels.length; i += 1) {
      const row = rows.nth(i);
      const label = ((await row.locator("div").first().textContent()) ?? "").trim();
      seen.push(label);
      await expect(row.getByText(PROCESS_HE.tier.verified, { exact: true })).toHaveCount(1);
      await expect(row.getByText(PROCESS_HE.tier.declared, { exact: true })).toHaveCount(0);
      await expect(row).toContainText(label === CAT_A_HE.honey ? PROCESS_HE.matrix.honey_doc : PROCESS_HE.matrix.groupA_doc);
    }
    expect([...seen].sort(), "every group-A category from the copy renders exactly once").toEqual(
      [...expectedLabels].sort(),
    );
    expect(seen, "the honey row must be present").toContain(CAT_A_HE.honey);
  });

  // MT:MEH-534:7 — matrix group B: each category «מוצהר או מאומת» except נרות וארומה = «מוצהר» only + the no-path note; ירקות/פירות carry the "מוצהר: הצהרה…" sub-line.
  //   Count is DERIVED (7 today — the checklist's "8" predates MEH-927 removing the herbal row).
  test("matrix group B: declared on every row, the 'or verified' path everywhere but candles, the declare sub-line on produce", async ({
    page,
  }) => {
    await gotoProcess(page);
    const groupB = scope(page).getByTestId("process-matrix-b");
    await groupB.scrollIntoViewIfNeeded();
    await expect(groupB).toContainText(PROCESS_HE.matrix.groupB_title);
    const rows = groupB.getByTestId("process-matrix-row");
    const entries = Object.values(CAT_B_HE);
    await expect(rows).toHaveCount(entries.length);
    const byLabel = new Map(entries.map((e) => [e.label, e]));
    const seen: string[] = [];
    let declaredOnly = 0;
    let declareLines = 0;
    for (let i = 0; i < entries.length; i += 1) {
      const row = rows.nth(i);
      const label = ((await row.locator("div").first().textContent()) ?? "").trim();
      seen.push(label);
      const entry = byLabel.get(label);
      expect(entry, `row label "${label}" must be a group-B category`).toBeDefined();
      await expect(row.getByText(PROCESS_HE.tier.declared, { exact: true })).toHaveCount(1);
      if (entry!.note) {
        // declared-only (candles): no verified path, the "no route to a badge" note instead.
        declaredOnly += 1;
        await expect(row.getByText(PROCESS_HE.tier.verified, { exact: true })).toHaveCount(0);
        await expect(row.getByText(PROCESS_HE.matrix.path_or, { exact: true })).toHaveCount(0);
        await expect(row).toContainText(entry!.note);
      } else {
        await expect(row.getByText(PROCESS_HE.tier.verified, { exact: true })).toHaveCount(1);
        await expect(row.getByText(PROCESS_HE.matrix.path_or, { exact: true })).toHaveCount(1);
        await expect(row).toContainText(entry!.doc!);
        if (entry!.declare) {
          declareLines += 1;
          await expect(row).toContainText(entry!.declare);
        }
      }
    }
    expect([...seen].sort()).toEqual([...entries.map((e) => e.label)].sort());
    // The two shapes the checklist names must both have been exercised (derived from the copy).
    expect(declaredOnly).toBe(entries.filter((e) => e.note).length);
    expect(declaredOnly).toBeGreaterThan(0);
    expect(declareLines).toBe(entries.filter((e) => e.declare).length);
    expect(declareLines).toBeGreaterThan(0);
  });

  // MT:MEH-534:8 — closing: Sapir's quote in italic, eyebrow «מהמקור», credit «— ספיר».
  test("closing: the founder quote as an italic blockquote, eyebrow + credit from copy", async ({ page }) => {
    await gotoProcess(page);
    const closing = scope(page).getByTestId("process-closing");
    await closing.scrollIntoViewIfNeeded();
    const quote = closing.locator("blockquote");
    await expect(quote).toHaveCount(1);
    await expect(quote).toHaveText(PROCESS_HE.closing.quote);
    expect(await computed(quote, "font-style")).toBe("italic");
    await expect(closing.getByText(PROCESS_HE.closing.em_mark, { exact: true })).toHaveCount(1);
    await expect(closing.getByText(PROCESS_HE.closing.attrib, { exact: true })).toHaveCount(1);
    expect(await precedes(closing.getByText(PROCESS_HE.closing.em_mark, { exact: true }), quote)).toBe(true);
    expect(await precedes(quote, closing.getByText(PROCESS_HE.closing.attrib, { exact: true }))).toBe(true);
  });

  // MT:MEH-534:9 — CTA «ספרו לנו על העסק» → /register/producer, with the secondary line.
  test("CTA: one link to /register/producer with the copy's label and secondary line", async ({ page }) => {
    await gotoProcess(page);
    const cta = scope(page).getByTestId("process-cta");
    await cta.scrollIntoViewIfNeeded();
    await expect(cta.getByRole("heading", { level: 2 })).toHaveText(PROCESS_HE.cta.h2);
    const link = cta.getByRole("link");
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText(PROCESS_HE.cta.submit);
    await expect(link).toHaveAttribute("href", /\/register\/producer(?:[/?#]|$)/);
    await expect(cta).toContainText(PROCESS_HE.cta.secondary);
  });

  // MT:MEH-534:10 — footer «תהליך הקבלה» → /about/process: COVERED by frontend/__tests__/FooterNavGroups.test.jsx:62 (not duplicated here).

  // MT:MEH-534:11 — cross-link from the bottom of /about → /about/process.
  //   (The checklist quotes «כך אנחנו מכירות כל בית עסק»; the copy key reads «כך אנחנו בודקות כל בית עסק» — drift recorded.)
  test("cross-link from /about: the Close row link (and the MEH-1840 verification teaser) → /about/process", async ({
    page,
  }) => {
    await gotoAbout(page);
    const closeLink = scope(page).getByTestId("about-close-process-link");
    await closeLink.scrollIntoViewIfNeeded();
    await expect(closeLink).toHaveText(PROCESS_HE.crosslink_from_about);
    await expect(closeLink).toHaveAttribute("href", /\/about\/process(?:[/?#]|$)/);
    const teaser = scope(page).getByTestId("verification-process-link");
    await expect(teaser).toHaveText(PROCESS_HE.crosslink_from_about);
    await expect(teaser).toHaveAttribute("href", /\/about\/process(?:[/?#]|$)/);
    // The Close row is the page's bottom — it must come after the verification teaser.
    expect(await precedes(teaser, closeLink)).toBe(true);
  });

  // MT:MEH-534:12 — RTL + tap targets: everything RTL, no horizontal overflow at 360px, CTA ≥ 44px, focus ring visible.
  test("RTL + tap targets at 360px: no horizontal scroll, CTA ≥ 44px with a visible focus ring", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await gotoProcess(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    for (const id of ["process-hero", "process-steps", "process-matrix", "process-cta"]) {
      expect(await computed(scope(page).getByTestId(id), "direction"), `${id} must be RTL`).toBe("rtl");
    }
    await noPageHorizontalScroll(page);
    const link = scope(page).getByTestId("process-cta").getByRole("link");
    await link.scrollIntoViewIfNeeded();
    const b = await box(link);
    expect(b.height, "CTA tap target height").toBeGreaterThanOrEqual(44);
    expect(b.width, "CTA tap target width").toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
    // Focus ring: keyboard focus must paint a ring (Tailwind `focus-visible:ring-2` = box-shadow).
    const unfocusedShadow = await computed(link, "box-shadow");
    await link.focus();
    await expect(link).toBeFocused();
    const focusedShadow = await computed(link, "box-shadow");
    expect(focusedShadow, "a focused CTA must show a ring").not.toBe("none");
    expect(focusedShadow, "the ring must appear ON focus").not.toBe(unfocusedShadow);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /about/why-local (MEH-1289)", () => {
  // MT:MEH-1289:1 — page loads: H1, intro, the five reason H2s + «איפה מתחילים» (+ the MEH-1810 «מה שמשתנה בדרך» block — 7 h2s live, derived); RTL, no bullets, no emoji.
  test("load: h1 + intro, the h2 sequence from copy in the locked order, prose only (no bullets, no emoji), RTL", async ({
    page,
  }) => {
    await gotoWhyLocal(page);
    await expect(page).toHaveTitle(WHY_HE.meta_title);
    const article = scope(page).getByTestId("why-local-article");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(WHY_HE.h1);
    await expect(article).toContainText(WHY_HE.intro);
    const h2s = article.getByRole("heading", { level: 2 });
    await expect(h2s).toHaveCount(WHY_H2_KEYS.length);
    for (let i = 0; i < WHY_H2_KEYS.length; i += 1) {
      await expect(h2s.nth(i)).toHaveText(WHY_HE[WHY_H2_KEYS[i]]);
    }
    // Magazine prose: no list bullets, no emoji anywhere in the article.
    await expect(article.locator("li")).toHaveCount(0);
    const text = (await article.textContent()) ?? "";
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await computed(article, "direction")).toBe("rtl");
    // The reason headings are brand green — the same token the CTA fills with.
    expect(await computed(h2s.first(), "color")).toBe(
      await computed(scope(page).getByTestId("why-local-cta"), "background-color"),
    );
  });

  // MT:MEH-1289:2 — inline evidence link in «הכסף נשאר קרוב»: underlined green, opens the NEF study in a new tab.
  test("inline evidence link: the <nef> phrase links to the study, underlined, target=_blank + noopener", async ({
    page,
  }) => {
    const nefText = richChunk(WHY_HE.money_body, "nef");
    expect(nefText, "money_body must carry a <nef> phrase (derivation control)").not.toBe("");
    await gotoWhyLocal(page);
    const article = scope(page).getByTestId("why-local-article");
    const money = article.locator("section").filter({
      has: page.getByRole("heading", { level: 2, name: WHY_HE.money_h }),
    });
    await expect(money).toHaveCount(1);
    const link = money.getByRole("link");
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText(nefText);
    await expect(link).toHaveAttribute("href", NEF_URL);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    expect(await computed(link, "text-decoration-line")).toContain("underline");
    expect(await computed(link, "color")).toBe(await computed(money.getByRole("heading", { level: 2 }), "color"));
  });

  // MT:MEH-1289:3 — CTA «גלו בתי עסק באזור שלכם» → /producers (he); /en → /en/producers is asserted in the /en test.
  test("CTA: the copy's button → /producers", async ({ page }) => {
    await gotoWhyLocal(page);
    const cta = scope(page).getByTestId("why-local-cta");
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toHaveText(WHY_HE.cta);
    await expect(cta).toHaveAttribute("href", /^\/producers(?:[/?#]|$)/);
  });

  // MT:MEH-1289:4 — sources line: «מקורות:» + two live links (Sustain UK, CollectiveCrop), both target=_blank.
  test("sources: prefix + two external links in a new tab", async ({ page }) => {
    await gotoWhyLocal(page);
    const sources = scope(page).getByTestId("why-local-sources");
    await sources.scrollIntoViewIfNeeded();
    await expect(sources).toContainText(WHY_HE.sources_prefix);
    const links = sources.getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText(WHY_HE.source_sustain);
    await expect(links.nth(0)).toHaveAttribute("href", NEF_URL);
    await expect(links.nth(1)).toHaveText(WHY_HE.source_collectivecrop);
    await expect(links.nth(1)).toHaveAttribute("href", COLLECTIVECROP_URL);
    for (let i = 0; i < 2; i += 1) {
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
      await expect(links.nth(i)).toHaveAttribute("rel", /noopener/);
    }
  });

  // MT:MEH-1289:5 — discovery: footer «גלו» group carries the link — COVERED by frontend/__tests__/FooterNavGroups.test.jsx:61;
  //   the quiet cross-link at the bottom of /about is asserted here.
  test("discovery: the quiet cross-link at the bottom of /about → /about/why-local", async ({ page }) => {
    await gotoAbout(page);
    const link = scope(page).getByTestId("about-close-why-local-link");
    await link.scrollIntoViewIfNeeded();
    await expect(link).toHaveText(he.about.consumer.cta.why_local_link);
    await expect(link).toHaveAttribute("href", /\/about\/why-local(?:[/?#]|$)/);
  });

  // MT:MEH-1289:6 — mobile 375px: content readable, CTA thumb-reachable (≥ 44px tap target, inside the viewport), no horizontal overflow.
  test("mobile 375px: no horizontal overflow, CTA is a ≥ 44px target inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoWhyLocal(page);
    await noPageHorizontalScroll(page);
    await noHorizontalOverflow(scope(page).getByTestId("why-local-article"));
    const cta = scope(page).getByTestId("why-local-cta");
    await cta.scrollIntoViewIfNeeded();
    const b = await box(cta);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(375);
  });

  // MT:MEH-1289:7 — /en/about/why-local renders the English version (short summary, not a full translation); no Hebrew leaks.
  test("English twin: /en/about/why-local in English, LTR, no Hebrew in the article, CTA → /en/producers", async ({
    page,
  }) => {
    await gotoWhyLocal(page, "/en/about/why-local");
    await expect(page).toHaveURL(/\/en\/about\/why-local(?:[/?#]|$)/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle(WHY_EN.meta_title);
    const article = scope(page).getByTestId("why-local-article");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(WHY_EN.h1);
    const h2s = article.getByRole("heading", { level: 2 });
    await expect(h2s).toHaveCount(WHY_H2_KEYS.length);
    for (let i = 0; i < WHY_H2_KEYS.length; i += 1) {
      await expect(h2s.nth(i)).toHaveText(WHY_EN[WHY_H2_KEYS[i]]);
    }
    expect(await computed(article, "direction")).toBe("ltr");
    const text = (await article.textContent()) ?? "";
    expect(text, "no Hebrew may leak into the English article").not.toMatch(/[\u0590-\u05FF]/);
    const cta = scope(page).getByTestId("why-local-cta");
    await expect(cta).toHaveText(WHY_EN.cta);
    await expect(cta).toHaveAttribute("href", /^\/en\/producers(?:[/?#]|$)/);
  });
});
