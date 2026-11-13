/**
 * MEH-2974 — the owner invite, end to end.
 *
 * THE FLOW UNDER TEST, in Sapir's words: she builds a business's page herself
 * through /admin, after written approval from its owner, and then hands it
 * over — often on Instagram or WhatsApp, with no email address on the link at
 * all. The owner opens it, SEES the page, types her own address and proves it
 * with a code, chooses a password, ticks the terms and the licensing
 * declaration, and lands in the dashboard of a page that her approval has
 * just published. She never sees the registration form.
 *
 * ─── WHERE THIS SPEC STOPS, and why ────────────────────────────────────────
 *
 * The browser journey here ends at the verification code, because **the code
 * exists only in an email this process cannot read**. It is minted inside the
 * request, stored as a sha256, and handed to a background task; no endpoint
 * returns it, by design — exposing one would hand every link holder a way to
 * skip the gate. So a browser cannot complete an acceptance, and the two
 * dishonest ways to make it look as if it could are both rejected:
 *
 *   * stubbing `POST …/email-code` and `POST …/accept` would leave a test that
 *     asserts nothing about the backend while reading like a full journey —
 *     a mock in a `flows/` spec, which is exactly the MEH-417 regression
 *     e2e/CLAUDE.md protects, and it meets none of the three MEH-1968
 *     conditions (no shared resource is burned);
 *   * adding a test-only way to read the code would put a bypass of the
 *     feature's last gate into production for the convenience of a test.
 *
 * What the browser DOES own is tested here for real, against the real backend:
 * the preview renders, the address is editable, the submit stays refused until
 * a code is live, the send-code round trip answers, and a WRONG code is
 * refused with the server's own message. The transaction on the far side —
 * the account, the consents, the publish, `/auth/me`, logging in with the
 * password she chose — is covered end to end by
 * `tests/test_producer_owner_invite.py` (105 tests), which can read the code
 * out of the mail the endpoint queues because it runs inside the process.
 *
 * ─── SCOPE, and why it is shaped this way ──────────────────────────────────
 *
 * **Setup runs through the admin API, the assertions run through the UI.** The
 * business and the invite are created with `authedContext("admin")`
 * (e2e/auth-fixture.ts) rather than by driving the admin forms, for the reason
 * spec 37 gives for its own leads: the subject here is the LINK and the page
 * it opens, not the admin create form, and a form round-trip per fixture is a
 * flake surface for something nobody is asserting. The admin PANEL is driven
 * through the UI in the one test whose subject is the panel.
 *
 * **That is not a mock (e2e/CLAUDE.md, "Distinguish a stub from a mock").**
 * Every request here reaches the real backend; the API context is a login
 * shortcut. The one `page.route` intercepts `POST /auth/check-password` — the
 * debounced strength check `PasswordInput` fires while typing — which
 * e2e/CLAUDE.md names verbatim as a stub rather than a mock (flows/29
 * precedent): removing it would change nothing about what any assertion here
 * measures.
 *
 * **This spec CREATES a real business and a real account, and cleans both up.**
 * Since MEH-2973 a PR run has its own throwaway backend, so the rows cost
 * nothing there; a staging push still runs against the shared Railway
 * backend, which is why `afterAll` deletes the business (which unlinks and
 * downgrades its owner — admin.py `admin_delete_producer`) and then the
 * account. Everything this file creates carries RUN_TAG, so a concurrent run
 * cannot collide with it. Acceptance cannot be deferred to pytest the way
 * spec 37 defers registration: the thing under test is precisely that the
 * BROWSER journey ends in the dashboard.
 *
 * SELECTORS: `data-testid` only (docs/E2E-LOCATORS.md). Hebrew copy is
 * asserted in exactly one place — the «לא בתוקף» end state — and there it is
 * read through the testid, never matched as text.
 */
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page, Route } from "@playwright/test";

import { authedContext } from "../auth-fixture";
import { expect, test } from "./_cloudinary-stub";
import he from "../../messages/he.json";

const AUTH_DIR = path.join(__dirname, "..", ".auth");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");

