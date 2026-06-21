import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Spec:     19-publish-approve-visible
 * Purpose:  Guards the single most critical path on the site —
 *           producer publish → admin approve → public visibility. A silent
 *           regression anywhere in the chain (status propagation, MEH-799
 *           image gate, admin queue, /producers + /map filters) breaks the
 *           core product unnoticed; this spec fails loudly when it does.
 * Touches:  REAL staging backend (no mocks) via the Next.js `/api` proxy —
 *           POST /auth/register/producer, POST /auth/login,
 *           GET/PUT/POST/DELETE /admin/producers/*, GET /producers.
 * Does NOT: re-test the 5-frame register *wizard UI* — that is owned by
 *           18-producer-register-wizard.spec.ts. This spec owns the
 *           cross-system propagation, not the form rendering.
 * History:  MEH-216 (creation).
 *
 * // MEH-360: RUNS on the Vercel preview deploy (in CI / by Sapir), NOT in the
 * CC sandbox — envoy denies the preview + *.up.railway.app there.
 *
 * Design notes (Phase 0, MEH-216):
 * - The producer row is born from the *real* public publish endpoint
 *   (POST /auth/register/producer → status="pending_whatsapp"). That endpoint
 *   gates the producer's own login behind email verification and returns no
 *   token (anti-enumeration RegisterAck), so the rest of the lifecycle can't
 *   be driven by clicks on staging. Everything after publish is therefore
 *   driven through the REAL admin API (seeded admin → JWT), which is exactly
 *   how the queue is operated in production. No request is stubbed — this is a
 *   real-backend flow, honouring the no-mocks rule (frontend/e2e/CLAUDE.md).
 * - MEH-799: approval is gated on >=1 image. We attach one (+ has_physical_location
 *   for /map) via the admin PUT before approving — same step a human admin takes.
 * - Cleanup: the disposable producer is deleted in `finally` regardless of
 *   outcome. The name carries a unique E2E-MEH216-<ts> tag so any orphan left
 *   by an aborted run is trivially identifiable in the admin queue.
 *
 * Required CI env (graceful-skip when absent — mirrors 10-producer-oauth-409):
 *   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD — the seeded staging admin. These
 *   are the SAME secrets the staging smoke job already uses (staging-smoke.yml;
 *   backend/.env.example), so no new env var is introduced. They still need to
 *   be passed through to the Playwright step in e2e.yml; see PR description.
 */

const TAG = `E2E-MEH216-${Date.now()}`;
const PRODUCER_NAME = `בדיקת ${TAG}`; // Hebrew letters satisfy the >=3-letter validator (MEH-555)

// Tel Aviv — real coordinates so the row clears the /map geo + radius filter.
const LAT = 32.0853;
const LNG = 34.7818;

// MEH-799 image gate: approval only checks `producer.images` is non-empty; the
// URL is never fetched. A Cloudinary demo asset keeps the value well-formed for
// the fail-open Cloudinary cleanup on DELETE.
const TEST_IMAGE = "https://res.cloudinary.com/demo/image/upload/sample.jpg";

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "";

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
}
interface Category {
  id: number;
  name: string;
}

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

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

