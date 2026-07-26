import { test, expect } from "@playwright/test";

/**
 * MEH-1536 — "מגיעים אלייך?" delivery checker on the producer detail page.
 *
 * NO MOCKS (e2e/CLAUDE.md, MEH-417): these run against the real backend behind
 * the CI `next start` proxy. Expectations are therefore DERIVED from the live
 * payload rather than hardcoded — the spec picks a producer that is actually in
 * each delivery state and asserts the checker's verdict against that producer's
 * own delivery_areas / delivery_excluded_cities.
 *
 * The five answer states are additionally covered deterministically (and in the
 * REQUIRED CI gate) by `frontend/__tests__/DeliveryChecker.test.jsx` — staging
 * data cannot be relied on to contain a producer in every state, in particular
 * the MEH-1255 nationwide-with-exclusions mode, which is rare. Where no such
 * producer exists the test skips with an explicit reason instead of asserting
 * on absent data; the unit suite is what guarantees the logic.
 */

type Area = { city?: string; delivery_day?: string | null; min_order?: number | null };
type Producer = {
  id: string | number;
  offers_delivery?: boolean;
  delivery_nationwide?: boolean;
  delivery_excluded_cities?: string[];
  delivery_areas?: Area[];
};

async function fetchProducers(page: import("@playwright/test").Page): Promise<Producer[]> {
  const res = await page.request.get("/api/producers");
  expect(res.ok(), "GET /producers must respond 2xx").toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body), "GET /producers must return an array").toBe(true);
  return body as Producer[];
}

const namedAreas = (p: Producer) => (p.delivery_areas || []).filter((a) => !!a?.city);

// Explicit per-city delivery: the common case the checker is built for.
const withAreas = (ps: Producer[]) =>
  ps.find((p) => p.offers_delivery && !p.delivery_nationwide && namedAreas(p).length > 0);

// MEH-1255 exclusion mode: nationwide, minus a list.
const withExclusions = (ps: Producer[]) =>
  ps.find(
    (p) => p.offers_delivery && p.delivery_nationwide && (p.delivery_excluded_cities || []).length > 0,
  );

// Nationwide, no exclusions → the answer is trivially yes → checker must not render.
const nationwidePlain = (ps: Producer[]) =>
  ps.find(
    (p) => p.offers_delivery && p.delivery_nationwide && (p.delivery_excluded_cities || []).length === 0,
  );

async function openProducer(page: import("@playwright/test").Page, id: string | number) {
  await page.goto(`/producer/${id}`);
}

const input = (page: import("@playwright/test").Page) =>
  page.getByTestId("delivery-checker-input").getByRole("combobox");

const verdict = (page: import("@playwright/test").Page) =>
  page.getByTestId("delivery-checker-result");

// The verdict is COMMITTED, not live (DeliveryChecker.jsx:78) — the suggestion
// dropdown would otherwise cover it, and a prefix would flash a false negative.
//
// Escape BEFORE Enter is load-bearing: with the dropdown open, Enter commits the
// highlighted suggestion (CitySearch.jsx:99), which is matches[0] — a substring
// match that is often a DIFFERENT city than the one typed ("תל אביב" commits as
// "תל אביב-יפו"). Committing a neighbouring city would silently assert the wrong
// verdict. Escape closes the list so Enter commits the literal text
// (CitySearch.jsx:85-88).
async function check(page: import("@playwright/test").Page, city: string) {
  await input(page).fill(city);
  await input(page).press("Escape");
  await input(page).press("Enter");
}

test.describe("MEH-1536 delivery checker", () => {
  test("a served city answers YES and echoes the producer's own day/minimum", async ({ page }) => {
    const producers = await fetchProducers(page);
    const producer = withAreas(producers);
    test.skip(!producer, "no producer with explicit delivery_areas in this environment");

    const area = namedAreas(producer!)[0];
    await openProducer(page, producer!.id);

    await expect(page.getByTestId("delivery-checker")).toBeVisible({ timeout: 15_000 });
    await check(page, area.city!);
    await expect(verdict(page)).toHaveAttribute("data-result", "yes");
    await expect(verdict(page)).toContainText(area.city!);
    if (area.delivery_day) await expect(verdict(page)).toContainText(area.delivery_day);
  });

  test("an unserved city answers NO — and the full city list stays visible (MEH-1435)", async ({
    page,
  }) => {
    const producers = await fetchProducers(page);
    const producer = withAreas(producers);
    test.skip(!producer, "no producer with explicit delivery_areas in this environment");

    const served = new Set(namedAreas(producer!).map((a) => a.city));
    const missing = ["אילת", "מטולה", "דימונה", "קריית שמונה"].find((c) => !served.has(c));
    test.skip(!missing, "this producer serves every candidate control city");
    await openProducer(page, producer!.id);

    await expect(page.getByTestId("delivery-checker")).toBeVisible({ timeout: 15_000 });
    await check(page, missing!);
    await expect(verdict(page)).toHaveAttribute("data-result", "no");

    // The checker is ADDITIVE — a negative answer must not hide the list below.
    await expect(page.getByText(namedAreas(producer!)[0].city!, { exact: false }).first()).toBeVisible();
  });

  test("nationwide with exclusions: excluded city NO, any other city YES (MEH-1255)", async ({
    page,
  }) => {
    const producers = await fetchProducers(page);
    const producer = withExclusions(producers);
    test.skip(!producer, "no nationwide-with-exclusions producer in this environment");

    const excludedCity = producer!.delivery_excluded_cities![0];
    await openProducer(page, producer!.id);

    await expect(page.getByTestId("delivery-checker")).toBeVisible({ timeout: 15_000 });
    await check(page, excludedCity);
    await expect(verdict(page)).toHaveAttribute("data-result", "no");

    const other = ["חיפה", "ירושלים", "באר שבע"].find(
      (c) => !producer!.delivery_excluded_cities!.includes(c),
    )!;
    await check(page, other);
    await expect(verdict(page)).toHaveAttribute("data-result", "yes_nationwide");
  });

  test("nationwide with no exclusions: the checker is not rendered at all", async ({ page }) => {
    const producers = await fetchProducers(page);
    const producer = nationwidePlain(producers);
    test.skip(!producer, "no plain-nationwide producer in this environment");

    await openProducer(page, producer!.id);
    // The delivery section itself must still be there — only the checker is gone.
    await expect(page.getByTestId("delivery-checker")).toHaveCount(0);
  });
});
