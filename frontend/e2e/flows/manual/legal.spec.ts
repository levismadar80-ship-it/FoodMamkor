import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import he from "../../../messages/he.json";

/**
 * Spec:     manual/legal
 * Purpose:  docs/MANUAL_TESTING.md § `Legal pages (אפריל 2026)` — the legal
 *           route family, converted under MEH-1249 stage 2 (chunk 4 — one
 *           route family per PR). The section carries no ticket id, so its
 *           rows are tagged `MT:LEGAL:<n>` (n = the row's position in the
 *           checklist and in docs/qa/manual-testing-matrix.md, rows 613-626).
 *           Converted here: rows 1, 2, 8, 9, 10, 11 — the CONVERT-PW rows
 *           whose matrix `destructive` column reads `no` AND that live on a
 *           route this chunk owns.
 * Touches:  static SSG routes only — `/privacy`, `/terms`, `/accessibility`
 *           (+ the site-wide Footer and CookieBanner as rendered on
 *           `/privacy`). No API writes, no auth, nothing is submitted. The
 *           cookie test writes `localStorage["cookieConsent"]` inside its own
 *           fresh browser context, which is exactly what row 10's «חלון פרטי»
 *           asks for.
 * Locators: `getByTestId` first (docs/E2E-LOCATORS.md). This chunk adds
 *           attribute-only ids — `privacy-page` (privacy/page.js),
 *           `terms-page` (terms/page.js), `accessibility-page`
 *           (accessibility/page.js), `footer-utility-links` (Footer.jsx),
 *           `cookie-banner` / `cookie-accept-all` / `cookie-essential-only`
 *           (CookieBanner.jsx). Inside a page the spec scopes by the
 *           `<section id>` each page already renders (SECTION_IDS in the
 *           page files) and by element/role, never by literal text.
 * Copy:     every expected string is read from messages/he.json — legal copy
 *           is LOCKED (workflow rule 22), so nothing here may drift from the
 *           file that owns it. Section counts are DERIVED from the copy
 *           objects (`Object.keys(...)`), never typed in. The only literals
 *           are the accessibility page's phone `tel:` href (a literal in the
 *           page too, accessibility/page.js `href="tel:+972552553744"`), the
 *           `#section` DOM ids (page decisions, not copy), the footer link
 *           HREFS (page decisions, Footer.jsx utility list), and the
 *           localStorage key/value the banner writes (`cookieConsent` /
 *           `essential`, CookieBanner.jsx `accept()`).
 * Does NOT: convert row 3 (contact form submit → success block): matrix
 *           `destructive = yes` — a real POST /contact writes a
 *           `contact_messages` row and sends mail (backend covered at
 *           tests/test_api.py:1183+); the success-state UI stays a residual.
 *           Rows 4-7 are DEVICE-ONLY / COVERED / CONVERT-PYTEST / COVERED per
 *           the matrix and are reported, not converted. Row 12 (registration
 *           consent checkboxes) is COVERED live by
 *           e2e/flows/18-producer-register-wizard.spec.ts:151-156 and
 *           __tests__/RegisterProducerClient.test.jsx:356-366 — and the
 *           checklist's «כפתור disabled» is doc-vs-code drift: the submit
 *           button is `disabled={loading}` only (RegisterProducerClient.jsx
 *           :2072); an unchecked consent is a click → `role="alert"`
 *           (`:2058-2069`). Row 13 (DirectoryDisclaimer above the report
 *           button) lives on `/producer/[id]` — chunk 8's route, SSR-fetched
 *           from the backend (producer/[id]/page.js:39), so it cannot render
 *           without a live API — residual, deferred to chunk 8 (the mount
 *           order is ProducerSections.jsx:758 disclaimer → :781 ReportButton).
 *           Row 14 (the «מהמטבח של השכן» grid) is STALE: the /neighbor route
 *           and its grid were removed (MEH-598 → MEH-793; next.config.js:166-167
 *           redirects `/neighbor/*` to `/`), and the phrase is a BRAND.md
 *           lock violation — reported, not converted. No `/en/` row exists in
 *           this section, so no EN twin is asserted (locale switching is
 *           e2e/flows/14-language-toggle.spec.ts's subject).
 * Related:  e2e/flows/12-axe-a11y.spec.ts:178-188 (/contact, /accessibility,
 *           /terms, /privacy are in the axe net — cited, not duplicated),
 *           __tests__/PrivacyThirdPartyDisclosure.test.js (every
 *           THIRD_PARTY_ITEMS id has a string in both locales — cited; this
 *           spec asserts the RENDERED list), __tests__/CookieConsent.test.js
 *           :13-30 (trackEvent's consent gate reads the value this spec
 *           asserts is persisted), __tests__/CookieBannerNavClearance.test.jsx
 *           (banner geometry), __tests__/FooterNavGroups.test.jsx (the NAV
 *           column; this spec covers the copyright-bar utility list, which
 *           that test does not), docs/qa/conversion-page-map.md.
 * History:  MEH-1249 chunk 4 (creation, 04/09).
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
const PRIVACY_HE = he.privacy;
const TERMS_HE = he.terms;
const A11Y_HE = he.accessibility;
const FOOTER_HE = he.nav.footer;
const COOKIE_HE = he.modals.cookie_banner;

type TitledSection = { title: string };

/**
 * Section order on each page — the KEYS are stated (order + DOM id are page
 * decisions: `SECTION_IDS` in privacy/page.js / terms/page.js and `SECTIONS`
 * in accessibility/page.js); the TITLES are read from the copy. The privacy
 * page spells one key differently in the DOM (`third-parties`) than in the
 * copy (`third_parties`), hence the explicit mapping.
 */
