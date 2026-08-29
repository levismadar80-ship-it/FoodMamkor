import { test, expect, type Page } from "./_cloudinary-stub";

/**
 * Spec:     35-archetype-channel-smoke
 * Purpose:  MEH-2189 chunk C — prove every value of
 *           schemas._ALLOWED_CONTACT_METHODS renders the right primary CTA on a
 *           REAL producer page, plus the missing-field edge case. One demo
 *           business per outreach archetype, each on a different
 *           `primary_contact_method` (seeded by ARCHETYPE_BUSINESSES in
 *           backend/scripts/seed_demo_producers.py).
 * Touches:  GET /{locale}/producer/{slug} against a real backend. Read-only —
 *           this spec never writes, and it never clicks a CTA that would
 *           navigate off-site.
 * Does NOT: edit or assert on any component. A failing assertion here is a BUG
 *           REPORT, not a licence to change frontend code (MEH-2189 scope).
 * History:  MEH-2189 (creation).
 *
 * ── WHY THIS NEEDS A SEEDED BACKEND ─────────────────────────────────────────
 * `facebook` and `external_order` have NO field in the registration form
 * (backend/app/routers/auth.py) — they are dashboard-only. So there is no
 * browser path that creates those states, and a mocked fixture would only prove
 * the mock. The eight rows have to exist in the database.
 *
 * ── THE DOUBLE MOUNT, WHICH IS EASY TO GET WRONG ────────────────────────────
 * ContactCard is mounted TWICE on every producer page:
 *   - ContactSidebar.jsx:12   <aside className="hidden lg:block">
 *   - ProducerDetail.jsx:255  <div id="section-contact" className="lg:hidden">
 * So `[data-testid=primary-contact-button]` resolves to TWO nodes at every
 * viewport — one visible, one display:none. A bare `.toBeVisible()` is
 * therefore strict-mode-ambiguous, and a bare `.count()` is 2, not 1.
 * Every assertion below is explicit about which mount it means, and the
 * breakpoint test asserts the SPLIT (exactly one visible) rather than a total,
 * so a regression that renders both — or neither — fails.
 */

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_URL || "http://localhost:3000";

/** One demo business per archetype. `expect` describes the primary CTA. */
const MATRIX = [
  { slug: "sdot-zahav", method: "whatsapp", hrefPrefix: "https://wa.me/" },
  { slug: "machlevet-ramat-yotam", method: "phone", hrefPrefix: "tel:" },
  { slug: "yekev-karmei-alona", method: "website", hrefPrefix: "https://" },
  // No "www." — instagramUrl (lib/social-links.js) builds a bare
  // instagram.com host. Measured: https://instagram.com/or_habosmat, which
  // also shows the leading "@" of the stored handle correctly stripped
  // (MEH-2174).
  { slug: "kaveret-or-habosmat", method: "instagram", hrefPrefix: "https://instagram.com/" },
  { slug: "beit-habad-sivan", method: "email", hrefPrefix: "mailto:" },
  { slug: "shulchan-aroch-catering", method: "external_order", hrefPrefix: "https://forms.example.com/" },
  { slug: "arugot-noam", method: "facebook", hrefPrefix: "https://www.facebook.com/" },
  // EDGE: phone-primary with phone NULL. getPrimaryContactHref returns null
  // (contact-method.js:50-53) -> PrimaryContactButton.jsx:72 returns null.
  // The correct rendering is NO CTA, so this row has no hrefPrefix.
  { slug: "maadaniyat-ben-shemen", method: "phone", hrefPrefix: null },
] as const;

const ARTIFACT_DIR = "qa-artifacts/meh-2189";
// The canonical producer URL is ROOT-LEVEL `/{slug}` — this was measured, not
// assumed. `/he/producer/{slug}` renders "not found" on staging AND production,
// because that route's getProducer (page.js:24-28) calls the UUID-only
// `/producers/{id}` endpoint and a slug 422s there. The root route
// (app/[locale]/[slug]/page.js:28) is the one that calls `/producers/by-slug/`,
// and it is what `<link rel="canonical">` on the by-id page points at.
const url = (slug: string) => `${baseURL}/he/${slug}`;

