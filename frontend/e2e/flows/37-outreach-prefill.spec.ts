/**
 * MEH-2238 — the outreach prefill link, end to end.
 *
 * THE FLOW UNDER TEST, in Sapir's words: she picks a real business out of the
 * outreach spreadsheet, saves it as a lead, clicks «הכן פרופיל», and sends the
 * copied link on WhatsApp. The owner taps it on her phone and lands on a
 * registration form that already knows who she is.
 *
 * ─── SCOPE, and why it is shaped this way ──────────────────────────────────
 *
 * **Setup runs through the admin API, assertions run through the UI.** Leads
 * are created and deleted with `authedContext("admin")` (e2e/auth-fixture.ts)
 * rather than by driving the AddLeadModal for every fixture. The subject of
 * this spec is the LINK — what it carries and what the registration form does
 * with it — not the create form, and a modal round-trip per fixture would be a
 * flake surface for something nobody is asserting. The modal IS driven
 * directly in the one test whose subject is the modal (the 409 duplicate).
 *
 * **That is not a mock (e2e/CLAUDE.md, "Distinguish a stub from a mock").**
 * Every request here hits the real backend; the API context is a login
 * shortcut, which is what `auth-fixture.ts` exists for and what specs 19, 20
 * and 22 already use. The ONE `page.route` in this file intercepts
 * `POST /auth/check-password` — the debounced strength check `PasswordInput`
 * fires while typing — which `e2e/CLAUDE.md` names verbatim as a stub rather
 * than a mock (flows/29 precedent): removing it would change nothing about
 * what any assertion here measures.
 *
 * **`outreach_leads` is admin-only, so creating rows here is safe on a shared
 * target** — no consumer surface reads that table, unlike the producer rows
 * spec 33 deliberately refuses to mutate (MEH-1502 self-pollution). Every lead
 * this file creates carries RUN_TAG and is deleted in `afterAll`.
 *
 * **DEFERRED, named rather than silently absent — completing a registration
 * from the prefilled form.** It would create a real business on the shared
 * seeded target (the exact class spec 33 defers §2D/§2E/§2F for) and spend a
 * permit from the per-IP `/auth/register` limiter MEH-1858 already had to
 * fight over. The same question is answered against a REAL registration, in a
 * per-test isolated database, at
 * `tests/test_outreach_prefill_edge_cases.py::TestRegistrationDoesNotCloseTheLoop`
 * — stronger evidence, not weaker: it reads the lead's status before AND after,
 * which a shared target cannot do reliably. Phase 0 §5 established the answer
 * is "nothing happens": `OutreachLead` is imported by exactly three modules
 * (`models/__init__.py`, `router_registry.py`, `routers/admin_outreach.py`) and
 * no registration path touches it.
 *
 * SELECTORS: `frontend/app/[locale]/admin/outreach/page.jsx` carries exactly
 * one `data-testid` (`status-select-${id}`, line 246) and nothing else, so the
 * admin-table assertions are structural (`table tbody tr`) plus fixture DATA
 * (the business name we just created) — never translated UI copy. The
 * registration side has real testids and uses them. Same call chunks 1 and 2
 * of MEH-217 made for these pages (flows/30, flows/33).
 */
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";

import { authedContext } from "../auth-fixture";
import { expect, test } from "./_cloudinary-stub";

const AUTH_DIR = path.join(__dirname, "..", ".auth");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");

/**
 * Copied from `flows/30-admin-panel-tabs.spec.ts`, itself the stricter of the
 * repo's two guards. Skips ONLY "provisioning was skipped by design" (no
 * fixture AND no password). A missing fixture WITH the password set is real
 * breakage and fails loud.
 *
 * Note what it consults: a file and an env var — never the outreach page
 * itself. A `count() === 0 -> skip` on the subject under test converts "the
 * feature is gone" into "nothing to check" (.claude/rules/testing.md).
 */
