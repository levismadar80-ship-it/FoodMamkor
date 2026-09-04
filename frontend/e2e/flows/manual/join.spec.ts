import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import he from "../../../messages/he.json";
import en from "../../../messages/en.json";

/**
 * Spec:     manual/join
 * Purpose:  docs/MANUAL_TESTING.md § `MEH-995 — /join: דף הצטרפות כבית עסק`,
 *           converted under MEH-1249 stage 2 (chunk 2 — one page per PR).
 *           Every test carries `// MT:MEH-995:<n>` — the matrix row it
 *           discharges (docs/qa/manual-testing-matrix.md, all eight rows
 *           CONVERT-PW, destructive = no).
 * Touches:  static SSG routes only (`/join`, `/about/for-businesses`,
 *           `/en/about/for-businesses`) — no API writes, no auth. Item 6
 *           navigates into `/register/producer` and stops at the pre-flight
 *           screen; nothing is submitted.
 * Locators: `getByTestId` only (docs/E2E-LOCATORS.md). /join already shipped
 *           `join-cta` / `join-how` / `join-prepare` / `join-card` /
 *           `join-testimonial` / `join-faq`; this chunk adds three
 *           attribute-only ids — `join-hero`, `join-step-numeral`
 *           (frontend/app/[locale]/join/page.js) and
 *           `about-business-showcase`
 *           (frontend/app/[locale]/about/for-businesses/page.js). Inside a
 *           section the spec scopes by element/role (`h1`, `h3`, `link`,
 *           `blockquote`, `figure li`), never by text.
 * Copy:     expected strings come from messages/he.json (`join.*`,
 *           `about_business.showcase.*`) and, for item 5, messages/en.json —
 *           a copy edit moves the expectation with it. The ONE literal
 *           Hebrew list in this file (`HERO_FEES_VOCAB`) is a DENY-list, not
 *           expected copy: item 1 asserts the hero carries no premium / fee
 *           language, and a deny-list cannot be derived from the copy it
 *           forbids.
 * Does NOT: assert item 7 (footer "הוסיפו את העסק שלכם" → `/join`) — COVERED
 *           at component level by
 *           frontend/__tests__/FooterNavGroups.test.jsx:62 (the business
 *           group's href list is exactly ["/join", "/about/process",
 *           "/about/for-businesses"]); the footer link carries no testid, so
 *           no PW duplicate was written. Item 4 counts FIVE showcase
 *           components, not the six the checklist row names: the `verified`
 *           entry is absent from the page's item list under MEH-1285
 *           (legal-gated — for-businesses/page.js:238-239), so six is a stale
 *           expectation in the doc, not a bug in the page — recorded in
 *           docs/qa/conversion-progress.md.
 * Related:  frontend/__tests__/BusinessCtaLink.test.jsx (the auth-state CTA
 *           swap, vitest), frontend/__tests__/RegisterProducerClient.test.jsx:228
 *           (the pre-flight screen item 6 lands on), docs/qa/conversion-page-map.md.
 * History:  MEH-1249 chunk 2 (creation, 04/09).
 */

const COPY = he.join;
const SHOWCASE_HE = he.about_business.showcase;
const SHOWCASE_EN = en.about_business.showcase;
const FIRST_PAINT = { timeout: 15_000 };

/** Deny-list for item 1 — the hero must not mention premium tiers or fees (MEH-617: the price answer lives in the FAQ, Etsy pattern). */
const HERO_FEES_VOCAB = ["פרימיום", "עמלה", "עמלות"];

/** Derived, not stated: the numerals the page renders are `0${n}` for n = 1..4. */
const STEP_NUMERALS = ["1", "2", "3", "4"].map((n) => `0${n}`);

/** The five showcase item titles the page renders today (verified is MEH-1285 gated). */
const SHOWCASE_ITEM_TITLES_HE = Object.values(SHOWCASE_HE.items).map((item) => item.title);

async function noHorizontalOverflow(el: Locator): Promise<void> {
  const [scrollWidth, clientWidth] = await el.evaluate((node: HTMLElement) => [
    node.scrollWidth,
    node.clientWidth,
  ]);
  expect(scrollWidth, "section must not overflow its own box horizontally").toBeLessThanOrEqual(
    clientWidth + 1,
  );
}

async function computedDirection(el: Locator): Promise<string> {
  return el.evaluate((node: HTMLElement) => getComputedStyle(node).direction);
}

async function gotoJoin(page: Page): Promise<void> {
  await page.goto("/join");
  await expect(page.getByTestId("join-hero")).toBeVisible(FIRST_PAINT);
}

