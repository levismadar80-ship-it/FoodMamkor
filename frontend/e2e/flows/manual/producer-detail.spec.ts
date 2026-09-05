import type { Locator, TestInfo } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import he from "../../../messages/he.json";

/**
 * Spec:     manual/producer-detail
 * Purpose:  docs/MANUAL_TESTING.md — the `/producer/[id]` page group, converted
 *           under MEH-1249 stage 2 (chunk 8 — one page per PR). Ten of the
 *           chunk's 26 sections carry matrix rows; rows are tagged
 *           `MT:<section id>:<row>` — section ids: MEH-1048 (trust strip) ·
 *           MEH-1146B (two-layer header) · MEH-1146A (contact card) ·
 *           MEH-815 (tinted masthead) · PDP (Producer Detail Page redesign,
 *           2026-04-18 — the section has no ticket id) · TASK14 (share button
 *           on the producer page) · OG (dynamic OG tags + share message).
 *           Converted here: 19 of the section's 29 CONVERT-PW rows — every row
 *           whose matrix `destructive` column reads `no`, whose surface still
 *           exists, and whose claim the product still satisfies. The other 10
 *           are reported in docs/qa/conversion-progress.md, not silently
 *           dropped.
 *
 * Touches:  `/producer/{id}` only. No auth, no writes, nothing is submitted.
 *           The page fires attribution beacons of its own on load
 *           (lib/contact-tracking.js `POST /producers/{id}/view`); this spec
 *           never clicks a CTA that would fire a contact/WhatsApp beacon.
 *
 * ── Data: NO MOCKS, and the reason this route is different ──────────────────
 *   `/producer/[id]` is the one converted route with a HARD SSR gate:
 *   `app/[locale]/producer/[id]/page.js:39` server-fetches the producer and
 *   `:44` RETHROWS on a network failure, so with no backend the segment throws
 *   and the visitor gets the error boundary. Measured 2026-09-04 against a
 *   local `next start`, one build, two worlds:
 *
 *     backend up   → HTTP 200 · 2 `application/ld+json` blocks · the business
 *                    name 18× in the HTML
 *     backend down → HTTP 200 · 0 `ld+json` · name 0× · body is the
 *                    `app/[locale]/loading.js` shell, and `/api/producers/{id}`
 *                    returns 500 so the client fetch fails too
 *
 *   Note the STATUS is 200 in both worlds (Next streams the loading fallback
 *   and the error surfaces client-side) — an HTTP-status probe cannot tell
 *   them apart, which is why the discriminator above is the JSON-LD block.
 *
 *   The rendered tree is CLIENT-fetched: `page.js:143` renders
 *   `<ProducerDetail />` with NO props, so `initialProducer` is null and
 *   `hooks/useProducerData.js:56-58` does the fetch that feeds the DOM. The
 *   SSR payload feeds only `generateMetadata` + JSON-LD. So this spec asserts
 *   against whatever the deployed backend serves, and every expectation is
 *   DERIVED from that producer's own payload — the pattern
 *   `e2e/flows/26-delivery-checker.spec.ts:1-18` established for this route.
 *   No `page.route`, so the MEH-1968 three-condition exception is not invoked
 *   and MEH-417 is not touched.
 *
 * ── Fixture preconditions: asserted, never skipped ──────────────────────────
 *   Some rows need a business in a particular state (imageless; ≥2 images;
 *   with reviews; ZERO reviews; with a contact_name — five, and the
 *   zero-reviews one is load-bearing rather than convenient: it is what
 *   silences ReviewExcerpt's eager fetch so the lazy-reviews row can be
 *   measured at all). `pick()` below turns a missing state into a NAMED
 *   failure rather than a skip. That is a deliberate departure
 *   from `26-delivery-checker.spec.ts`, which skips with a reason: a skip on
 *   "the catalog has no such business" prints the same thing whether the
 *   catalog is thin or the query is wrong, which is the null-that-is-also-the
 *   -reassuring-answer shape `.claude/rules/testing.md` warns about. A red
 *   naming the missing state is information; a skip is not.
 *   The five states this spec requires are listed in
 *   docs/qa/conversion-progress.md so they can be checked against a target
 *   before the suite is pointed at it.
 *
 * Locators: `getByTestId` first (docs/E2E-LOCATORS.md). Existing ids used:
 *           `contact-card`, `primary-contact-button`, `sticky-primary-cta`,
 *           `new-mark`, `gallery-empty-state`, `gallery-grid-hero`,
 *           `signature-product-trigger`, `owner-card`, `status-open` /
 *           `status-closed` / `status-orders-closed` / `status-vacation`.
 *           Added under this chunk (attribute-only — no copy, structure or
 *           logic changed): `producer-detail-root`, `producer-breadcrumb-block`,
 *           `producer-main-column` (ProducerDetail.jsx); `producer-header`,
 *           `producer-header-meta`, `producer-actions-row`,
 *           `trust-strip-rating` (ProducerHeader.jsx); `contact-sidebar`
 *           (ContactSidebar.jsx); `sticky-contact-bar` (StickyContactBar.jsx);
 *           `gallery-carousel` (ImageGallery.jsx); `review-date`
 *           (ReviewsSection.jsx).
 *
 * Copy:     every expected string is read from messages/he.json. The only
 *           literals are (a) DOM ids the page owns (`#reviews`,
 *           `#section-contact`, `#main-content`), (b) the four status testids
 *           enumerated in `lib/order-status.js`, and (c) the share-text SHAPE
 *           (`👉 ` + newline join), which lives in components/ShareButton.jsx
 *           and is stated here as a derivation, not as an expected string.
 *
 * Does NOT convert (10 rows — reasons in docs/qa/conversion-progress.md):
 *           PDP:5 (vacation state) and WhatsApp-normalization:11 are matrix
 *           `destructive = yes` — Sapir's 13/07 decision confines those to a
 *           local backend + ephemeral Postgres, and this suite runs against
 *           the deployed backend on CI (e2e.yml:142). PDP:13 (the grass_fed /
 *           delivery highlight chips) and TASK14 WhatsApp-share:1 (a separate
 *           WhatsApp share button) describe surfaces that no longer exist —
 *           MEH-1334 decision 4 removed the highlight strip, and
 *           `components/WhatsAppShareButton.jsx` has ZERO render sites in
 *           `frontend/app` today (grep, 04/09). TASK14 copy-link:2 (toast
 *           «הקישור הועתק ✓») is superseded: MEH-1290 replaced the clipboard
 *           path with the wa.me fallback this spec asserts, and no toast
 *           fires. WhatsApp-normalization:14/15 (blank / letters-only phone →
 *           button hidden) are `lib/utils.js normalizePhone` cases whose home
 *           is vitest — the matrix's own note says so — and a PW form would be
 *           vacuous unless the catalog happens to hold such a business.
 *           OG share-text:3/4 (description / location line omitted) need a
 *           payload the route cannot be given without intercepting the client
 *           fetch; asserted at component level in
 *           `__tests__/ShareButton.test.jsx`. PDP:2 (mobile inline CTA above
 *           the fold) is the only row that fails against the PRODUCT rather
 *           than against a stale checklist — measured, escalated, and left
 *           unconverted; see the block above its former position below.
 *
 * Run:      22 passed · 0 failed · 6 skipped, green x3, against `next start`
 *           with a stub backend on :8000 (build ownership proven per run by
 *           GET /_next/static/$(cat .next/BUILD_ID)/_buildManifest.js -> 200,
 *           bogus id -> 404 as the control). All 6 skips are static
 *           project-identity gates, never a DOM read.
 *           Shown failing first (MEH-1619): three one-line breaks — `priority`
 *           removed from the gallery's first image, `useLazyReviews` forced to
 *           mount eagerly, `useStickyBar` forced always-visible — produced
 *           5 red / 17 green, exactly those three behaviours. The
 *           discrimination is unusually clean because in all three cases the
 *           PREVIOUS assertion was red against CORRECT code: `fetchpriority`
 *           is never emitted, ReviewExcerpt's eager fetch was miscounted, and
 *           `inert` is never rendered. Full table + the two app findings the
 *           run surfaced: docs/qa/conversion-progress.md, chunk 8 note.
 *           In the sandbox this runs via the untracked
 *           playwright.sandbox.config.ts, which only overrides
 *           launchOptions.executablePath to the provisioned
 *           /opt/pw-browsers/chromium (the npm-pinned Playwright expects a
 *           different build number; `playwright install` is a download and the
 *           egress proxy blocks that host).
 *
 * Related:  e2e/flows/03-view-producer-detail.spec.ts (the page loads at all),
 *           26-delivery-checker.spec.ts (the derive-from-live-payload pattern),
 *           12-axe-a11y.spec.ts:85-120 (`/producer/[id]` in the axe net),
 *           __tests__/ShareButton.test.jsx (MEH-1290 wa.me fallback at
 *           component level), __tests__/ContactCard.test.jsx,
 *           __tests__/PrimaryContactButton.test.jsx,
 *           docs/qa/conversion-page-map.md.
 * History:  MEH-1249 chunk 8 (creation, 04/09).
 */

