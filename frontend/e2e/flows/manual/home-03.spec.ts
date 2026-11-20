// MEH-3540: part 3 of 3 of the former home.spec.ts, split mechanically by
// top-level describe block (no test body changed). Shared fixtures and helpers:
// ./_home-shared.ts.
import type { Route } from "@playwright/test";
import { test, expect } from "../_cloudinary-stub";
import { layoutSettled } from "../_layout-settled";
import he from "../../../messages/he.json";
import en from "../../../messages/en.json";
import { ListCategoriesCategoriesGetResponse, ListProducersProducersGetResponse, GetStatsStatsGetResponse } from "../../../lib/generated/api.zod.js";
import { ProducersResponseSchema } from "../../../lib/schemas.js";
import { CategoriesResponseSchema, StatsSchema } from "../../../lib/api-schemas.js";
import { CHIPS_CONFIG } from "../../../lib/producer-filters.js";
import {
  FIRST_PAINT,
  scope,
  isDesktop,
  HERO_SEARCH,
  CATS_COPY,
  CTA,
  RECENT,
  TRUST,
  FRIDAY_HE,
  FRIDAY_EN,
  HOME_CHIPS,
  PROMOTED,
  I18N_KEY_PATH,
  CARDS,
  CAT_A,
  CATEGORIES,
  CITY,
  DAYS_OUT_OF_ORDER,
  DAYS_IN_ORDER,
  DAY_NOBODY,
  uuid,
  producer,
  P1,
  P2,
  P3,
  P5,
  PRODUCERS,
  PAGE_SIZE,
  CAT_A_MEMBERS,
  STATS_ABOVE,
  STATS_COUNTED,
  stubTiles,
  mockApi,
  seedStorage,
  consent,
  gotoHome,
  mountEffectRan,
  gotoWithFeed,
  cards,
  heroSearch,
  box,
  strangersBetweenGridAndMap,
} from "./_home-shared";


