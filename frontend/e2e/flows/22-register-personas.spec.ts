import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Spec:     22-register-personas
 * Purpose:  MEH-1274 registration persona matrix — the UI leg. Complements the
 *           backend leg (tests/test_register_personas.py) with the flows that
 *           can only be proven in a browser:
 *             P1 — full wizard → admin approve → public page → login → the
 *                  producer dashboard's approved checklist state.
 *             P2 — OAuth-409 surfaces a toast (GSI-stub, mirrors flows/10).
 *             P5 — abandon mid-wizard: the draft persists + the wizard resets
 *                  to its pre-flight entry on refresh / back (ACTUAL behaviour).
 * Touches:  P1 drives the REAL backend (no mocks) via the Next.js /api proxy —
 *           POST /auth/register/producer, GET /categories, admin JWT +
 *           GET/PUT/POST/DELETE /admin/producers/*, POST /auth/login. It sits
 *           beside 19-publish-approve-visible and reuses its admin-driven
 *           pattern. P2/P5 are frontend-only (P2 stubs GSI + the OAuth route;
 *           P5 asserts localStorage draft state) so they need no backend.
 * Does NOT: edit spec 18 (mocked wizard) or spec 19 (publish→approve). The
 *           `adminLogin` helper is DUPLICATED locally here (a tiny copy) rather
 *           than shared, to avoid touching either sibling spec.
 * History:  MEH-1274 (creation).
 *
 * // MEH-360 / MEH-1044: P1 runs against a REMOTE backend only (TEST_URL=staging
 * or a Vercel preview) — it is skipped on the default localhost baseURL where
 * the /api proxy has no seeded backend + admin. P2/P5 run wherever the frontend
 * is served. Selectors are the wizard's existing data-testids (docs/E2E-LOCATORS)
 * — no testid is added by this spec.
 *
 * Required CI env for P1 (graceful-skip when absent — mirrors flows/19):
 *   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD — the seeded staging admin (same
 *   secrets the staging smoke job uses; no new env var is introduced).
 */

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_URL || "http://localhost:3000";
// MEH-1044: the default CI target is a local `next start` with no seeded
// backend/admin, so the real-backend P1 leg is remote-target-only.
const isLocal = /localhost|127\.0\.0\.1/.test(baseURL);

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "";

// Unique-per-run identity: a shared RegisterAck response makes a re-registration
// idempotent (anti-enum), so a repeated email would silently create no producer
// and break reruns. The timestamp tag also makes any orphan trivial to sweep.
const uniqueEmail = (persona: number) =>
  `qa+persona${persona}-${Date.now()}@example.com`;

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

interface QueueProducer {
  id: string;
  name: string;
  slug: string | null;
  status: string;
}
interface ListProducer {
  id: string;
  name: string;
  status: string;
  slug?: string | null;
}
interface Category {
  id: number;
  name: string;
}

// DUPLICATED locally (see header "Does NOT") — mirrors flows/19:76-85 so spec 19
// stays untouched.
async function adminLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/login", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(
    res.ok(),
    `admin login failed (${res.status()}) — check SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD`,
  ).toBeTruthy();
  return (await res.json()).access_token as string;
}