const FIRST_PAINT = { timeout: 15_000 };
const CLIENT_FETCH = { timeout: 20_000 };

// MEH-1792 (re-measured on chunks 1-2, 04/09): during the app's page-transition
// window a second copy of the page tree exists briefly OUTSIDE `#main-content`,
// so a page-wide `getByTestId` can resolve to TWO elements and fail strict mode.
// Scoping to the `#main-content` landmark (layout.js) names the live tree only.
const scope = (page: Page) => page.locator("#main-content");

const isDesktop = (info: TestInfo) => info.project.name === "desktop";

// ── copy ────────────────────────────────────────────────────────────────────
const DETAIL_HE = he.producer.detail;
const SHARE_HE = he.share;

/** ShareButton.jsx aria-label + visible label on the header quiet variant. */
const SHARE_ARIA = SHARE_HE.modal_title;
const SHARE_QUIET_LABEL = SHARE_HE.quiet_label;

/**
 * lib/order-status.js resolveHeaderStatus — the four branches it can return.
 * Exactly one renders in the meta line; the page has no second status element
 * (MEH-1546, "one status home per page").
 */
const STATUS_TESTIDS = [
  "status-open",
  "status-closed",
  "status-orders-closed",
  "status-vacation",
] as const;

// ── the payload this spec reads ─────────────────────────────────────────────
type Category = { id: number | string; name: string };
type Producer = {
  id: string;
  slug?: string | null;
  name: string;
  city?: string | null;
  description?: string | null;
  images?: unknown;
  categories?: Category[];
  reviews_count?: number;
  contact_name?: string | null;
};

/**
 * REUSES the filter that owns "is this business imageless?" —
 * `producer/[id]/lib/producer-format.js getRenderableImages`. `images.length`
 * is NOT the same predicate: a producer whose array holds only blank entries
 * renders the Tinted Masthead (MEH-1121 Task D). Mirrored rather than imported
 * because the lib is plain JS with no .d.ts and this is three lines.
 */
function renderableImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