/**
 * Copied from flows/30 and flows/37, the stricter of the repo's two guards.
 * Skips ONLY "provisioning was skipped by design" (no fixture AND no
 * password). A missing fixture WITH the password set is real breakage and
 * fails loud rather than hiding behind a skip.
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

/** Unique per run, so two runs in flight cannot collide on a slug or an email. */
const RUN_TAG = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
// Spelled with "example" on purpose — see the same note in
// tests/test_producer_owner_invite.py. Long enough for the 12-character
// floor; this reaches the REAL password policy (HIBP included), so it also
// has to be a string nobody has ever actually used.
const OWNER_PASSWORD = "example-pw-meh2974";

let admin: APIRequestContext;

/**
 * Every test owns its OWN business, invite and email address, and nothing is
 * shared between them but the admin context.
 *
 * `playwright.config.ts` sets `fullyParallel: true`, so tests in one file run
 * in parallel across workers and in no promised order. A spec that let test 2
 * consume the invite test 3 opens would pass or fail on scheduling — and the
 * specific trap here is that acceptance CREATES an account for the invited
 * address, after which any further invite to it is a 409 by design. One
 * business and one address per test removes the question instead of ordering
 * the answer.
 */
const created: { producers: string[]; emails: string[] } = { producers: [], emails: [] };

function freshEmail(slot: string): string {
  return `owner-invite-${slot}-${RUN_TAG}@example.com`;
}

/** The debounced strength check — a stub, see the header. */
async function stubPasswordCheck(page: Page): Promise<void> {
  await page.route("**/api/auth/check-password", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, failures: [] }),
    }),
  );
}

async function createBusiness(
  slot: string,
  status: "approved" | "inactive" = "approved",
): Promise<{ id: string; name: string }> {
  const name = `מחלבת הבדיקה ${slot} ${RUN_TAG}`;
  const r = await admin.post("/api/admin/producers", {
    data: {
      name,
      city: "תל אביב",
      phone: "0501234567",
      short_description: "עסק בדיקה אוטומטי",
      description: "נוצר ע״י ספק הבדיקות של MEH-2974 ונמחק בסוף הריצה.",
      category_ids: [],
    },
  });
  expect(r.status(), `admin create -> ${r.status()} ${await r.text()}`).toBeLessThan(300);
  const id = ((await r.json()) as { id: string }).id;
  created.producers.push(id);
  if (status !== "approved") {
    // `POST /admin/producers` always creates an approved business, so hidden
    // is reached the way the admin reaches it: the status toggle. Doing it
    // here rather than asserting on the default is what makes the «הדף יעלה
    // לאוויר באישור» half of the flow reachable at all.
    const hid = await admin.post(`/api/admin/producers/${id}/toggle-status`);
    expect(hid.status(), `hide -> ${hid.status()} ${await hid.text()}`).toBe(200);
    // Assert the LANDING state, not that a request succeeded: `toggle-status`
    // flips, so calling it on a row that was not approved would quietly hand
    // this spec the opposite status to the one it asked for.
    expect((await hid.json()).status, "toggle did not land on the asked status").toBe(
      status,
    );
  }
  return { id, name };
}

async function createInvite(producerId: string, email: string | null): Promise<string> {
  const r = await admin.post(`/api/admin/producers/${producerId}/owner-invite`, {
    data: {
      // `null` is the v3 case this spec cares about: the link is minted with no
      // address and nothing is mailed, which is how most of these invites are
      // actually handed over.
      email,
      name: "דנה הבדיקה",
      consent_confirmed: true,
      consent_note: `e2e ${RUN_TAG}`,
    },
  });
  expect(r.status(), `owner-invite -> ${r.status()} ${await r.text()}`).toBe(200);
  if (email) created.emails.push(email);
  const { invite_url } = (await r.json()) as { invite_url: string };
  // The backend builds this against ITS `frontend_url`, which on a seeded
  // staging target is not the origin Playwright drives. Only the token is
  // portable, so the path is rebuilt by the caller rather than followed.
  return invite_url.split("/owner-invite/")[1];
}

test.beforeAll(async () => {
  skipUnlessProvisioned();
  admin = await authedContext("admin");
});

test.afterAll(async () => {
  if (!admin) return;
  // Businesses first: deleting one unlinks and downgrades the account that
  // owns it (admin.py `admin_delete_producer`), and an owned account cannot
  // be removed cleanly before that.
  for (const id of created.producers) {
    await admin.delete(`/api/admin/producers/${id}`);
  }
  for (const email of created.emails) {
    const list = await admin.get("/api/admin/users", { params: { search: email } });
    if (!list.ok()) continue;
    const rows = (await list.json()) as Array<{ id: string; email: string }>;
    for (const row of rows.filter((u) => u.email === email)) {
      await admin.delete(`/api/admin/users/${row.id}`);
    }
  }
  await admin.dispose();
});

