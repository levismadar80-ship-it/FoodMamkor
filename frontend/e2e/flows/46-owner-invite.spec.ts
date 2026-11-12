/**
 * MEH-2974 — the owner invite, end to end.
 *
 * THE FLOW UNDER TEST, in Sapir's words: she builds a business's page herself
 * through /admin, after written approval from its owner, and then hands it
 * over. The owner opens one link, chooses a password, ticks the terms and the
 * licensing declaration, and lands in the dashboard of a page that is already
 * live. She never sees the registration form.
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

async function createBusiness(slot: string): Promise<{ id: string; name: string }> {
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
  return { id, name };
}

async function createInvite(producerId: string, email: string): Promise<string> {
  const r = await admin.post(`/api/admin/producers/${producerId}/owner-invite`, {
    data: {
      email,
      name: "דנה הבדיקה",
      consent_confirmed: true,
      consent_note: `e2e ${RUN_TAG}`,
    },
  });
  expect(r.status(), `owner-invite -> ${r.status()} ${await r.text()}`).toBe(200);
  created.emails.push(email);
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
  });
});

test.describe("owner invite", () => {
  test("the owner sets a password and lands in the dashboard", async ({ page }) => {
    const business = await createBusiness("accept");
    const email = freshEmail("accept");
    const token = await createInvite(business.id, email);
    await stubPasswordCheck(page);

    await page.goto(`/he/owner-invite/${token}`);

    // The token leaves the address bar before anything else happens — the
    // MEH-2324 rule, and the reason this page exists in two route folders.
    await expect(page).toHaveURL(/\/owner-invite(\?.*)?$/, { timeout: 15_000 });
    await expect(page.url()).not.toContain(token);

    await expect(page.getByTestId("owner-invite-ready")).toBeVisible();
    await expect(page.getByTestId("owner-invite-title")).toContainText(business.name);
    await expect(page.getByTestId("owner-invite-email")).toHaveValue(email);

    await page.getByTestId("owner-invite-password").fill(OWNER_PASSWORD);
    await page.getByTestId("owner-invite-terms").check();
    await page.getByTestId("owner-invite-declaration").check();
    await page.getByTestId("owner-invite-submit").click();

    await page.waitForURL(/\/producer\/dashboard/, { timeout: 30_000 });
  });

  test("reopening the same link shows the not-valid state", async ({ page }) => {
    const business = await createBusiness("dead-link");
    const token = await createInvite(business.id, freshEmail("dead-link"));
    await stubPasswordCheck(page);
    await page.goto(`/he/owner-invite/${token}`);
    await expect(page.getByTestId("owner-invite-ready")).toBeVisible({ timeout: 15_000 });

    // Kill it the way the admin would: cancel the outstanding invite.
    const cancelled = await admin.delete(`/api/admin/producers/${business.id}/owner-invite`);
    expect(cancelled.status(), await cancelled.text()).toBe(200);

    // A fresh context, because the first one has the token in sessionStorage
    // and we want the LINK's verdict, not the stash's.
    await page.context().clearCookies();
    await page.goto(`/he/owner-invite/${token}`);
    await expect(page.getByTestId("owner-invite-invalid")).toBeVisible({ timeout: 15_000 });
  });
});
