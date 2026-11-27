/**
 * MEH-3933 — a buyer's weekly repeat of an order.
 *
 * The cells: the sheet's checkbox closed / open × no slot / a slot; the body
 * carries `repeat_weekly` only when ticked; the status page with no repeat /
 * an active one (closed, asking, refused, stopped) / a stopped one; the
 * business card with no repeat / active / stopped; the repeat day and time on
 * the Israel clock, the evening UTC hour included. Real he.json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import api from "@/lib/api";
import OrderSheetRepeat from "@/components/public/OrderSheetRepeat";
import OrderRepeatBlock from "@/app/[locale]/order/[id]/OrderRepeatBlock";
import OrderCard from "@/components/dashboard/orders/OrderCard";
import { orderBody } from "@/lib/order-sheet";
import { repeatWhen } from "@/lib/order-repeat";

const DAYS = he.product_weekdays.days_long;
const ID = "0a000000-0000-4000-8000-00000000000a";
const TOKEN = "t".repeat(43);
// Friday 20/11/2026 09:00 in Israel (UTC+2).
const FRIDAY_9 = "2026-11-20T07:00:00Z";

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      {ui}
    </NextIntlClientProvider>,
  );

function order(over = {}) {
  return {
    id: ID,
    producer_id: "7e57a6f0-0000-4000-8000-000000000007",
    status: "pending",
    fulfilment: "pickup",
    slot_start: FRIDAY_9,
    slot_end: "2026-11-20T08:00:00Z",
    items: [{ name: "חלה", qty: 2, unit_price_agorot: 2800, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }],
    estimated_total_agorot: 5600,
    final_total_agorot: null,
    delivery_fee_agorot: 0,
    delivery_city: null,
    customer_name: "דנה לוי",
    customer_phone: "972501234567",
    delivery_address: null,
    note: null,
    proposal: null,
    created_at: "2026-11-18T10:00:00Z",
    expires_at: "2026-11-19T10:00:00Z",
    age_declared: false,
    has_estimate: false,
    repeat: null,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("the day and time it repeats on", () => {
  it("reads the Israel clock", () => {
    expect(repeatWhen(FRIDAY_9, DAYS)).toEqual({ day: "שישי", time: "09:00" });
  });

  it("an evening slot that is already the next day in Israel", () => {
    // Saturday 21/11 22:30 UTC = Sunday 00:30 in Israel.
    expect(repeatWhen("2026-11-21T22:30:00Z", DAYS)).toEqual({ day: "ראשון", time: "00:30" });
  });
});

describe("the order sheet", () => {
  const base = {
    producerId: "p", picks: { b: 1 }, fulfilment: "pickup", slotStart: FRIDAY_9, name: "דנה", phone: "050",
    code: "123456", city: "", address: "", note: "", ageDeclared: false, key: "k",
  };

  it("sends repeat_weekly only when ticked", () => {
    expect(orderBody(base)).not.toHaveProperty("repeat_weekly");
    expect(orderBody({ ...base, repeatWeekly: false })).not.toHaveProperty("repeat_weekly");
    expect(orderBody({ ...base, repeatWeekly: true }).repeat_weekly).toBe(true);
  });

  it("a guest does not see it", () => {
    wrap(<OrderSheetRepeat signedIn={false} slot={FRIDAY_9} checked onChange={() => {}} />);
    expect(screen.queryByText("להזמין את זה שוב כל שבוע")).toBeNull();
    expect(screen.queryByTestId("order-sheet-repeat-hint")).toBeNull();
  });

  it("closed: the label only", () => {
    wrap(<OrderSheetRepeat signedIn slot={FRIDAY_9} checked={false} onChange={() => {}} />);
    expect(screen.getByText("להזמין את זה שוב כל שבוע")).toBeTruthy();
    expect(screen.queryByTestId("order-sheet-repeat-hint")).toBeNull();
  });

  it("open with a slot: the day and time", () => {
    wrap(<OrderSheetRepeat signedIn slot={FRIDAY_9} checked onChange={() => {}} />);
    expect(screen.getByTestId("order-sheet-repeat-hint").textContent).toBe(
      "כל יום שישי בשעה 09:00 נשלח לבית העסק את אותה הזמנה, ובית העסק יאשר אותה כמו כל הזמנה. אפשר לעצור בכל רגע מעמוד ההזמנה.",
    );
  });

  it("open before a slot is picked: says it follows the slot", () => {
    wrap(<OrderSheetRepeat signedIn slot="" checked onChange={() => {}} />);
    expect(screen.getByTestId("order-sheet-repeat-hint").textContent).toBe(he.order_repeat.sheet_hint_no_slot);
  });

  it("ticking it reports the change", () => {
    const onChange = vi.fn();
    wrap(<OrderSheetRepeat signedIn slot={FRIDAY_9} checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// What the buyer's status read returns on top of the shared order fields.
const buyerOrder = (over = {}) => {
  const { customer_phone, delivery_address, age_declared, has_estimate, ...shared } = order(over);
  return {
    ...shared,
    producer_name: "המאפייה של רותי",
    review_url: null,
    pickup_address: null,
    phone_masked: "••••••••••67",
    pickup_code: null,
    can_cancel: true,
  };
};

describe("the buyer's status page", () => {
  const show = (o, onChange = () => {}) => wrap(<OrderRepeatBlock order={o} onChange={onChange} refOf={() => ({ token: TOKEN })} />);

  it("no repeat: nothing", () => {
    const { container } = show(order());
    expect(container.textContent).toBe("");
  });

  it("active: the day and time and a stop button; stopping asks first, then posts the token", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: buyerOrder({ repeat: "stopped" }) });
    const onChange = vi.fn();
    show(order({ repeat: "active" }), onChange);
    expect(screen.getByTestId("order-repeat").textContent).toContain(
      "הזמנה קבועה: כל יום שישי בשעה 09:00. ההזמנה של השבוע הבא נשלחת לבית העסק אחרי המועד של השבוע.",
    );
    fireEvent.click(screen.getByTestId("order-repeat-stop"));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText(he.order_repeat.stop_confirm)).toBeTruthy();
    fireEvent.click(screen.getByTestId("order-repeat-stop-confirm"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/product-orders/status/repeat/stop", { token: TOKEN }, { _noAuth: true });
    expect(onChange.mock.calls[0][0].repeat).toBe("stopped");
  });

  it("a refused stop shows the Hebrew reason and stays on the question", async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { status: 409, data: { detail: "ההזמנה הזאת לא חוזרת כל שבוע" } } });
    show(order({ repeat: "active" }));
    fireEvent.click(screen.getByTestId("order-repeat-stop"));
    fireEvent.click(screen.getByTestId("order-repeat-stop-confirm"));
    expect(await screen.findByText("ההזמנה הזאת לא חוזרת כל שבוע")).toBeTruthy();
    expect(screen.getByTestId("order-repeat-stop-confirm")).toBeTruthy();
  });

  it("«חזרה» closes the question without posting", () => {
    show(order({ repeat: "active" }));
    fireEvent.click(screen.getByTestId("order-repeat-stop"));
    fireEvent.click(screen.getByText(he.order_status.back));
    expect(screen.getByTestId("order-repeat-stop")).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("stopped: says so, no button", () => {
    show(order({ repeat: "stopped" }));
    expect(screen.getByTestId("order-repeat-stopped").textContent).toBe(he.order_repeat.status_stopped);
    expect(screen.queryByTestId("order-repeat-stop")).toBeNull();
  });
});

describe("the business's order card", () => {
  const card = (o, onChanged = () => {}) => wrap(<ul><OrderCard order={o} onChanged={onChanged} /></ul>);

  it("no repeat: no badge, no stop", () => {
    card(order());
    expect(screen.queryByTestId("order-repeat-badge")).toBeNull();
    expect(screen.queryByTestId("order-repeat-control")).toBeNull();
  });

  it("active: the badge, the weekly line, and a stop that posts to this order", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: order({ repeat: "stopped" }) });
    const onChanged = vi.fn();
    card(order({ repeat: "active" }), onChanged);
    expect(screen.getByTestId("order-repeat-badge").textContent).toBe("הזמנה קבועה");
    expect(screen.getByTestId("order-repeat-control").textContent).toContain("חוזרת כל יום שישי בשעה 09:00.");
    // The order's own status badge is unchanged.
    expect(screen.getByTestId("order-status").textContent).toBe(he.dashboard.producer.orders.status.pending);
    fireEvent.click(screen.getByTestId("order-repeat-stop"));
    fireEvent.click(screen.getByTestId("order-repeat-stop-confirm"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(`/producers/me/product-orders/${ID}/repeat/stop`, {});
  });

  it("stopped: the stopped badge, no stop", () => {
    card(order({ repeat: "stopped" }));
    expect(screen.getByTestId("order-repeat-badge").textContent).toBe("הזמנה קבועה שנעצרה");
    expect(screen.queryByTestId("order-repeat-control")).toBeNull();
  });
});