function skipUnlessProvisioned(): void {
  test.skip(
    !fs.existsSync(ADMIN_STATE) && !process.env.DEMO_ADMIN_PASSWORD,
    "no e2e/.auth/admin.json and DEMO_ADMIN_PASSWORD is unset — global-setup " +
      "skips QA auth provisioning on an unseeded localhost target " +
      "(global-setup.ts:105-112). Runs against a seeded target; see " +
      "frontend/e2e/CLAUDE.md.",
  );
}

/** Unique per run, so a concurrent PR's run cannot collide on the soft-unique
 *  `(lower(name), lower(city))` key and get a 409 where a 201 is expected. */
const RUN_TAG = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** The real sheet row this spec is named after. Phone digits are fake. */
const LEAD = {
  name: `מוטק'ה החולב ${RUN_TAG}`,
  city: "תלמי אלעזר",
  phone: "050-1234567",
  instagram: "@yaar_mushrooms",
  // The `&id=17703` tail is the point — it is what makes the real link
  // resolve. A scheme is mandatory (`SanitizedUrlField`, schemas.py:302-315);
  // the sheet's own scheme-less form is FINDING-2 and is covered in pytest.
  website: "https://machine.co.il/show.asp?table=users&id=17703",
  category: "ירקות אורגני + גבינות עיזים",
} as const;

/** The stored form of `LEAD.phone` — `_phone_validator` strips [\s()-] only. */
const STORED_PHONE = "0501234567";

let admin: APIRequestContext;
const createdLeadIds: string[] = [];

interface Lead {
  id: string;
  name: string;
}

async function createLead(fields: Record<string, unknown>): Promise<Lead> {
  const r = await admin.post("/api/admin/outreach", { data: fields });
  expect(r.status(), `POST /admin/outreach -> ${r.status()} ${await r.text()}`).toBe(201);
  const lead = (await r.json()) as Lead;
  createdLeadIds.push(lead.id);
  return lead;
}

async function mintToken(leadId: string): Promise<string> {
  const r = await admin.post(`/api/admin/outreach/${leadId}/prefill-token`);
  expect(r.status()).toBe(200);
  return (await r.json()).prefill_token as string;
}

/**
 * Console noise produced by the TARGET, not by the page under test.
 *
 * Since MEH-1044 the suite runs against a local `next start`, where Vercel's
 * Speed Insights endpoint does not exist: `@vercel/speed-insights` still
 * injects `/_vercel/speed-insights/script.js`, Next answers 404 with
 * `text/plain`, and Chromium logs a resource error plus a strict-MIME refusal
 * on EVERY page load. Measured on this spec's first full run: all eight
 * console assertions failed on exactly these two strings while every other
 * assertion in those tests passed.
 *
 * The list is deliberately two exact substrings, not a category or a regex
 * with a wildcard. `assertNoConsoleErrors` below re-checks that property on
 * every call, so this cannot quietly widen into "ignore everything" — which is
 * the failure mode a console-error filter invites.
 */
const TARGET_NOISE = [
  "/_vercel/speed-insights/script.js",
  "Failed to load resource: the server responded with a status of 404 (Not Found)",
  // MEH-2168 chunk 3: Google Identity Services on the register page. The
  // button iframe (accounts.google.com/gsi/button) answers 403 for an origin
  // the OAuth client does not list — CI's http://localhost:3000 — and the SDK
  // logs the reason. Both lines are the third party refusing the runner's
  // origin, not the outreach form; measured on runs 33620715216 and
  // 33622606801 (four tests, both projects, identical text). The 403 entry
  // keeps the empty "()" status text on purpose: a FastAPI 403 reads
  // "(Forbidden)" and stays visible.
  "[GSI_LOGGER]: The given origin is not allowed for the given client ID.",
  "Failed to load resource: the server responded with a status of 403 ()",
] as const;