test.describe("Publish → approve → visible (MEH-216 critical path)", () => {
  test("a published producer is pending, hidden until approved, then live on /producers and /map", async ({
    request,
    page,
  }) => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD not configured — admin-driven path unavailable",
    );
    // Run on ONE project only: this spec creates a real staging producer, and
    // the /auth/register limiter quota is shared across CI runs (frontend/e2e/
    // CLAUDE.md). Two projects → two registrations → wasted quota + DB litter.
    test.skip(
      test.info().project.name !== "desktop",
      "single-project guard — avoid a duplicate staging registration",
    );

    let producerId = "";
    let adminToken = "";

    try {
      // ── 0) Admin auth (seeded staging admin → JWT) ──────────────────────
      adminToken = await adminLogin(request);

      // ── 1) A real, existing category for the publish payload ────────────
      const catsRes = await request.get("/api/categories");
      expect(catsRes.ok(), `GET /categories failed (${catsRes.status()})`).toBeTruthy();
      const cats = (await catsRes.json()) as Category[];
      expect(cats.length, "no categories seeded on staging").toBeGreaterThan(0);
      const categoryId = cats[0].id;

      // ── 2) PUBLISH via the REAL public route ────────────────────────────
      const regRes = await request.post("/api/auth/register/producer", {
        data: {
          email: `e2e+${Date.now()}@example.com`, // .test TLD is rejected (MEH-353)
          name: "בודקת אוטומציה",
          password: `Meh216Qa!${Date.now()}`, // >=12, unique → clears HIBP/deny-list
          producer_name: PRODUCER_NAME,
          short_description: "בית עסק בדיקה אוטומטי",
          city: "תל אביב",
          address: "הרצל 1",
          lat: LAT,
          lng: LNG,
          phone: "0501234567",
          primary_contact_method: "phone",
          category_ids: [categoryId],
          producer_license_number: "000000000", // covers any license-gated category
          declaration_accepted: true, // handler 422s when falsy (MEH-759)
        },
      });
      expect(
        regRes.ok(),
        `publish failed (${regRes.status()}): ${await regRes.text()}`,
      ).toBeTruthy();

      // ── 3) Lands in the admin queue as pending ──────────────────────────
      // status=pending groups both "pending" and "pending_whatsapp" (admin.py).
      const queueRes = await request.get("/api/admin/producers?status=pending", {
        headers: authHeader(adminToken),
      });
      expect(queueRes.ok(), `admin queue fetch failed (${queueRes.status()})`).toBeTruthy();
      const queue = (await queueRes.json()) as QueueProducer[];
      const mine = queue.find((p) => p.name === PRODUCER_NAME);
      expect(mine, "published producer not found in the pending admin queue").toBeTruthy();
      producerId = mine!.id;
      expect(["pending", "pending_whatsapp"]).toContain(mine!.status);

      // ── 3b) Not public yet — approval is what flips visibility ───────────
      const preList = (await (
        await request.get(`/api/producers?q=${encodeURIComponent(TAG)}`)
      ).json()) as ListProducer[];
      expect(
        preList.find((p) => p.id === producerId),
        "a pending producer must NOT be publicly visible",
      ).toBeFalsy();

      // ── 4) Admin attaches the MEH-799 required image + physical location ─
      const putRes = await request.put(`/api/admin/producers/${producerId}`, {
        headers: authHeader(adminToken),
        data: { images: [TEST_IMAGE], has_physical_location: true, lat: LAT, lng: LNG },
      });
      expect(
        putRes.ok(),
        `admin update (image/location) failed (${putRes.status()}): ${await putRes.text()}`,
      ).toBeTruthy();

      // ── 5) Admin approves ───────────────────────────────────────────────
      const approveRes = await request.post(`/api/admin/producers/${producerId}/approve`, {
        headers: authHeader(adminToken),
      });
      expect(
        approveRes.ok(),
        `approve failed (${approveRes.status()}): ${await approveRes.text()}`,
      ).toBeTruthy();

      // ── 6) Visible on /producers (public list — the directory data source) ─
      const listRes = await request.get(`/api/producers?q=${encodeURIComponent(TAG)}`);
      expect(listRes.ok(), `public list failed (${listRes.status()})`).toBeTruthy();
      const listed = ((await listRes.json()) as ListProducer[]).find((p) => p.id === producerId);
      expect(listed, "approved producer missing from public /producers list").toBeTruthy();
      expect(listed!.status).toBe("approved");

      // ── 6b) Visible on /map (geo query — the marker data source) ─────────
      const mapRes = await request.get(
        `/api/producers?lat=${LAT}&lng=${LNG}&radius_km=25&q=${encodeURIComponent(TAG)}`,
      );
      expect(mapRes.ok(), `map geo query failed (${mapRes.status()})`).toBeTruthy();
      expect(
        ((await mapRes.json()) as ListProducer[]).find((p) => p.id === producerId),
        "approved producer missing from /map geo results (status/has_physical_location/coords)",
      ).toBeTruthy();

      // ── 6c) UI sanity: the /producers page renders a card for the search ─
      // TAG is unique, so the only card returned is ours.
      await page.goto(`/producers?q=${encodeURIComponent(TAG)}`);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator('[data-testid="producer-card"]').first()).toBeVisible({
        timeout: 15_000,
      });

      // ── 6d) UI sanity: the /map page mounts (markers are data-driven; the
      //        specific marker presence is already proven by 6b's data source) ─
      await page.goto("/map");
      await page.waitForFunction(
        () =>
          (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !==
          undefined,
        { timeout: 45_000 },
      );
    } finally {
      // Cleanup — delete the disposable producer no matter what happened above.
      if (producerId && adminToken) {
        await request
          .delete(`/api/admin/producers/${producerId}`, { headers: authHeader(adminToken) })
          .catch(() => {
            /* fail-open: an orphan is tagged E2E-MEH216-* and admin-sweepable */
          });
      }
    }
  });
});
