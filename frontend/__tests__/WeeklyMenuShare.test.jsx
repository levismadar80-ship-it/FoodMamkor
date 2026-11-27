// MEH-3931: «מה יש השבוע» — the ready message a business sends in WhatsApp
// with this week's orderable products, the open days and the order link.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "@/messages/he.json";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));
const copyOrThrow = vi.fn();
vi.mock("@/lib/clipboard", () => ({ copyOrThrow: (...a) => copyOrThrow(...a) }));

import { weekMenuText, weekDays } from "@/lib/weekly-menu-share";
import OrderWeekShareCard from "@/components/dashboard/orders/OrderWeekShareCard";

const NOW = new Date("2026-11-27T08:00:00Z"); // Friday 27.11, Israel
const PID = "11111111-1111-4111-8111-111111111111";
const PID2 = "22222222-2222-4222-8222-222222222222";

function product(over = {}) {
  return {
    id: PID,
    name: "לחם שאור",
    image_url: null,
    price_min_agorot: 3200,
    price_max_agorot: 3200,
    price_unit: "unit",
    price_is_estimate: false,
    in_stock: true,
    contains_alcohol: false,
    available_weekdays: null,
    variants: [],
    ...over,
  };
}
const slot = (start) => ({ start, end: start, fulfilment: "pickup", alcohol_ok: false });
function menu(over = {}) {
  return {
    producer_id: "33333333-3333-4333-8333-333333333333",
    min_order_agorot: null,
    cancel_cutoff_hours: 24,
    lead_time_hours: 24,
    business_id_number: "1",
    products: [product()],
    slots: [slot("2026-11-27T10:00:00Z"), slot("2026-12-01T10:00:00Z")],
    ...over,
  };
}
/** @param {string} key @param {any} [v] */
function t(key, v) {
  const path = key.split(".");
  /** @type {any} */
  let x = he.dashboard.producer.orders.share;
  for (const k of path) x = x?.[k];
  if (typeof x !== "string") throw new Error(`missing ${key}`);
  return x.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""));
}
const tUnit = (/** @type {string} */ k) => he.price_unit[k];
const args = (m) => ({ menu: m, name: "מאפיית רוח השדה", url: "https://mehamakor.co.il/ruach", locale: "he", t, tUnit, now: NOW });

describe("weekDays", () => {
  it("keeps the offered days of the next seven, each once, soonest first", () => {
    const m = menu({ slots: [slot("2026-12-01T10:00:00Z"), slot("2026-11-27T10:00:00Z"), slot("2026-11-27T12:00:00Z"), slot("2026-12-04T10:00:00Z")] });
    expect(weekDays(m, NOW)).toEqual(["2026-11-27", "2026-12-01"]);
  });
  it("the seventh day is in, a slot before today is out", () => {
    const m = menu({ slots: [slot("2026-11-26T10:00:00Z"), slot("2026-12-03T10:00:00Z")] });
    expect(weekDays(m, NOW)).toEqual(["2026-12-03"]);
  });
  it("counts days on the Israel clock: 22:30 UTC on Thursday is already Friday (UTC+2)", () => {
    const late = new Date("2026-11-26T22:30:00Z");
    expect(weekDays(menu({ slots: [slot("2026-11-26T22:00:00Z"), slot("2026-11-26T23:00:00Z"), slot("2026-12-03T10:00:00Z")] }), late)).toEqual(["2026-11-27", "2026-12-03"]);
    expect(weekDays(menu({ slots: [slot("2026-12-04T10:00:00Z")] }), late)).toEqual([]);
  });
  it("no slot → no day", () => {
    expect(weekDays(menu({ slots: [] }), NOW)).toEqual([]);
  });
});

describe("weekMenuText", () => {
  it("names the business, each product with its price, the days and the link", () => {
    const text = weekMenuText(args(menu())) ?? "";
    expect(text.split("\n")[0]).toContain("מאפיית רוח השדה");
    expect(text).toContain("לחם שאור");
    expect(text).toContain("32");
    expect(text).toContain("שישי 27.11");
    expect(text).toContain("שלישי 1.12");
    expect(text.trim().endsWith("https://mehamakor.co.il/ruach")).toBe(true);
  });
  it("leaves out a product that is out of stock, and keeps the others", () => {
    const m = menu({ products: [product({ in_stock: false }), product({ id: PID2, name: "חלה" })] });
    const text = weekMenuText(args(m)) ?? "";
    expect(text).not.toContain("לחם שאור");
    expect(text).toContain("חלה");
  });
  it("a price per kg says so; a range reads from–to", () => {
    const m = menu({ products: [product({ price_unit: "kg", name: "גבינה" }), product({ id: PID2, name: "עוגה", price_min_agorot: 4000, price_max_agorot: 6000 })] });
    const text = weekMenuText(args(m)) ?? "";
    expect(text).toContain(`גבינה · 32₪ ${he.price_unit.kg}`);
    expect(text).toMatch(/עוגה.*40.*60/);
  });
  it("a product made on some days only says so, and one made on none is left out", () => {
    const FRIDAY = 1 << 5;
    const SUNDAY = 1;
    const m = menu({ products: [product({ name: "חלה", available_weekdays: FRIDAY }), product({ id: PID2, name: "בגט", available_weekdays: SUNDAY })] });
    const text = weekMenuText(args(m)) ?? "";
    expect(text).toMatch(/חלה.*רק ליום שישי 27\.11/);
    expect(text).not.toContain("בגט");
  });
  it("with sizes, the price is the range of the sizes in stock", () => {
    const v = (id, price, in_stock = true) => ({ id, name: id, price_agorot: price, price_is_estimate: false, in_stock });
    const m = menu({ products: [product({ name: "עוגה", price_min_agorot: 1000, price_max_agorot: 9000, variants: [v("44444444-4444-4444-8444-444444444444", 3000), v("55555555-5555-4555-8555-555555555555", 5000), v("66666666-6666-4666-8666-666666666666", 9000, false)] })] });
    const text = weekMenuText(args(m)) ?? "";
    expect(text).toContain("30₪–50₪");
    expect(text).not.toContain("90");
  });
  it("a price per 100 g says so", () => {
    const text = weekMenuText(args(menu({ products: [product({ price_unit: "100g", name: "חלבה" })] }))) ?? "";
    expect(text).toContain(`32₪ ${he.price_unit["100g"]}`);
  });
  it("is null with no product in stock, or with no open day this week", () => {
    expect(weekMenuText(args(menu({ products: [product({ in_stock: false })] })))).toBeNull();
    expect(weekMenuText(args(menu({ slots: [slot("2026-12-10T10:00:00Z")] })))).toBeNull();
  });
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="he" messages={he}>
      <OrderWeekShareCard business={{ name: "מאפיית רוח השדה", slug: "ruach" }} now={NOW} />
    </NextIntlClientProvider>,
  );
}

