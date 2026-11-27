// @ts-check
// MEH-3978: text a business or buyer typed (product, customer, address, note)
// is isolated (FSI…PDI) inside our sentences, so a Hebrew value in the
// English UI, or an English one in Hebrew, keeps its order.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../messages/en.json";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import api from "@/lib/api";
import { isolate } from "@/lib/bidi";
import OrderCard from "@/components/dashboard/orders/OrderCard";
import OrderCustomersCard from "@/components/dashboard/orders/OrderCustomersCard";
import { OrderStatusView } from "@/app/[locale]/order/[id]/OrderStatusClient";
import { weekMenuText } from "@/lib/weekly-menu-share";

const FSI = "⁨";
const PDI = "⁩";
const HOUR_MS = 60 * 60 * 1000; // eslint-disable-line no-magic-numbers -- an hour from now

/** @param {Record<string, any>} over */
function order(over) {
  const start = new Date(Date.now() + HOUR_MS).toISOString();
  return {
    id: "o-1",
    producer_id: "p-1",
    status: "pending",
    fulfilment: "delivery",
    slot_start: start,
    slot_end: start,
    items: [{ name: "חלה קלועה", qty: 7, unit_price_agorot: 2800, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }],
    estimated_total_agorot: 19_600,
    final_total_agorot: null,
    delivery_fee_agorot: 0,
    customer_name: "נועה",
    customer_phone: "972501234567",
    delivery_address: "הרצל 12 דירה 3",
    delivery_city: null,
    note: "להשאיר ליד הדלת",
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

/** @param {string} locale @param {any} messages @param {any} node */
const wrap = (locale, messages, node) => render(
  <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Jerusalem">{node}</NextIntlClientProvider>,
);

describe("isolate", () => {
  it("wraps a value and turns null into an empty isolate", () => {
    expect(isolate("חלה")).toBe(`${FSI}חלה${PDI}`);
    expect(isolate(null)).toBe(`${FSI}${PDI}`);
  });
});

describe("the owner's card in English", () => {
  it("isolates the line name, the address and the note", () => {
    wrap("en", en, <ul><OrderCard order={order({})} onChanged={() => {}} /></ul>);
    const text = document.body.textContent ?? "";
    expect(text).toContain(`7 × ${FSI}חלה קלועה${PDI}`);
    expect(text).toContain(`Delivery address: ${FSI}הרצל 12 דירה 3${PDI}`);
    expect(text).toContain(`${FSI}להשאיר ליד הדלת${PDI}`);
  });
});

describe("the buyer's page", () => {
  it("isolates an English product name in Hebrew", () => {
    const items = [{ name: "Sourdough 800g", qty: 2, unit_price_agorot: 2800, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }];
    wrap("he", he, <OrderStatusView order={order({ items, fulfilment: "pickup" })} onChange={() => {}} refOf={() => ({ token: "t" })} />);
    expect(document.body.textContent).toContain(`${FSI}Sourdough 800g${PDI}`);
  });
});

describe("the customers card in English", () => {
  it("isolates the customer's name inside the row", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { customers: [{ name: "נועה בדיקה", phone: "972500000001", order_count: 2, last_order_at: "2026-11-19T08:00:00" }] } });
    wrap("en", en, <OrderCustomersCard />);
    const [row] = await screen.findAllByTestId("orders-customers-row");
    expect(row.textContent).toContain(`${FSI}נועה בדיקה${PDI}`);
  });
});

describe("the weekly share message", () => {
  it("isolates the business name and each product name", () => {
    /** @param {string} key @param {any} [v] */
    const t = (key, v) => {
      /** @type {any} */
      let x = en.dashboard.producer.orders.share;
      for (const k of key.split(".")) x = x?.[k];
      return String(x).replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""));
    };
    const menu = {
      products: [{ id: "a", name: "חלה קלועה", price_min_agorot: 2400, price_max_agorot: 2800, price_unit: "unit", price_is_estimate: true, in_stock: true, available_weekdays: null, variants: [] }],
      slots: [{ start: "2026-11-27T10:00:00Z", end: "2026-11-27T10:00:00Z", fulfilment: "pickup", alcohol_ok: false }],
    };
    const text = weekMenuText({ menu, name: "מאפיית רוח השדה", url: "https://x", locale: "en", t, tUnit: (/** @type {string} */ k) => k, now: new Date("2026-11-27T08:00:00Z") }) ?? "";
    expect(text.split("\n")[0]).toContain(`${FSI}מאפיית רוח השדה${PDI}`);
    expect(text).toContain(`• ${FSI}חלה קלועה${PDI} · `);
  });
});