/** The visible mount of the primary CTA, whichever viewport we are in. */
const visibleCta = (page: Page) =>
  page.locator("[data-testid=primary-contact-button]:visible");

/**
 * FIXTURE GATE — deliberately NOT a `count()===0 -> skip` on the thing under
 * test (testing.md bans that: it converts "the CTA vanished" into "nothing to
 * check"). This probes a DIFFERENT fact — whether the demo PACK is seeded on
 * this target at all — by asking the API for the first slug. A page that loads
 * but renders no CTA still FAILS the tests below; only a completely unseeded
 * backend skips, and it says so loudly.
 */
let packSeeded = false;
let gateDetail = "";

test.beforeAll(async ({ request }) => {
  const probe = MATRIX[0].slug;
  try {
    const res = await request.get(`${baseURL}/api/producers/by-slug/${probe}`);
    packSeeded = res.ok();
    gateDetail = `GET /api/producers/by-slug/${probe} -> ${res.status()}`;
  } catch (err) {
    packSeeded = false;
    gateDetail = `GET /api/producers/by-slug/${probe} threw: ${(err as Error).message}`;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[MEH-2189 fixture gate] target=${baseURL} seeded=${packSeeded} (${gateDetail})`
  );
});

test.beforeEach(() => {
  test.skip(
    !packSeeded,
    `MEH-2189 demo pack is NOT seeded on ${baseURL} (${gateDetail}). ` +
      `Run: python -m scripts.seed_demo_producers --confirm against that database. ` +
      `This is a MISSING FIXTURE, not a passing test.`
  );
});

test.describe("MEH-2189 — archetype x channel primary-CTA matrix", () => {
  for (const { slug, method, hrefPrefix } of MATRIX) {
    test(`${method} :: ${slug} renders the right primary CTA`, async ({ page }) => {
      const res = await page.goto(url(slug), { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${slug} must return 200`).toBe(200);

      // Both mounts always exist in the DOM; exactly one is visible.
      const allCtas = page.locator("[data-testid=primary-contact-button]");

      if (hrefPrefix === null) {
        // EDGE — the CTA must be absent from BOTH mounts, not merely hidden.
        await expect(
          allCtas,
          `${slug}: phone-primary with no phone must render NO primary CTA ` +
            `(contact-method.js:50-53 + PrimaryContactButton.jsx:72)`
        ).toHaveCount(0);

        // ...and no dead tel: link may appear anywhere on the page. A bare
        // `tel:` with nothing after the colon is the exact defect.
        const deadTel = page.locator('a[href="tel:"], a[href="tel:null"], a[href="tel:undefined"]');
        await expect(deadTel, `${slug}: no dead tel: href anywhere`).toHaveCount(0);
        return;
      }

      const cta = visibleCta(page);
      await expect(cta, `${slug}: exactly one primary CTA visible`).toHaveCount(1);
      await expect(cta).toBeVisible();
      await expect(cta, `${slug}: data-method must be ${method}`).toHaveAttribute(
        "data-method",
        method
      );

      const href = await cta.getAttribute("href");
      expect(href, `${slug}: href must start with ${hrefPrefix}`).toContain(hrefPrefix);

      // MEH-1525: the website CTA — and ONLY it — carries referral UTM
      // (PrimaryContactButton.jsx:80 via withReferralParams).
      if (method === "website") {
        expect(href, `${slug}: website CTA must carry utm_source=mehamakor`).toContain(
          "utm_source=mehamakor"
        );
      } else {
        expect(
          href,
          `${slug}: only the website method may carry referral UTM`
        ).not.toContain("utm_source=mehamakor");
      }
    });
  }

  test("MEH-2154 :: non-whatsapp-primary pages carry zero wa.me links in the question chips", async ({
    page,
  }) => {
    // Positive control FIRST. If the whatsapp-primary page does not produce a
    // wa.me chip, the locator is wrong and every zero below is meaningless.
    await page.goto(url("sdot-zahav"), { waitUntil: "domcontentloaded" });
    const waChipsOnControl = await page
      .locator('[data-testid=question-link][href*="wa.me"], [data-testid=escalation-link][href*="wa.me"]')
      .count();
    expect(
      waChipsOnControl,
      "CONTROL: the whatsapp-primary page MUST produce wa.me chips. " +
        "If this is 0 the locator is broken and every 0 below is worthless."
    ).toBeGreaterThan(0);

    for (const { slug, method } of MATRIX) {
      if (method === "whatsapp") continue;
      await page.goto(url(slug), { waitUntil: "domcontentloaded" });
      const stray = page.locator(
        '[data-testid=question-link][href*="wa.me"], [data-testid=escalation-link][href*="wa.me"]'
      );
      await expect(
        stray,
        `${slug} (${method}-primary): question chips must contain no wa.me link (MEH-2154)`
      ).toHaveCount(0);
    }
  });

  test("beacon :: whatsapp-click fires on wa.me items and on nothing else", async ({
    page,
  }) => {
    const beacons: string[] = [];
    await page.route("**/api/producers/*/whatsapp-click", (route) => {
      beacons.push(route.request().url());
      return route.fulfill({ status: 204, body: "" });
    });

    // CONTROL: the whatsapp-primary page must fire one.
    await page.goto(url("sdot-zahav"), { waitUntil: "domcontentloaded" });
    // `:visible` because the question chips are inside ContactCard, which is
    // mounted twice (see the header note) — `.first()` alone resolves to the
    // display:none copy and the click times out.
    const waChip = page
      .locator('[data-testid=question-link][href*="wa.me"]:visible')
      .first();
    await waChip.evaluate((el) => el.setAttribute("target", "_blank"));
    await waChip.click({ noWaitAfter: true });
    await expect
      .poll(() => beacons.length, {
        message:
          "CONTROL: a wa.me chip click MUST fire the beacon. 0 here means the " +
          "route interception is broken, so the 0 asserted below proves nothing.",
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    // Now the real assertion: a non-wa.me primary CTA fires none.
    beacons.length = 0;
    await page.goto(url("beit-habad-sivan"), { waitUntil: "domcontentloaded" });
    const mailCta = visibleCta(page);
    await expect(mailCta).toHaveAttribute("data-method", "email");
    await mailCta.click({ noWaitAfter: true });
    // Give any stray beacon a bounded window to arrive (inverted wait — the
    // spec asserts something did NOT happen, so it must not depend on quiet).
    await page.waitForTimeout(1_500);
    expect(
      beacons,
      "a mailto: CTA opens no WhatsApp conversation and must fire no beacon (MEH-1426)"
    ).toHaveLength(0);
  });

  test("breakpoints :: exactly one primary CTA per viewport", async ({ page }) => {
    const slug = "machlevet-ramat-yotam";

    // Desktop — the sidebar mount is the visible one; the sticky bar is
    // suppressed outright (StickyContactBar.jsx:79 `lg:hidden`).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url(slug), { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("[data-testid=primary-contact-button]"),
      "both mounts are always in the DOM — the split, not the total, is the signal"
    ).toHaveCount(2);
    await expect(
      visibleCta(page),
      "1440px: exactly one primary CTA visible (the sidebar mount)"
    ).toHaveCount(1);
    await expect(
      page.locator("[data-testid=sticky-primary-cta]:visible"),
      "1440px: the sticky bar is lg:hidden"
    ).toHaveCount(0);

    // Mobile — the inline mount is the visible one.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url(slug), { waitUntil: "domcontentloaded" });
    await expect(
      visibleCta(page),
      "375px: exactly one primary CTA visible (the inline mount)"
    ).toHaveCount(1);
  });

  test("contact sheet :: 16 screenshots, 8 pages x 2 viewports", async ({ page }) => {
    for (const { slug, method } of MATRIX) {
      for (const [label, width, height] of [
        ["375", 375, 812],
        ["1440", 1440, 900],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(url(slug), { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load");
        await page.screenshot({
          path: `${ARTIFACT_DIR}/${method}-${slug}-${label}.png`,
          fullPage: false,
        });
      }
    }
  });
});