describe("OrderWeekShareCard", () => {
  beforeEach(() => {
    get.mockReset();
    copyOrThrow.mockReset();
  });

  it("shows the message and a WhatsApp link that carries it", async () => {
    get.mockResolvedValue({ data: menu() });
    renderCard();
    const preview = await screen.findByTestId("week-share-text");
    expect(get).toHaveBeenCalledWith("/producers/me/order-menu/preview");
    expect(preview.textContent).toContain("לחם שאור");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(screen.getByTestId("week-share-whatsapp"));
    expect(open).toHaveBeenCalledTimes(1);
    const href = String(open.mock.calls[0][0]);
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1])).toBe(preview.textContent);
    expect(open.mock.calls[0][2]).toContain("noopener");
    open.mockRestore();
  });

  it("copies the same text and says so", async () => {
    get.mockResolvedValue({ data: menu() });
    copyOrThrow.mockResolvedValue(undefined);
    renderCard();
    const preview = await screen.findByTestId("week-share-text");
    fireEvent.click(screen.getByTestId("week-share-copy"));
    await waitFor(() => expect(copyOrThrow).toHaveBeenCalledWith(preview.textContent));
    expect(await screen.findByText(he.dashboard.producer.orders.share.copied)).toBeTruthy();
  });

  it("a failed copy says so", async () => {
    get.mockResolvedValue({ data: menu() });
    copyOrThrow.mockRejectedValue(new Error("no"));
    renderCard();
    await screen.findByTestId("week-share-text");
    fireEvent.click(screen.getByTestId("week-share-copy"));
    expect(await screen.findByText(he.dashboard.producer.orders.share.copy_failed)).toBeTruthy();
    expect(screen.queryByText(he.dashboard.producer.orders.share.copied)).toBeNull();
  });

  it("nothing to share this week: says why, and offers no button", async () => {
    get.mockResolvedValue({ data: menu({ slots: [] }) });
    renderCard();
    expect(await screen.findByTestId("week-share-empty")).toBeTruthy();
    expect(screen.queryByTestId("week-share-whatsapp")).toBeNull();
  });

  it("every product sold out: says why, and offers no button", async () => {
    get.mockResolvedValue({ data: menu({ products: [product({ in_stock: false })] }) });
    renderCard();
    expect(await screen.findByTestId("week-share-empty")).toBeTruthy();
    expect(screen.queryByTestId("week-share-copy")).toBeNull();
  });

  it("an answer that is not a menu counts as a failed read", async () => {
    get.mockResolvedValue({ data: { nope: true } });
    renderCard();
    expect(await screen.findByTestId("week-share-retry")).toBeTruthy();
    expect(screen.queryByTestId("week-share-empty")).toBeNull();
  });

  it("reads the menu again when a product is switched", async () => {
    get.mockResolvedValue({ data: menu() });
    const ui = (refresh) => (
      <NextIntlClientProvider locale="he" messages={he}>
        <OrderWeekShareCard business={{ name: "מאפיית רוח השדה", slug: "ruach" }} refresh={refresh} now={NOW} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui(0));
    await screen.findByTestId("week-share-text");
    get.mockResolvedValue({ data: menu({ products: [product({ in_stock: false }), product({ id: PID2, name: "חלה" })] }) });
    rerender(ui(1));
    await waitFor(() => expect(screen.getByTestId("week-share-text").textContent).not.toContain("לחם שאור"));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("a failed read says so and retries", async () => {
    get.mockRejectedValueOnce(new Error("down")).mockResolvedValue({ data: menu() });
    renderCard();
    fireEvent.click(await screen.findByTestId("week-share-retry"));
    expect(await screen.findByTestId("week-share-text")).toBeTruthy();
  });
});
