/**
 * Daily stock (Fischgrund bakery, 27/11/2026): the buyer's cap and «נשארו N»,
 * the slots whose day still has room, the owner's «כמה ליום» field, and the
 * week's «מה להכין» read from the server.
 *
 * 5-state rule: the stock rows, the variant fields and the prep days are each
 * 0 / 1 / many; the prep list is shown open. Rendered with the real he.json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

import DailyLimitField, { LIMIT_MAX, parseLimit } from "@/components/dashboard/orders/DailyLimitField";
import OrderPrepList from "@/components/dashboard/orders/OrderPrepList";
import OrderProductsCard from "@/components/dashboard/orders/OrderProductsCard";
import OrderStepper from "@/components/public/OrderStepper";
import api from "@/lib/api";
import { LOW_STOCK_AT, leftOn, mostLeft, removeShort, shortOn, stockShortText, stockSlots, variantCap } from "@/lib/daily-stock";
import { prepDayName, prepRows } from "@/lib/daily-stock-owner";
import { lineKey } from "@/lib/product-variants";
import { readFileSync } from "node:fs";
import path from "node:path";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const V1 = "33333333-3333-4333-8333-333333333333";
const V2 = "44444444-4444-4444-8444-444444444444";

// Noon UTC is the same date on the Israel clock.
const FRI = "2026-12-04";
const SAT = "2026-12-05";
const slot = (day) => ({ start: `${day}T10:00:00Z`, end: `${day}T11:00:00Z` });

const wrap = (node) => (
  <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
    {node}
  </NextIntlClientProvider>
);

beforeEach(() => vi.clearAllMocks());

describe("lib/daily-stock: what is left", () => {
  const menu = {
    slots: [slot(FRI), slot(SAT)],
    stock: [
      { day: FRI, product_id: P1, variant_id: null, left: 0 },
      { day: SAT, product_id: P1, variant_id: null, left: 4 },
      { day: FRI, product_id: P1, variant_id: V1, left: 2 },
      { day: SAT, product_id: P1, variant_id: V1, left: 1 },
    ],
  };

  it("0 rows: no limit anywhere", () => {
    expect(leftOn({}, { day: FRI, productId: P1 })).toBeNull();
    expect(mostLeft({ slots: [slot(FRI)] }, P1)).toBeNull();
  });

  it("a product's row and a variant's row are read apart", () => {
    expect(leftOn(menu, { day: FRI, productId: P1 })).toBe(0);
    expect(leftOn(menu, { day: FRI, productId: P1, variantId: V1 })).toBe(2);
    expect(leftOn(menu, { day: FRI, productId: P2 })).toBeNull();
  });

  it("the most she can pick is the best day, under both limits", () => {
    expect(mostLeft(menu, P1)).toBe(4);
    // Friday: product 0 → 0; Saturday: min(4, 1) → 1.
    expect(mostLeft(menu, P1, V1)).toBe(1);
  });

  it("one offered day with no limit lifts the cap", () => {
    const open = { ...menu, slots: [...menu.slots, slot("2026-12-06")] };
    expect(mostLeft(open, P1)).toBeNull();
  });

  it("the cart is checked per variant and summed per product", () => {
    expect(shortOn(menu, { [P1]: 4 }, SAT)).toBeNull();
    expect(shortOn(menu, { [P1]: 5 }, SAT)).toEqual({ productId: P1, variantId: null, left: 4 });
    expect(shortOn(menu, { [lineKey(P1, V1)]: 2 }, SAT)).toEqual({ productId: P1, variantId: V1, left: 1 });
    expect(shortOn(menu, { [lineKey(P1, V1)]: 1, [P1]: 4 }, SAT)).toEqual({ productId: P1, variantId: null, left: 4 });
  });

  it("only the days with room stay; with none, the line with the most room is named", () => {
    const offered = [slot(FRI), slot(SAT)];
    const one = stockSlots(offered, menu, { [P1]: 3 });
    expect(one.slots.map((s) => s.start)).toEqual([slot(SAT).start]);
    expect(one.short).toBeNull();
    const none = stockSlots(offered, menu, { [P1]: 9 });
    expect(none.slots).toEqual([]);
    expect(none.short).toEqual({ productId: P1, variantId: null, left: 4 });
    expect(stockSlots([], menu, { [P1]: 9 })).toEqual({ slots: [], short: null });
  });

  it("the sheet's line names the product, and the variant when it is one", () => {
    const byId = new Map([[P1, { id: P1, name: "חלה", variants: [{ id: V1, name: "זיתים" }] }]]);
    const t = (key, values) => `${key}:${values.name}:${values.count ?? ""}`;
    expect(stockShortText({ productId: P1, variantId: null, left: 0 }, byId, t)).toBe("stock_sold_out:חלה:");
    expect(stockShortText({ productId: P1, variantId: V1, left: 2 }, byId, t)).toBe("stock_short:חלה · זיתים:2");
  });
});

describe("the buyer's stepper", () => {
  const stepper = (left, qty = 0) =>
    render(wrap(<OrderStepper product={{ id: P1, name: "חלה", in_stock: true, left }} qty={qty} onChange={() => {}} />));

  it("no limit: no «נשארו», «+» stays on", () => {
    stepper(null, 5);
    expect(screen.queryByTestId("order-left")).toBeNull();
    expect(screen.getByTestId("order-plus").hasAttribute("disabled")).toBe(false);
  });

  it("0 left on every offered day: «אזל לימים הקרובים», no stepper", () => {
    stepper(0);
    expect(screen.getByTestId("order-sold-out").textContent).toBe("אזל לימים הקרובים");
    expect(screen.queryByTestId("order-add")).toBeNull();
  });

  it("1 left: «נשאר אחד»", () => {
    stepper(1);
    expect(screen.getByTestId("order-left").textContent).toBe("נשאר אחד");
  });

  it("3 left: «נשארו 3», and «+» stops at 3", () => {
    stepper(3, 3);
    expect(screen.getByTestId("order-left").textContent).toBe("נשארו 3");
    expect(screen.getByTestId("order-plus").hasAttribute("disabled")).toBe(true);
  });

  it("many left: no line yet", () => {
    stepper(12, 1);
    expect(screen.queryByTestId("order-left")).toBeNull();
  });

  it("at the cap with many left: «+» stops and says why", () => {
    stepper(10, 10);
    expect(screen.getByTestId("order-plus").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("order-left").textContent).toBe("נשארו 10");
  });

  it("sold out since it went in the cart: «−» stays so it can come out", () => {
    const onChange = vi.fn();
    render(wrap(<OrderStepper product={{ id: P1, name: "חלה", in_stock: true, left: 0 }} qty={2} onChange={onChange} />));
    expect(screen.getByTestId("order-left").textContent).toBe("אזל לימים הקרובים");
    expect(screen.getByTestId("order-plus").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("order-minus"));
    expect(onChange).toHaveBeenCalledWith(P1, 1);
  });
});

describe("sizes share the product's limit", () => {
  it("a size's cap is the product's room less the other sizes in the cart", () => {
    expect(variantCap(null, null, 3)).toBeNull();
    expect(variantCap(4, null, 3)).toBe(4);
    expect(variantCap(5, 5, 0)).toBe(5);
    expect(variantCap(5, 5, 3)).toBe(2);
    expect(variantCap(null, 5, 9)).toBe(0);
  });

  it("removing a short line takes the size alone, or every line of the product, and closes an empty sheet", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const picks = { [lineKey(P1, V1)]: 2, [lineKey(P1, V2)]: 1, [P2]: 1 };
    removeShort({ productId: P1, variantId: V1, left: 0 }, { picks, onChange, onClose });
    expect(onChange.mock.calls).toEqual([[lineKey(P1, V1), 0]]);
    expect(onClose).not.toHaveBeenCalled();
    onChange.mockClear();
    removeShort({ productId: P1, variantId: null, left: 0 }, { picks, onChange, onClose });
    expect(onChange.mock.calls.map((c) => c[0]).sort()).toEqual([lineKey(P1, V1), lineKey(P1, V2)].sort());
    removeShort({ productId: P2, variantId: null, left: 0 }, { picks: { [P2]: 1 }, onChange, onClose });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("«כמה ליום» field", () => {
  it("reads empty as no limit, and refuses what is not 1–999", () => {
    expect(parseLimit("  ")).toBeNull();
    expect(parseLimit("20")).toBe(20);
    expect(parseLimit("0")).toBeUndefined();
    expect(parseLimit("1000")).toBeUndefined();
    expect(parseLimit("2.5")).toBeUndefined();
  });

  it("an invalid value says what is allowed", () => {
    render(wrap(<DailyLimitField id="x" label="כמה" value={null} unit="יחידות" busy={false} onSave={() => {}} />));
    fireEvent.change(screen.getByTestId("daily-limit-x"), { target: { value: "0" } });
    expect(screen.getByTestId("daily-limit-error-x").textContent).toBe("מספר שלם מ-1 עד 999, או ריק בלי הגבלה");
    expect(screen.getByTestId("daily-limit-x").getAttribute("aria-describedby")).toBe("x-error");
  });

  it("saves on Enter and on leaving the field, only when it changed", () => {
    const onSave = vi.fn();
    render(wrap(<DailyLimitField id="x" label="כמה" value={10} unit="יחידות" busy={false} onSave={onSave} />));
    const field = screen.getByTestId("daily-limit-x");
    fireEvent.blur(field);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "20" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith(20);
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    expect(onSave).toHaveBeenLastCalledWith(null);
    fireEvent.change(field, { target: { value: "abc" } });
    fireEvent.blur(field);
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

describe("products card: the day's limits", () => {
  const product = (over = {}) => ({
    id: P1,
    name: "חלה",
    has_price: true,
    is_orderable: true,
    in_stock: true,
    price_unit: "unit",
    contains_alcohol: false,
    daily_limit: null,
    variants: [],
    ...over,
  });

  it("0 or 1 variant: one field, «כמה אפשר להזמין ליום»", () => {
    render(wrap(<OrderProductsCard initial={[product({ variants: [{ id: V1, name: "רגילה", daily_limit: null }] })]} />));
    const box = screen.getByTestId("daily-limits");
    expect(within(box).getByLabelText("כמה אפשר להזמין ליום")).toBeTruthy();
    expect(screen.queryByTestId(`daily-limit-limit-${P1}-${V1}`)).toBeNull();
  });

  it("many variants: a total and one field for each", () => {
    const variants = [
      { id: V1, name: "זיתים", daily_limit: 5 },
      { id: V2, name: "שומשום", daily_limit: null },
    ];
    render(wrap(<OrderProductsCard initial={[product({ variants })]} />));
    expect(screen.getByLabelText("כמה ליום מכל הסוגים יחד")).toBeTruthy();
    expect(screen.getByTestId(`daily-limit-limit-${P1}-${V1}`).value).toBe("5");
    expect(screen.getByTestId(`daily-limit-limit-${P1}-${V2}`).value).toBe("");
  });

  it("a kg product says «ק״ג»", () => {
    render(wrap(<OrderProductsCard initial={[product({ price_unit: "kg" })]} />));
    expect(within(screen.getByTestId("daily-limits")).getByText("ק״ג")).toBeTruthy();
  });

  it("saving sends the limit, and a variant's limit as variant_limits", async () => {
    const variants = [
      { id: V1, name: "זיתים", daily_limit: null },
      { id: V2, name: "שומשום", daily_limit: null },
    ];
    api.put.mockResolvedValue({
      data: {
        id: P1,
        is_orderable: true,
        in_stock: true,
        price_unit: "unit",
        contains_alcohol: false,
        daily_limit: 20,
        variants,
      },
    });
    render(wrap(<OrderProductsCard initial={[product({ variants })]} />));
    const total = screen.getByTestId(`daily-limit-limit-${P1}`);
    fireEvent.change(total, { target: { value: "20" } });
    await act(async () => fireEvent.blur(total));
    expect(api.put.mock.calls[0][1].daily_limit).toBe(20);
    const one = screen.getByTestId(`daily-limit-limit-${P1}-${V2}`);
    fireEvent.change(one, { target: { value: "7" } });
    await act(async () => fireEvent.blur(one));
    expect(api.put.mock.calls[1][1].variant_limits).toEqual([{ id: V2, daily_limit: 7 }]);
  });
});

describe("«מה להכין» from the server", () => {
  const prepLine = (over = {}) => ({
    product_id: P1,
    variant_id: null,
    name: "חלה",
    variant_name: null,
    confirmed: 3,
    waiting: 0,
    limit: null,
    product_limit: null,
    ...over,
  });
  const show = async (days) => {
    api.get.mockResolvedValue({ data: { days } });
    let view;
    await act(async () => {
      view = render(wrap(<OrderPrepList orders={[]} />));
    });
    return view;
  };

  it("0 days: renders nothing", async () => {
    const { container } = await show([]);
    expect(api.get).toHaveBeenCalledWith("/producers/me/orders/prep");
    expect(container.querySelector('[data-testid="orders-prep"]')).toBeNull();
  });

  it("a failed read says so, and «לנסות שוב» reads again", async () => {
    api.get.mockRejectedValueOnce(new Error("down"));
    await act(async () => {
      render(wrap(<OrderPrepList orders={[]} />));
    });
    expect(screen.getByTestId("orders-prep-failed").textContent).toContain("לא הצלחנו לטעון את «מה להכין».");
    api.get.mockResolvedValueOnce({ data: { days: [{ day: FRI, lines: [prepLine()] }] } });
    await act(async () => fireEvent.click(screen.getByTestId("orders-prep-retry")));
    expect(screen.queryByTestId("orders-prep-failed")).toBeNull();
    expect(screen.getByTestId("orders-prep-line").textContent).toContain("3 × חלה");
  });

  it("sizes under a limit for all of them get a sum line against it", async () => {
    const lines = [
      prepLine({ variant_id: V1, variant_name: "זיתים", confirmed: 3, waiting: 1, product_limit: 20 }),
      prepLine({ variant_id: V2, variant_name: "שומשום", confirmed: 2, product_limit: 20 }),
      prepLine({ product_id: P2, name: "עוגה", confirmed: 1 }),
    ];
    const rows = prepRows(lines);
    expect(rows).toHaveLength(4);
    expect(rows[2]).toMatchObject({ all: true, confirmed: 5, waiting: 1, limit: 20 });
    expect(prepRows([prepLine({ variant_id: V1, variant_name: "זיתים" })])).toHaveLength(1);
    await show([{ day: FRI, lines }]);
    const shown = screen.getAllByTestId("orders-prep-line");
    expect(shown[2].textContent).toContain("6 × חלה מכל הסוגים יחד");
    expect(shown[2].textContent).toContain("מתוך 20 ליום");
  });

  it("1 day: its name, no chips, the lines with waiting and the limit", async () => {
    await show([
      {
        day: FRI,
        lines: [
          prepLine({ confirmed: 12, waiting: 2, limit: 20 }),
          prepLine({ product_id: P2, name: "עוגה", variant_id: V1, variant_name: "שוקולד", confirmed: 1 }),
        ],
      },
    ]);
    const box = screen.getByTestId("orders-prep");
    expect(box.hasAttribute("open")).toBe(true);
    expect(within(box).getByRole("heading", { name: "מה להכין" })).toBeTruthy();
    expect(screen.queryByTestId("orders-prep-day")).toBeNull();
    const lines = screen.getAllByTestId("orders-prep-line");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("14 × חלה");
    expect(lines[0].textContent).toContain("2 מחכים לאישור");
    expect(lines[0].textContent).toContain("מתוך 20 ליום");
    expect(lines[1].textContent).toContain("1 × עוגה");
    expect(lines[1].textContent).toContain("שוקולד");
  });

  it("many days: a chip for each, the first picked, a tap shows that day", async () => {
    await show([
      { day: FRI, lines: [prepLine({ confirmed: 1, waiting: 1 })] },
      { day: SAT, lines: [prepLine({ name: "עוגה", confirmed: 5 })] },
    ]);
    const chips = screen.getAllByTestId("orders-prep-day");
    expect(chips).toHaveLength(2);
    expect(chips[0].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("orders-prep-line").textContent).toContain("2 × חלה");
    expect(screen.getByTestId("orders-prep-line").textContent).toContain("אחד מחכה לאישור");
    fireEvent.click(chips[1]);
    expect(screen.getAllByTestId("orders-prep-day")[1].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("orders-prep-line").textContent).toContain("5 × עוגה");
  });

  it("names today and tomorrow on the Israel clock, after 22:00 UTC too", () => {
    const t = (key) => key;
    // 22:30 UTC on 3/12 is already 4/12 in Israel.
    const now = new Date("2026-12-03T22:30:00Z");
    expect(prepDayName(FRI, "he", t, now)).toBe("tabs.today");
    expect(prepDayName(SAT, "he", t, now)).toBe("prep.tomorrow");
    expect(prepDayName("2026-12-07", "he", t, now)).not.toMatch(/today|tomorrow/);
  });
});

describe("the client mirrors the server's numbers", () => {
  // Source text on purpose: the Python constants cannot run here.
  const server = readFileSync(path.join(process.cwd(), "../backend/app/services/product_daily_stock.py"), "utf8");
  const schema = readFileSync(path.join(process.cwd(), "../backend/app/schemas/product_order_offer.py"), "utf8");

  it("«נשארו N» starts at the same count", () => {
    expect(server).toMatch(new RegExp(`^LOW_STOCK_AT = ${LOW_STOCK_AT}$`, "m"));
  });

  it("the field allows what the API allows", () => {
    expect(schema).toContain(`daily_limit: int | None = Field(default=None, ge=1, le=${LIMIT_MAX})`);
  });
});
