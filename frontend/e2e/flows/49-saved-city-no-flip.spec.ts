import { test, expect } from "./_cloudinary-stub";
import { settledField } from "./_settled-field";
import { stableCatalog } from "./_stable-catalog";

/**
 * MEH-3857 — a city the visitor saved on the site (localStorage `user_city`)
 * never changes what a page shows after the load. It used to be filled into
 * the /group-buys city field and the delivery checker a moment after the first
 * paint; the field, the status chips and the verdict changed under her eyes
 * (staging, iPhone, 25/11). Since then it is offered when the empty field is
 * focused, never filled in (Sapir's choice, 25/11).
 *
 * Every other spec runs with no saved city, which is why the load guard
 * (MEH-3809) never saw this: this spec is the one that loads with one.
 *
 * NO MOCKS (e2e/CLAUDE.md): real backend; the saved city is derived from the
 * live data, so on the old code the seed would have fired.
 */

const WAIT_MS = 3_000;

/** A group-buys counts or list read for one city. */
const isCityRead = (r: import("@playwright/test").Request) =>
  r.url().includes("/group-buys") && r.url().includes("city=");

async function saveCity(page: import("@playwright/test").Page, city: string) {
  await page.addInitScript((c) => {
    try {
      window.localStorage.setItem("user_city", c);
    } catch {
      /* storage blocked: the spec then proves nothing, and says so below */
    }
  }, city);
}

test.describe("MEH-3857 the saved city is offered, never filled in", () => {
  test("/group-buys: the city field stays empty and the status chips do not change after the load", async ({ page }) => {
    // A city with an open group buy: the one the old seed would have filled in.
    const res = await page.request.get("/api/group-buys?status=open");
    expect(res.ok(), "GET /group-buys must respond 2xx").toBeTruthy();
    const rows = (await res.json()) as Array<{ city?: string | null }>;
    const city = rows.find((r) => r.city)?.city || "זכרון יעקב";
    await saveCity(page, city);

    // The unwanted event: a counts or list read for the saved city. Every
    // matching request is recorded from the first byte, so one that left
    // during the load is not missed by a wait set up later.
    const requests: import("@playwright/test").Request[] = [];
    page.on("request", (r) => requests.push(r));
    await page.goto("/group-buys");
    await settledField(page, "group-buys-status-hint");
    const field = page.locator("#group-buys-city");
    await expect(field).toBeVisible();
    const chipsAtLoad = await page.getByTestId("group-buys-status-hint").evaluate(
      (hint) => hint.previousElementSibling?.querySelectorAll("button").length ?? -1,
    );
    expect(chipsAtLoad, "the chip row must be found next to its hint").toBeGreaterThan(0);

    // Then a bounded wait for a late one, caught at once (MEH-2972).
    const late = await page.waitForRequest(isCityRead, { timeout: WAIT_MS }).catch((e: Error) => e);
    expect(late, "no read for the saved city may leave on its own").toBeInstanceOf(Error);
    expect(requests.filter(isCityRead).map((r) => r.url()), "no read for the saved city may have left during the load").toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("user_city")), "the saved city must be in storage").toBe(city);
    await expect(field).toHaveValue("");
    const chipsAfter = await page.getByTestId("group-buys-status-hint").evaluate(
      (hint) => hint.previousElementSibling?.querySelectorAll("button").length ?? -1,
    );
    expect(chipsAfter).toBe(chipsAtLoad);

    // And the offer itself: focusing the empty field lists the saved city.
    await field.focus();
    await expect(page.getByRole("option", { name: city })).toBeVisible();
  });

  test("business page: the delivery checker stays empty, with no verdict, after the load", async ({ page }) => {
    const list = await page.request.get("/api/producers");
    expect(list.ok(), "GET /producers must respond 2xx").toBeTruthy();
    // MEH-3845: never another run's temporary business (_stable-catalog.ts).
    const producers = stableCatalog((await list.json()) as Array<{
      id: string | number;
      name?: string;
      offers_delivery?: boolean;
      delivery_nationwide?: boolean;
      delivery_areas?: Array<{ city?: string }>;
    }>);
    const producer = producers.find(
      (p) => p.offers_delivery && !p.delivery_nationwide && (p.delivery_areas || []).some((a) => a?.city),
    );
    // eslint-disable-next-line playwright/no-skipped-test -- same data gate as 26-delivery-checker.spec.ts: the checker renders only for a business with explicit delivery areas; the unit suite (CoverageRequestCta.test.jsx) holds the behaviour without data
    test.skip(!producer, "no producer with explicit delivery_areas in this environment");
    const city = producer!.delivery_areas!.find((a) => a?.city)!.city!;
    await saveCity(page, city);

    await page.goto(`/producer/${producer!.id}`);
    await expect(await settledField(page, "delivery-checker")).toBeVisible();
    const input = page.getByTestId("delivery-checker-input").getByRole("combobox");

    // The unwanted event: the field filling itself in.
    const filled = page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="delivery-checker-input"] input');
        return el instanceof HTMLInputElement && el.value !== "";
      },
      undefined,
      { timeout: WAIT_MS },
    );
    await expect(filled, "the checker must not fill in the saved city").rejects.toThrow(/Timeout/);
    await expect(input).toHaveValue("");
    await expect(page.getByTestId("delivery-checker-result")).toHaveAttribute("data-result", "none");

    await input.focus();
    await expect(page.getByRole("option", { name: city })).toBeVisible();
  });
});
