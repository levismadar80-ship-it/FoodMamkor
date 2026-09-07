/**
 * Module:   40-rejected-resubmit-loop
 * Spec:     MEH-2210 — the rejected → resubmit loop, end to end against the
 *           real backend the suite targets: an admin rejects with a structured
 *           reason code, the owner dashboard renders the reason-driven banner
 *           (line + deep link + CTA + "שליחה 1 מתוך 3"), and the CTA reaches
 *           POST /producers/me/request-review.
 * Touches:  creates ONE disposable producer on the target backend (tagged
 *           E2E-MEH2210-*, deleted in `finally`), one /auth/register call and
 *           one /auth/login call — both rate-limited per IP, which is why this
 *           runs on the desktop project only (19's precedent).
 * Does NOT: drive the rejected → pending transition itself. The completeness
 *           gate (MEH-2120) requires `phone_verified`, which only the OTP flow
 *           can set and which has no test bypass, so the CTA's click here is
 *           answered by the gate (422 → inline error). The transition, the
 *           3-resubmission cap and the admin ping are asserted in
 *           tests/test_producer_resubmit.py through the app; the request-review
 *           route is also 3/hour per IP, so the cap could not be exercised
 *           here even with a verified phone.
 * Related:  19-publish-approve-visible.spec.ts (the register → admin PUT →
 *           approve scaffolding this reuses, incl. the single-project guard),
 *           RejectedBanner.jsx (chunk B — every locator here is one of its
 *           data-testids), AdminProducersTable.jsx ResubmissionBadge (chunk C).
 * History:  MEH-2210 chunk C (creation).
 */
import { test, expect } from "./_cloudinary-stub";
import { authedContext, fixtureExists } from "../auth-fixture";

const TAG = `E2E-MEH2210-${Date.now()}`;
const PRODUCER_NAME = `בדיקת ${TAG}`;
const OWNER_EMAIL = `e2e+2210-${Date.now()}@example.com`;
const OWNER_PASSWORD = `Meh2210Qa!${Date.now()}`;
const LAT = 32.0853;
const LNG = 34.7818;
const TEST_IMAGE = "https://res.cloudinary.com/demo/image/upload/sample.jpg";

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "";

interface QueueProducer {
  id: string;
  name: string;
  status: string;
  rejection_reason: string | null;
  rejection_reason_code: string | null;
  resubmission_count: number;
}
interface Category {
  id: number;
}

