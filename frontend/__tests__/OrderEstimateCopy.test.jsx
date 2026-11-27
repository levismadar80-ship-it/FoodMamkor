// @ts-check
// MEH-3974: an estimated price says «שקילה» only when something is weighed,
// and the buyer reads «עד», because the business may confirm lower, never
// higher. Rendered with the real he.json.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import OrderCard from "@/components/dashboard/orders/OrderCard";
import { OrderStatusView } from "@/app/[locale]/order/[id]/OrderStatusClient";
import { estimateKind } from "@/lib/product-orders";

const HOUR_MS = 60 * 60 * 1000; // eslint-disable-line no-magic-numbers -- an hour from now

/** @param {string} unit @param {boolean} estimate */
const line = (unit, estimate) => ({
  name: unit === "kg" ? "גבינה" : "חלה",
  qty: 1,
  unit_price_agorot: 2800,
  price_unit: unit,
  price_is_estimate: estimate,
  contains_alcohol: false,
});
const WEIGHED = line("kg", true);
const RANGE = line("unit", true);
const EXACT = line("unit", false);

/** @param {Record<string, any>} over */
function order(over) {
  const start = new Date(Date.now() + HOUR_MS).toISOString();
  return {
    id: "o-1",
    producer_id: "p-1",
    status: "pending",
    fulfilment: "pickup",
    slot_start: start,
    slot_end: start,
    items: [EXACT],
    estimated_total_agorot: 21_600,
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
    can_cancel: true,
    ...over,
  };
}

/** @param {any} node */
const wrap = (node) => render(
  <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">{node}</NextIntlClientProvider>,
);
/** @param {Record<string, any>} over */
const card = (over) => wrap(<ul><OrderCard order={order(over)} onChanged={() => {}} /></ul>);
/** @param {Record<string, any>} over */
const status = (over) => wrap(<OrderStatusView order={order(over)} onChange={() => {}} refOf={() => ({ token: "t" })} />);

describe("estimateKind", () => {
  it.each([
    { name: "weighed only", lines: [WEIGHED], kind: "weighed" },
    { name: "range only", lines: [RANGE], kind: "range" },
    { name: "both", lines: [RANGE, WEIGHED], kind: "weighed" },
    { name: "no estimate", lines: [EXACT], kind: null },
    { name: "no lines", lines: [], kind: null },
  ])("$name", ({ lines, kind }) => {
    expect(estimateKind(lines)).toBe(kind);
  });
});

describe("the owner's card (MEH-3974)", () => {
  it("a weighed line says the price is set after weighing", () => {
    card({ items: [WEIGHED], has_estimate: true });
    expect(screen.getByText("מחיר משוער, נקבע אחרי שקילה")).toBeInTheDocument();
  });

  it("a range on a unit product says it is set on confirming, with no weighing", () => {
    card({ items: [RANGE], has_estimate: true });
    expect(screen.getByText("מחיר משוער, נקבע באישור")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("שקילה");
  });

  it("an exact order has no estimate line", () => {
    card({ items: [EXACT] });
    expect(document.body.textContent).not.toContain("מחיר משוער");
  });

  it("the confirm dialog of a range order is titled «מחיר סופי»", () => {
    card({ items: [RANGE], has_estimate: true });
    fireEvent.click(screen.getByRole("button", { name: "לאשר" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("מחיר סופי");
    expect(screen.getByRole("dialog").textContent).not.toContain("שקילה");
  });

  it("the confirm dialog of a weighed order keeps «אחרי שקילה»", () => {
    card({ items: [WEIGHED], has_estimate: true });
    fireEvent.click(screen.getByRole("button", { name: "לאשר" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("מחיר סופי אחרי שקילה");
  });
});

describe("the buyer's status page (MEH-3974)", () => {
  it("waiting with an estimate: «עד», and when the price is set", () => {
    status({ items: [RANGE] });
    expect(screen.getByText(/^לתשלום לבית העסק/).textContent).toBe(
      "לתשלום לבית העסק: עד 216 ₪. המחיר הסופי ייקבע כשבית העסק יאשר.",
    );
  });

  it("waiting with an exact price: the amount as is", () => {
    status({ items: [EXACT] });
    expect(screen.getByText(/^לתשלום לבית העסק/).textContent).toBe("לתשלום לבית העסק: 216 ₪");
  });

  it("confirmed with a final price: the final amount, no «עד»", () => {
    status({ items: [RANGE], status: "confirmed", final_total_agorot: 20_000 });
    expect(screen.getByText(/^לתשלום לבית העסק/).textContent).toBe("לתשלום לבית העסק: 200 ₪");
  });
});