// The admin edit page authenticates in the BROWSER (lib/auth-context reads the
// token from localStorage), so this one test needs the admin storageState —
// the API context the rest of the file uses cannot log a PAGE in. Scoped to
// its own describe so the two public-page tests keep running as a stranger,
// which is what they are.
test.describe("owner invite — the admin panel", () => {
  test.use({ storageState: ADMIN_STATE });

  test("offers the invite on an approved business", async ({ page }) => {
    const business = await createBusiness("panel");
    await page.goto(`/he/admin/producers/${business.id}/edit`);
    const panel = page.getByTestId("owner-invite-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    // 0 invites × closed — the empty state, which is the one a conditional-UI
    // matrix most often leaves unspecified (CLAUDE.md § 5-state rule).
    await expect(page.getByTestId("owner-invite-empty")).toBeVisible();
    await expect(page.getByTestId("owner-invite-open")).toBeVisible();
    // The link box belongs to the render that follows a mint, and to no other.
    await expect(page.getByTestId("owner-invite-result")).toHaveCount(0);
    // 0 invites × OPEN: the form, and the warning that this page is ALREADY
    // live — the state the admin is told to fix before minting a link.
    await page.getByTestId("owner-invite-open").click();
    await expect(page.getByTestId("owner-invite-form")).toBeVisible();
    await expect(page.getByTestId("owner-invite-status-live")).toBeVisible();
    await expect(page.getByTestId("owner-invite-status-hidden")).toHaveCount(0);
  });

  test("on a hidden business it says the approval will publish the page", async ({
    page,
  }) => {
    const business = await createBusiness("panel-hidden", "inactive");
    await page.goto(`/he/admin/producers/${business.id}/edit`);
    await expect(page.getByTestId("owner-invite-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("owner-invite-open").click();
    // The other arm of the same matrix cell, and the one that proves the panel
    // renders at all on a hidden business — it was gated on `approved` until
    // the card's v3 revision, which would have made this flow unreachable.
    await expect(page.getByTestId("owner-invite-status-hidden")).toBeVisible();
    await expect(page.getByTestId("owner-invite-status-live")).toHaveCount(0);
  });

  test("mints a link with no address, and offers the message to copy", async ({
    page,
  }) => {
    const business = await createBusiness("panel-mint", "inactive");
    await page.goto(`/he/admin/producers/${business.id}/edit`);
    await expect(page.getByTestId("owner-invite-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("owner-invite-open").click();
    // The address field is left EMPTY on purpose: the submit must enable
    // without it since v3, which is the assertion this test exists for.
    await page.getByTestId("owner-invite-name").fill("דנה הבדיקה");
    await page.getByTestId("owner-invite-note").fill(`e2e ${RUN_TAG}`);
    await page.getByTestId("owner-invite-consent").check();
    await expect(page.getByTestId("owner-invite-submit")).toBeEnabled();
    await page.getByTestId("owner-invite-submit").click();

    // The link is shown exactly once, in the render that follows the mint.
    const url = page.getByTestId("owner-invite-url");
    await expect(url).toBeVisible({ timeout: 15_000 });
    await expect(url).not.toHaveValue("");
    await expect(page.getByTestId("owner-invite-copy-message")).toBeVisible();
    // Nothing was mailed, so the pending line must not claim it was.
    await expect(page.getByTestId("owner-invite-pending")).not.toContainText("@");
  });
});

test.describe("owner invite", () => {
  test("the owner sees the page, types an address and is asked for a code", async ({
    page,
  }) => {
    const business = await createBusiness("accept", "inactive");
    const email = freshEmail("accept");
    const token = await createInvite(business.id, null);
    await stubPasswordCheck(page);

    await page.goto(`/he/owner-invite/${token}`);

    // The token leaves the address bar before anything else happens — the
    // MEH-2324 rule, and the reason this page exists in two route folders.
    await expect(page).toHaveURL(/\/owner-invite(\?.*)?$/, { timeout: 15_000 });
    await expect(page.url()).not.toContain(token);

    await expect(page.getByTestId("owner-invite-ready")).toBeVisible();
    await expect(page.getByTestId("owner-invite-title")).toContainText(business.name);
    // v3: she approves something she has SEEN.
    await expect(page.getByTestId("owner-invite-preview")).toBeVisible();
    await expect(page.getByTestId("owner-invite-preview-name")).toContainText(
      business.name,
    );
    // Minted with no address, so the field is empty and hers to fill.
    await expect(page.getByTestId("owner-invite-email")).toHaveValue("");

    // Refused until a code is live — asserted BEFORE anything is typed, and
    // again after the password alone, so the button's disabled state is shown
    // to depend on the code rather than on the form being empty.
    await expect(page.getByTestId("owner-invite-submit")).toBeDisabled();
    await page.getByTestId("owner-invite-password").fill(OWNER_PASSWORD);
    await page.getByTestId("owner-invite-terms").check();
    await page.getByTestId("owner-invite-declaration").check();
    await expect(page.getByTestId("owner-invite-submit")).toBeDisabled();

    // The real round trip. Its answer is deliberately the same whatever
    // happened on the far side, so the only thing to assert is that the page
    // moved on to the code.
    await page.getByTestId("owner-invite-email").fill(email);
    await page.getByTestId("owner-invite-send-code").click();
    await expect(page.getByTestId("owner-invite-code-sent")).toBeVisible({
      timeout: 15_000,
    });

    // A WRONG code is refused by the SERVER, and its message is rendered
    // verbatim. The right one is unreachable from a browser — see the header.
    await page.getByTestId("owner-invite-code").fill("000000");
    await expect(page.getByTestId("owner-invite-submit")).toBeEnabled();
    await page.getByTestId("owner-invite-submit").click();
    await expect(page.getByTestId("owner-invite-error")).toBeVisible({ timeout: 15_000 });
    // Still on the form, and the page is still hidden: a refused code creates
    // nothing and publishes nothing.
    await expect(page.getByTestId("owner-invite-form")).toBeVisible();
    const after = await admin.get(`/api/admin/producers/${business.id}`);
    expect((await after.json()).status).toBe("inactive");
  });

  test("a hidden business is not on the site before its owner approves", async ({
    page,
  }) => {
    const business = await createBusiness("hidden-public", "inactive");
    await createInvite(business.id, null);
    // The public page of a hidden business, opened as a stranger. This is the
    // card's «עסק inactive לא חוזר מאף endpoint ציבורי לפני הקבלה» at the
    // surface a person would actually reach it from.
    //
    // Not the document status: /producer/<uuid> answers 200 with the not-found
    // page for ANY missing business (measured on production 13/11, browser and
    // Googlebot user agents alike), so a status check here never passed and
    // said nothing about «hidden». What a stranger can actually tell apart is
    // asserted instead: the public API refuses the id, and the page shows the
    // not-found copy and none of the business.
    const api = await page.request.get(`/api/producers/${business.id}`);
    expect(api.status(), "the public API must not return a hidden business").toBe(404);
    await page.goto(`/he/producer/${business.id}`);
    await expect(page.locator("#main-content h1")).toHaveText(
      he.errors.producer_not_found.heading,
      { timeout: 15_000 },
    );
    await expect(page.getByText(business.name)).toHaveCount(0);
  });

  test("reopening the same link shows the not-valid state", async ({ page }) => {
    const business = await createBusiness("dead-link");
    const token = await createInvite(business.id, null);
    await stubPasswordCheck(page);
    await page.goto(`/he/owner-invite/${token}`);
    await expect(page.getByTestId("owner-invite-ready")).toBeVisible({ timeout: 15_000 });

    // Kill it the way the admin would: cancel the outstanding invite.
    const cancelled = await admin.delete(`/api/admin/producers/${business.id}/owner-invite`);
    expect(cancelled.status(), await cancelled.text()).toBe(200);

    // `clearCookies()` does NOT clear sessionStorage, so this does not do
    // what an earlier version of this comment said. It does not need to: the
    // stashed token IS the token under test, and it is now dead, so reading
    // it back gives the same 404 the URL would. Said plainly rather than
    // deleted, because the next reader will otherwise re-derive the same
    // wrong mechanism from the same line.
    await page.context().clearCookies();
    await page.goto(`/he/owner-invite/${token}`);
    await expect(page.getByTestId("owner-invite-invalid")).toBeVisible({ timeout: 15_000 });
  });
});