const PRIVACY_SECTIONS = [
  "operator",
  "who",
  "data",
  "why",
  "third_parties",
  "rights",
  "cookies",
  "retention",
  "minors",
  "changes",
  "contact",
] as const;
const TERMS_SECTIONS = [
  "operator",
  "service",
  "licensing",
  "age",
  "responsibility",
  "verified",
  "report",
  "ip",
  "changes",
  "law",
  "privacy",
  "contact",
] as const;
const A11Y_SECTIONS = ["commitment", "standard", "features", "gaps", "contact", "authority"] as const;
const domId = (key: string) => key.replace(/_/g, "-");

/** Derived: the third-party list is one `<li>` per key in the copy object. */
const THIRD_PARTY_KEYS = Object.keys(PRIVACY_HE.sections.third_parties.items);
/** Derived: the accessibility features list is one `<li>` per `item_*` key. */
const A11Y_FEATURE_KEYS = Object.keys(A11Y_HE.sections.features).filter((k) => k.startsWith("item_"));

/**
 * Footer copyright-bar utility links (Footer.jsx utility list). Hrefs are page
 * decisions; labels come from the copy. Row 9 names four of these — מדיניות /
 * תנאי / נגישות / קשר — the page renders a fifth (`login`) today; asserted as
 * rendered, drift recorded in docs/qa/conversion-progress.md.
 */
const FOOTER_UTILITY = [
  { key: "login", href: "/login" },
  { key: "terms", href: "/terms" },
  { key: "privacy_short", href: "/privacy" },
  { key: "accessibility", href: "/accessibility" },
  { key: "contact", href: "/about#contact" },
] as const;

/** Literal in the page (accessibility/page.js) — the approved business line. */
const A11Y_PHONE_HREF = "tel:+972552553744";

/** CookieBanner.jsx `accept(mode)` — the storage contract ClarityScript.jsx and lib/analytics.js read. */
const CONSENT_KEY = "cookieConsent";
const CONSENT_ESSENTIAL = "essential";

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── helpers ─────────────────────────────────────────────────────────────────
async function gotoLegal(page: Page, testId: string, path: string): Promise<void> {
  await page.goto(path);
  // Count gate first (retries; the strict checks below would throw instead of
  // waiting if a stray copy ever landed INSIDE the landmark).
  await expect(scope(page).getByTestId(testId)).toHaveCount(1, FIRST_PAINT);
  await expect(scope(page).getByTestId(testId)).toBeVisible(FIRST_PAINT);
}

/** Every `<section id>` on a legal page, in order, with its h2 from the copy. */
async function assertSections(
  root: Locator,
  keys: readonly string[],
  sections: Record<string, TitledSection>,
): Promise<void> {
  // Exactly the stated sections — no extra, no missing.
  await expect(root.locator("section[id]")).toHaveCount(keys.length);
  for (const key of keys) {
    const section = root.locator(`section#${domId(key)}`);
    await expect(section).toHaveCount(1);
    await expect(section.getByRole("heading", { level: 2 })).toHaveText(sections[key].title);
  }
}