// ===========================================================================
// P1 — full wizard → approve → public → login → dashboard checklist (REAL)
// ===========================================================================
test.describe("P1 — wizard → approve → public → login → dashboard (MEH-1274)", () => {
  test("a producer registered through the wizard is approvable, public, and reaches an approved dashboard", async ({
    page,
    request,
  }) => {
    test.skip(
      isLocal,
      "real-backend persona — needs TEST_URL=staging/preview (MEH-1044 localhost has no seeded backend)",
    );
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD not configured — admin-driven approval unavailable",
    );
    // Single-project: this creates a REAL staging producer and burns the shared
    // /auth/register limiter quota (frontend/e2e/CLAUDE.md). Mirror flows/19.
    test.skip(
      test.info().project.name !== "desktop",
      "single-project guard — avoid a duplicate staging registration",
    );

    const tag = `E2E-MEH1274-${Date.now()}`;
    const producerName = `בדיקת פרסונה ${tag}`; // Hebrew ≥3 letters (MEH-555)
    const email = uniqueEmail(1);
    const password = `Meh1274Qa!${Date.now()}`; // ≥12, unique → clears HIBP/deny-list

    let producerId = "";
    let adminToken = "";

    try {
      // ── 0) Admin JWT + a real category id from the live catalogue ──
      adminToken = await adminLogin(request);
      const catsRes = await request.get("/api/categories");
      expect(catsRes.ok(), `GET /categories failed (${catsRes.status()})`).toBeTruthy();
      const cats = (await catsRes.json()) as Category[];
      expect(cats.length, "no categories seeded on the target").toBeGreaterThan(0);
      const categoryId = cats[0].id;

      // ── 1) Drive the REAL 5-frame wizard (existing testids only) ──
      await page.goto("/register/producer");
      await page.getByTestId("register-preflight-start").click();

      // ACCOUNT
      await expect(page.getByTestId("register-frame-account")).toBeVisible();
      await page.getByTestId("register-account-name").fill("בודקת פרסונה");
      await page.getByTestId("register-account-email").fill(email);
      await page.getByTestId("register-account-password").fill(password);
      await page.getByTestId("register-account-next").click();

      // DETAILS — name + phone + city (combobox inside the wrapper) + address
      await expect(page.getByTestId("register-frame-details")).toBeVisible();
      await page.getByTestId("register-details-name").fill(producerName);
      await page.getByTestId("register-details-phone").fill("0501234567");
      await page
        .getByTestId("register-details-city")
        .getByRole("combobox")
        .fill("תל אביב");
      await page.getByTestId("register-details-address").fill("הרצל 1");
      await page.getByTestId("register-details-next").click();

      // CATEGORY — pick the live category; fill the license iff the field is
      // shown (a license-required category gates advance inline, MEH-952).
      await expect(page.getByTestId("register-frame-category")).toBeVisible();
      await page.getByTestId(`category-chip-${categoryId}`).click();
      const licenseInput = page.getByTestId("register-category-license");
      if (await licenseInput.isVisible().catch(() => false)) {
        await licenseInput.fill("000000000");
      }
      await page.getByTestId("register-category-next").click();

      // STORY — tagline + all declarations (ToS + binding), then submit
      await expect(page.getByTestId("register-frame-story")).toBeVisible();
      await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
      for (const cb of await page
        .getByTestId("register-frame-story")
        .getByRole("checkbox")
        .all()) {
        await cb.check();
      }
      await page.getByTestId("register-story-submit").click();

      // CONFIRM — non-upgrade inbox-check state (RegisterAck, no token)
      await expect(page.getByTestId("register-frame-confirm")).toBeVisible({
        timeout: 15_000,
      });

      // ── 2) Lands in the admin queue as pending ──
      const queue = (await (
        await request.get("/api/admin/producers?status=pending", {
          headers: authHeader(adminToken),
        })
      ).json()) as QueueProducer[];
      const mine = queue.find((p) => p.name === producerName);
      expect(mine, "wizard-registered producer not found in the pending queue").toBeTruthy();
      producerId = mine!.id;
      expect(["pending", "pending_whatsapp"]).toContain(mine!.status);

      // ── 3) Admin attaches the MEH-799 image + location, then approves ──
      const putRes = await request.put(`/api/admin/producers/${producerId}`, {
        headers: authHeader(adminToken),
        data: {
          images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
          has_physical_location: true,
          lat: 32.0853,
          lng: 34.7818,
        },
      });
      expect(putRes.ok(), `admin update failed (${putRes.status()}): ${await putRes.text()}`).toBeTruthy();
      const approveRes = await request.post(
        `/api/admin/producers/${producerId}/approve`,
        { headers: authHeader(adminToken) },
      );
      expect(approveRes.ok(), `approve failed (${approveRes.status()}): ${await approveRes.text()}`).toBeTruthy();

      // ── 4) Public producer page is visible (approved + has a slug) ──
      const listed = ((await (
        await request.get(`/api/producers?q=${encodeURIComponent(tag)}`)
      ).json()) as ListProducer[]).find((p) => p.id === producerId);
      expect(listed, "approved producer missing from public /producers").toBeTruthy();
      expect(listed!.status).toBe("approved");
      expect(listed!.slug, "approved producer must have a public slug").toBeTruthy();

      await page.goto(`/${listed!.slug}`);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByText(producerName).first()).toBeVisible({ timeout: 15_000 });

      // ── 5) Log in with the just-created creds, then assert the dashboard's
      //       approved checklist state. Login sets the fingerprint cookie in the
      //       browser context (HTTPS on staging) + we mirror the token into
      //       localStorage["token"] the way auth-context hydrates from. ──
      const loginRes = await page.request.post("/api/auth/login", {
        data: { email, password },
      });
      expect(loginRes.ok(), `producer login failed (${loginRes.status()})`).toBeTruthy();
      const token = (await loginRes.json()).access_token as string;
      await page.goto("/");
      await page.evaluate((t) => localStorage.setItem("token", t), token);

      await page.goto("/producer/dashboard");
      const overview = page.getByTestId("producer-overview");
      await expect(overview).toBeVisible({ timeout: 20_000 });
      // The checklist state: an approved business exposes data-state-approved.
      await expect(overview).toHaveAttribute("data-state-approved", "true");
      // …and the one-tap public link is present (slug assigned on approval).
      await expect(page.getByTestId("view-public-link")).toBeVisible();
    } finally {
      if (producerId && adminToken) {
        await request
          .delete(`/api/admin/producers/${producerId}`, {
            headers: authHeader(adminToken),
          })
          .catch(() => {
            /* fail-open: orphan is tagged E2E-MEH1274-* and admin-sweepable */
          });
      }
    }
  });
});