test.describe("Rejected → resubmit loop (MEH-2210)", () => {
  test("admin rejects with a code → owner sees the reason-driven banner and the CTA reaches the endpoint", async ({
    request,
    page,
    baseURL,
  }) => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD not configured — admin-driven path unavailable",
    );
    expect(
      fixtureExists("smoke-admin"),
      "SMOKE_ADMIN_* are set but e2e/.auth/smoke-admin.json is missing — global-setup did not provision it",
    ).toBeTruthy();
    test.skip(
      test.info().project.name !== "desktop",
      "single-project guard — one registration per run (shared /auth/register quota)",
    );

    let producerId = "";
    const adminCtx = await authedContext("smoke-admin");

    try {
      // ── 1) register a disposable producer (lands as draft, MEH-2100) ──────
      const cats = (await (await request.get("/api/categories")).json()) as Category[];
      expect(cats.length, "no categories on the target backend").toBeGreaterThan(0);
      const regRes = await request.post("/api/auth/register/producer", {
        data: {
          email: OWNER_EMAIL,
          name: "בודקת אוטומציה",
          password: OWNER_PASSWORD,
          producer_name: PRODUCER_NAME,
          short_description: "בית עסק בדיקה אוטומטי",
          city: "תל אביב",
          address: "הרצל 1",
          lat: LAT,
          lng: LNG,
          phone: "0501234567",
          primary_contact_method: "phone",
          category_ids: [cats[0].id],
          producer_license_number: "000000000",
          declaration_accepted: true,
        },
      });
      expect(regRes.ok(), `register failed (${regRes.status()}): ${await regRes.text()}`).toBeTruthy();

      const drafts = (await (
        await adminCtx.get("/api/admin/producers?status=draft")
      ).json()) as QueueProducer[];
      const mine = drafts.find((p) => p.name === PRODUCER_NAME);
      expect(mine, "registered producer not found in the draft list").toBeTruthy();
      producerId = mine!.id;

      // ── 2) admin approves (19's path), then REJECTS with a structured code ─
      // A draft cannot be rejected (409 — MEH-2121), and the front door needs
      // a verified phone, so approve-then-reject is the only way a disposable
      // producer can reach `rejected` from here. Reject itself guards draft
      // only, so approved → rejected is a legal admin decision.
      const putRes = await adminCtx.put(`/api/admin/producers/${producerId}`, {
        data: { images: [TEST_IMAGE], has_physical_location: true, lat: LAT, lng: LNG },
      });
      expect(putRes.ok(), `admin update failed (${putRes.status()}): ${await putRes.text()}`).toBeTruthy();
      const approveRes = await adminCtx.post(`/api/admin/producers/${producerId}/approve`);
      expect(approveRes.ok(), `approve failed (${approveRes.status()}): ${await approveRes.text()}`).toBeTruthy();

      const rejectRes = await adminCtx.post(`/api/admin/producers/${producerId}/reject`, {
        data: { preset_key: "missing_image", reason: "בדיקה אוטומטית" },
      });
      expect(rejectRes.ok(), `reject failed (${rejectRes.status()}): ${await rejectRes.text()}`).toBeTruthy();

      const rejected = (await (
        await adminCtx.get(`/api/admin/producers/${producerId}`)
      ).json()) as QueueProducer;
      expect(rejected.status).toBe("rejected");
      expect(rejected.rejection_reason_code, "chunk A: the preset key is persisted as the code").toBe(
        "missing_image",
      );
      expect(rejected.rejection_reason).toContain("תמונה ראשית חסרה");
      expect(rejected.resubmission_count).toBe(0);

      // ── 3) log the OWNER in — the global-setup pattern: login via the API,
      //       keep its cookies (the __Secure-Fgp fingerprint, MEH-1858), inject
      //       the JWT into localStorage where auth-context.js reads it. ────────
      const loginRes = await request.post("/api/auth/login", {
        data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      });
      expect(loginRes.ok(), `owner login failed (${loginRes.status()}): ${await loginRes.text()}`).toBeTruthy();
      const { access_token: token } = (await loginRes.json()) as { access_token: string };
      expect(token, "login returned no access_token").toBeTruthy();
      const loginState = await request.storageState();
      await page.context().addCookies(loginState.cookies);
      await page.context().addInitScript(
        ({ jwt }) => {
          window.localStorage.setItem("token", jwt);
          window.localStorage.setItem("cookieConsent", "essential");
        },
        { jwt: token },
      );

      // ── 4) the banner, from REAL data (chunk B reads code + count) ────────
      await page.goto("/producer/dashboard");
      const banner = page.getByTestId("status-rejected-banner");
      await expect(banner).toBeVisible({ timeout: 20_000 });
      await expect(banner).toHaveAttribute("data-reason-code", "missing_image");
      const line = page.getByTestId("status-rejected-line");
      await expect(line).toHaveAttribute("data-code", "missing_image");
      await expect(page.getByTestId("status-rejected-fix-link")).toHaveAttribute(
        "href",
        /#images$/,
      );
      await expect(page.getByTestId("status-rejected-reason")).toContainText("בדיקה אוטומטית");
      await expect(page.getByTestId("status-rejected-caption")).toHaveText("שליחה 1 מתוך 3");
      // The three MEH-1355 generic tips must not be on the page (absence).
      await expect(page.getByText("הוסיפו תמונות ברורות של המוצרים")).toHaveCount(0);

      // ── 5) the CTA reaches the endpoint; the completeness gate answers ────
      // The phone is not verified (no OTP bypass exists), so the server's
      // 422 is the CORRECT answer here and is rendered inline. This proves the
      // wiring (button → POST → detailToMessage), not the transition — see
      // the module header for where the transition is asserted.
      const reviewReq = page.waitForResponse(
        (r) => r.url().includes("/producers/me/request-review") && r.request().method() === "POST",
        { timeout: 15_000 },
      );
      await page.getByTestId("status-rejected-resubmit").click();
      const reviewRes = await reviewReq;
      expect(reviewRes.status(), "the gate refuses an unverified phone with 422").toBe(422);
      await expect(page.getByTestId("status-rejected-error")).toBeVisible({ timeout: 10_000 });
      await expect(banner).toBeVisible();

      const after = (await (
        await adminCtx.get(`/api/admin/producers/${producerId}`)
      ).json()) as QueueProducer;
      expect(after.status).toBe("rejected");
      expect(after.resubmission_count, "a refused resubmit must not count").toBe(0);
    } finally {
      if (producerId) {
        await adminCtx.delete(`/api/admin/producers/${producerId}`).catch(() => {
          /* fail-open: an orphan is tagged E2E-MEH2210-* and admin-sweepable */
        });
      }
      await adminCtx.dispose();
    }
  });
});