async function consentValue(page: Page): Promise<string | null> {
  return page.evaluate((k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }, CONSENT_KEY);
}

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /privacy (LEGAL)", () => {
  // MT:LEGAL:1 — /privacy — פתחי בדפדפן — מכיל "תיקון 13" ושם Cloudinary/Google.
  //   «תיקון 13» lives in `privacy.date_label` + `privacy.sections.rights.title`;
  //   Cloudinary / Google are the first two `third_parties.items` — all asserted
  //   verbatim from he.json, never as literals.
  test("privacy policy: locked title + h1, the Amendment-13 date line, every section, and the full third-party list", async ({
    page,
  }) => {
    await gotoLegal(page, "privacy-page", "/privacy");
    const root = scope(page).getByTestId("privacy-page");
    await expect(page).toHaveURL(/\/privacy(?:[/?#]|$)/);
    await expect(page).toHaveTitle(PRIVACY_HE.meta_title);
    await expect(root.getByRole("heading", { level: 1 })).toHaveText(PRIVACY_HE.heading);
    // The date line is the paragraph directly under the h1.
    await expect(root.locator("h1 + p")).toHaveText(PRIVACY_HE.date_label);

    await assertSections(root, PRIVACY_SECTIONS, PRIVACY_HE.sections);

    // Third parties: one <li> per processor in the copy, each rendered verbatim
    // (the <b> tags become <strong>; textContent is the tag-stripped string).
    const thirdParties = root.locator(`section#${domId("third_parties")}`);
    const items = thirdParties.locator("li");
    await expect(items).toHaveCount(THIRD_PARTY_KEYS.length);
    const rendered = await items.allTextContents();
    for (const key of THIRD_PARTY_KEYS) {
      const expected = stripTags(
        (PRIVACY_HE.sections.third_parties.items as Record<string, string>)[key],
      );
      expect(rendered.map((s) => s.trim()), `third-party entry «${key}» must render`).toContain(expected);
    }
    // The rights section's h2 is the other carrier of «תיקון 13»; the minors
    // clause is the 18+ statement — both verbatim.
    await expect(root.locator("section#rights").getByRole("heading", { level: 2 })).toHaveText(
      PRIVACY_HE.sections.rights.title,
    );
    await expect(root.locator("section#minors")).toContainText(PRIVACY_HE.sections.minors.body);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /terms (LEGAL)", () => {
  // MT:LEGAL:2 — /terms — פתחי בדפדפן — מכיל "חוק רישוי עסקים" ו-18+.
  //   «חוק רישוי עסקים» is inside `terms.sections.licensing.intro`; «18 ומעלה»
  //   inside `terms.sections.age.body` — both asserted verbatim from he.json.
  test("terms of use: locked title + h1 + date line, every section, the licensing clause and the 18+ clause verbatim, and the two in-page legal links", async ({
    page,
  }) => {
    await gotoLegal(page, "terms-page", "/terms");
    const root = scope(page).getByTestId("terms-page");
    await expect(page).toHaveURL(/\/terms(?:[/?#]|$)/);
    await expect(page).toHaveTitle(TERMS_HE.meta_title);
    await expect(root.getByRole("heading", { level: 1 })).toHaveText(TERMS_HE.heading);
    await expect(root.locator("h1 + p")).toHaveText(TERMS_HE.date_label);

    await assertSections(root, TERMS_SECTIONS, TERMS_HE.sections);

    const licensing = root.locator("section#licensing");
    await expect(licensing.locator("p").nth(0)).toHaveText(stripTags(TERMS_HE.sections.licensing.intro));
    await expect(licensing.locator("p").nth(1)).toHaveText(stripTags(TERMS_HE.sections.licensing.outro));
    await expect(root.locator("section#age")).toContainText(stripTags(TERMS_HE.sections.age.body));

    // The report section links to the contact form; the privacy section to the
    // policy (i18n Link, `localePrefix: "as-needed"` → no /he/ prefix).
    // The report section carries two anchors: a mailto and the contact-form link.
    await expect(root.locator("section#report a:not([href^='mailto:'])")).toHaveAttribute(
      "href",
      /^\/contact(?:[/?#]|$)/,
    );
    await expect(root.locator("section#privacy").getByRole("link")).toHaveAttribute(
      "href",
      /^\/privacy(?:[/?#]|$)/,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › /accessibility (LEGAL)", () => {
  // MT:LEGAL:8 — /accessibility — פתחי בדפדפן — מכיל תאריך עדכון ופרטי קשר.
  //   The update date is `accessibility.statement_date` (MEH-1059, תקנה 35) and
  //   the contact details are the `sections.contact.*` block — named coordinator,
  //   mailto link, phone line (MEH-1074) — all read from he.json.
  test("accessibility statement: locked title + h1, the two date lines, every section, the features list, and the coordinator's contact block", async ({
    page,
  }) => {
    await gotoLegal(page, "accessibility-page", "/accessibility");
    const root = scope(page).getByTestId("accessibility-page");
    await expect(page).toHaveURL(/\/accessibility(?:[/?#]|$)/);
    await expect(page).toHaveTitle(A11Y_HE.meta_title);
    await expect(root.getByRole("heading", { level: 1 })).toHaveText(A11Y_HE.heading);
    // Two lines under the h1: the statement date, then the last-check line.
    await expect(root.locator("h1 + p")).toHaveText(A11Y_HE.statement_date);
    await expect(root.locator("h1 + p + p")).toHaveText(A11Y_HE.date_label);

    await assertSections(root, A11Y_SECTIONS, A11Y_HE.sections);

    // Features: one <li> per `item_*` key, in copy order.
    const features = root.locator("section#features li");
    await expect(features).toHaveCount(A11Y_FEATURE_KEYS.length);
    for (let i = 0; i < A11Y_FEATURE_KEYS.length; i += 1) {
      await expect(features.nth(i)).toHaveText(
        (A11Y_HE.sections.features as Record<string, string>)[A11Y_FEATURE_KEYS[i]],
      );
    }

    // Contact block: intro, named coordinator, mailto, phone, footnote.
    const contact = root.locator("section#contact");
    const c = A11Y_HE.sections.contact;
    await expect(contact).toContainText(c.intro);
    await expect(contact).toContainText(`${c.coordinator_label} ${c.coordinator_value}`);
    await expect(contact).toContainText(c.phone_label);
    await expect(contact).toContainText(c.footnote);
    const mail = contact.locator("a[href^='mailto:']");
    await expect(mail).toHaveCount(1);
    const mailText = ((await mail.textContent()) ?? "").trim();
    expect(mailText, "the visible address must be an email").toMatch(EMAIL_RE);
    // The link points at the address it shows (CONTACT_EMAIL, env-driven —
    // asserted as self-consistent, not as a literal).
    await expect(mail).toHaveAttribute("href", `mailto:${mailText}`);
    const phone = contact.locator("a[href^='tel:']");
    await expect(phone).toHaveCount(1);
    await expect(phone).toHaveAttribute("href", A11Y_PHONE_HREF);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › footer legal links (LEGAL)", () => {
  // MT:LEGAL:9 — Footer — גללי למטה — 4 לינקים: מדיניות / תנאי / נגישות / קשר.
  //   Asserted on /privacy (the footer is site-wide; FooterSlot.jsx only swaps it
  //   on /map and the dashboard). The page renders FIVE utility links today —
  //   the four the row names plus «כניסה לחשבון» — and «קשר» resolves to
  //   `/about#contact` (MEH-1312), not `/contact`. Asserted as rendered.
  test("copyright bar: the utility list carries every legal link with its locked label and href", async ({ page }) => {
    await gotoLegal(page, "privacy-page", "/privacy");
    const footer = page.locator("footer");
    await expect(footer).toHaveCount(1);
    const list = footer.getByTestId("footer-utility-links");
    await expect(list).toHaveCount(1);
    await list.scrollIntoViewIfNeeded();
    // Exactly the stated links — a dropped or duplicated entry moves the count.
    await expect(list.getByRole("link")).toHaveCount(FOOTER_UTILITY.length);
    for (const { key, href } of FOOTER_UTILITY) {
      const label = (FOOTER_HE as Record<string, string>)[key];
      const link = list.getByRole("link", { name: label, exact: true });
      await expect(link, `footer link «${key}»`).toHaveCount(1);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("manual › cookie banner (LEGAL)", () => {
  // MT:LEGAL:10 — Cookie banner — כנסי בחלון פרטי — מופיע עם 2 כפתורים.
  //   Every Playwright test runs in a fresh browser context (no localStorage),
  //   which IS the private-window condition the row describes.
  test("fresh context: the banner renders once, labelled, with exactly two consent buttons and a link to the policy", async ({
    page,
  }) => {
    await gotoLegal(page, "privacy-page", "/privacy");
    expect(await consentValue(page), "a fresh context must carry no consent").toBeNull();
    const banner = page.getByTestId("cookie-banner");
    await expect(banner).toHaveCount(1, FIRST_PAINT);
    await expect(banner).toBeVisible(FIRST_PAINT);
    await expect(banner).toHaveAttribute("role", "region");
    await expect(banner).toHaveAttribute("aria-label", COOKIE_HE.aria_label);
    await expect(banner).toContainText(stripTags(COOKIE_HE.message));
    await expect(banner.getByRole("link")).toHaveAttribute("href", /^\/privacy(?:[/?#]|$)/);
    // Exactly two buttons, each with its locked label.
    await expect(banner.getByRole("button")).toHaveCount(2);
    await expect(banner.getByTestId("cookie-accept-all")).toHaveText(COOKIE_HE.accept_all);
    await expect(banner.getByTestId("cookie-essential-only")).toHaveText(COOKIE_HE.essential_only);
  });

  // MT:LEGAL:11 — "רק הכרחיים" — לחצי — banner נעלם, analytics לא נטען.
  //   «analytics לא נטען» is asserted through the contract both loaders read:
  //   ClarityScript.jsx:11 and lib/analytics.js:44 gate on
  //   localStorage.cookieConsent === "all", so persisting "essential" is what
  //   keeps them off (the trackEvent half is guarded at unit level by
  //   __tests__/CookieConsent.test.js:13-30). The DOM/network half — no
  //   `#ms-clarity` script, no clarity.ms / posthog request — is asserted too,
  //   but note it is NON-discriminating on a build without
  //   NEXT_PUBLIC_CLARITY_PROJECT_ID / NEXT_PUBLIC_POSTHOG_KEY (layout.js:267
  //   mounts ClarityScript only when the id is set), so a request recorder
  //   CONTROL proves the recorder saw traffic at all before its empty analytics
  //   list is read as evidence.
  test("«essential only»: the banner is dismissed, «essential» persists across a reload, and no analytics loads", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await gotoLegal(page, "privacy-page", "/privacy");
    const banner = page.getByTestId("cookie-banner");
    await expect(banner).toHaveCount(1, FIRST_PAINT);
    await banner.getByTestId("cookie-essential-only").click();

    await expect(banner).toHaveCount(0);
    expect(await consentValue(page)).toBe(CONSENT_ESSENTIAL);

    // Persists: a reload in the same context never shows the banner again.
    await page.reload();
    await expect(scope(page).getByTestId("privacy-page")).toHaveCount(1, FIRST_PAINT);
    await expect(scope(page).getByTestId("privacy-page")).toBeVisible(FIRST_PAINT);
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    expect(await consentValue(page)).toBe(CONSENT_ESSENTIAL);

    // Analytics stayed off. CONTROL first: the recorder must have seen the
    // page's own traffic, or its empty analytics list below is worthless.
    expect(requests.length, "request recorder saw no traffic — every null below is void").toBeGreaterThan(0);
    const analytics = requests.filter((u) => /clarity\.ms|posthog\.com/i.test(u));
    expect(analytics, "no analytics request may fire under «essential»").toEqual([]);
    await expect(page.locator("script#ms-clarity")).toHaveCount(0);
  });
});

// MT:LEGAL:3 — /contact submit → «תודה!…»: NOT converted — matrix destructive = yes (real POST /contact
//   writes contact_messages + sends mail; backend covered tests/test_api.py:1183+). Residual.
// MT:LEGAL:4 — email to CONTACT_EMAIL, From not spoofed: DEVICE-ONLY (live inbox, tests/CLAUDE.md MEH-325).
// MT:LEGAL:5 — contact_messages row: COVERED tests/test_api.py:1183 (`test_submit_contact_saves_to_db`).
// MT:LEGAL:6 — 6th contact from one IP → 429: CONVERT-PYTEST (limiter marketing.py:170), not a PW row.
// MT:LEGAL:7 — mail transport down → still 200 + row saved: COVERED tests/test_api.py:1349 + :1336.
// MT:LEGAL:12 — registration without consent checkboxes: COVERED (live behaviour = click → alert, not a
//   disabled button) e2e/flows/18-producer-register-wizard.spec.ts:151-156 +
//   __tests__/RegisterProducerClient.test.jsx:356-366. Doc-vs-code drift recorded.
// MT:LEGAL:13 — DirectoryDisclaimer above the report button on /producer/[id]: residual → chunk 8
//   (SSR route, needs a live backend; ProducerSections.jsx:758 → :781 order).
// MT:LEGAL:14 — DirectoryDisclaimer on the «מהמטבח של השכן» grid: STALE — the grid no longer exists
//   (MEH-598 → MEH-793; next.config.js:166-167 redirects /neighbor/* → /).
