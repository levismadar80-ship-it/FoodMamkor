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
 * History:  MEH-1249 chunk 2 (creation, 04/09). MEH-2799 (v2): FAQ case
 *           follows the new section; item 8 moved to vitest (the slot is gone);
 *           four v2 cases added — one «מצטרפים» on screen at 390 + 1280, no
 *           horizontal overflow at 390/768/1024/1280, no video bytes on load,
 *           toggletip overlays without reflow. Locators: `join-sticky-bar`,
 *           `join-sticky-cta`, `join-closing-cta`, `join-features`,
 *           `join-group-card`, `join-panel`, `join-check-item`, `join-clip`,
 *           `join-feature-tip(-button)` (all attribute-only).
 */

const COPY = he.join;
const SHOWCASE_HE = he.about_business.showcase;
const SHOWCASE_EN = en.about_business.showcase;
const FIRST_PAINT = { timeout: 15_000 };

// MEH-1792 (re-measured 2026-09-04 on this spec): during the app's page-transition
// window a second copy of the page tree exists briefly OUTSIDE `#main-content`,
// so a page-wide `getByTestId` can resolve to TWO elements and fail strict mode
// ("resolved to 2 elements … unexpected value hidden") — seen on the mobile
// project in both a red-control run and a green run. Scoping every locator to
// the `#main-content` landmark (layout.js) names the live tree only. Same fix
// as e2e/flows/27-delivery-day-discoverability.spec.ts:73.
const scope = (page: Page) => page.locator("#main-content");

/** Deny-list for item 1 — the hero must not mention premium tiers or fees (MEH-617: the price answer lives in the FAQ, Etsy pattern). */
const HERO_FEES_VOCAB = ["פרימיום", "עמלה", "עמלות"];

/** The numerals the page renders: 1..4 (MEH-2564 dropped the «01–04» zero-pad). */
const STEP_NUMERALS = ["1", "2", "3", "4"];

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

/** True when the element at `el`'s centre is `el` or inside it — i.e. nothing is painted over it. */
async function isOnTop(el: Locator): Promise<boolean> {
  return el.evaluate((node: HTMLElement) => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(hit && node.contains(hit));
  });
}

/** «מצטרפים» controls whose box is on screen and painted (the sticky bar fades, so opacity counts). */
async function visibleJoinCtas(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ids = ["join-cta", "join-sticky-cta", "join-closing-cta"];
    const vh = window.innerHeight;
    let n = 0;
    for (const id of ids) {
      for (const el of document.querySelectorAll(`#main-content [data-testid="${id}"]`)) {
        const r = el.getBoundingClientRect();
        let node: Element | null = el;
        let painted = true;
        while (node) {
          const cs = getComputedStyle(node);
          if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.5) painted = false;
          node = node.parentElement;
        }
        if (painted && r.height > 0 && r.bottom > 0 && r.top < vh) n += 1;
      }
    }
    return n;
  });
}

async function gotoJoin(page: Page): Promise<void> {
  await page.goto("/join");
  // Count gate first (retries; the strict visibility check below would throw
  // instead of waiting if a stray copy ever landed INSIDE the landmark).
  await expect(scope(page).getByTestId("join-hero")).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId("join-hero")).toBeVisible(FIRST_PAINT);
}

