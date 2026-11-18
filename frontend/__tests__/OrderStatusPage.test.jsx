/**
 * MEH-3216 stage 5a — the buyer's status page (/order/{id}#t={token}), the
 * link every order message carries. One headline per status, the hand-over
 * line and pickup code only once committed, cancel until the cutoff, and the
 * proposal's two buttons. Rendered with the real he.json (approved copy).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));

import api from "@/lib/api";
import { OrderStatusView } from "@/app/[locale]/order/[id]/OrderStatusClient";
import { buyerRef, statusView, tokenFromHash } from "@/lib/order-status";

const ID = "0a000000-0000-4000-8000-00000000000a";
const PRODUCER = "7e57a6f0-0000-4000-8000-000000000007";
const TOKEN = "t".repeat(43);

function order(over = {}) {
  return {
    id: ID,
    producer_id: PRODUCER,
    status: "pending",
    fulfilment: "pickup",
    slot_start: "2026-11-20T07:00:00Z",
    slot_end: "2026-11-20T08:00:00Z",
    items: [{ name: "חלה", qty: 2, unit_price_agorot: 2800, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }],
    estimated_total_agorot: 5600,
    final_total_agorot: null,
    delivery_fee_agorot: 0,
    delivery_city: null,
    customer_name: "דנה",
    note: null,
    proposal: null,
    created_at: "2026-11-18T10:00:00Z",
    expires_at: "2026-11-18T18:00:00Z",
    producer_name: "המאפייה של רותי",
    pickup_address: null,
    phone_masked: "••••••••••67",
    pickup_code: null,
    can_cancel: true,
    ...over,
  };
}

const show = (o, onChange = () => {}) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrderStatusView order={o} onChange={onChange} refOf={() => ({ token: TOKEN })} />
    </NextIntlClientProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe("the link", () => {
  it("reads the token from #t= and ignores anything that cannot be one", () => {
    expect(tokenFromHash(`#t=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash("#t=short")).toBeNull();
    expect(tokenFromHash(`#t=${"x".repeat(101)}`)).toBeNull();
  });

  it("names the order by token when there is one, else by id (logged-in owner)", () => {
    expect(buyerRef(ID, TOKEN)).toEqual({ token: TOKEN });
    expect(buyerRef(ID, null)).toEqual({ order_id: ID });
  });
});

describe("one approved headline per status", () => {
  const cases = [
    ["pending", "הבקשה נשלחה. המאפייה של רותי יאשרו בקרוב."],
    ["confirmed", "ההזמנה אושרה"],
    ["ready", "ההזמנה מוכנה לאיסוף"],
    ["declined", "בית העסק לא יכול למלא את ההזמנה הזאת."],
    ["cancelled", "ההזמנה מהמאפייה של רותי בוטלה."],
    ["expired", "בית העסק לא ענה בזמן, ולכן הבקשה בוטלה. לא חויבתם."],
    ["handed", "נמסר. בתיאבון."],
  ];
  it.each(cases)("%s", (status, text) => {
    show(order({ status, can_cancel: false }));
    expect(screen.getByTestId("order-headline").textContent).toBe(text);
  });
});

describe("what each status shows", () => {
  it("pending: the deadline line, the cancel button, no hand-over line, no code", () => {
    show(order());
    expect(screen.getByText(/אם לא תגיע תשובה עד/)).toBeTruthy();
    expect(screen.getByTestId("order-cancel")).toBeTruthy();
    expect(screen.queryByTestId("order-when")).toBeNull();
    expect(screen.queryByTestId("order-code")).toBeNull();
  });

  it("confirmed pickup: when and where, the code with its line, what to pay", () => {
    show(order({ status: "confirmed", pickup_code: "4821", pickup_address: "הרצל 12, רחובות", final_total_agorot: 5600 }));
    const when = screen.getByTestId("order-when").textContent;
    expect(when.startsWith("איסוף ב")).toBe(true);
    expect(when).toContain("09:00");
    expect(when.endsWith(" · הרצל 12, רחובות")).toBe(true);
    expect(screen.getByTestId("order-code").textContent).toContain("4821");
    expect(screen.getByText("אומרים את הקוד בקופה")).toBeTruthy();
    expect(screen.getByText("לתשלום לבית העסק: 56 ₪")).toBeTruthy();
  });

  it("confirmed pickup without a public address: the line ends at the time", () => {
    show(order({ status: "confirmed", pickup_code: "4821" }));
    expect(screen.getByTestId("order-when").textContent).not.toContain("·");
  });

  it("confirmed delivery: the delivery line, the fee in what to pay", () => {
    show(order({ status: "confirmed", fulfilment: "delivery", delivery_fee_agorot: 1500 }));
    expect(screen.getByTestId("order-when").textContent).toMatch(/^משלוח ב/);
    expect(screen.getByText("לתשלום לבית העסק: 71 ₪")).toBeTruthy();
  });

  it("past the cutoff: no cancel button, the approved line instead", () => {
    show(order({ status: "confirmed", can_cancel: false }));
    expect(screen.queryByTestId("order-cancel")).toBeNull();
    expect(screen.getByText("את ההזמנה הזאת כבר אי אפשר לבטל באתר. אפשר לפנות לבית העסק.")).toBeTruthy();
  });

  it("closed orders offer nothing to do", () => {
    for (const status of ["declined", "cancelled", "expired", "handed", "no_show"]) {
      expect(statusView(order({ status })).cancel).toBeNull();
    }
  });
});

describe("acting on the order", () => {
  it("cancel asks first, then sends the token and shows the new state", async () => {
    api.post.mockResolvedValue({ data: order({ status: "cancelled", can_cancel: false }) });
    const onChange = vi.fn();
    show(order(), onChange);
    fireEvent.click(screen.getByTestId("order-cancel"));
    expect(screen.getByText("לבטל את ההזמנה? בית העסק יקבל על כך הודעה.")).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByTestId("order-cancel-confirm")));
    expect(api.post).toHaveBeenCalledWith("/product-orders/status/cancel", { token: TOKEN });
    expect(onChange.mock.calls[0][0].status).toBe("cancelled");
  });

  it("a proposed change: its new time and total, «מתאים לי» accepts it", async () => {
    const proposal = { slot_start: "2026-11-21T07:00:00Z", slot_end: "2026-11-21T08:00:00Z", total_agorot: 5000, note: "נשארה חלה אחת" };
    api.post.mockResolvedValue({ data: order({ status: "confirmed" }) });
    const onChange = vi.fn();
    show(order({ status: "change_proposed", proposal }), onChange);
    expect(screen.getByTestId("order-headline").textContent).toBe("בית העסק מציע שינוי");
    expect(screen.getByText("נשארה חלה אחת")).toBeTruthy();
    expect(screen.getAllByText(/^לתשלום לבית העסק/).map((n) => n.textContent)).toEqual(["לתשלום לבית העסק: 50 ₪"]);
    expect(screen.queryByTestId("order-cancel")).toBeNull(); // the proposal carries its own
    await act(async () => fireEvent.click(screen.getByTestId("order-accept")));
    expect(api.post).toHaveBeenCalledWith("/product-orders/status/accept-change", { token: TOKEN });
    expect(onChange).toHaveBeenCalled();
  });

  it("a refused action shows the server's Hebrew reason", async () => {
    const detail = "את ההזמנה הזאת כבר אי אפשר לבטל";
    api.post.mockRejectedValue({ response: { status: 409, data: { detail } } });
    show(order());
    fireEvent.click(screen.getByTestId("order-cancel"));
    await act(async () => fireEvent.click(screen.getByTestId("order-cancel-confirm")));
    expect(screen.getByText(detail)).toBeTruthy();
  });
});