/** Collect console errors so a test can FAIL on them rather than log them. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

/**
 * Assert the page logged no APPLICATION console error.
 *
 * The first expectation is the guard on the guard: a sentinel that no entry in
 * TARGET_NOISE matches must survive the filter. If someone ever widens an
 * entry to something that swallows arbitrary text, this line reds instead of
 * the suite silently becoming unable to see a real error.
 */
function assertNoConsoleErrors(errors: string[]): void {
  const filter = (list: readonly string[]) =>
    list.filter((e) => !TARGET_NOISE.some((noise) => e.includes(noise)));

  expect(
    filter(["SENTINEL: a real application error"]),
    "TARGET_NOISE has widened until it swallows arbitrary text — it can no " +
      "longer distinguish a real console error from target noise",
  ).toHaveLength(1);

  const real = filter(errors);
  expect(real, `console errors: ${real.join(" | ")}`).toEqual([]);
}

/**
 * STUB, not a mock (see the header): the debounced password-strength check
 * `PasswordInput` fires on every keystroke past 12 characters. No assertion in
 * this file reads its result. flows/29 does the same for the same reason.
 */
async function stubPasswordCheck(page: Page): Promise<void> {
  await page.route("**/auth/check-password", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, strength: "strong", breached: false }),
    }),
  );
}

/**
 * Walk a logged-out visitor from the prefill URL to the DETAILS frame, where
 * the prefilled business fields actually live.
 *
 * The wizard opens on the MEH-994 pre-flight screen and then on ACCOUNT
 * (`register-frame-account`); `producer_name` and `phone` are on the NEXT
 * frame. Nothing is submitted — `register-account-next` only advances the
 * client-side wizard, so no account is created and the `/auth/register`
 * limiter is untouched.
 */