// ===========================================================================
// P2 — OAuth producer: a 409 surfaces a toast (GSI-stub, mirrors flows/10)
// ===========================================================================
test.describe("P2 — producer OAuth 409 surfaces a toast (MEH-1274)", () => {
  const DETAIL_MSG = "יש לך כבר עסק רשום בחשבון זה. התחברו כדי לנהל אותו.";

  test("a 409 from the OAuth Step-0 endpoint shows the backend detail as a toast", async ({
    page,
  }) => {
    // Stub window.google.accounts.id so useGoogleSignIn captures our callback
    // instead of loading the real GSI script (mirrors flows/10:26-41).
    await page.addInitScript(() => {
      let captured: ((res: { credential: string }) => void) | null = null;
      (window as unknown as { __getProducerGoogleCallback: () => typeof captured }).__getProducerGoogleCallback =
        () => captured;
      (window as unknown as { google: unknown }).google = {
        accounts: {
          id: {
            initialize: ({ callback }: { callback: typeof captured }) => {
              captured = callback;
            },
            renderButton: () => {},
            cancel: () => {},
          },
        },
      };
    });

    await page.route("**/auth/register/producer/oauth", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: DETAIL_MSG }),
      }),
    );

    await page.goto("/register/producer");
    await page.waitForLoadState("domcontentloaded");

    // Skip when the Google button is absent (NEXT_PUBLIC_GOOGLE_CLIENT_ID unset).
    const callbackReady = await page.evaluate(() => {
      const getter = (window as unknown as {
        __getProducerGoogleCallback?: () => unknown;
      }).__getProducerGoogleCallback;
      return typeof getter === "function" && typeof getter() === "function";
    });
    test.skip(
      !callbackReady,
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured in build env — Google button absent",
    );

    await page.evaluate(() => {
      const getter = (window as unknown as {
        __getProducerGoogleCallback: () => (res: { credential: string }) => void;
      }).__getProducerGoogleCallback;
      getter()({ credential: "fake_id_token_for_test" });
    });

    await expect(page.getByText(DETAIL_MSG)).toBeVisible({ timeout: 3000 });
    await page.waitForURL(/\/login(\?|$)/, { timeout: 5000 });
  });
});

// ===========================================================================
// P5 — abandon mid-wizard: draft persists + wizard resets on refresh/back
// ===========================================================================
test.describe("P5 — abandon mid-wizard keeps the draft (MEH-1274)", () => {
  const DRAFT_KEY = "producer_registration_draft";

  async function fillAccountAndAdvance(page: import("@playwright/test").Page, email: string) {
    await page.goto("/register/producer");
    await page.getByTestId("register-preflight-start").click();
    await expect(page.getByTestId("register-frame-account")).toBeVisible();
    await page.getByTestId("register-account-name").fill("בודקת פרסונה");
    await page.getByTestId("register-account-email").fill(email);
    await page.getByTestId("register-account-password").fill("Abcdefgh1234");
    await page.getByTestId("register-account-next").click();
    await expect(page.getByTestId("register-frame-details")).toBeVisible();
  }

  test("refresh mid-wizard: draft persists in localStorage and the pre-flight entry returns", async ({
    page,
  }) => {
    const email = uniqueEmail(5);
    await fillAccountAndAdvance(page, email);

    // ACTUAL behaviour (RegisterProducerClient): every field write mirrors the
    // form to localStorage[DRAFT_KEY]; showPreflight resets to true on mount.
    await page.reload();

    // The wizard resets to its pre-flight entry (no auto-resume mid-step).
    await expect(page.getByTestId("register-preflight-start")).toBeVisible();
    // …but the draft survived the reload with the entered email.
    const draft = await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY);
    expect(draft, "draft must persist across a mid-wizard reload").toBeTruthy();
    expect(draft as string).toContain(email);
  });

  test("back after leaving: returning to the wizard still shows the entry with the draft intact", async ({
    page,
  }) => {
    const email = uniqueEmail(5);
    await fillAccountAndAdvance(page, email);

    // Leave the wizard, then browser-back to it.
    await page.goto("/");
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Pre-flight entry is shown again (fresh mount) and the draft is still there.
    await expect(page.getByTestId("register-preflight-start")).toBeVisible();
    const draft = await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY);
    expect(draft as string).toContain(email);
  });
});
