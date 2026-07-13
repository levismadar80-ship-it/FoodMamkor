import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Spec:     manual/producer-detail-state
 * Purpose:  Converted from docs/MANUAL_TESTING.md §§ "MEH-291 Phase 3 unified
 *           availability card" (public banners, items 14/15/23) and "MEH-51
 *           Trust Ladder + Kashrut Badges" (items 5/6/7) — the state-driven
 *           surfaces of the producer detail page (MEH-1171 conversion stage).
 * Touches:  GET /producers (+ ?availability_state filter) and producer detail
 *           reads only (real backend, MEH-417). No writes.
 * Approach: DATA-DRIVEN find-or-skip. These surfaces only render for a producer
 *           in a specific state (on_vacation / full_this_week / has kashrut
 *           badges), which the local seed does not carry by default — so
 *           scripts/local-backend.sh §4c seeds them, and each test QUERIES the
 *           live API for a producer with the attribute and skips gracefully if
 *           none exists (same philosophy as 03-view-producer-detail's empty-DB
 *           skip). This keeps the test meaningful locally AND CI-safe against
 *           the real Railway backend where the exact producers differ.
 * Does NOT: assert the verified seal (item 4 — BadgeRow/VerifiedTierBadge, its
 *           own surface) or admin/dashboard availability controls (auth-gated,
 *           separate cluster).
 * History:  MEH-1171 (creation).
 */

// KashrutBadgeStrip CODE_TO_KEY → he.json kashrut.badges.<key>.label (verbatim)
const KASHRUT_LABELS: Record<string, string> = {
  rabanut: "כשר מרבנות",
  badatz: 'בדצ"ה',
  chalak: "חלק",
  mehadrin: "מהדרין",
  "organic-kosher": "אורגני כשר",
  shmitta: "שמיטה",
  kilayim: "ללא כלאיים",
  "artisan-dairy": "מוצרי חלב מהחווה",
};

type Prod = {
  slug?: string;
  id: string;
  availability_state?: string;
  kashrut_badges?: string[];
  kashrut_expires_at?: string | null;
};

const listProducers = async (request: APIRequestContext, query = "") => {
  const res = await request.get(`/api/producers${query}`);
  expect(res.ok(), `GET /api/producers${query} → ${res.status()}`).toBeTruthy();
  return (await res.json()) as Prod[];
};

const detailPath = (p: Prod) => (p.slug ? `/${p.slug}` : `/producer/${p.id}`);

// The [slug] detail page is ISR-cached (`revalidate: 60`, page.js:16). A page
// whose producer data changed within the last 60s can serve one stale render
// before the background revalidation lands; the next request is fresh. Navigate
// and, if the expected marker is absent, reload up to a few times to ride out
// the revalidation window. This does NOT mask a persistent bug — a marker that
// never appears still fails. (In CI against long-stable staging data this is a
// no-op single navigation; it only matters right after a local re-seed.)
const gotoWithMarker = async (page: import("@playwright/test").Page, path: string, marker: import("@playwright/test").Locator) => {
  await page.goto(path);
  for (let i = 0; i < 4; i++) {
    if (await marker.isVisible().catch(() => false)) return;
    await page.waitForTimeout(1500);
    await page.reload();
  }
};

test.describe("producer detail — state-driven surfaces (MEH-1171 § MEH-291/MEH-51)", () => {
  // MANUAL_TESTING § MEH-291 item 15 + 23 — on_vacation → slate vacation banner
  // "🌙 בית עסק זה בהפסקה כרגע" + a return-date line
  test("an on_vacation producer shows the vacation banner + return line", async ({ page, request }) => {
    const vac = (await listProducers(request, "?availability_state=on_vacation"))[0];
    test.skip(!vac, "no on_vacation producer on this backend");

    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    const banner = page.getByText("🌙 בית עסק זה בהפסקה כרגע");
    await gotoWithMarker(page, detailPath(vac), banner);
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ניתן להשאיר הודעה")).toBeVisible();
  });

  // MANUAL_TESTING § MEH-291 item 14 — full_this_week → amber slow-response
  // banner "⏳ זמני תגובה ארוכים יותר השבוע"
  test("a full_this_week producer shows the slow-response banner", async ({ page, request }) => {
    const full = (await listProducers(request, "?availability_state=full_this_week"))[0];
    test.skip(!full, "no full_this_week producer on this backend");

    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    const banner = page.getByText("⏳ זמני תגובה ארוכים יותר השבוע");
    await gotoWithMarker(page, detailPath(full), banner);
    await expect(banner).toBeVisible({ timeout: 15_000 });
  });

  // MANUAL_TESTING § MEH-51 items 5 + 6 — KashrutBadgeStrip renders when
  // kashrut_badges present; a within-30-days expiry adds "⚠️ תעודה פגה בקרוב"
  test("a producer with kashrut badges shows the strip (+ near-expiry warning)", async ({ page, request }) => {
    const all = await listProducers(request);
    const withKashrut = all.find((p) => (p.kashrut_badges?.length ?? 0) > 0);
    test.skip(!withKashrut, "no producer with kashrut_badges on this backend");

    const code = withKashrut!.kashrut_badges![0];
    const label = KASHRUT_LABELS[code];
    expect(label, `unmapped kashrut code "${code}"`).toBeTruthy();

    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    const strip = page.getByText(label, { exact: false });
    await gotoWithMarker(page, detailPath(withKashrut!), strip);
    await expect(strip).toBeVisible({ timeout: 15_000 });

    // item 6 — the near-expiry warning renders IFF the cert expires within
    // 30 days (KashrutBadgeStrip.jsx:32 `expiresInDays <= 30`)
    const exp = withKashrut!.kashrut_expires_at;
    if (exp && new Date(exp).getTime() - Date.now() <= 30 * 8.64e7) {
      await expect(page.getByText("⚠️ תעודה פגה בקרוב")).toBeVisible();
    }
  });

  // MANUAL_TESTING § MEH-51 item 7 — no kashrut strip when kashrut_badges empty
  test("a producer with no kashrut badges shows no kashrut strip", async ({ page, request }) => {
    const all = await listProducers(request);
    const noKashrut = all.find((p) => (p.kashrut_badges?.length ?? 0) === 0);
    test.skip(!noKashrut, "every producer on this backend has kashrut badges");

    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    await page.goto(detailPath(noKashrut!));
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
    // none of the 8 kashrut labels should render (the strip returns null on empty)
    for (const label of Object.values(KASHRUT_LABELS)) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
  });
});