async function reachDetailsFrame(page: Page): Promise<void> {
  await page.getByTestId("register-preflight-start").click();
  await expect(page.getByTestId("register-frame-account")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("register-account-name").fill("בדיקת פריפיל");
  await page.getByTestId("register-account-email").fill(`prefill+${RUN_TAG}@mehamakor.online`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();
  await expect(page.getByTestId("register-frame-details")).toBeVisible({ timeout: 15_000 });
}

async function openPrefillAsGuest(
  browser: Browser,
  token: string,
  contextOptions: Record<string, unknown> = {},
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  // No storageState — the business owner is not logged in and has never
  // visited the site. That is the whole point of this half of the spec.
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = collectConsoleErrors(page);
  await stubPasswordCheck(page);
  await page.goto(`/register/producer?prefill=${token}`);
  return { context, page, errors };
}

test.beforeAll(async () => {
  if (!fs.existsSync(ADMIN_STATE) && !process.env.DEMO_ADMIN_PASSWORD) return;
  admin = await authedContext("admin");
});

test.afterAll(async () => {
  if (!admin) return;
  for (const id of createdLeadIds) await admin.delete(`/api/admin/outreach/${id}`);
  await admin.dispose();
});

// ---------------------------------------------------------------------------
// Admin side — the list the link is minted from.
// ---------------------------------------------------------------------------

test.describe("MEH-2238 — admin outreach list", () => {
  skipUnlessProvisioned();
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("a real sheet row renders, and the minted link has the documented shape", async ({
    page,
    baseURL,
  }) => {
    const lead = await createLead({ ...LEAD });
    const token = await mintToken(lead.id);

    // The URL the «הכן פרופיל» button builds — admin/outreach/page.jsx:103.
    // Read from the app's own construction; deliberately NOT re-derived from
    // the backend route, which lives under a different prefix entirely.
    const prefillUrl = `${baseURL}/register/producer?prefill=${token}`;
    const parsed = new URL(prefillUrl);
    expect(parsed.pathname).toBe("/register/producer");
    expect(parsed.searchParams.get("prefill")).toBe(token);
    // secrets.token_urlsafe(32) is ~43 chars (admin_outreach.py:146).
    expect(token.length).toBeGreaterThanOrEqual(40);

    const errors = collectConsoleErrors(page);
    await page.goto("/he/admin/outreach");

    const row = page.locator("table tbody tr", { hasText: LEAD.name });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(row).toContainText(LEAD.city);
    await expect(row).toContainText(LEAD.category);
    // The STORED (separator-stripped) phone, not the typed one.
    await expect(row.locator(`a[href="tel:${STORED_PHONE}"]`)).toBeVisible();
    // "@" is stripped on write, then re-composed for the href by
    // lib/social-links.js:34.
    await expect(row.locator('a[href="https://instagram.com/yaar_mushrooms"]')).toBeVisible();

    assertNoConsoleErrors(errors);
  });

  test("a messy instagram value from the sheet becomes a dead profile link", async ({
    page,
  }) => {
    // FINDING-8. `_normalize_instagram` strips a leading "@" and an
    // instagram.com prefix and nothing else, so a cell the admin filled in as
    // free text is stored verbatim — and `instagramUrl` then composes
    // `https://instagram.com/<that free text>`. Recorded as an assertion on
    // the CURRENT href rather than as an xfail: the value round-trips exactly
    // as designed, and only the rendered link is wrong.
    await createLead({ name: `אינסטגרם משובש ${RUN_TAG}`, city: "נתניה", instagram: "IG: mushroom.co.il" });

    await page.goto("/he/admin/outreach");
    const row = page.locator("table tbody tr", { hasText: `אינסטגרם משובש ${RUN_TAG}` });
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    const href = await row.locator('a[href*="instagram.com"]').getAttribute("href");
    expect(href).toBe("https://instagram.com/IG: mushroom.co.il");
  });

  test("duplicate lead — the modal shows the 409 message and offers no route to the original", async ({
    page,
  }) => {
    const dupe = { name: `שיטה ${RUN_TAG}`, city: "חדרה" };
    await createLead(dupe);

    await page.goto("/he/admin/outreach");
    await expect(page.locator("table tbody tr", { hasText: dupe.name })).toHaveCount(1, {
      timeout: 15_000,
    });

    // Open the add-lead modal. The filter row is [city input, status select,
    // add button] (page.jsx:151-176) — positional, so a copy change to the
    // button label cannot break this.
    await page.locator("div.flex.flex-col.md\\:flex-row > button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const inputs = dialog.locator("input");
    await inputs.nth(0).fill(dupe.name); // name (page.jsx:385)
    await inputs.nth(1).fill(dupe.city); // city (page.jsx:392)
    await dialog.locator('button[type="submit"]').click();

    // The server's Hebrew message is rendered verbatim (page.jsx:361-362).
    await expect(dialog).toContainText("כבר קיים", { timeout: 15_000 });

    // FINDING-6: the 409 body carries `existing_id` (admin_outreach.py:78-84)
    // and the modal discards it — no link, no id, no scroll-to on the existing
    // row. The admin is told a lead exists and given no way to reach it.
    // Asserted as CURRENT behaviour: nothing here is failing, the ABSENCE is
    // the finding, so an xfail would misdescribe it.
    await expect(dialog.locator("a")).toHaveCount(0);
    await expect(dialog).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  test("an XSS-shape name is rendered as literal text, not markup", async ({ page }) => {
    const marker = `xss-${RUN_TAG}`;
    await createLead({ name: `<b>בדיקה</b> ${marker}`, city: "עכו" });

    await page.goto("/he/admin/outreach");
    const row = page.locator("table tbody tr", { hasText: marker });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    // Tags are stripped server-side by `sanitize_text`, so what reaches the
    // page is already inert. Both halves asserted: no injected element, and
    // the surviving text.
    await expect(row.locator("b")).toHaveCount(0);
    await expect(row).toContainText("בדיקה");
  });
});

// ---------------------------------------------------------------------------
// Owner side — what the link actually does.
// ---------------------------------------------------------------------------

test.describe("MEH-2238 — the owner opens the link", () => {
  skipUnlessProvisioned();

  test("logged out: name and phone are prefilled — city, category, website and instagram are NOT", async ({
    browser,
  }) => {
    const lead = await createLead({ ...LEAD, name: `${LEAD.name} guest` });
    const token = await mintToken(lead.id);
    const { context, page, errors } = await openPrefillAsGuest(browser, token);

    try {
      // The API hands the form all six fields — proven first, so this test
      // cannot blame the backend for a frontend gap.
      const api = await page.request.get(`/api/register/producer/prefill/${token}`);
      expect(api.status()).toBe(200);
      const body = await api.json();
      expect(Object.keys(body).sort()).toEqual([
        "category",
        "city",
        "instagram",
        "name",
        "phone",
        "website",
      ]);
      expect(body.website).toContain("&id=17703");
      expect(body.city).toBe(LEAD.city);
      expect(body.category).toBe(LEAD.category);

      await reachDetailsFrame(page);

      // What the form actually does with them —
      // RegisterProducerClient.jsx:472-487 writes exactly two keys.
      await expect(page.getByTestId("register-details-name")).toHaveValue(
        `${LEAD.name} guest`,
      );
      await expect(page.getByTestId("register-details-phone")).toHaveValue(STORED_PHONE);

      // FINDING-5: `city`, `category`, `website` and `instagram` come back
      // from the API and are dropped. The form has no website/instagram field
      // at all, and its category axis is `category_ids` (Category UUIDs) — a
      // different vocabulary from the lead's free-text `category`, with no
      // matching code anywhere. So the owner still retypes four of the six
      // things the admin already collected.
      await expect(
        page.getByTestId("register-details-city").getByRole("combobox"),
      ).toHaveValue("");
      expect(await page.locator('input[value*="17703"]').count()).toBe(0);
      expect(await page.locator('input[value*="yaar_mushrooms"]').count()).toBe(0);

      assertNoConsoleErrors(errors);
    } finally {
      await context.close();
    }
  });

  test("mobile viewport: the prefilled fields are visible and the form stays RTL", async ({
    browser,
  }) => {
    const lead = await createLead({ ...LEAD, name: `${LEAD.name} mobile` });
    const token = await mintToken(lead.id);
    // Pixel 5 metrics, matching the `mobile` project in playwright.config.ts.
    const { context, page, errors } = await openPrefillAsGuest(browser, token, {
      viewport: { width: 393, height: 851 },
      isMobile: true,
      hasTouch: true,
    });

    try {
      await reachDetailsFrame(page);

      const name = page.getByTestId("register-details-name");
      await expect(name).toBeVisible();
      await expect(name).toHaveValue(`${LEAD.name} mobile`);
      await expect(page.getByTestId("register-details-phone")).toBeVisible();

      // Direction is set on <html> by next-intl — asserted where it actually
      // lives, not on a wrapper that merely inherits it. The business-name
      // input additionally carries its own explicit dir (line 1093), and the
      // phone input is deliberately ltr (line 1116) because it holds digits.
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(name).toHaveAttribute("dir", "rtl");
      await expect(page.getByTestId("register-details-phone")).toHaveAttribute("dir", "ltr");

      assertNoConsoleErrors(errors);
    } finally {
      await context.close();
    }
  });

  test("tampered token: the form renders empty, with no error toast and no crash", async ({
    browser,
  }) => {
    const lead = await createLead({ ...LEAD, name: `${LEAD.name} tampered` });
    const good = await mintToken(lead.id);
    // One character changed — same length, same charset, wrong token.
    const bad = (good[0] === "a" ? "b" : "a") + good.slice(1);
    expect(bad).not.toBe(good);
    expect(bad.length).toBe(good.length);

    const { context, page, errors } = await openPrefillAsGuest(browser, bad);
    try {
      await reachDetailsFrame(page);
      await expect(page.getByTestId("register-details-name")).toHaveValue("");
      await expect(page.getByTestId("register-details-phone")).toHaveValue("");
      // The 404 must be swallowed, not surfaced to a business owner who did
      // nothing wrong.
      await expect(page.locator(".Toastify__toast")).toHaveCount(0);
      assertNoConsoleErrors(errors);
    } finally {
      await context.close();
    }
  });

  /**
   * FINDING-7, asserted as CURRENT behaviour — deliberately NOT `test.fail()`.
   *
   * `test.fail()` was the obvious shape here and it is the wrong one, because
   * it does not discriminate: Playwright counts the test as "expected failure"
   * if it fails for ANY reason. Once the bug is fixed the notice disappears,
   * the positive assertion below is what breaks instead, and `test.fail()`
   * reports the identical green — the very "one signal, two possible causes"
   * defect .claude/rules/testing.md exists to prevent. It has no
   * `strict=True` counterpart, so the Python xfails in
   * `tests/test_outreach_prefill_edge_cases.py` cannot be mirrored literally.
   *
   * A plain assertion on the observed value gives the same guarantee `strict`
   * gives on the backend: the moment someone fixes the handler, this test goes
   * RED and names itself, which is the notification that the PR's Findings
   * table is stale. Same shape as FINDING-5, -6 and -8 above.
   *
   * TO FIX THE UNDERLYING BUG, then DELETE this test (do not "repair" it):
   * `RegisterProducerClient.jsx:486` — `.catch(() => setPrefillApplied(true))`
   * sets the SAME flag on failure as on success, and the notice renders on
   * `prefillToken && prefillApplied` (`:935`). A dead, expired or tampered link
   * therefore greets the owner with a success notice over an empty form — and
   * the notice sits above the frames, so she reads it on the ACCOUNT step,
   * before any field could contradict it.
   *
   * _(Credit: the CI reviewer caught the `test.fail()` non-strictness on this
   * PR. The first version of this test shipped the defect it was written to
   * document.)_
   */
  test(
    "FINDING-7 (current behaviour): the «filled in for you» notice appears even when the token 404s",
    async ({ browser }) => {
      const { context, page, errors } = await openPrefillAsGuest(
        browser,
        "z".repeat(43),
      );
      try {
        await page.getByTestId("register-preflight-start").click();
        await expect(page.getByTestId("register-frame-account")).toBeVisible({
          timeout: 15_000,
        });
        // The lookup 404s (proven independently, so this test cannot be green
        // because the token accidentally resolved).
        const api = await page.request.get(
          `/api/register/producer/prefill/${"z".repeat(43)}`,
        );
        expect(api.status()).toBe(404);
        // …and the success notice is rendered anyway.
        await expect(page.locator("main").getByText(/מילא/)).toHaveCount(1, {
          timeout: 15_000,
        });
        assertNoConsoleErrors(errors);
      } finally {
        await context.close();
      }
    },
  );
});

test.describe("MEH-2238 — a signed-in admin follows the link", () => {
  skipUnlessProvisioned();
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("the prefill link is gated, not crashed", async ({ page }) => {
    const lead = await createLead({ ...LEAD, name: `${LEAD.name} admin-view` });
    const token = await mintToken(lead.id);

    const errors = collectConsoleErrors(page);
    const response = await page.goto(`/register/producer?prefill=${token}`);

    // Recording ACTUAL behaviour, per the card: assert it is not a crash and
    // not a blank page, without inventing which gate it must be.
    // `register-producer-gate-admin` (line 813) is what the app renders for a
    // signed-in admin today; the assertions below still hold if that becomes a
    // redirect, and go red if it becomes a 500 or an empty <main>.
    expect(
      response?.status(),
      "prefill link must not 5xx for a signed-in admin",
    ).toBeLessThan(500);
    await expect(page.locator("main")).not.toBeEmpty({ timeout: 15_000 });
    assertNoConsoleErrors(errors);
  });
});