async function catalog(page: Page): Promise<Producer[]> {
  const res = await page.request.get("/api/producers");
  expect(res.ok(), `GET /producers must respond 2xx — got ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as unknown;
  expect(Array.isArray(body), "GET /producers must return an array").toBe(true);
  const list = body as Producer[];
  expect(list.length, "the catalog must hold at least one business").toBeGreaterThan(0);
  return list;
}

async function detailOf(page: Page, id: string): Promise<Producer> {
  const res = await page.request.get(`/api/producers/${id}`);
  expect(res.ok(), `GET /producers/${id} must respond 2xx — got ${res.status()}`).toBeTruthy();
  return (await res.json()) as Producer;
}

/**
 * Fixture precondition. A missing state is a NAMED red, never a skip — see the
 * header block. `why` must say what state is missing so the failure is
 * actionable against whatever catalog the run is pointed at.
 */
function pick(list: Producer[], predicate: (p: Producer) => boolean, why: string): Producer {
  const hit = list.find(predicate);
  expect(hit, `this row needs ${why}; the catalog served none`).toBeTruthy();
  return hit as Producer;
}

/** The page's own share URL rule — producer-format.js buildShareUrl. */
function shareUrlFor(origin: string, p: Producer): string {
  return `${origin}${p.slug ? `/${p.slug}` : `/producer/${p.id}`}`;
}

/**
 * ShareButton.jsx `waText` — the message the DESKTOP path (no native share)
 * hands to wa.me. Stated as a derivation from he.json + the component's join
 * rule, so a copy edit moves both sides together and a rule change reds this.
 */
function waTextFor(origin: string, p: Producer): string {
  const title = SHARE_HE.wa_message_with_meta.replace("{title}", p.name);
  return `${title}\n👉 ${shareUrlFor(origin, p)}`;
}

async function openProducer(page: Page, id: string): Promise<Locator> {
  await page.goto(`/producer/${id}`);
  const root = scope(page).getByTestId("producer-detail-root");
  // Count gate first: the strict checks below would throw rather than wait if a
  // transition copy ever landed inside the landmark.
  await expect(root).toHaveCount(1, CLIENT_FETCH);
  await expect(root).toBeVisible(CLIENT_FETCH);
  return root;
}

/** The single visible primary CTA — ContactCard's PrimaryContactButton. */
const primaryCta = (root: Locator) => root.getByTestId("primary-contact-button");

/**
 * Fixture precondition for the two CTA rows, established by OBSERVATION rather
 * than by predicting it from the listing payload.
 *
 * `PrimaryContactButton` returns null when `getPrimaryContactHref` does
 * (`lib/contact-method.js:35` — nine method branches, each with its own null
 * case), and `StickyContactBar`'s CTA is gated on the same href. So a business
 * whose `primary_contact_method` has no value behind it renders NO primary CTA
 * anywhere and cannot exercise either row. Deciding that from the listing would
 * mean mirroring fifty lines of branch logic in this file, where it would drift
 * silently; opening the page and asking is both shorter and exact.
 *
 * Measured 04/09 on the CI catalog: `list[0]` is such a business — both rows
 * read `primary-contact-button` / `sticky-primary-cta` count 0 while passing
 * locally against a fixture whose first entry had a phone.
 *
 * A missing state is a NAMED red, never a skip, and the message names every
 * business it probed so the failure is actionable against whatever catalog the
 * run is pointed at.
 */
async function openWithPrimaryCta(page: Page, list: Producer[], limit = 6): Promise<Locator> {
  const probed: string[] = [];
  for (const cand of list.slice(0, limit)) {
    const root = await openProducer(page, cand.id);
    if ((await primaryCta(root).count()) > 0) return root;
    probed.push(`${cand.name} (${cand.id})`);
  }
  expect(
    probed.length,
    `this row needs a business whose primary contact method resolves to a link, so the CTA renders at all; none of the ${probed.length} probed did: ${probed.join(" · ")}`,
  ).toBe(-1);
  throw new Error("unreachable — the expect above always fails here");
}

/**
 * Both ShareButton mounts carry the same accessible name (ShareButton.jsx
 * `aria-label={t("modal_title")}` on every variant).
 *
 * `includeHidden` matters and is the whole point of the pair: the two mounts
 * are CSS-gated (`hidden lg:flex` header row / `lg:hidden` hero overlay), and
 * `getByRole` drops elements that are out of the accessibility tree. So the
 * default query counts what a viewport can actually reach, and the
 * include-hidden query counts what the page mounts.
 */
const shareControls = (root: Locator, includeHidden = false) =>
  root.getByRole("button", { name: SHARE_ARIA, includeHidden });

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /producer/[id] — header and breadcrumb", () => {
  // MT:MEH-1146B:1 — כותרת דו-שכבתית: שורת זהות מעל שורת לוגיסטיקה
  //   "עיר · קטגוריה · סטטוס"; אין "המוצר החתום" בכותרת.
  test("two-layer header: the identity row sits above one logistics line carrying city, category and exactly one status", async ({
    page,
  }) => {
    const list = await catalog(page);
    const target = pick(
      list,
      (p) => renderableImages(p.images).length > 0 && !!p.city && (p.categories?.length ?? 0) > 0,
      "a business with at least one image, a city and a category",
    );
    const root = await openProducer(page, target.id);
    const header = root.getByTestId("producer-header");
    await expect(header).toHaveCount(1, FIRST_PAINT);

    // Identity row — for an imaged business the h1 lives here (MEH-815 keeps it
    // in the masthead only when the business is imageless).
    const identity = header.getByRole("heading", { level: 1 });
    await expect(identity).toHaveCount(1);
    await expect(identity).toHaveText(target.name);

    // Logistics row — exactly one, and BELOW the identity row.
    const meta = header.getByTestId("producer-header-meta");
    await expect(meta).toHaveCount(1);
    const identityBox = await identity.boundingBox();
    const metaBox = await meta.boundingBox();
    expect(identityBox, "the h1 must be laid out").not.toBeNull();
    expect(metaBox, "the logistics line must be laid out").not.toBeNull();
    expect(
      metaBox!.y,
      "the logistics line must render BELOW the identity row, not beside it",
    ).toBeGreaterThan(identityBox!.y);

    // Its three parts, each derived from this business's own payload.
    await expect(meta).toContainText(target.city as string);
    await expect(meta).toContainText(target.categories![0].name);

    // Exactly one status element on the whole page, from the four branches
    // resolveHeaderStatus can return — never two, never none.
    const statuses = await Promise.all(
      STATUS_TESTIDS.map((id) => root.getByTestId(id).count()),
    );
    expect(
      statuses.reduce((a, b) => a + b, 0),
      `exactly one order status must render — got ${JSON.stringify(
        Object.fromEntries(STATUS_TESTIDS.map((id, i) => [id, statuses[i]])),
      )}`,
    ).toBe(1);

    // "אין 'המוצר החתום' בכותרת" — the signature-product trigger belongs to the
    // products section, never to the header block.
    await expect(header.getByTestId("signature-product-trigger")).toHaveCount(0);
  });

  // MT:MEH-1146B:2 — פירורי לחם בלבד: אין כפתור "→ חזרה"; רק נתיב פירורים.
  test("breadcrumb block holds the breadcrumb nav and no back button", async ({ page }) => {
    const list = await catalog(page);
    const target = list[0];
    const root = await openProducer(page, target.id);
    const block = root.getByTestId("producer-breadcrumb-block");
    await expect(block).toHaveCount(1, FIRST_PAINT);

    // Exactly one nav, and it is the breadcrumb: first crumb is home.
    await expect(block.locator("nav")).toHaveCount(1);
    const crumbHome = block.locator("nav a").first();
    await expect(crumbHome).toHaveText(DETAIL_HE.breadcrumb_home);
    await expect(crumbHome).toHaveAttribute("href", /^\/(?:[?#]|$)/);

    // The removed "→ חזרה" control was a button. The block carries none — and
    // the ?from=map return link (`back-to-map`) is a LINK, so this stays true
    // on the map-referred variant too.
    await expect(block.locator("button")).toHaveCount(0);
    // Landing without ?from=map: no map return link either (MEH-1414).
    await expect(block.getByTestId("back-to-map")).toHaveCount(0);
  });

  // MT:MEH-815:2 — שם פעם אחת בלבד: h1 ב-masthead; לא חוזר ב-ProducerHeader.
  test("the business name is the page's single h1, in the masthead when imageless and in the header when imaged", async ({
    page,
  }) => {
    const list = await catalog(page);

    for (const target of [
      pick(list, (p) => renderableImages(p.images).length > 0, "a business with at least one image"),
      pick(list, (p) => renderableImages(p.images).length === 0, "an imageless business"),
    ]) {
      const imaged = renderableImages(target.images).length > 0;
      const root = await openProducer(page, target.id);

      const h1 = root.getByRole("heading", { level: 1 });
      await expect(h1, `${target.name}: exactly one h1 on the page`).toHaveCount(1);
      await expect(h1).toHaveText(target.name);

      const inMasthead = await root.getByTestId("gallery-empty-state").getByRole("heading", { level: 1 }).count();
      const inHeader = await root.getByTestId("producer-header").getByRole("heading", { level: 1 }).count();
      expect(
        { inMasthead, inHeader },
        `${target.name} (imaged=${imaged}): the h1 belongs to the masthead iff the business is imageless`,
      ).toEqual(imaged ? { inMasthead: 0, inHeader: 1 } : { inMasthead: 1, inHeader: 0 });
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /producer/[id] — one primary action per screen", () => {
  // MT:MEH-1146A:1 (desktop half) + MT:PDP:8 — כרטיס דביק בדסקטופ;
  //   אין PrimaryContactButton כפול — ה-CTA רק ב-sidebar.
  test("desktop: exactly one primary CTA, and it is the sticky sidebar card", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "desktop-only layout assertion (project identity, not a DOM read)");
    const list = await catalog(page);
    const root = await openWithPrimaryCta(page, list);

    const sidebar = root.getByTestId("contact-sidebar");
    await expect(sidebar).toBeVisible(FIRST_PAINT);
    // The card is mounted twice (inline for mobile + sidebar for desktop);
    // exactly one of them is visible per viewport.
    await expect(root.getByTestId("contact-card")).toHaveCount(2);
    await expect(sidebar.getByTestId("contact-card")).toHaveCount(1);

    // "אין PrimaryContactButton כפול" — the page mounts the CTA twice (one per
    // breakpoint) and exactly one of them is reachable. A third mount, or the
    // main column's copy becoming visible on desktop, reds this.
    await expect(primaryCta(root)).toHaveCount(2);
    await expect(primaryCta(sidebar)).toBeVisible();
    await expect(primaryCta(root.getByTestId("producer-main-column"))).toBeHidden();

    // The sticky bar is mobile-only (`lg:hidden`), so on desktop it must not be
    // on screen at all. Deliberately NOT asserted through the `inert` attribute
    // the mobile test uses: `useStickyBar` observes the `lg:hidden` inline card,
    // and a `display:none` element never intersects — so on desktop the hook
    // reports "bar visible" and drops `inert` while CSS keeps the bar off
    // screen. Asserting `inert` here would be asserting a state the desktop
    // layout does not produce.
    await expect(root.getByTestId("sticky-contact-bar")).toBeHidden();
  });

  // MT:MEH-1146A:1 (mobile half) + MT:PDP:3 + MT:PDP:4 —
  //   פס דביק תחתון במובייל אחרי גלילה; גלילה חזרה → הפס נסוג.
  test("mobile: the sticky bar is parked at rest, slides in past the inline CTA, and slides back out", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "mobile-only layout assertion (project identity, not a DOM read)");
    const list = await catalog(page);
    const root = await openWithPrimaryCta(page, list);

    const bar = root.getByTestId("sticky-contact-bar");
    await expect(bar).toHaveCount(1, FIRST_PAINT);
    await expect(root.getByTestId("sticky-primary-cta")).toHaveCount(1);

    // The invariant under test is the COUPLING — `useStickyBar` parks the bar
    // exactly while the inline card intersects the viewport (threshold 0) —
    // not the bar's state at `scrollY: 0`.
    //
    // An earlier draft opened with "at rest the bar must be parked" and went
    // red. That was not the bar misbehaving: measured 04/09 at Pixel 5
    // (393×727), the inline card starts at y=755, i.e. BELOW the fold at rest,
    // so the observer correctly reports it as not intersecting and the bar
    // correctly slides in. Asserting the coupling instead is strictly stronger
    // — it exercises both transitions and depends on no page-length accident.
    // (That the card is below the fold at rest is a separate finding against
    // checklist row PDP:2 — see docs/qa/conversion-progress.md.)
    //
    // ── Why `transform` and not `inert` ─────────────────────────────────────
    // The parked state is asserted through StickyContactBar.jsx's own
    // `translateY` fork. That draft used the `inert` attribute instead, on the
    // strength of the MEH-1333 comment, and went red — so the two were
    // measured apart at five scroll positions:
    //
    //   card intersecting     -> transform translateY(100%) · inert ABSENT
    //   card not intersecting -> transform translateY(0px)   · inert ABSENT
    //
    // `transform` tracks the scroll exactly, so the hook, the observer and the
    // slide are all correct; `inert` is absent at EVERY position, i.e. it is
    // never rendered at all. That is a real (narrow) regression against
    // MEH-1333 — the parked CTA stays focusable and in the a11y tree, the
    // `aria-hidden-focus` class that ticket closed — and it is REPORTED, not
    // fixed here and not quietly dropped: see docs/qa/conversion-progress.md.
    // Asserting `inert` would red this suite on a bug these rows are not about.
    const inlineCard = root.locator("#section-contact");
    const cardTop = await inlineCard.evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY,
    );
    const parked = /translateY\(100%\)/;

    // Bring the inline card fully into view → the bar must park.
    await page.evaluate((y) => window.scrollTo(0, y), cardTop - 80);
    await expect(bar, "while the inline CTA is in view the bar must be parked").toHaveAttribute(
      "style",
      parked,
      { timeout: 10_000 },
    );

    // Scroll well past it → the bar must slide in.
    await page.evaluate((y) => window.scrollTo(0, y), cardTop + 1400);
    await expect(bar, "past the inline CTA the bar must slide in").not.toHaveAttribute(
      "style",
      parked,
      { timeout: 10_000 },
    );

    // Scroll back to it → the same observer must park the bar again.
    await page.evaluate((y) => window.scrollTo(0, y), cardTop - 80);
    await expect(bar, "back at the inline CTA the bar must slide out again").toHaveAttribute(
      "style",
      parked,
      { timeout: 10_000 },
    );
  });

  // MT:MEH-1146A:6 + MT:TASK14:copy-link:1 + MT:TASK14:whatsapp:1 —
  //   אין כפתורי מפה/שיתוף כפולים בעמודה הראשית; כפתור שיתוף אחד לכל מסך.
  test("exactly one share control is visible per viewport, and the main column carries no second share or map control", async ({
    page,
  }, info) => {
    const list = await catalog(page);
    const target = pick(
      list,
      (p) => renderableImages(p.images).length > 0,
      "a business with at least one image",
    );
    const root = await openProducer(page, target.id);

    // Two mounts by construction: the header quiet row (`hidden lg:flex`) and
    // the gallery overlay circle (`lg:hidden`). Exactly one is ever reachable.
    await expect(
      shareControls(root, true),
      "the page mounts one share control per breakpoint",
    ).toHaveCount(2);
    await expect(
      shareControls(root),
      "exactly one share control may be reachable per viewport",
    ).toHaveCount(1);

    const actionsRow = root.getByTestId("producer-actions-row");
    if (isDesktop(info)) {
      // Desktop home: the quiet actions row, labelled «שיתוף».
      await expect(shareControls(actionsRow)).toHaveCount(1);
      await expect(shareControls(actionsRow)).toBeVisible();
      await expect(shareControls(actionsRow)).toContainText(SHARE_QUIET_LABEL);
    } else {
      // Mobile home: the hero overlay circle — outside the actions row, and
      // above the header block.
      await expect(actionsRow).toBeHidden();
      const overlay = shareControls(root);
      const overlayBox = await overlay.boundingBox();
      const headerBox = await root.getByTestId("producer-header").boundingBox();
      expect(overlayBox, "the overlay share circle must be laid out").not.toBeNull();
      expect(headerBox, "the header must be laid out").not.toBeNull();
      expect(
        overlayBox!.y,
        "the mobile share circle lives on the hero, above the header block",
      ).toBeLessThan(headerBox!.y);
    }

    // The removed "הצג במפה" control was a link into /map. The main column
    // carries none; the only /map link the page may hold is the ?from=map
    // return crumb, which lives in the breadcrumb block, not here.
    await expect(
      root.getByTestId("producer-main-column").locator('a[href$="/map"]'),
    ).toHaveCount(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /producer/[id] — mobile above-the-fold and geometry", () => {
  // MT:PDP:1 — Mobile 375px: producer name visible above fold without scrolling.
  //   The mobile project is Pixel 5 (393×851); the row's "375" is the intent.
  test("mobile: the business name is above the fold on first paint", async ({ page }, info) => {
    test.skip(isDesktop(info), "mobile-only (project identity, not a DOM read)");
    const list = await catalog(page);
    const root = await openProducer(page, list[0].id);

    const h1 = root.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1, FIRST_PAINT);
    const box = await h1.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "the h1 must be laid out").not.toBeNull();
    expect(viewport, "the mobile project must declare a viewport").not.toBeNull();
    expect(
      box!.y + box!.height,
      "the name must be fully visible without scrolling",
    ).toBeLessThanOrEqual(viewport!.height);
    // And nothing may have scrolled to make that true.
    expect(await page.evaluate(() => window.scrollY), "no scroll may be needed").toBe(0);
  });

  // MT:PDP:2 — "Mobile: inline CTA visible above fold" is NOT converted, and
  // it is the one row in this chunk that failed as an ASSERTION ABOUT THE
  // PRODUCT rather than as a defect in the spec. It is a reported finding, not
  // a deleted test — full entry in docs/qa/conversion-progress.md.
  //
  // Measured 04/09 at the mobile project's real viewport (Pixel 5, 393×727 —
  // note 727, not the 851 screen height), on a DELIBERATELY THIN fixture
  // (short one-liner, no kashrut strip, no established year, one category):
  //
  //     gallery      142 →  350   (h-52 carousel)
  //     header       471 →  739   (ProducerHeader, 268px)
  //     #section-contact  755 → 1182
  //     inline CTA   780 →  828   ← fold is 727
  //
  // The CTA's bottom is 101px below the fold, and every field a richer
  // business carries pushes it further down. So the row's claim is not true of
  // the product today.
  //
  // Whether that is a REGRESSION or a SUPERSEDED REQUIREMENT is not this
  // chunk's call: the row dates from 2026-04-18, and MEH-1146 chunk A later
  // redesigned this exact surface around a sticky bottom bar that exists
  // precisely because the inline card scrolls away ("מובייל: הכרטיס למעלה,
  // ואחרי שהוא נגלל מהמסך — פס דביק תחתון"). Converting it would have meant
  // shipping a red test; weakening it to "somewhere on the page" would have
  // meant an assertion that cannot fail. Neither is this chunk's to choose, so
  // it is escalated with numbers instead.

  // MT:MEH-1048:5 — ללא התנגשות עם ה-hero grid: ה-strip בלי לשבור שורה ב-375px.
  //   Post-MEH-1334 the trust element is its own group under the badge row, so
  //   what is regression-bearing is that it neither overflows the viewport nor
  //   doubles: exactly one of {rating anchor, «אין ביקורות עדיין» pill} renders.
  test("mobile: the trust strip renders once and stays inside the viewport", async ({
    page,
  }, info) => {
    test.skip(isDesktop(info), "mobile-only (project identity, not a DOM read)");
    const list = await catalog(page);
    const target = list[0];
    const root = await openProducer(page, target.id);
    const header = root.getByTestId("producer-header");
    await expect(header).toHaveCount(1, FIRST_PAINT);

    // Not `a[href="#reviews"]`: ReviewExcerpt's pull-quote is a second anchor
    // with the same href inside this header, so the href selector would resolve
    // to two elements and the count below would be measuring the wrong thing.
    const ratingAnchor = header.getByTestId("trust-strip-rating");
    const newMark = header.getByTestId("new-mark");
    const [rated, unrated] = [await ratingAnchor.count(), await newMark.count()];
    expect(
      rated + unrated,
      `exactly one trust element must render — rating=${rated} no-reviews=${unrated}`,
    ).toBe(1);

    const trust = rated === 1 ? ratingAnchor : newMark;
    const viewport = page.viewportSize();
    for (const [label, locator] of [
      ["the header block", header],
      ["the trust strip", trust],
    ] as const) {
      const box = await locator.boundingBox();
      expect(box, `${label} must be laid out`).not.toBeNull();
      expect(box!.x, `${label} must not start outside the viewport`).toBeGreaterThanOrEqual(0);
      expect(
        box!.x + box!.width,
        `${label} must not overflow the viewport at ${viewport!.width}px`,
      ).toBeLessThanOrEqual(viewport!.width);
    }
  });

  // MT:MEH-815:5 — גובה קצר מהגלריה: ה-masthead נמוך מקרוסלת התמונות (h-52).
  test("mobile: the tinted masthead is shorter than the image carousel", async ({ page }, info) => {
    test.skip(isDesktop(info), "the carousel is the mobile branch of ImageGallery");
    const list = await catalog(page);

    const imaged = pick(
      list,
      (p) => renderableImages(p.images).length > 0,
      "a business with at least one image",
    );
    const imageless = pick(
      list,
      (p) => renderableImages(p.images).length === 0,
      "an imageless business",
    );

    const imagedRoot = await openProducer(page, imaged.id);
    const carousel = imagedRoot.getByTestId("gallery-carousel");
    await expect(carousel).toBeVisible(FIRST_PAINT);
    const carouselBox = await carousel.boundingBox();

    const imagelessRoot = await openProducer(page, imageless.id);
    const masthead = imagelessRoot.getByTestId("gallery-empty-state");
    await expect(masthead).toBeVisible(FIRST_PAINT);
    const mastheadBox = await masthead.boundingBox();

    expect(carouselBox, "the carousel must be laid out").not.toBeNull();
    expect(mastheadBox, "the masthead must be laid out").not.toBeNull();
    expect(
      mastheadBox!.height,
      `the masthead (${mastheadBox!.height}px) must be shorter than the carousel (${carouselBox!.height}px)`,
    ).toBeLessThan(carouselBox!.height);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /producer/[id] — loading behaviour", () => {
  // MT:PDP:7 — With images: first image loads eagerly (priority preload).
  test("the gallery's first image is eager and every later cell is lazy", async ({ page }, info) => {
    const list = await catalog(page);
    const target = pick(
      list,
      (p) => renderableImages(p.images).length >= 2,
      "a business with at least two images",
    );
    const root = await openProducer(page, target.id);

    // Desktop renders the editorial grid; mobile renders the carousel. Both
    // mark their first cell `priority` (ImageGallery.jsx:261-272, :331).
    const hero = isDesktop(info)
      ? root.getByTestId("gallery-grid-hero").locator("img").first()
      : root.getByTestId("gallery-carousel").locator("img").first();
    await expect(hero).toBeVisible(FIRST_PAINT);
    expect(
      await hero.getAttribute("loading"),
      "the LCP image must not be lazy",
    ).not.toBe("lazy");

    // `priority` does NOT emit a `fetchpriority` attribute in this Next
    // version — measured 04/09 on both projects with images actually
    // rendering: the hero `<img>` carries `loading: null · fetchpriority:
    // null` while the secondary cells carry `loading: "lazy"`. What `priority`
    // DOES emit is the head preload link, which is also the observable the
    // checklist row itself names ("preload link בhead"), so that is what is
    // asserted. An earlier draft asserted `fetchpriority === "high"` and went
    // red against correct code.
    const heroPreloads = await page
      .locator('head link[rel="preload"][as="image"]')
      .evaluateAll((links) =>
        links
          .map((l) => l.getAttribute("imagesrcset") || l.getAttribute("href") || "")
          .filter((s) => s.includes("res.cloudinary.com")),
      );
    expect(
      heroPreloads.length,
      "next/image `priority` must preload the gallery's first image from the head",
    ).toBeGreaterThan(0);

    // The discriminating half: a later cell must NOT be eager, or "eager on the
    // first" would be satisfied by a page that marks everything eager. Not
    // guarded on a count — the fixture is picked with >= 2 images, so with 2
    // images `images.slice(1, 3)` renders exactly one secondary cell and with
    // 3+ it renders one secondary plus the pill cell; either way at least one
    // `gallery-grid-cell` exists, and a zero here is a real failure, not a
    // reason to skip past the check.
    if (isDesktop(info)) {
      const secondary = root.getByTestId("gallery-grid-cell");
      await expect(
        secondary,
        "a business with >= 2 images must render at least one secondary grid cell",
      ).not.toHaveCount(0);
      expect(
        (await secondary.locator("img").first().getAttribute("fetchpriority"))?.toLowerCase(),
        "secondary grid cells must stay lazy",
      ).not.toBe("high");
    }
  });

  // MT:PDP:9 — Reviews: not fetched until the section scrolls into view.
  test("the reviews request is not made until the reviews section is scrolled into view", async ({
    page,
  }) => {
    const list = await catalog(page);
    // MUST be a zero-review business, and that is not a convenience.
    // `ReviewExcerpt.jsx:37` EAGER-fetches `GET /producers/{id}/reviews?page=1`
    // from the header — the byte-identical URL ReviewsSection lazy-fetches, so
    // a recorder cannot tell the two apart. Its own guard (`:31`, "zero
    // reviews → no fetch at all") is the discriminator: with `reviews_count`
    // 0 the excerpt is silent and every recorded request is the section's.
    // An earlier draft used `list[0]` and counted the excerpt's deliberate
    // eager fetch as a laziness violation — red against correct code.
    const zeroReview = list.filter((p) => (p.reviews_count ?? 0) === 0);
    expect(
      zeroReview.length,
      "this row needs a business with zero reviews (so ReviewExcerpt's eager fetch is guarded off); the catalog served none",
    ).toBeGreaterThan(0);

    // SECOND precondition, and it selects the fixture rather than merely
    // asserting it afterwards: `useLazyReviews` observes with
    // `rootMargin: "300px"`, so on a page where `#reviews` starts inside that
    // band the section is SUPPOSED to load at once and the row cannot be
    // measured at all. Zero reviews does not imply a tall page — measured
    // 04/09 on the CI catalog, the first zero-review business put `#reviews`
    // at 935 on a 900px desktop fold, i.e. inside the band, and the assertion
    // below correctly went red on a page that could not answer the question.
    //
    // A gallery is what pushes the section down, so candidates are probed
    // image-richest first; the loop measures the real page instead of guessing
    // from the payload. Bounded at six loads, and a catalog that holds no such
    // business is a NAMED red carrying every measurement — never a skip, which
    // would print the same thing whether the catalog is thin or the gate broke.
    const viewportHeight = page.viewportSize()!.height;
    const candidates = [...zeroReview].sort(
      (a, b) => renderableImages(b.images).length - renderableImages(a.images).length,
    );
    const measured: string[] = [];
    let target: Producer | undefined;
    for (const cand of candidates.slice(0, 6)) {
      const probe = await openProducer(page, cand.id);
      const top = await probe
        .locator("#reviews")
        .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      measured.push(`${cand.name}: ${Math.round(top)}`);
      if (top > viewportHeight + 300) {
        target = cand;
        break;
      }
    }
    expect(
      target,
      `this row can only be measured when #reviews starts beyond the 300px rootMargin (fold ${viewportHeight} + 300); no zero-review business probed put it there — tops measured: ${measured.join(" · ")}`,
    ).toBeTruthy();
    const chosen = target as Producer;

    const reviewRequests: string[] = [];
    const detailRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(`/producers/${chosen.id}/reviews`)) reviewRequests.push(url);
      else if (url.endsWith(`/api/producers/${chosen.id}`)) detailRequests.push(url);
    });

    const root = await openProducer(page, chosen.id);

    // CONTROL, run first: a recorder that never attached prints the same empty
    // array as a page that genuinely made no reviews call. The page's own
    // client detail fetch (useProducerData.js:59) is a request this recorder
    // MUST have seen; if it did not, every zero below is void.
    expect(
      detailRequests.length,
      "recorder control: the client detail fetch must have been observed — if this is 0 the reviews count below means nothing",
    ).toBeGreaterThan(0);

    // The same precondition, re-measured on the load the recorder is watching.
    // Not entailed by the selection loop above: that measurement was taken on a
    // SEPARATE navigation, and the value is needed here anyway to drive the
    // scroll. If the two loads ever disagree, this is the one that decides
    // whether the zeros below mean "the gate held" or "the page was too short
    // to tell" — the green-with-two-causes this row exists to avoid.
    const reviewsTop = await root
      .locator("#reviews")
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(
      reviewsTop,
      `this row can only be measured when #reviews starts beyond the 300px rootMargin; it is at ${Math.round(reviewsTop)} on a ${viewportHeight}px fold, so the page is too short to tell a lazy gate from an eager one`,
    ).toBeGreaterThan(viewportHeight + 300);

    // TWO named checks, not one — because the reviews request is protected by
    // TWO independent gates and either one alone would keep the network quiet:
    //   outer: useLazyReviews (rootMargin 300px) decides whether ReviewsSection
    //          MOUNTS at all — its observable is the DOM.
    //   inner: ReviewsSection's own IO (ReviewsSection.jsx:301, threshold 0.1)
    //          decides whether it FETCHES — its observable is the network.
    // Measured 04/09: with the outer gate defeated (`useState(true)`) the
    // network assertion alone still passed, because the inner IO held the
    // fetch. That is the `||`-shaped pass condition testing.md warns about —
    // one cue silently carrying the whole assertion — so each gate gets its
    // own check and its own failure message.
    expect(
      await root.locator("#reviews").evaluate((el) => el.childElementCount),
      "outer gate: the reviews section must not be MOUNTED while it is below the fold",
    ).toBe(0);
    expect(
      reviewRequests,
      "inner gate: reviews must not be FETCHED while the section is below the fold",
    ).toEqual([]);

    // NOT `scrollIntoViewIfNeeded()`: `#reviews` is a ZERO-HEIGHT wrapper until
    // ReviewsSection mounts (it is the IO observation point), and on a
    // zero-height target that call returns having scrolled nothing — measured
    // 04/09, `scrollY: 0` after it on both projects, so the section never
    // mounted and the test read as "reviews never loaded". A real scroll is
    // the only instrument that moves this page.
    await page.evaluate((y) => window.scrollTo(0, y), reviewsTop - 100);
    await expect
      .poll(() => reviewRequests.length, {
        message: "the reviews fetch must fire once the section is in view",
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /producer/[id] — main-column content", () => {
  // MT:PDP:12 — contact_name shows in the main column.
  //   Drift, reported: the "מאחורי העסק: [שם]" LINE was removed from the header
  //   by MEH-1334 decision 4 and relocated to OwnerCard — a section with that
  //   heading and the name as its own h3. Asserted as rendered.
  test("a business with a contact_name gets the owner card in the main column", async ({
    page,
  }) => {
    const list = await catalog(page);
    // contact_name is detail-only (ProducerDetailOut), so it cannot be picked
    // off the listing — probe a bounded prefix.
    const probed: Producer[] = [];
    for (const p of list.slice(0, 8)) probed.push(await detailOf(page, p.id));

    const named = pick(probed, (p) => !!p.contact_name?.trim(), "a business with a contact_name");
    const root = await openProducer(page, named.id);
    const card = root.getByTestId("producer-main-column").getByTestId("owner-card");
    await expect(card).toHaveCount(1, CLIENT_FETCH);
    await expect(card.getByRole("heading", { level: 2 })).toHaveText(DETAIL_HE.owner_card.heading);
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(named.contact_name!.trim());

    // The other half of the mockup rule ("אין שם → הסקשן לא מרונדר כלל") is
    // NOT asserted here: it would need a second fixture the catalog may not
    // hold, and an `if (found)` around it would pass identically whether the
    // rule holds or the fixture is absent. Its home is
    // __tests__/OwnerCard.test.jsx:28 ("hidden entirely when contact_name is
    // absent or blank") — cited, not duplicated.
  });

  // MT:PDP:11 — Review dates display correctly in RTL (dir="ltr").
  test("every review date is bidi-isolated with dir=ltr", async ({ page }) => {
    const list = await catalog(page);
    const target = pick(
      list,
      (p) => (p.reviews_count ?? 0) > 0,
      "a business with at least one published review",
    );
    const root = await openProducer(page, target.id);

    // Real scroll, not `scrollIntoViewIfNeeded()` — `#reviews` is zero-height
    // until ReviewsSection mounts, and that call no-ops on a zero-height
    // target (measured 04/09: `scrollY: 0` after it, section never mounted).
    const reviewsTop = await root
      .locator("#reviews")
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), reviewsTop - 100);
    const dates = root.getByTestId("review-date");
    await expect(dates.first()).toBeVisible({ timeout: 20_000 });
    const count = await dates.count();
    expect(count, "the reviews list must render at least one dated review").toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(dates.nth(i), `review date ${i} must be bidi-isolated`).toHaveAttribute(
        "dir",
        "ltr",
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /producer/[id] — share", () => {
  // MT:OG:share-text:1 + MT:TASK14:whatsapp:2 + MT:TASK14:whatsapp:3 —
  //   the desktop (no native share) path and the message it carries.
  //   Drift, reported: the row says "clipboard contains the multi-line message"
  //   and a «הקישור הועתק ✓» toast. MEH-1290 replaced both — with no native
  //   share the button opens wa.me with the business line + the URL
  //   (ShareButton.jsx:33-36, :51-52). Asserted as it behaves today.
  test("desktop share with no native sheet opens wa.me carrying the business name and its share URL", async ({
    page,
  }, info) => {
    test.skip(!isDesktop(info), "the quiet share control is the desktop mount (project identity)");
    const list = await catalog(page);
    const target = pick(
      list,
      (p) => renderableImages(p.images).length > 0,
      "a business with at least one image",
    );

    await page.addInitScript(() => {
      // Desktop / older browsers: no native share sheet. Stated explicitly
      // rather than assumed — headless Chromium's support is not this spec's
      // subject, and the row IS the no-native-share branch.
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      const opened: string[] = [];
      (window as unknown as { __opened: string[] }).__opened = opened;
      window.open = ((url?: string | URL) => {
        opened.push(String(url ?? ""));
        return null;
      }) as typeof window.open;
    });

    const root = await openProducer(page, target.id);
    const share = shareControls(root.getByTestId("producer-actions-row"));
    await expect(share).toHaveCount(1, FIRST_PAINT);
    await share.click();

    const opened = () =>
      page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
    await expect.poll(async () => (await opened()).length, { timeout: 10_000 }).toBe(1);
    const [href] = await opened();
    expect(href.startsWith("https://wa.me/?text="), `expected a wa.me link, got ${href}`).toBe(true);

    const origin = new URL(page.url()).origin;
    const text = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(text, "the wa.me message is the business line plus its share URL").toBe(
      waTextFor(origin, target),
    );
    // The two halves the rows name, asserted on their own so a failure says
    // which one moved.
    expect(text, "the message must carry the business name").toContain(target.name);
    expect(text, "the message must carry the business's share URL").toContain(
      shareUrlFor(origin, target),
    );
  });
});