test.beforeAll(() => {
  // A schema change reds the spec HERE, loudly, instead of letting the fixture
  // drift away from what the app is actually given — BOTH contracts: the
  // generated one (what the backend emits) and the app-side one the page
  // validates with before a single card is created.
  ListProducersProducersGetResponse.parse(PRODUCERS);
  ListCategoriesCategoriesGetResponse.parse(CATEGORIES);
  GetStatsStatsGetResponse.parse(STATS_ABOVE);
  ProducersResponseSchema.parse(PRODUCERS);
  CategoriesResponseSchema.parse(CATEGORIES);
  StatsSchema.parse(STATS_ABOVE);
  // Guards on the fixture's own premises — each is a condition a row below
  // depends on, so a fixture edit that breaks one fails here rather than
  // producing a test that is green for the wrong reason.
  if (PRODUCERS.length <= PAGE_SIZE) throw new Error("the feed must overflow PAGE_SIZE for the load-more row");
  if (CAT_A_MEMBERS.length !== 2) throw new Error(`CAT_A must hold exactly 2 businesses, got ${CAT_A_MEMBERS.length}`);
  if (PRODUCERS.some((p) => p.delivery_areas.some((a) => a.delivery_day === DAY_NOBODY)))
    throw new Error("DAY_NOBODY must be a day no fixture business delivers on");
  if (P3.delivery_areas.some((a) => a.city === CITY))
    throw new Error("P3 must carry NO delivery_areas row for CITY — that is MT:2197:7's whole subject");
  if (DAYS_OUT_OF_ORDER[0] === DAYS_IN_ORDER[0])
    throw new Error("the day fixture must be declared out of week order or MT:2197:5 cannot discriminate");
  if (PROMOTED.some((k) => !HOME_CHIPS.find((c) => c.key === k)))
    throw new Error("a promoted key vanished from CHIPS_CONFIG");
  const sugarDeclared = PRODUCERS.filter((p) => p.has_no_added_sugar_products).length;
  if (sugarDeclared < 5)
    throw new Error(`DIET_CHIP_MIN = 5 declared businesses are needed to un-gate no_added_sugar, got ${sugarDeclared}`);
  const grassFed = PRODUCERS.filter((p) => p.grass_fed).length;
  if (grassFed < 5)
    throw new Error(`DIET_CHIP_MIN = 5 grass-fed businesses are needed to un-gate grass_fed, got ${grassFed}`);
  const onSite = PRODUCERS.filter((p) => p.sells_on_site).length;
  if (onSite < 5)
    throw new Error(`DIET_CHIP_MIN = 5 businesses selling on site are needed to un-gate on_site, got ${onSite}`);
  if (PROMOTED.includes("verified"))
    throw new Error("«מאומת» is promoted again — MT:1418:2 below asserts it lives in the sheet only (MEH-2598)");
  const windowed = PRODUCERS.filter((p) => p.order_window).length;
  if (windowed < 5)
    throw new Error(`OPEN_NOW_CHIP_MIN = 5 declared windows are needed to un-gate open_for_orders_now, got ${windowed}`);
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › above-the-fold mini-map + trust band (MEH-604 · MEH-607)", () => {
  // MEH-2979: Thu 18:00 → Fri 14:00 Israel the friday-delivery-strip mounts
  // between the hero and the trust band (lib/friday-mode.js). It shifted the
  // trust band by 219px against the 60px budget (:2383) and appeared on one
  // project but not the other in the section-order check (:2192) — both seen
  // in this window on 12/11. These tests are about layout, not the strip, so
  // pin a weekday noon; the strip's own tests force it with
  // friday_mode_override, which wins over the clock.
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-07-15T09:00:00Z")); // Wed 12:00 IDT
  });

  // MT:604:1 — REVISED by MEH-2747 (Sapir 6/11, option א׳): the map comes
  //   right AFTER the businesses grid on phone and desktop alike. MEH-604's
  //   "second block, right under the hero" is retired. Asserted as DOM order
  //   AND as painted order on both projects — MEH-2635 had moved it with CSS
  //   `order-last` on phones only, which this row could not see in the DOM
  //   while the painted half of it disagreed.
  test("the mini-map comes right after the businesses grid, in the DOM and on screen", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    for (const id of ["home-hero", "home-minimap", "home-trust-band"]) {
      await expect(scope(page).getByTestId(id), `${id} renders exactly once`).toHaveCount(1, FIRST_PAINT);
    }
    expect(
      (await strangersBetweenGridAndMap(page)).join(" | "),
      "the mini-map is the businesses grid's next block; these sat between them",
    ).toBe("");
    // …and on screen the trust band (above the grid) is above it, not below.
    // `home-minimap` is a `dynamic({ ssr:false, loading })` slot: the skeleton is
    // REPLACED by the live map, which detaches the node a boundingBox() read was
    // about to measure (observed on the mobile project: "element has no box").
    // Both offsets in one evaluate, off the document rather than the viewport.
    const tops = await page.evaluate(() => {
      const y = (id: string) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? el.getBoundingClientRect().top + window.scrollY : NaN;
      };
      return { map: y("home-minimap"), trust: y("home-trust-band") };
    });
    expect(Number.isNaN(tops.map) || Number.isNaN(tops.trust), "both blocks are in the document").toBe(false);
    expect(tops.trust, "the trust band is above the mini-map").toBeLessThan(tops.map);
  });

  // MEH-2747 — one page order, phone and desktop. The same homepage at 375
  //   and at 1440 must show the SAME top-level sections, and on each viewport
  //   the painted order must equal the DOM order (what VoiceOver / the keyboard
  //   walk). The static half of this rule is __tests__/VisualOrderGuard.test.js
  //   (no CSS reorder utilities); this row is the rendered half, which also
  //   catches a section that exists on one viewport only.
  //   One test drives both viewports, so it runs on the desktop project only —
  //   gated on the project name, which the product cannot move.
  test("phone and desktop show the same sections, in the same order, painted as in the DOM", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "drives 375 and 1440 itself; once is enough");
    const read = async (viewport: { width: number; height: number }) => {
      const ctx = await browser.newContext({ viewport, locale: "he-IL", timezoneId: "Asia/Jerusalem", reducedMotion: "reduce" });
      const page = await ctx.newPage();
      // MEH-2986: this test opens its own contexts, so the describe's
      // beforeEach clock (MEH-2979) never reaches them. Pin the same weekday
      // noon here, or Thu 18:00 → Fri 14:00 Israel the friday-delivery-strip
      // can be read on one viewport and not yet on the other.
      await page.clock.setFixedTime(new Date("2026-07-15T09:00:00Z")); // Wed 12:00 IDT
      try {
        await consent(page);
        await stubTiles(page);
        await mockApi(page);
        await gotoHome(page);
        await expect(scope(page).getByTestId("home-minimap")).toHaveCount(1, FIRST_PAINT);
        return await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll("#main-content section[data-testid]"));
          const top = all.filter((el) => !el.parentElement?.closest("section[data-testid]"));
          const shown = top.filter((el) => el.getBoundingClientRect().height > 0);
          const dom = shown.map((el) => el.getAttribute("data-testid")!);
          const painted = shown
            .map((el) => ({ id: el.getAttribute("data-testid")!, y: el.getBoundingClientRect().top }))
            .sort((a, b) => a.y - b.y)
            .map((x) => x.id);
          return { dom, painted };
        });
      } finally {
        await ctx.close();
      }
    };
    const phone = await read({ width: 375, height: 812 });
    const desk = await read({ width: 1440, height: 900 });
    // Control: the reader saw real sections, including the map this ticket moved.
    expect(phone.dom, "control: the reader found the mini-map on the phone").toContain("home-minimap");
    expect(desk.dom.length, "control: more than a couple of sections were read").toBeGreaterThan(3);
    // MEH-2986 control: the pinned weekday clock reached both contexts. Without
    // the pin, this reds Thu 18:00 → Fri 14:00 Israel, when the strip mounts.
    expect([...phone.dom, ...desk.dom], "clock pin reached both contexts: no Friday strip").not.toContain(
      "friday-delivery-strip"
    );
    expect(phone.painted, "375: painted order = DOM order (no CSS reorder)").toEqual(phone.dom);
    expect(desk.painted, "1440: painted order = DOM order (no CSS reorder)").toEqual(desk.dom);
    expect(phone.dom, "the same sections, in the same order, on phone and desktop").toEqual(desk.dom);
  });

  /**
   * SELF-TEST for the reader above, run against the REAL function on three
   * inputs whose answers are known — the testing.md rule for an assertion that
   * is a classifier. It exercises `strangersBetweenGridAndMap`, never a copy,
   * so the two cannot drift.
   *
   * Without it the skip-list is a green of unknown wiring: a reader that
   * returned `[]` unconditionally would satisfy the order row above just as
   * well as a correct one, and nothing in that row's output would say which it
   * was. Case 3 is what discriminates — it is the case a broken reader fails.
   */
  test("the block-order reader skips non-rendering placeholders and still catches a real block", async ({
    page,
  }) => {
    await consent(page);
    await stubTiles(page);
    const seen = await mockApi(page);
    await gotoHome(page);
    await expect(scope(page).getByTestId("home-minimap")).toHaveCount(1, FIRST_PAINT);
    // HYDRATED before anything is injected. `home-minimap` and the grid are in
    // the SERVER html, so the gate above can return while that region is still
    // dehydrated — and a node injected there is one React's hydration did not
    // render: React error #418, the region is client-rendered from scratch,
    // and the injected node goes with the discarded DOM (~0.5-0.7 s after injection). Measured on a local
    // production build of staging @ 89bc3b411 under 4x CPU throttling, 32 runs
    // each: injecting at the old gate drew #418 in 9 runs, one of them red at
    // the precondition below; gated here, 0 of 32. That is the shape of CI run
    // 42845330925's red (attached at the check, reader then saw ""), and of
    // run 33943227079's before it. `mountEffectRan` is this file's own
    // post-hydration signal (see its doc comment).
    await mountEffectRan(seen);
    // The witness for the gate above: a hydration error raised from here on
    // means an injection below landed in a region React had not hydrated yet.
    // React 19 reports it through reportError (an uncaught error) and the
    // console; both are collected and asserted empty at the end.
    const hydrationErrors: string[] = [];
    const isHydrationError = (text: string) => /#418\b|Hydration failed/.test(text);
    page.on("pageerror", (e) => {
      if (isHydrationError(e.message)) hydrationErrors.push(`pageerror: ${e.message.slice(0, 160)}`);
    });
    page.on("console", (m) => {
      if (m.type() === "error" && isHydrationError(m.text())) hydrationErrors.push(`console: ${m.text().slice(0, 160)}`);
    });

    const insert = (tag: string, testid?: string) =>
      page.evaluate(
        ([t, id]) => {
          const hero = document.getElementById("producers-grid")!;
          const el = document.createElement(t as string);
          if (id) el.setAttribute("data-testid", id as string);
          hero.after(el);
        },
        [tag, testid ?? ""] as const,
      );
    const remove = (selector: string) =>
      page.evaluate((sel) => document.querySelector(sel)?.remove(), selector);

    // 1 — the settled page: nothing between them.
    expect(await strangersBetweenGridAndMap(page), "control: the settled page has no strangers").toEqual([]);

    // 2 — the measured flake, injected deterministically: React's streaming
    //     placeholder renders nothing, so it must not count as a block.
    await insert("template");
    expect(
      await strangersBetweenGridAndMap(page),
      "a <template> renders nothing and must not read as a block",
    ).toEqual([]);
    await remove("section[data-testid] + template, template");

    // 3 — a REAL block in the same position must be caught, and must name
    //     itself. This is the case that fails against a reader that skips
    //     everything, which is the way the fix above could be inert.
    await insert("div", "interloper");

    // PRECONDITION ON THE FIXTURE, not on the subject. This row went flaky in
    // CI (run 33943227079) reporting «a real element between the two must be
    // reported by name» with an empty result — a message that blames the
    // reader for what may be a fixture that did not survive to sample time.
    // The two are different defects and must not share a failure. Injecting
    // is now gated on `mountEffectRan` above, so React should no longer replace
    // the hero's subtree (and an injected sibling with it) after this point —
    // but "should" is the gate's claim, not a fact this line can take on trust.
    // So assert the injected node is attached AND still sits between the two
    // sections before reading anything into what the reader returns, and
    // (below) that no hydration error fired. If this line is what goes red,
    // the reader is not the suspect.
    await expect(
      page.locator('[data-testid="interloper"]'),
      "fixture precondition: the injected block must survive to sample time — if THIS fails the reader is not implicated",
    ).toHaveCount(1);
    // …and it must still sit right after the grid, read by a check that is NOT
    // the reader (one sibling hop, no skip-list). The comment above always
    // claimed this half; until now only the attachment half was asserted.
    expect(
      await page.evaluate(
        () => document.getElementById("producers-grid")?.nextElementSibling?.getAttribute("data-testid") ?? null,
      ),
      "fixture precondition: the injected block must still be the grid's next sibling — if THIS fails the reader is not implicated",
    ).toBe("interloper");

    const caught = await strangersBetweenGridAndMap(page);
    expect(caught.join(" | "), "a real element between the two must be reported by name").toContain(
      "div[interloper]",
    );
    await remove('[data-testid="interloper"]');
    expect(
      hydrationErrors,
      "no React hydration error (#418) after the mountEffectRan gate — one here means the gate let an injection into an unhydrated region",
    ).toEqual([]);
  });

  // MT:604:3 — REVERSED by MEH-2861. The head used to preconnect to the OSM
  //   tile host on every page for a mini-map that is now ~2,700px down and
  //   loads on scroll (MEH-2747, MEH-2850), so the handshake expired unused.
  //   The Cloudinary preconnect is the control: the query reads real links.
  test("the document head does not preconnect to the OSM tile host", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel="preconnect"]')).map(
        (l) => (l as HTMLLinkElement).href,
      ),
    );
    expect(hrefs, "control: the head's preconnect links are being read").toContain(
      "https://res.cloudinary.com/",
    );
    expect(hrefs.filter((h) => /openstreetmap\.org/.test(h))).toEqual([]);
  });

  // MT:607:2 — the trust band reserves its slot with a pulsing skeleton while
  //   /stats is in flight, and the real line replaces it in place.
  //   Rows 1, 3 and 4 are STALE (the גליון/month copy MEH-879 removed).
  //
  //   ⚠️ THE ROW'S "zero layout jump" HALF IS NOT SATISFIED ON THIS BUILD, AND IS
  //   DELIBERATELY NOT ASSERTED — in EITHER direction. Measured with a
  //   BELOW-threshold /stats payload (so the loaded band is one lead line, the
  //   fairest possible comparison), the band's own document offset moves between
  //   the busy state and the loaded one:
  //       desktop 1440×900   band top 1104 → 1140   (+36px)
  //       mobile   393×727   band top  879 →  915   (+36px)
  //   **The cause is NOT established.** The band's top moving means something
  //   ABOVE it grew, so the candidates are the band's own skeleton→text line-box
  //   swap (`<span class="h-5">` inside a `<p class="text-base">`,
  //   HomeClient.jsx:141-146), the mini-map's dynamic skeleton→Leaflet swap
  //   directly above it, or the hero image settling — and this spec did not
  //   separate them. Attributing it to one of the three would be exactly the
  //   unverified diagnosis workflow.md's Bug Protocol §6 forbids, so it ships as
  //   an unexplained observation in docs/qa/conversion-progress.md with the
  //   numbers above, for whoever owns MEH-607 / MEH-604 to bisect.
  //   What IS asserted is the part that holds and that the row is really about:
  //   the slot is reserved (aria-busy, non-zero height) and is REPLACED by the
  //   real lead in the same element rather than appearing from nothing.
  test("the trust band reserves a busy slot while /stats is in flight and the lead replaces it", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { statsDelayMs: 2_000, stats: { producers_count: 2, categories_count: 2 } });
    await page.goto("/");
    const band = scope(page).getByTestId("home-trust-band");
    await expect(band).toHaveCount(1, FIRST_PAINT);
    await expect(band).toHaveAttribute("aria-busy", "true");
    // MEH-2804 follow-up: the sentence needs no /stats, so it is already up; only
    // the count line's slot is a placeholder while /stats is in flight.
    await expect(scope(page).getByTestId("trust-lead")).toHaveText(TRUST.lead);
    await expect(scope(page).getByTestId("trust-count-skeleton")).toBeVisible();
    const skeleton = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="home-trust-band"]')!;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    expect(skeleton.height, "the skeleton reserves a real slot, not zero height").toBeGreaterThan(0);
    await expect(scope(page).getByTestId("trust-lead")).toBeVisible(FIRST_PAINT);
    await expect(band).not.toHaveAttribute("aria-busy", "true");
    const loaded = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="home-trust-band"]')!;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    // The band still occupies a real slot after the swap — i.e. the skeleton was
    // REPLACED, not removed and the section collapsed. The offset delta is
    // recorded (see the header block) rather than asserted, because its cause was
    // not isolated.
    expect(loaded.height, "the band still occupies a slot after the swap").toBeGreaterThan(0);
    expect(
      Math.abs(loaded.top - skeleton.top),
      "the observed shift stays in the range this chunk measured and reported (36px); a larger one is new breakage",
    ).toBeLessThanOrEqual(60);
  });

  // MT:607:1 replacement — the STALE «גליון מאי» copy is gone and the live lead
  //   comes from he.json. MEH-2804 follow-up (07/11): the sentence renders at
  //   EVERY count; below TRUST_COUNT_THRESHOLD (25) there is no number at all.
  test("the trust band renders the he.json sentence and, below the count threshold, no count line", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { stats: STATS_ABOVE }); // 10: above 5, below 25
    await gotoHome(page);
    await expect(scope(page).getByTestId("trust-lead")).toHaveText(TRUST.lead);
    await expect(scope(page).getByTestId("home-trust-band")).not.toHaveAttribute("aria-busy", "true", FIRST_PAINT);
    await expect(
      scope(page).getByTestId("trust-count"),
      "below 25 businesses no count is shown (MEH-521: a small count is negative social proof)",
    ).toHaveCount(0);
    const body = await page.locator("body").innerText();
    expect(body, "the MEH-879-removed month framing must not come back").not.toContain("גליון");
  });

  // The discriminating twin of the test above: from 25 the count line DOES
  // render, under the same sentence (either test alone is green on a band that
  // never renders a count at all).
  test("from the count threshold a second line states the business count, under the same sentence", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { stats: STATS_COUNTED });
    await gotoHome(page);
    await expect(scope(page).getByTestId("trust-lead")).toHaveText(TRUST.lead);
    const line = scope(page).getByTestId("trust-count");
    await expect(line).toBeVisible(FIRST_PAINT);
    await expect(line.getByTestId("trust-count-value")).toHaveText(String(STATS_COUNTED.producers_count));
    await expect(line).toContainText(TRUST.count_line.replace(/<num>\{count\}<\/num>\s*/, ""));
  });

  // MEH-2488: Hebrew is never letter-spaced (DESIGN.md) — tracking pulls the
  // letters of a word apart. The band carried `tracking-wide` (0.4px / 0.35px).
  // Both lines are checked, from the threshold, so neither can pass by being absent.
  test("the trust band's Hebrew lines are not letter-spaced", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { stats: STATS_COUNTED });
    await gotoHome(page);
    for (const id of ["trust-lead", "trust-count"]) {
      const line = scope(page).getByTestId(id);
      await expect(line).toBeVisible(FIRST_PAINT);
      expect(await line.textContent(), `${id} carries Hebrew`).toMatch(/[\u0590-\u05FF]/);
      const spacing = await line.evaluate((el) => getComputedStyle(el).letterSpacing);
      expect(spacing, `${id} letter-spacing`).toMatch(/^(normal|0px)$/);
    }
  });

  // MEH-2804 follow-up (Sapir 07/11): the count numeral is the line's own face,
  // upright and semibold — Cormorant's old-style italic figures read as «ɜı»
  // beside Hebrew. Read from the browser, so a class that compiles to nothing
  // (or a font-english that sneaks back) fails here.
  test("the count numeral is upright, semibold, in the line's own face — not Cormorant", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { stats: STATS_COUNTED });
    await gotoHome(page);
    const num = scope(page).getByTestId("trust-count-value");
    await expect(num).toBeVisible(FIRST_PAINT);
    const style = await num.evaluate((el) => {
      const cs = getComputedStyle(el);
      const line = getComputedStyle(el.parentElement!);
      return { fontStyle: cs.fontStyle, weight: Number(cs.fontWeight), family: cs.fontFamily, lineFamily: line.fontFamily };
    });
    expect(style.fontStyle).toBe("normal");
    expect(style.weight).toBeGreaterThanOrEqual(600);
    expect(style.family.toLowerCase()).not.toContain("cormorant");
    expect(style.family, "same face as the line it sits in").toBe(style.lineFamily);
    expect(await num.getAttribute("dir")).toBe("ltr");
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › static home blocks (overnight design batch)", () => {
  // MT:ODB:4 — the closing business block: heading + three body lines + button.
  test("the closing CTA renders its heading, three body lines and button", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const cta = scope(page).getByTestId("home-cta");
    await expect(cta).toHaveCount(1, FIRST_PAINT);
    await expect(cta.getByRole("heading", { level: 2, name: CTA.heading })).toBeVisible();
    for (const line of [CTA.body_l1, CTA.body_l2, CTA.body_l3]) await expect(cta).toContainText(line);
    // MEH-2824: the band's one button is «מצטרפים», like /join (home.cta.button retired).
    // MEH-2983: the home band leads to /join, the main door for businesses.
    await expect(cta.getByRole("link", { name: he.join.cta })).toHaveAttribute("href", /\/join$/);
  });

  // MT:ODB:5 — the footer's copyright line: no leaf emoji. (The tagline's own
  //   copy is asserted from he.json rather than restated here.)
  test("the footer copyright line carries no leaf glyph", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible(FIRST_PAINT);
    const text = await footer.innerText();
    expect(text, "the copyright line must carry no leaf emoji").not.toContain("🌿");
    expect(text, "…and it does name the brand year line").toMatch(/©/);
  });

  // MT:ODB:2 / MT:ODB:3 (STALE since MEH-2441) — "איך זה עובד" and the
  //   comparison teaser both left home (Sapir 27/10: /about carries the full
  //   comparison since MEH-841, /about/process the real four steps). Asserted
  //   as absences beside a presence (the closing CTA), so a page that failed
  //   to render can't pass it; the full comparison TABLE stays off home too.
  test("home carries no how-it-works block, no comparison teaser and no comparison table", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await gotoHome(page);
    await expect(scope(page).getByTestId("home-cta"), "control: the page rendered").toHaveCount(1, FIRST_PAINT);
    await expect(scope(page).getByTestId("home-how-it-works")).toHaveCount(0);
    await expect(page.locator("#how-it-works")).toHaveCount(0);
    await expect(scope(page).getByTestId("home-comparison-teaser")).toHaveCount(0);
    await expect(scope(page).locator("table"), "the full comparison table moved to /about (MEH-841)").toHaveCount(0);
  });

  // MT:CCI adjacent — the live category grid, asserted so that section's seven
  //   STALE rows leave a live successor rather than a hole: TEN cards, each
  //   named by lib/home-categories.js, and NO tint layer over any photo (the
  //   65% green scrim MEH-1183 forbade).
  test("the category grid renders the ten declared cards with no tint over the photos", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page);
    await gotoHome(page);
    const grid = scope(page).getByTestId("home-category-grid");
    await expect(grid).toHaveCount(1, FIRST_PAINT);
    const names = await grid.getByTestId("home-category-card").getByRole("heading", { level: 3 }).allTextContents();
    expect(names, "one card per declaration in lib/home-categories.js").toEqual(CARDS.map((c) => c.name));
    await expect(grid.getByRole("heading", { level: 2, name: CATS_COPY.heading })).toBeVisible();
    // The forbidden scrim would be an absolutely-positioned sibling INSIDE the
    // image frame; there is exactly one child (the <img>) per frame.
    const overlays = await grid
      .getByTestId("home-category-image-frame")
      .evaluateAll((els) => els.map((el) => el.childElementCount));
    for (const n of overlays) expect(n, "no scrim/tint layer inside an image frame").toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › recently viewed (task 13)", () => {
  const stamped = (ids: string[]) =>
    JSON.stringify(ids.map((id) => ({ id, viewedAt: Date.now() }))); // lib/recently-viewed.js readRaw shape

  // MT:T13:5 + MT:T13:6 + MT:T13:9 — the band renders from storage as a
  //   horizontal row of image+name+city cards, and a card navigates.
  //   DRIFT, recorded: the row says the section appears ABOVE the main producer
  //   grid and calls it «ביקרת לאחרונה». MEH-912 demoted it to a band just above
  //   the closing CTA (BELOW the grid), and the live heading is
  //   `home.recent.heading`. Both are asserted as they live.
  test("the recently-viewed band renders from storage, below the grid, and its cards navigate", async ({ page }) => {
    await seedStorage(page, "recently_viewed", stamped([P1.id, P2.id]));
    await gotoWithFeed(page);
    const band = scope(page).getByTestId("home-recently-viewed");
    await expect(band).toBeVisible(FIRST_PAINT);
    await expect(band.getByRole("heading", { level: 2, name: RECENT.heading })).toBeVisible();
    const items = band.getByTestId("home-recent-card");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText(P1.name);
    await expect(items.first()).toContainText(String(P1.city));
    // Position: BELOW the producer grid (MEH-912), ABOVE the closing CTA.
    const [g, b, c] = [
      await box(scope(page).getByTestId("home-producers-grid")),
      await box(band),
      await box(scope(page).getByTestId("home-cta")),
    ];
    expect(b.y, "the band sits below the producer grid").toBeGreaterThan(g.y + g.height - 1);
    expect(b.y, "…and above the closing CTA").toBeLessThan(c.y);
    // MEH-3486 (WebKit, 20/11, passed on retry): the click left the page on «/».
    // The band sits at the foot of a page whose grid is still settling, so the
    // card can move between mousedown and mouseup and the click is lost with no
    // error (MEH-3449). Scroll it in and wait for it to be still first.
    await items.first().scrollIntoViewIfNeeded();
    await layoutSettled(items.first());
    await items.first().click();
    await expect(page).toHaveURL(new RegExp(`/${P1.slug}$|/producer/${P1.id}$`));
  });

  // MT:T13:7 + MT:T13:10 — 160px-wide cards with 100px-tall images, in a row
  //   that scrolls horizontally.
  test("the cards are 160px wide with 100px images and the row scrolls horizontally", async ({ page }, info) => {
    await seedStorage(page, "recently_viewed", stamped(PRODUCERS.slice(0, 5).map((p) => p.id)));
    await gotoWithFeed(page);
    const band = scope(page).getByTestId("home-recently-viewed");
    await expect(band).toBeVisible(FIRST_PAINT);
    const card = band.getByTestId("home-recent-card").first();
    const cardBox = await box(card);
    expect(Math.round(cardBox.width), "w-[160px]").toBe(160);
    const imgBox = await box(card.getByTestId("home-recent-card-image"));
    expect(Math.round(imgBox.height), "h-[100px]").toBe(100);
    const rail = band.getByTestId("home-recent-rail");
    await expect(rail, "the rail is a horizontal scroller on every viewport").toHaveCSS("overflow-x", "auto");
    const [scrollW, clientW] = await rail.evaluate((el) => [el.scrollWidth, (el as HTMLElement).clientWidth]);
    if (isDesktop(info)) {
      // 5 x 160px + gaps fits inside 1440, so there is nothing to overflow — the
      // CSS assertion above is the whole claim here. Asserting an overflow on
      // desktop would be asserting the fixture size, not the component.
      expect(scrollW).toBeGreaterThanOrEqual(clientW - 1);
    } else {
      expect(scrollW, "five 160px cards overflow a phone-width rail, so it scrolls").toBeGreaterThan(clientW);
    }
  });

  // MT:T13:8 — a long name is clipped rather than wrapping the card open.
  test("a long business name truncates inside the card", async ({ page }) => {
    await seedStorage(page, "recently_viewed", stamped([P5.id]));
    await gotoWithFeed(page);
    const name = scope(page)
      .getByTestId("home-recently-viewed")
      .getByTestId("home-recent-card")
      .first()
      .locator("p")
      .first();
    await expect(name).toBeVisible(FIRST_PAINT);
    await expect(name).toHaveCSS("text-overflow", "ellipsis");
    const [scrollW, clientW] = await name.evaluate((el) => [el.scrollWidth, (el as HTMLElement).clientWidth]);
    expect(scrollW, "the long name is genuinely clipped").toBeGreaterThan(clientW);
  });

  // MT:T13:11 + MT:T13:12 — with nothing stored the band renders NOTHING (no
  //   empty state). Both rows describe the same world (empty storage), so they
  //   are one test; row 12 is entailed by row 11 and recorded as such.
  test("with no stored history the band is absent — no empty state", async ({ page }) => {
    await gotoWithFeed(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE, FIRST_PAINT);
    await expect(scope(page).getByTestId("home-recently-viewed")).toHaveCount(0);
    await expect(scope(page).getByText(RECENT.heading)).toHaveCount(0);
  });

  // MT:T13:13 — a stored id the backend no longer serves is dropped silently:
  //   the band still renders, one card short. The COUNT is what discriminates —
  //   "the band renders" alone is green whether or not the dead id was dropped.
  test("a stored id that no longer resolves is skipped, and the rest still render", async ({ page }) => {
    const dead = uuid(999);
    await seedStorage(page, "recently_viewed", stamped([P1.id, dead, P2.id]));
    await gotoWithFeed(page);
    const band = scope(page).getByTestId("home-recently-viewed");
    await expect(band).toBeVisible(FIRST_PAINT);
    await expect(band.getByTestId("home-recent-card"), "exactly the two live ids").toHaveCount(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › Friday delivery strip (סרגל שישי)", () => {
  // MT:FRI:1 — inside the Friday window (forced through the documented
  //   `friday_mode_override` localStorage flag, lib/friday-mode.js:6) and with
  //   businesses delivering on Friday (MEH-2759), the strip renders REAL copy — not an
  //   untranslated key path — and the cards carry the "today" badge.
  test("in the Friday window the strip renders real Hebrew copy, not a key path", async ({ page }) => {
    await seedStorage(page, "friday_mode_override", "1");
    await gotoWithFeed(page, "/", (u: URL) =>
      // MEH-2759: the strip asks for Friday delivery, not available_today.
      u.searchParams.get("delivery_day") === "שישי" ? [P1, P2] : PRODUCERS,
    );
    const strip = scope(page).getByTestId("friday-delivery-strip");
    await expect(strip).toBeVisible(FIRST_PAINT);
    const text = await strip.innerText();
    expect(text, "the strip must not render an i18n key path").not.toMatch(I18N_KEY_PATH);
    await expect(strip.getByRole("heading", { level: 2, name: FRIDAY_HE.title_alt })).toBeVisible();
    await expect(strip).toContainText(FRIDAY_HE.today);
  });

  // MT:FRI:2 — the same strip on `/en`, in English.
  test("the same strip renders in English on /en", async ({ page }) => {
    await seedStorage(page, "friday_mode_override", "1");
    await gotoWithFeed(page, "/en", (u: URL) =>
      // MEH-2759: the strip asks for Friday delivery, not available_today.
      u.searchParams.get("delivery_day") === "שישי" ? [P1, P2] : PRODUCERS,
    );
    const strip = scope(page).getByTestId("friday-delivery-strip");
    await expect(strip).toBeVisible(FIRST_PAINT);
    await expect(strip.getByRole("heading", { level: 2, name: FRIDAY_EN.title_alt })).toBeVisible();
    await expect(strip).toContainText(FRIDAY_EN.today);
    const text = await strip.innerText();
    expect(text).not.toMatch(I18N_KEY_PATH);
    expect(text, "the English strip must not fall back to the Hebrew title").not.toContain(FRIDAY_HE.title_alt);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › smart search dropdown (MEH-99)", () => {
  // MT:MEH-99:1 — clicking the pill with recent searches stored shows them, up
  //   to five, and a click routes to /producers?q=.
  test("recent searches open on focus, capped at five, and route to /producers?q=", async ({ page }) => {
    const stored = ["לחם", "גבינה", "ירקות", "דבש", "יין"];
    await seedStorage(page, "mehamakor_recent_searches", JSON.stringify([...stored, "שישי-שביעי"]));
    await gotoWithFeed(page);
    await heroSearch(page).click();
    const history = scope(page).getByTestId("hero-search-history");
    await expect(history).toBeVisible(FIRST_PAINT);
    await expect(history).toContainText(HERO_SEARCH.recent_heading);
    await expect(history.getByRole("option"), "MAX_RECENT = 5 (HeroSearch.jsx:24)").toHaveCount(5);
    await history.getByRole("option").first().click();
    await expect(page).toHaveURL(new RegExp(`/producers\\?q=${encodeURIComponent(stored[0])}`));
  });

  // MT:MEH-99:2 — MEH-3257 (Sapir 14/11): «חיפושים פופולריים» is gone.
  //   With no recent searches, focusing the empty field opens nothing and asks
  //   the server for nothing. The stub still answers /search/trending with
  //   rows, so a fetch that came back would render them and fail the count.
  test("with no recent searches the empty field opens no dropdown", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, { trending: ["מחמצת", "עיזים"] });
    await gotoHome(page);
    const trendingCall = page
      .waitForRequest(/\/api\/search\/trending/, { timeout: 1500 })
      .then(() => "requested", () => "none");
    await heroSearch(page).click();
    expect(await trendingCall, "no /search/trending request after focus").toBe("none");
    await expect(scope(page).getByTestId("hero-search-history")).toHaveCount(0);
  });

  // MT:MEH-99:3 + MT:MEH-99:8 — one character fires NOTHING; two characters fire
  //   exactly ONE request per debounce burst. The two halves are one test
  //   because the zero-request claim only discriminates beside a case that DOES
  //   produce a request (a broken fetch would satisfy "no request" on its own).
  test("one character fires no search; a burst past two characters fires exactly one", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    const seen = await mockApi(page);
    await gotoHome(page);
    await heroSearch(page).fill("ל");
    // Inverted bounded wait (testing.md): await the UNWANTED event and require
    // that it times out. Deterministic in both worlds, dependent on no network
    // condition.
    const fired = await page
      .waitForRequest((r) => /\/api\/search\?/.test(r.url()), { timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(fired, "a single character must not trigger autocomplete (HeroSearch.jsx:91)").toBe(false);
    expect(seen.search.length).toBe(0);
    // Now type a burst faster than DEBOUNCE_MS = 300 and require exactly one.
    // `fill("")` first — the single character above is still in the field, and a
    // burst appended to it queries a different string than the one asserted below.
    await heroSearch(page).fill("");
    await heroSearch(page).pressSequentially("לחם מחמצת", { delay: 20 });
    await expect.poll(() => seen.search.length, { message: "the burst produces a request" }).toBeGreaterThan(0);
    await expect.poll(() => seen.search.length, { timeout: 3_000, message: "…and only one" }).toBe(1);
    expect(seen.search[0].searchParams.get("q")).toBe("לחם מחמצת");
  });

  // MT:MEH-99:4 — 2+ characters produce GROUPED results.
  //   DRIFT: the row names four groups — יצרנים / מוצרים / ערים / קטגוריות. The
  //   hero dropdown renders THREE (`search.hero.section_producers` /
  //   `_categories` / `_cities`); there is no products group, and the businesses
  //   group is labelled «בתי עסק», not «יצרנים» (HeroSearch.jsx:392-449). The
  //   live three are asserted; the drift is recorded in conversion-progress.md.
  test("two or more characters produce the three grouped result sections", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, {
      search: {
        producers: [{ id: P1.id, name: P1.name, city: CITY, slug: P1.slug }],
        categories: [{ id: CAT_A.id, name: CAT_A.name }],
        cities: [CITY],
      },
    });
    await gotoHome(page);
    await heroSearch(page).fill("לחם");
    const dropdown = scope(page).getByTestId("hero-search-dropdown");
    await expect(dropdown).toBeVisible(FIRST_PAINT);
    for (const heading of [HERO_SEARCH.section_producers, HERO_SEARCH.section_categories, HERO_SEARCH.section_cities]) {
      await expect(dropdown).toContainText(heading);
    }
    await expect(dropdown.getByRole("option"), "one row per group in this fixture").toHaveCount(3);
  });

  // MT:MEH-99:5 — ArrowDown/Up walk the FLAT row list and Enter opens the
  //   highlighted row.
  test("arrow keys walk the flat row list and Enter opens the highlighted row", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    await mockApi(page, PRODUCERS, {
      search: {
        producers: [{ id: P1.id, name: P1.name, city: CITY, slug: P1.slug }],
        categories: [{ id: CAT_A.id, name: CAT_A.name }],
        cities: [CITY],
      },
    });
    await gotoHome(page);
    await heroSearch(page).fill("לחם");
    const dropdown = scope(page).getByTestId("hero-search-dropdown");
    await expect(dropdown).toBeVisible(FIRST_PAINT);
    // The rows arrive after the 300ms debounce; `aria-activedescendant` is only
    // set once there ARE rows, so reading it before they land returns "" — which
    // is also what a broken highlight returns. Gate on the rows first.
    await expect(dropdown.getByRole("option")).toHaveCount(3, FIRST_PAINT);
    const activeText = async () => {
      const id = await heroSearch(page).getAttribute("aria-activedescendant");
      if (!id) return "";
      return page.evaluate((rowId) => document.getElementById(rowId)?.textContent?.trim() ?? "", id);
    };
    const first = await activeText();
    expect(first, "a row is highlighted from the start").not.toBe("");
    await heroSearch(page).press("ArrowDown");
    await expect.poll(activeText, { message: "ArrowDown moves the highlight" }).not.toBe(first);
    const second = await activeText();
    await heroSearch(page).press("ArrowUp");
    await expect.poll(activeText, { message: "ArrowUp moves it back" }).toBe(first);
    expect(second).not.toBe(first);
    await heroSearch(page).press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${P1.slug}$|/producer/${P1.id}$`));
  });

  // MT:MEH-99:7 — a submitted term is stored, most-recent-first, capped at five.
  test("a submitted term is stored most-recent-first and capped at five", async ({ page }) => {
    await seedStorage(page, "mehamakor_recent_searches", JSON.stringify(["a", "b", "c", "d", "e"]));
    await gotoWithFeed(page);
    await heroSearch(page).fill("מחמצת");
    await scope(page).getByTestId("hero-search-submit").click();
    await expect(page).toHaveURL(/\/producers\?q=/);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mehamakor_recent_searches") || "[]"));
    expect(stored[0], "the newest term leads").toBe("מחמצת");
    expect(stored.length, "MAX_RECENT = 5").toBe(5);
    expect(stored, "the oldest is evicted").not.toContain("e");
  });

  // MT:MEH-99:9 — a rapid type-then-delete abandons the in-flight request, so no
  //   stale result set survives. Asserted through the OUTCOME the row cares
  //   about: the held payload must never land in the dropdown.
  test("deleting back below two characters abandons the in-flight request and clears the results", async ({ page }) => {
    await consent(page);
    await stubTiles(page);
    // `!` (definite assignment): the executor runs synchronously, but TS's
    // control-flow analysis cannot see that, so without it `release` narrows to
    // `never` and the call below is untypeable.
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    await mockApi(page);
    await page.route("**/api/search?**", async (route: Route) => {
      await held; // hold the response open — the abort must win
      return route.fulfill({ json: { producers: [{ id: P1.id, name: P1.name }], categories: [], cities: [] } });
    });
    await gotoHome(page);
    await heroSearch(page).fill("לחם");
    await expect(scope(page).getByTestId("hero-search-dropdown")).toBeVisible(FIRST_PAINT);
    await heroSearch(page).fill("ל");
    release();
    // The stale payload must never appear in the dropdown.
    const stale = await page
      .waitForSelector(`[data-testid="hero-search-dropdown"] >> text=${P1.name}`, { timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(stale, "the abandoned request's results must not appear").toBe(false);
  });
});
