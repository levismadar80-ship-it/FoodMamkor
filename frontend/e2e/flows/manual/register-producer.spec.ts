import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "../_cloudinary-stub";
import { LICENSE_REQUIRED_CATEGORIES } from "../../../lib/license-required-categories";

/**
 * Spec:     manual/register-producer
 * Purpose:  docs/MANUAL_TESTING.md → the `/register/producer` sections,
 *           converted under MEH-1249 stage 2 (chunk 9 — one page per PR).
 *           Every test carries a `// MT:<section>:<n>` marker naming the
 *           matrix row it discharges (docs/qa/manual-testing-matrix.md).
 * Touches:  READ PATH ONLY. `GET /categories` (frame 02) is the single API
 *           call any test here depends on. Nothing is submitted: no
 *           `POST /auth/register/producer`, no account created, no WhatsApp.
 *           That is deliberate — see § "What this file does NOT convert".
 * Does NOT: assert the wizard's submit, its success screen, or any funnel
 *           event that only exists in a dev build. Those rows are named
 *           below with their reasons; they are deferred, not forgotten.
 * Locators: `getByTestId` only (docs/E2E-LOCATORS.md), except where the
 *           element is addressed by ARIA role inside a testid'd wrapper —
 *           the combobox/listbox/option triple of CitySearch and
 *           CitiesAutocomplete, which `flows/18-producer-register-wizard.spec.ts:67`
 *           already reaches the same way. Roles are copy-independent, which
 *           is the property the locator rule exists to protect.
 * Related:  frontend/e2e/flows/18-producer-register-wizard.spec.ts (the
 *           MEH-866 wizard walk — ACCOUNT→CONFIRM against a mocked submit,
 *           the ARIA error states, and the MEH-971 license-pending bypass).
 *           This file does not repeat any of it.
 * History:  MEH-1249 chunk 9 (creation).
 *
 * ── What this file does NOT convert, and why ────────────────────────────────
 *
 * 10 of the 33 in-matrix rows on this page are matrix-`destructive = yes`.
 * Sapir's 13/07 decision binds: a destructive row runs ONLY against a local
 * backend + ephemeral Postgres (`scripts/local-backend.sh`), NEVER against the
 * deployed backend — and `e2e.yml` points `/api/*` at Railway staging. So
 * every row whose subject is a completed registration stays out of this file:
 *   · MEH-435 row 2 (submitted + error events)
 *   · MEH-853 rows 2-5 (city/address in the POST body; both paths; the freeze)
 *   · MEH-287 rows 1-5 (the WhatsApp welcome and both success-screen banners)
 * Mocking `POST /auth/register/producer` to reach the success screen is exactly
 * the case the MEH-1968 three-condition exception has to settle first, and that
 * ruling is OPEN (PR #3379 is parked on it). Do not route around it here.
 *
 * MEH-435 row 1 (`[track] producer_register_step_viewed` in the console) is
 * NOT converted for a different and more mechanical reason:
 * `frontend/lib/analytics.js:45-48` emits that console line only when
 * `process.env.NODE_ENV !== "production"`. The E2E target is a production
 * `next build && next start` (e2e.yml), so the line provably never appears
 * there — a console-listener spec would report zero logs on a healthy build
 * and on a broken one alike. That is a null that is also the reassuring
 * answer (.claude/rules/testing.md), so the row is reported rather than
 * converted. Its consent half is already covered by
 * `frontend/__tests__/CookieConsent.test.js:13-31`.
 */

const REGISTER = "/register/producer";

/** The matrix's `city autocomplete` row needs a query that matches ≥1 entry of
 *  the STATIC list CitySearch filters (`frontend/data/cities.js` — merged with
 *  `GET /cities` only when `useBackend` is passed, which the wizard does not).
 *  Two chars is also the component's own `q.length < 2` threshold, so the two
 *  states below are the boundary either side of it. */
const CITY_QUERY_TOO_SHORT = "ת";
const CITY_QUERY = "תל א";

/** A valid Israeli mobile number — `validateIsraeliPhone` gates the
 *  DETAILS→CATEGORY advance (RegisterProducerClient.jsx:90). */
const PHONE = "0501234567";

