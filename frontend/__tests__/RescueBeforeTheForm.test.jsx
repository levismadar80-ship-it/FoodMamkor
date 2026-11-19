/**
 * MEH-2921 / MEH-2935 — a business knows BEFORE the publish form whether it
 * can publish, and both publish buttons state the same facts.
 *
 * Rendered with the real next-intl provider and the real he.json, so ICU
 * plurals («סל אחד») are exercised, not a string replace.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn(), put: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: RescueTab } = await import("@/components/dashboard/RescueTab");

const IN_PILOT = "11111111-1111-4111-8111-111111111111";
const OUTSIDE = "22222222-2222-4222-8222-222222222222";

function mock({ status = "approved", locations, pilot = [IN_PILOT], orders = [] } = {}) {
  get.mockImplementation((url) => {
    if (url === "/producers/me") return Promise.resolve({ data: { name: "מאפיית בדיקה", status } });
    if (url === "/producers/me/locations")
      return Promise.resolve({
        data: locations ?? [{ id: IN_PILOT, location_precision: "exact", city: "רעננה" }],
      });
    if (url === "/producers/me/rescue/pilot-locations") return Promise.resolve({ data: { location_ids: pilot } });
    if (url === "/producers/me/rescue/orders") return Promise.resolve({ data: orders });
    if (String(url).includes("typical-items")) return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: [] });
  });
}

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <RescueTab />
    </NextIntlClientProvider>,
  );

const RESERVED = {
  id: "o1",
  offer_id: "f1",
  status: "reserved",
  pickup_code: "1234",
  qty: 1,
  pickup_end: new Date(Date.now() + 3600e3).toISOString(),
};

describe("RescueTab — pilot town known before the form (MEH-2921 c)", () => {
  beforeEach(() => get.mockReset());

  it("exact point outside the pilot: says so with the town, no form", async () => {
    mock({ locations: [{ id: OUTSIDE, location_precision: "exact", city: "אילת" }], pilot: [] });
    renderTab();
    const box = await screen.findByTestId("rescue-not-in-pilot");
    expect(box.textContent).toContain("סלי הפתעה עדיין לא פתוחים באילת.");
    expect(screen.queryByTestId("rescue-publish-today")).toBeNull();
  });

  it("exact point in the pilot: the form, no notice", async () => {
    mock();
    renderTab();
    await screen.findByTestId("rescue-publish-today");
    expect(screen.queryByTestId("rescue-not-in-pilot")).toBeNull();
    expect(screen.getByTestId("rescue-publish-suggestion").textContent).toBe(
      "מילאנו הצעה לפי ערב רגיל. משנים לפי מה שנשאר היום.",
    );
  });

  it("pilot read fails: the form stays (the server still guards)", async () => {
    mock();
    const base = get.getMockImplementation();
    get.mockImplementation((url) =>
      url === "/producers/me/rescue/pilot-locations" ? Promise.reject(new Error("net")) : base(url),
    );
    renderTab();
    expect(await screen.findByTestId("rescue-publish-today")).toBeTruthy();
    expect(screen.queryByTestId("rescue-not-in-pilot")).toBeNull();
  });

  it("no exact point: the address box names where to go", async () => {
    mock({ locations: [{ id: IN_PILOT, location_precision: "approximate", city: "רעננה" }] });
    renderTab();
    const box = await screen.findByTestId("rescue-needs-address");
    expect(box.textContent).toContain("בוחרים «דיוק: מדויק»");
    expect(screen.getByTestId("rescue-needs-address-link").textContent).toBe("לעריכת המיקום");
  });
});

describe("RescueTab — code box only where there is something to hand over (MEH-2921 d)", () => {
  beforeEach(() => get.mockReset());

  it.each([
    ["pending", [], false],
    ["pending", [RESERVED], true],
    ["suspended", [], false],
    ["suspended", [RESERVED], true],
    ["approved", [], true],
    ["approved", [RESERVED], true],
  ])("%s with %j orders → code box %s", async (status, orders, shown) => {
    mock({ status, orders });
    renderTab();
    await screen.findByTestId("rescue-counters");
    // wait until status + orders both answered
    await screen.findByTestId(status === "approved" ? "rescue-publish-today" : status === "pending" ? "rescue-pending-banner" : "rescue-not-approved");
    if (orders.length) await screen.findByTestId("rescue-order-row");
    expect(!!screen.queryByTestId("rescue-code-box")).toBe(shown);
  });
});

describe("RescueTab — both publish buttons, same facts (MEH-2935)", () => {
  beforeEach(() => get.mockReset());

  it("default form: quantity and price on both", async () => {
    mock();
    renderTab();
    const today = await screen.findByTestId("rescue-publish-today");
    expect(today.textContent).toBe("לפרסם להיום · 4 סלים · 15 ₪ לסל");
    expect(screen.getByTestId("rescue-publish-tomorrow").textContent).toBe("לפרסם למחר · 4 סלים · 15 ₪ לסל");
  });

  it("one bag reads «סל אחד»", async () => {
    mock();
    renderTab();
    fireEvent.change(await screen.findByTestId("rescue-publish-qty"), { target: { value: "1" } });
    expect(screen.getByTestId("rescue-publish-today").textContent).toBe("לפרסם להיום · סל אחד · 15 ₪ לסל");
    expect(screen.getByTestId("rescue-publish-tomorrow").textContent).toBe("לפרסם למחר · סל אחד · 15 ₪ לסל");
  });

  it("bag contents and allergens come before the publish buttons", async () => {
    mock();
    renderTab();
    const button = await screen.findByTestId("rescue-publish-today");
    const items = screen.getByTestId("rescue-items-section");
    expect(items.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(items.textContent).toContain("מה בדרך כלל בסל");
    expect(screen.getByText("מחיר לסל (₪)")).toBeTruthy();
  });
});
