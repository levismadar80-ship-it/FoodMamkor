// @ts-check
// MEH-3976: the buyer reads what the business wrote when it declined or
// cancelled; a no-show has its own headline; and «הלקוח לא הגיע» asks before
// it closes the order. Rendered with the real he.json.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import api from "@/lib/api";
import OrderCard from "@/components/dashboard/orders/OrderCard";
import { OrderStatusView } from "@/app/[locale]/order/[id]/OrderStatusClient";

const HOUR_MS = 60 * 60 * 1000; // eslint-disable-line no-magic-numbers -- an hour

/** @param {Record<string, any>} over */
function order(over) {
  const start = new Date(Date.now() - 2 * HOUR_MS).toISOString();
  const end = new Date(Date.now() - HOUR_MS).toISOString();
  return {
    id: "o-1",
    producer_id: "p-1",
    status: "declined",
    fulfilment: "pickup",
    slot_start: start,
    slot_end: end,
    items: [{ name: "חלה", qty: 1, unit_price_agorot: 2800, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }],
    estimated_total_agorot: 2800,
    final_total_agorot: null,
    delivery_fee_agorot: 0,
    customer_name: "נועה",
    customer_phone: "972501234567",
    delivery_address: null,
    delivery_city: null,
    note: null,
    proposal: null,
    expires_at: null,
    age_declared: false,
    has_estimate: false,
    producer_name: "המאפייה",
    pickup_address: null,
    pickup_code: null,
    can_cancel: false,
    business_note: null,
    ...over,
  };
}

/** @param {any} node */
const wrap = (node) => render(
  <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">{node}</NextIntlClientProvider>,
);
/** @param {Record<string, any>} over */
const status = (over) => wrap(<OrderStatusView order={order(over)} onChange={() => {}} refOf={() => ({ token: "t" })} />);

beforeEach(() => vi.clearAllMocks());

describe("the buyer's page shows the business's reason (MEH-3976)", () => {
  it("declined with a reason", () => {
    status({ status: "declined", business_note: "אזל המלאי" });
    expect(screen.getByTestId("order-business-note").textContent).toBe("מה בית העסק כתב: אזל המלאי");
  });

  it("cancelled with a note", () => {
    status({ status: "cancelled", business_note: "התנור התקלקל" });
    expect(screen.getByTestId("order-business-note").textContent).toBe("מה בית העסק כתב: התנור התקלקל");
  });

  it("cancelled with no note: no line", () => {
    status({ status: "cancelled" });
    expect(screen.queryByTestId("order-business-note")).toBeNull();
  });
});

describe("a no-show on the buyer's page (MEH-3976)", () => {
  it("says she was marked as not coming, not that it was cancelled", () => {
    status({ status: "no_show" });
    expect(screen.getByTestId("order-headline").textContent).toBe(
      "בית העסק סימן שלא הגעתם לקבל את ההזמנה. אם זו טעות, אפשר לפנות לבית העסק.",
    );
  });
});

describe("«הלקוח לא הגיע» asks first (MEH-3976)", () => {
  /** @param {Record<string, any>} over */
  const card = (over) => wrap(<ul><OrderCard order={order({ status: "confirmed", ...over })} onChanged={() => {}} /></ul>);

  it("closed: nothing is posted until she confirms", () => {
    card({});
    fireEvent.click(screen.getByTestId("order-action-no_show"));
    expect(api.post).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("הלקוח לא הגיע?");
    expect(dialog).toHaveTextContent("פעמיים בתוך 90 יום");
  });

  it("back closes the dialog with nothing posted", () => {
    card({});
    fireEvent.click(screen.getByTestId("order-action-no_show"));
    fireEvent.click(screen.getByRole("button", { name: "חזרה" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("confirming posts the no-show", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: order({ status: "no_show" }) });
    card({});
    fireEvent.click(screen.getByTestId("order-action-no_show"));
    fireEvent.click(screen.getByRole("button", { name: "כן, לא הגיע" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(api.post).mock.calls[0][0])).toContain("no-show");
  });
});