test.describe("manual › /join (MEH-995)", () => {
  // MT:MEH-995:1 — /join is live: hero h1, gold eyebrow, ONE "מצטרפים" CTA with the free-to-join hint; no premium/fees copy in the hero.
  test("hero: h1 + eyebrow, a single CTA with the trust hint, no fees vocabulary", async ({ page }) => {
    await gotoJoin(page);
    const hero = page.getByTestId("join-hero");
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText(COPY.h1);
    await expect(hero).toContainText(COPY.eyebrow);
    // toHaveCount(1) page-wide, not just "visible": the page's whole point is
    // ONE door to the wizard, so a second CTA anywhere must fail here.
    const cta = page.getByTestId("join-cta");
    await expect(cta).toHaveCount(1);
    await expect(hero.getByTestId("join-cta")).toHaveText(COPY.cta);
    await expect(cta).toHaveAttribute("href", /\/register\/producer(?:[/?#]|$)/);
    await expect(hero).toContainText(COPY.trust_hint);
    const heroText = (await hero.textContent()) ?? "";
    for (const word of HERO_FEES_VOCAB) {
      expect(heroText, `hero must not mention "${word}"`).not.toContain(word);
    }
  });

  // MT:MEH-995:2 — "איך זה עובד": Cormorant numerals 01–04 intact (not clipped, even at 320px), 4 titles + texts, link → /about/process.
  test("four steps: numerals 01–04 unclipped at 320px, titles from copy, process link", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoJoin(page);
    const how = page.getByTestId("join-how");
    await how.scrollIntoViewIfNeeded();
    await expect(how).toContainText(COPY.how.heading);

    const numerals = how.getByTestId("join-step-numeral");
    await expect(numerals).toHaveCount(STEP_NUMERALS.length);
    for (let i = 0; i < STEP_NUMERALS.length; i += 1) {
      const numeral = numerals.nth(i);
      await expect(numeral).toHaveText(STEP_NUMERALS[i]);
      await numeral.scrollIntoViewIfNeeded();
      const box = await numeral.boundingBox();
      expect(box, `numeral ${STEP_NUMERALS[i]} must render a box`).not.toBeNull();
      // Inside the 320px viewport on both edges — a glyph pushed past x=0 or
      // past 320 is what "clipped" looks like in RTL flow.
      expect(box!.x, `numeral ${STEP_NUMERALS[i]} left edge`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `numeral ${STEP_NUMERALS[i]} right edge`).toBeLessThanOrEqual(320);
      // leading-none: one line of glyphs. A wrapped "0" / "1" would double the height.
      const fontSize = await numeral.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      expect(box!.height, `numeral ${STEP_NUMERALS[i]} must sit on one line`).toBeLessThan(fontSize * 1.5);
      await noHorizontalOverflow(numeral);
    }
    await noHorizontalOverflow(how);

    const titles = how.getByRole("heading", { level: 3 });
    await expect(titles).toHaveCount(4);
    for (const n of ["1", "2", "3", "4"] as const) {
      await expect(titles.nth(Number(n) - 1)).toHaveText(COPY.how[`step${n}_title`]);
      await expect(how).toContainText(COPY.how[`step${n}_text`]);
    }

    const processLink = how.getByRole("link");
    await expect(processLink).toHaveCount(1);
    await expect(processLink).toHaveText(COPY.how.process_link);
    await expect(processLink).toHaveAttribute("href", /\/about\/process(?:[/?#]|$)/);
  });

  // MT:MEH-995:3 — FAQ teaser at the end: "כמה זה עולה?" with the locked no-fees answer, link "לכל השאלות" → /about/for-businesses.
  test("FAQ teaser: price question + locked answer, link to the full FAQ", async ({ page }) => {
    await gotoJoin(page);
    const faq = page.getByTestId("join-faq");
    await faq.scrollIntoViewIfNeeded();
    await expect(faq).toContainText(COPY.faq.eyebrow);
    await expect(faq.getByRole("heading", { level: 2 })).toHaveText(COPY.faq.q_cost);
    await expect(faq).toContainText(COPY.faq.a_cost);
    const allLink = faq.getByRole("link");
    await expect(allLink).toHaveCount(1);
    await expect(allLink).toHaveText(COPY.faq.all_link);
    await expect(allLink).toHaveAttribute("href", /\/about\/for-businesses(?:[/?#]|$)/);
  });

  // MT:MEH-995:4 — "כך נראה פרופיל מלא" (MEH-1074 W3.5) on /about/for-businesses: heading + example tag, sample card, component list, nudge; RTL at 375px.
  test("showcase section on /about/for-businesses: example card, components, nudge, RTL at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/about/for-businesses");
    const showcase = page.getByTestId("about-business-showcase");
    await expect(showcase).toBeAttached(FIRST_PAINT);
    await showcase.scrollIntoViewIfNeeded();
    await expect(showcase).toBeVisible();

    await expect(showcase.getByRole("heading", { level: 2 })).toHaveText(SHOWCASE_HE.heading);
    // Two "example" markers: the prominent tag beside the heading and the
    // small tag on the sample card — a sample business must never read as real.
    await expect(showcase.getByText(SHOWCASE_HE.label, { exact: true })).toHaveCount(2);
    await expect(showcase).toContainText(SHOWCASE_HE.intro);

    const card = showcase.locator("figure");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(SHOWCASE_HE.example_name);
    await expect(card).toContainText(SHOWCASE_HE.example_tagline);

    // FIVE, not six: `verified` is absent from the list under MEH-1285 (legal-gated).
    // When that entry is restored this count — and the checklist row — move to 6.
    const items = card.locator("li");
    await expect(items).toHaveCount(5);
    for (let i = 0; i < 5; i += 1) {
      const title = (await items.nth(i).locator("p").first().textContent())?.trim() ?? "";
      expect(SHOWCASE_ITEM_TITLES_HE, `item ${i} title "${title}" must be a showcase item`).toContain(title);
    }
    // Each component carries a Phosphor icon (decorative svg).
    await expect(card.locator("li svg")).toHaveCount(5);
    await expect(card).toContainText(SHOWCASE_HE.nudge);

    // RTL at 375px rides this spec: document direction, the section's own
    // computed direction, and no horizontal spill out of the section box.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(await computedDirection(showcase)).toBe("rtl");
    await noHorizontalOverflow(showcase);
  });

  // MT:MEH-995:5 — English twin: /en/about/for-businesses renders "What a complete profile looks like" + "Example" labels.
  test("English twin: /en/about/for-businesses renders the showcase in English", async ({ page }) => {
    await page.goto("/en/about/for-businesses");
    await expect(page).toHaveURL(/\/en\/about\/for-businesses(?:[/?#]|$)/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const showcase = page.getByTestId("about-business-showcase");
    await expect(showcase).toBeAttached(FIRST_PAINT);
    await showcase.scrollIntoViewIfNeeded();
    await expect(showcase.getByRole("heading", { level: 2 })).toHaveText(SHOWCASE_EN.heading);
    await expect(showcase.getByText(SHOWCASE_EN.label, { exact: true })).toHaveCount(2);
    await expect(showcase.locator("figure")).toContainText(SHOWCASE_EN.example_name);
    expect(await computedDirection(showcase)).toBe("ltr");
  });

  // MT:MEH-995:6 — clicking "מצטרפים" lands on /register/producer (the MEH-994 pre-flight screen).
  test("CTA → wizard: the join CTA lands on /register/producer's pre-flight screen", async ({ page }) => {
    await gotoJoin(page);
    await page.getByTestId("join-cta").click();
    await page.waitForURL(/\/register\/producer(?:[/?#]|$)/);
    // The pre-flight screen itself is covered by RegisterProducerClient.test.jsx;
    // here it is only the landing marker — proof the navigation reached the wizard.
    await expect(page.getByTestId("register-preflight-start")).toBeVisible(FIRST_PAINT);
  });

  // MT:MEH-995:7 — footer "הוסיפו את העסק שלכם" → /join: COVERED by frontend/__tests__/FooterNavGroups.test.jsx:62 (not duplicated here).

  // MT:MEH-995:8 — testimonial slot is a self-explaining placeholder, not a fabricated-looking testimonial.
  test("testimonial slot: the self-describing placeholder, with no attribution that would read as real", async ({
    page,
  }) => {
    await gotoJoin(page);
    const slot = page.getByTestId("join-testimonial");
    await slot.scrollIntoViewIfNeeded();
    await expect(slot).toContainText(COPY.testimonial.eyebrow);
    const quote = slot.locator("blockquote");
    await expect(quote).toHaveCount(1);
    // Exact equality, not containment: the placeholder is the whole quote. Any
    // other text in the blockquote is invented business copy (COPY_BANK §8).
    await expect(quote).toHaveText(COPY.testimonial.quote);
    // A real-looking testimonial carries an attribution; the placeholder must not.
    await expect(slot.locator("cite, figcaption")).toHaveCount(0);
  });
});