test.describe("manual › /join (MEH-995)", () => {
  // MT:MEH-995:1 — /join is live: hero h1, gold eyebrow, ONE "מצטרפים" CTA with the free-to-join hint; no premium/fees copy in the hero.
  test("hero: h1 + eyebrow, a single CTA with the trust hint, no fees vocabulary", async ({ page }) => {
    await gotoJoin(page);
    const hero = scope(page).getByTestId("join-hero");
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText(COPY.h1);
    await expect(hero).toContainText(COPY.eyebrow);
    // toHaveCount(1) page-wide, not just "visible": the page's whole point is
    // ONE door to the wizard, so a second CTA anywhere must fail here.
    const cta = scope(page).getByTestId("join-cta");
    await expect(cta).toHaveCount(1);
    await expect(hero.getByTestId("join-cta")).toHaveText(COPY.cta);
    await expect(cta).toHaveAttribute("href", /\/register\/producer(?:[/?#]|$)/);
    await expect(hero).toContainText(COPY.trust_hint);
    const heroText = (await hero.textContent()) ?? "";
    for (const word of HERO_FEES_VOCAB) {
      expect(heroText, `hero must not mention "${word}"`).not.toContain(word);
    }
  });

  // MT:MEH-995:2 — "איך זה עובד": numerals 1–4 intact (not clipped, even at 320px), 4 titles + texts, link → /about/process.
  // MEH-2564: the numerals are 36px round badges now, not 01–04 in Cormorant.
  test("four steps: numerals 1–4 unclipped at 320px, titles from copy, process link", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoJoin(page);
    const how = scope(page).getByTestId("join-how");
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
      // MEH-2564: a round badge — as tall as it is wide. A squeezed or wrapped
      // badge breaks that ratio.
      expect(Math.abs(box!.height - box!.width), `numeral ${STEP_NUMERALS[i]} badge must stay round`).toBeLessThan(1);
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

  // MT:MEH-995:3 — FAQ at the end: "כמה זה עולה?" with the locked no-fees answer, link "לכל השאלות" → /about/for-businesses.
  // MEH-2799: the section now has its own h2 and four questions (h3); the cost
  // answer keeps «— לעולם» (ADR-030 §5).
  test("FAQ: heading, four questions, the locked cost answer, link to the full FAQ", async ({ page }) => {
    await gotoJoin(page);
    const faq = scope(page).getByTestId("join-faq");
    await faq.scrollIntoViewIfNeeded();
    await expect(faq).toContainText(COPY.faq.eyebrow);
    await expect(faq.getByRole("heading", { level: 2 })).toHaveText(COPY.faq.heading);
    const questions = faq.getByRole("heading", { level: 3 });
    await expect(questions).toHaveCount(4);
    await expect(questions.first()).toHaveText(COPY.faq.q_cost);
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
    const showcase = scope(page).getByTestId("about-business-showcase");
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
    const showcase = scope(page).getByTestId("about-business-showcase");
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
    await scope(page).getByTestId("join-cta").click();
    await page.waitForURL(/\/register\/producer(?:[/?#]|$)/);
    // The pre-flight screen itself is covered by RegisterProducerClient.test.jsx;
    // here it is only the landing marker — proof the navigation reached the wizard.
    await expect(scope(page).getByTestId("register-preflight-start")).toBeVisible(FIRST_PAINT);
  });

  // MT:MEH-995:7 — footer "הוסיפו את העסק שלכם" → /join: COVERED by frontend/__tests__/FooterNavGroups.test.jsx:62 (not duplicated here).

  // MT:MEH-995:8 — MEH-2799 removed the testimonial slot outright (it was
  // render-gated off since MEH-2419). Coverage MOVED, not dropped:
  // __tests__/JoinStepNumerals.test.jsx › "the testimonial slot and the
  // duplicate introduction card are gone".

  // ── MEH-2799 · /join v2 ─────────────────────────────────────────────────

  // Never two «מצטרפים» on screen: hero CTA, sticky bar, closing band — one at
  // a time, at every scroll position, on phone and desktop.
  for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    test(`one «מצטרפים» on screen at a time, top to bottom — ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size);
      // A consent choice already made: the cookie banner (z-1100) would
      // otherwise cover the bar on purpose, and the on-top check below is about
      // the chat launcher, not the banner (CookieBanner.jsx: "cookieConsent").
      await page.addInitScript(() => {
        try {
          localStorage.setItem("cookieConsent", "essential");
        } catch {
          /* storage blocked: the banner then shows and this case reports it */
        }
      });
      await gotoJoin(page);
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      let sawBar = false;
      for (let y = 0; y <= scrollHeight; y += Math.round(size.height / 2)) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        // Gate on settled state, not a timer: the count must come down to <= 1.
        await expect.poll(() => visibleJoinCtas(page), { timeout: 2_000 }).toBeLessThanOrEqual(1);
        // The chat launcher floats in the bottom-END corner over this bar
        // (rtl.md, MEH-1135). Whenever the bar is SHOWN, the hit at its CTA's
        // centre must be the CTA (measured covered at both widths before the
        // fix). One polled condition, not "read visible, then check": near the
        // closing band the bar can flip off between the two reads.
        const bar = scope(page).getByTestId("join-sticky-bar");
        const cta = scope(page).getByTestId("join-sticky-cta");
        await expect
          .poll(async () => (await bar.getAttribute("data-visible")) !== "true" || isOnTop(cta), { timeout: 2_000 })
          .toBe(true);
        if ((await bar.getAttribute("data-visible")) === "true") sawBar = true;
      }
      // Control: the walk really reached the middle of the page, where the bar
      // must have been the one CTA — otherwise "<= 1" could mean "never scrolled".
      expect(sawBar, "the sticky bar never appeared mid-page").toBe(true);
    });
  }

  // No horizontal overflow at the four widths the design was checked at.
  for (const width of [390, 768, 1024, 1280]) {
    test(`no horizontal overflow — ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoJoin(page);
      const [scrollWidth, clientWidth] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      expect(scrollWidth, "the page scrolls sideways").toBeLessThanOrEqual(clientWidth + 1);
      await noHorizontalOverflow(scope(page).getByTestId("join-features"));
    });
  }

  // Zero video bytes before the features are seen; then only the selected clip.
  test("video requests: none on load, then only the selected clip once the section is in view", async ({ page }) => {
    const videoUrls: string[] = [];
    page.on("request", (req) => {
      if (/\.mp4(?:$|\?)/.test(req.url())) videoUrls.push(new URL(req.url()).pathname);
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoJoin(page);
    // Gate on a real readiness signal: the features section is hydrated (its
    // selected card exists) before the "nothing yet" read is trusted.
    await expect(scope(page).locator('[data-testid="join-group-card"][data-selected="true"]')).toHaveCount(1);
    expect(videoUrls, "a video was requested before any interaction").toEqual([]);
    await scope(page).getByTestId("join-clip").scrollIntoViewIfNeeded();
    await expect.poll(() => videoUrls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect([...new Set(videoUrls)]).toEqual(["/images/join/clip-page.mp4"]);
  });

  // Phone shelf: a tapped card ends centred. Taps go through dispatchEvent, not
  // click(): Playwright's click() first scrolls its target into view, which
  // moves the shelf by itself and so measures the harness, not the page — an
  // early measurement for this card was misled exactly that way. The block
  // opts back into motion because the suite runs reducedMotion: "reduce"
  // (playwright.config.ts:97), and the smooth path is the one a phone takes.
  test.describe("with motion", () => {
    test.use({ reducedMotion: "no-preference" });

    test("phone shelf: each tapped neighbour ends centred and selected", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoJoin(page);
      const shelf = scope(page).getByTestId("join-shelf");
      await shelf.scrollIntoViewIfNeeded();
      const centred = () =>
        shelf.evaluate((node: HTMLElement) => {
          const s = node.getBoundingClientRect();
          const mid = s.left + s.width / 2;
          let best = "";
          let bestDist = Infinity;
          for (const card of node.querySelectorAll<HTMLElement>('[data-testid="join-group-card"]')) {
            const r = card.getBoundingClientRect();
            const d = Math.abs(r.left + r.width / 2 - mid);
            if (d < bestDist) {
              bestDist = d;
              best = card.dataset.group ?? "";
            }
          }
          return best;
        });
      for (const group of ["found", "contact", "return", "trust", "insights"]) {
        const card = shelf.locator(`[data-testid="join-group-card"][data-group="${group}"]`);
        await card.getByRole("button").first().dispatchEvent("click");
        await expect(card).toHaveAttribute("data-selected", "true");
        await expect.poll(centred, { timeout: 3_000 }).toBe(group);
      }
    });
  });

  // The toggletip overlays: opening it moves nothing below it.
  test("toggletip opens over the list without moving it, and closes on Esc", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoJoin(page);
    const panel = scope(page).getByTestId("join-panel");
    await panel.scrollIntoViewIfNeeded();
    const button = panel.getByTestId("join-feature-tip-button").first();
    const lastItem = panel.getByTestId("join-check-item").last();
    const before = await lastItem.boundingBox();
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const tip = panel.getByTestId("join-feature-tip").first();
    await expect(tip).toBeVisible();
    // Painted ON TOP: the element at the bubble's centre is the bubble. A tip
    // trapped in its row's stacking context is "visible" yet sits under the
    // next row — toBeVisible() cannot tell the two apart.
    expect(await isOnTop(tip), "the open tip is painted under another element").toBe(true);
    const after = await lastItem.boundingBox();
    expect(after!.y, "opening the tip pushed the list down").toBeCloseTo(before!.y, 0);
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
