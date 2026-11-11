import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/dashboard-vanity-share
 * Purpose:  MEH-2827 PR 8 (#4178) — the owner dashboard's «שתפו» on the
 *           /p/{slug} card opens the phone's share sheet with the link as
 *           `url`; with no share sheet it copies the link. This is the
 *           real-browser stand-in for the vitest click case quarantined in
 *           __tests__/Dashboard1DStates.test.jsx (MEH-2876: the click hung the
 *           vitest worker three times). Sapir 10/11: quarantine + prove the
 *           page in a browser.
 * Touches:  no backend. Auth + the three dashboard reads are stubbed with a
 *           profile complete enough to unlock the share card (MEH-964 gate).
 * Does NOT: test the copy / QR / analytics cards — Dashboard1DStates owns those.
 */

const PRODUCER = {
  id: 7, name: "חוות ערוגות נועם", slug: "arugot-noam", status: "approved",
  availability_state: "accepting_orders", city: "חיפה",
  locations: [{ id: 1, lat: 32.79, lng: 34.99, kind: "main", is_primary: true, opening_hours: "א-ה 8:00-16:00" }],
  phone: "0501234567", phone_verified: true, description: "ירקות אורגניים מהחווה, קטיף יומי.",
  images: ["x"], categories: [{ id: 1, name: "ירקות" }], opening_hours: "א-ה",
};
const ZERO = { last_7d: 0, last_30d: 0, total: 0 };
const ANALYTICS = {
  profile_views: { last_7d: 2, last_30d: 4, total: 9 }, whatsapp_clicks: ZERO, contact_clicks: ZERO,
  average_rating: 0, total_reviews: 0, conversion_rate: 0,
};

// "ok" resolves; "refused" rejects like a share target that failed (not a
// cancel); "none" = no share sheet at all (most desktops).
type ShareMode = "ok" | "refused" | "none";

async function stub(page: Page, { share }: { share: ShareMode }) {
  const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  await page.addInitScript((ws) => {
    localStorage.setItem("token", "e2e-token");
    localStorage.setItem("cookieConsent", "essential");
    const w = window as unknown as { __shared: unknown[]; __copied: string[] };
    w.__shared = [];
    w.__copied = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value:
        ws === "none"
          ? undefined
          : (d: unknown) => {
              w.__shared.push(d);
              return ws === "ok" ? Promise.resolve() : Promise.reject(new DOMException("refused", "NotAllowedError"));
            },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t: string) => (w.__copied.push(t), Promise.resolve()) },
    });
  }, share);
  await page.route((u) => /\/api\//.test(u.pathname), (r) => {
    const p = new URL(r.request().url()).pathname.replace(/^\/api/, "");
    if (/\/auth\/me\/?$/.test(p)) return json(r, { id: 42, email: "o@example.com", name: "נועה", role: "producer", producer_id: 7, phone_verified: true });
    // MEH-2880: the real /me/dashboard payload has no slug — the page must take
    // it from /producers/me. (This stub used to carry one, which hid the bug.)
    if (/\/producers\/me\/dashboard/.test(p)) return json(r, { producer: { ...PRODUCER, slug: undefined } });
    if (/\/producers\/me\/analytics/.test(p)) return json(r, ANALYTICS);
    if (/\/producers\/me\/?$/.test(p)) return json(r, PRODUCER);
    if (/count/.test(p)) return json(r, { count: 0 });
    return json(r, []);
  });
}

// The link exactly as the card shows it — equality, not a suffix match, so a
// wrong origin or the whole message in place of the link goes red.
const shownUrl = (page: Page) => page.locator('[dir="ltr"].font-mono').first().textContent();

const sharedState = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __shared: { url?: string }[]; __copied: string[] };
    return { shared: w.__shared, copied: w.__copied };
  });

test.describe("dashboard «שתפו» (MEH-2827 PR 8)", () => {
  test("with a share sheet: opens it with /p/{slug} as url, copies nothing", async ({ page }) => {
    await stub(page, { share: "ok" });
    await page.goto("/he/producer/dashboard");
    await page.getByTestId("vanity-share").click({ timeout: 20_000 });
    await expect.poll(async () => (await sharedState(page)).shared).toHaveLength(1);
    const url = await shownUrl(page);
    expect(url).toMatch(/\/p\/arugot-noam$/);
    const { shared, copied } = await sharedState(page);
    expect(shared[0].url).toBe(url);
    expect(copied).toEqual([]);
  });

  test("without a share sheet: copies the /p/{slug} link", async ({ page }) => {
    await stub(page, { share: "none" });
    await page.goto("/he/producer/dashboard");
    await page.getByTestId("vanity-share").click({ timeout: 20_000 });
    await expect.poll(async () => (await sharedState(page)).copied).toHaveLength(1);
    const { shared, copied } = await sharedState(page);
    expect(copied[0]).toBe(await shownUrl(page));
    expect(shared).toEqual([]);
  });

  test("a share sheet that fails (not a cancel): falls back to copying the link", async ({ page }) => {
    await stub(page, { share: "refused" });
    await page.goto("/he/producer/dashboard");
    await page.getByTestId("vanity-share").click({ timeout: 20_000 });
    await expect.poll(async () => (await sharedState(page)).copied).toHaveLength(1);
    const { shared, copied } = await sharedState(page);
    expect(shared).toHaveLength(1);
    expect(copied[0]).toBe(await shownUrl(page));
  });
});