/** Computed `direction`, not the `dir` attribute: the RTL rows are about what
 *  the browser actually lays the field out as. An attribute read would pass on
 *  an element whose direction is overridden by CSS. */
async function directionOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).direction);
}

/** Pre-flight → ACCOUNT. MEH-994 put an intro screen in front of frame 01. */
async function startWizard(page: Page) {
  await page.goto(REGISTER);
  await expect(page.getByTestId("register-preflight")).toBeVisible();
  await page.getByTestId("register-preflight-start").click();
  await expect(page.getByTestId("register-frame-account")).toBeVisible();
}

/** ACCOUNT → DETAILS. The email is unique per run but NOTHING is submitted,
 *  so no account is created and the `/auth/register` limiter is untouched. */
async function gotoDetails(page: Page) {
  await startWizard(page);
  await page.getByTestId("register-account-name").fill("טסט בדיקה");
  await page.getByTestId("register-account-email").fill(`c9+${Date.now()}@mehamakor.online`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();
  await expect(page.getByTestId("register-frame-details")).toBeVisible();
}

/** Fill the three fields CROSS_STEP_REQUIRED gates DETAILS on
 *  (RegisterProducerClient.jsx:77-98) and advance to CATEGORY. The city must
 *  be PICKED from the listbox — MEH-213 forbids free text, and typing alone
 *  leaves `form.city` set but is not what a seller does. */
async function gotoCategory(page: Page) {
  await gotoDetails(page);
  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill(PHONE);
  const city = page.getByTestId("register-details-city");
  await city.getByRole("combobox").fill(CITY_QUERY);
  await city.getByRole("option").first().click();
  await page.getByTestId("register-details-next").click();
  await expect(page.getByTestId("register-frame-category")).toBeVisible();
}

/**
 * CATEGORY → STORY, with the fixture state ESTABLISHED rather than assumed.
 *
 * The CATEGORY→STORY gate blocks when the selected category requires a
 * producer licence and no number is entered (RegisterProducerClient.jsx:1721-1730).
 * `licenseRequired` is derived from the category NAME against
 * `lib/license-required-categories.js` — the same module imported at the top of
 * this file, so this is the real predicate and not a second copy of it.
 *
 * Reading the live catalogue and picking a category the predicate says is
 * licence-FREE is what makes the advance deterministic on any catalogue. A
 * positional pick (`the first chip`) is what put chunk 8 red on CI.
 *
 * If no such category exists, this fails loudly and names every category it
 * probed — never a skip, never an `if (found)` around the assertion.
 */
async function pickLicenceFreeCategoryAndAdvance(page: Page) {
  const res = await page.request.get("/api/categories");
  expect(res.ok(), `GET /api/categories must answer — got ${res.status()}`).toBe(true);
  const catalogue = (await res.json()) as Array<{ id: number; name: string }>;
  expect(
    catalogue.length,
    "GET /api/categories returned an empty catalogue — the CATEGORY frame cannot render a chip",
  ).toBeGreaterThan(0);

  const free = catalogue.filter((c) => !LICENSE_REQUIRED_CATEGORIES.includes(c.name));
  expect(
    free.length,
    `no licence-free category in the live catalogue; probed ${catalogue.length}: ` +
      `${catalogue.map((c) => c.name).join(" · ")}`,
  ).toBeGreaterThan(0);

  const chosen = free[0];
  // CategorySelector shows only the POPULAR-6 until a query is typed
  // (CategorySelector.jsx:135-140); typing renders the whole catalogue, so the
  // chosen chip is present whether or not it is one of the six.
  await page.getByTestId("category-search").fill(chosen.name);
  await page.getByTestId(`category-chip-${chosen.id}`).click();
  await page.getByTestId("register-category-next").click();
  await expect(
    page.getByTestId("register-frame-story"),
    `CATEGORY→STORY blocked on «${chosen.name}», which the licence predicate calls licence-free`,
  ).toBeVisible();
}

test.describe("/register/producer — MANUAL_TESTING conversion (MEH-1249 chunk 9)", () => {
  // MT:MEH-994:4 — «קישור התהליך» on the pre-flight screen → /about/process.
  test("pre-flight: the acceptance-process link navigates to /about/process", async ({ page }) => {
    await page.goto(REGISTER);
    await expect(page.getByTestId("register-preflight")).toBeVisible();

    await page.getByTestId("register-preflight-process-link").click();

    await expect(page).toHaveURL(/\/about\/process(\?|#|$)/);
    // The URL alone is not arrival — assert the destination actually rendered.
    // `process-hero` belongs to a page OUTSIDE this spec's scope:
    // app/[locale]/about/process/AboutProcessClient.jsx:123. Named here so a
    // rename or removal there points at its source instead of leaving this
    // failure looking like a bug on /register/producer.
    await expect(page.getByTestId("process-hero")).toBeVisible();
  });

  // MT:MEH-994:5 — a reload after «מתחילים» returns the pre-flight, because no
  // flag remembers it was dismissed (`showPreflight` is plain useState,
  // RegisterProducerClient.jsx:235).
  test("pre-flight: a reload returns it, and no localStorage flag remembers it", async ({ page }) => {
    await startWizard(page);

    // Typing on ACCOUNT writes the MEH-1769 draft (saveDraft →
    // RegisterProducerClient.jsx:493-496). That write is this test's CONTROL:
    // it proves the key scan below can SEE a key. Without it, "no preflight
    // key" and "the scan read nothing at all" are the same output.
    await page.getByTestId("register-account-name").fill("טסט בדיקה");
    const keysBefore = await page.evaluate(() => Object.keys(localStorage));
    expect(
      keysBefore,
      "control: the draft key must be present, otherwise the localStorage scan below reads nothing and its null is worthless",
    ).toContain("producer_registration_draft");

    await page.reload();

    await expect(page.getByTestId("register-preflight")).toBeVisible();
    await expect(page.getByTestId("register-frame-account")).not.toBeVisible();

    const keysAfter = await page.evaluate(() => Object.keys(localStorage));
    expect(keysAfter, "control: the scan still sees keys after the reload").toContain(
      "producer_registration_draft",
    );
    expect(
      keysAfter.filter((k) => /preflight/i.test(k)),
      "the pre-flight must not persist a dismissal flag (MEH-994: by design)",
    ).toEqual([]);
  });

  // MT:MEH-853:1 — city autocomplete: dropdown opens, a pick fills the field,
  // ✕ clears it. Both sides of the component's own 2-character threshold are
  // asserted (CitySearch.jsx:84 `if (q.length < 2) return []`) — the 5-state
  // rule's "0 items / 1 / many" applied to a reveal.
  test("DETAILS city: under 2 chars no list, 2+ opens it, a pick fills, ✕ clears", async ({ page }) => {
    await gotoDetails(page);

    const city = page.getByTestId("register-details-city");
    const input = city.getByRole("combobox");

    await input.fill(CITY_QUERY_TOO_SHORT);
    await expect(
      city.getByRole("listbox"),
      "one character is below the component's own 2-char threshold — no list may open",
    ).toHaveCount(0);

    await input.fill(CITY_QUERY);
    await expect(city.getByRole("listbox")).toBeVisible();
    const options = city.getByRole("option");
    const count = await options.count();
    expect(count, `«${CITY_QUERY}» matched no city in the static list`).toBeGreaterThan(0);
    for (const text of await options.allTextContents()) {
      expect(text, "every suggestion must contain the typed query").toContain(CITY_QUERY);
    }

    const picked = (await options.first().textContent())?.trim() ?? "";
    expect(picked.length, "the first suggestion must carry text").toBeGreaterThan(0);
    await options.first().click();
    await expect(input).toHaveValue(picked);
    await expect(city.getByRole("listbox"), "the list closes on pick").toHaveCount(0);

    // The ✕ renders only while the field has a value (CitySearch.jsx:198), so
    // it is present here by construction rather than by luck.
    await city.getByRole("button").click();
    await expect(input).toHaveValue("");
  });

  // MT:Registration-forms-RTL:6 — «/register/producer שלב 1 — שדה שם מלא — RTL».
  // Asserted together with the two fields the same section calls intentionally
  // LTR on the sibling /register page: name RTL *while* email and password are
  // LTR is a claim the whole-document dir cannot satisfy on its own, so this
  // goes red if any of the three `dir` attributes is dropped.
  test("ACCOUNT: full-name is RTL while email and password stay LTR", async ({ page }) => {
    await startWizard(page);

    expect(await directionOf(page.getByTestId("register-account-name"))).toBe("rtl");
    expect(await directionOf(page.getByTestId("register-account-email"))).toBe("ltr");
    expect(await directionOf(page.getByTestId("register-account-password"))).toBe("ltr");
  });

  // MT:Registration-forms-RTL:7 (שם העסק) + MT:Registration-forms-RTL:9 (עיר).
  // Same shape as ACCOUNT: the LTR phone field is the discriminator.
  test("DETAILS: business name and city are RTL while phone stays LTR", async ({ page }) => {
    await gotoDetails(page);

    expect(await directionOf(page.getByTestId("register-details-name"))).toBe("rtl");
    expect(await directionOf(page.getByTestId("register-details-city").getByRole("combobox"))).toBe(
      "rtl",
    );
    expect(await directionOf(page.getByTestId("register-details-phone"))).toBe("ltr");
  });

  // MT:Registration-forms-RTL:10 — the surviving half. The item says «שלב 3 —
  // שדות "עיר משלוח" ו-"יום משלוח"»; the delivery block is on DETAILS (step 2)
  // and there is no delivery-DAY field anywhere in the wizard. See the chunk-9
  // drift table in docs/qa/conversion-progress.md.
  test("DETAILS: the delivery-cities combobox is RTL once delivery is declared", async ({ page }) => {
    await gotoDetails(page);

    // Establish the state the row is about instead of assuming it: the block is
    // conditionally rendered on `offers_delivery` (RegisterProducerClient.jsx:1440),
    // and on `!delivery_nationwide` under it.
    await expect(page.getByTestId("register-delivery-cities")).toHaveCount(0);
    await page.getByTestId("register-offers-delivery").check();
    await expect(page.getByTestId("register-delivery-nationwide")).not.toBeChecked();

    const cities = page.getByTestId("register-delivery-cities");
    await expect(cities).toBeVisible();
    expect(await directionOf(cities.getByRole("combobox"))).toBe("rtl");
  });

  // MT:Registration-forms-RTL:8 — «textarea תיאור העסק — RTL». The item places
  // it on שלב 2; it lives on STORY (step 4) and its label reads
  // «ספרו על העסק שלך». Both recorded as drift; the direction is asserted where
  // the field actually is.
  test("STORY: the business-description textarea is RTL", async ({ page }) => {
    await gotoCategory(page);
    await pickLicenceFreeCategoryAndAdvance(page);

    const description = page.getByTestId("register-story-description");
    await expect(description).toBeVisible();
    expect(await directionOf(description)).toBe("rtl");
  });

  // MT:MEH-435:3 — «no-op בלי מפתח»: with no NEXT_PUBLIC_POSTHOG_KEY in the
  // build, walking the funnel must issue ZERO PostHog requests.
  //
  // Two things make this a signal rather than a coincidence:
  //   · consent is pre-set to "all", so `trackEvent`'s consent gate
  //     (analytics.js:41) is NOT what produces the zero — the missing key is;
  //   · the recorder's own liveness is asserted (it saw other requests) and the
  //     frames are asserted to have advanced, so `trackEvent` really ran.
  // Without those, "zero PostHog requests" is equally the output of a page that
  // never loaded.
  test("no PostHog request is issued when the build carries no key", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("cookieConsent", "all");
      } catch {
        /* private mode — the assertion below reports it */
      }
    });

    const seen: string[] = [];
    page.on("request", (r) => seen.push(r.url()));

    await gotoDetails(page);
    await expect(page.getByTestId("register-frame-details")).toBeVisible();

    expect(
      await page.evaluate(() => localStorage.getItem("cookieConsent")),
      "consent must be 'all', otherwise trackEvent returns at the consent gate and the zero below means nothing",
    ).toBe("all");
    expect(seen.length, "control: the request recorder must have seen traffic").toBeGreaterThan(0);
    expect(
      seen.filter((u) => /posthog/i.test(u)),
      "posthog-js must not be loaded and no event may be sent without a key",
    ).toEqual([]);
  });
});
