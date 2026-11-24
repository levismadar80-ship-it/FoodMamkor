/**
 * MEH-3755 — the order page's business block: the name links to the business
 * page, the contact button uses the business's own channel, and a pickup
 * order gets Waze / Google Maps for its address. A business whose page cannot
 * be read shows no block (the nav links stay, they come from the order).
 * Rendered with the real he.json.
 */
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/lib/contact-tracking", () => ({ trackPrimaryCtaClick: vi.fn() }));

import api from "@/lib/api";
import { GetProducerProducersProducerIdGetResponse } from "@/lib/generated/api.zod";
import OrderBusinessLinks from "@/app/[locale]/order/[id]/OrderBusinessLinks";
import { OrderStatusView } from "@/app/[locale]/order/[id]/OrderStatusClient";
import { contractRow, uuidFor } from "./helpers/contract-row";

const ID = uuidFor("bakery");
const business = (over = {}) =>
  contractRow(GetProducerProducersProducerIdGetResponse, { id: ID, name: "המאפייה של רותי", slug: "rutis-bakery", ...over });

const show = (props) =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <OrderBusinessLinks producerId={ID} {...props} />
      </NextIntlClientProvider>
    </SWRConfig>,
  );

// Wait until the read was made AND its promise settled (SWR has then stored
// the result), so an absent block means "hidden", not "not loaded yet".
async function settled() {
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  await act(async () => {
    await vi.mocked(api.get).mock.results.at(-1)?.value?.catch?.(() => {});
  });
}

describe("OrderBusinessLinks", () => {
  it("control: the fixture parses as a business page", () => {
    expect(GetProducerProducersProducerIdGetResponse.safeParse(business()).success).toBe(true);
  });

  it("links the business name to its page and asks for that business", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: business() });
    show({});
    const link = await screen.findByTestId("order-business-link");
    expect(link.getAttribute("href")).toBe("/rutis-bakery");
    expect(link.textContent).toContain("המאפייה של רותי");
    expect(api.get).toHaveBeenCalledWith(`/producers/${ID}`, undefined);
  });

  it("the contact button follows the business's channel: WhatsApp with the greeting", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: business({ phone: "052-1234567", primary_contact_method: "whatsapp" }) });
    show({});
    const btn = await screen.findByTestId("primary-contact-button");
    expect(btn.textContent).toBe(he.contact_cta.whatsapp);
    expect(btn.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/972521234567\?text=/);
  });

  it("a business with no contact detail gets no contact button", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: business({ phone: null }) });
    show({});
    await screen.findByTestId("order-business-link");
    expect(screen.queryByTestId("primary-contact-button")).toBeNull();
  });

  it("a pickup address gets Waze and Google Maps links to that address", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: business() });
    show({ pickupAddress: "הנשיא 5, זכרון יעקב" });
    const nav = await screen.findByTestId("order-nav");
    const hrefs = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    const q = encodeURIComponent("הנשיא 5, זכרון יעקב");
    expect(hrefs).toEqual([
      `https://waze.com/ul?q=${q}&navigate=yes`,
      `https://www.google.com/maps/search/?api=1&query=${q}`,
    ]);
  });

  it("no pickup address (delivery, or not confirmed yet) → no nav links", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: business() });
    show({ pickupAddress: null });
    await screen.findByTestId("order-business-link");
    expect(screen.queryByTestId("order-nav")).toBeNull();
  });

  it("the business page cannot be read (404) → no business block, the nav links stay", async () => {
    vi.mocked(api.get).mockImplementation(async () => { throw Object.assign(new Error("404"), { response: { status: 404 } }); });
    show({ pickupAddress: "הנשיא 5, זכרון יעקב" });
    await settled();
    expect(api.get).toHaveBeenCalledWith(`/producers/${ID}`, undefined);
    expect(screen.getByTestId("order-nav")).toBeTruthy();
    expect(screen.queryByTestId("order-business")).toBeNull();
  });

  it("a body that does not parse is treated as no business (rule 19)", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: ID } });
    show({});
    await settled();
    expect(api.get).toHaveBeenCalledWith(`/producers/${ID}`, undefined);
    expect(screen.queryByTestId("order-business")).toBeNull();
  });
});

describe("the order page passes the pickup address only for a confirmed pickup", () => {
  const ORDER = {
    id: "0a000000-0000-4000-8000-00000000000a", producer_id: ID, status: "confirmed", fulfilment: "pickup",
    slot_start: "2026-11-26T15:00:00Z", slot_end: "2026-11-26T16:00:00Z",
    items: [{ name: "חלה", qty: 1, unit_price_agorot: 2800, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }],
    estimated_total_agorot: 2800, final_total_agorot: null, delivery_fee_agorot: 0, delivery_city: null,
    customer_name: "דנה", note: null, proposal: null, created_at: "2026-11-23T10:00:00Z", expires_at: null,
    producer_name: "המאפייה של רותי", pickup_address: "הנשיא 5, זכרון יעקב", phone_masked: "••••67",
    pickup_code: null, can_cancel: true,
  };
  const page = (over) => {
    vi.mocked(api.get).mockResolvedValue({ data: business() });
    return render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
          <OrderStatusView order={{ ...ORDER, ...over }} onChange={() => {}} refOf={() => ({ token: "t".repeat(43) })} />
        </NextIntlClientProvider>
      </SWRConfig>,
    );
  };

  it("confirmed pickup: the business block for this order's business, and nav to its address", async () => {
    page({});
    expect(await screen.findByTestId("order-business")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(`/producers/${ID}`, undefined);
    expect(screen.getByTestId("order-nav")).toBeTruthy();
  });

  it("still pending: the business block, but no nav (the place is not confirmed)", async () => {
    page({ status: "pending" });
    expect(await screen.findByTestId("order-business")).toBeTruthy();
    expect(screen.queryByTestId("order-nav")).toBeNull();
  });

  it("a delivery: the business block, no nav", async () => {
    page({ fulfilment: "delivery", delivery_city: "חיפה", pickup_address: null });
    expect(await screen.findByTestId("order-business")).toBeTruthy();
    expect(screen.queryByTestId("order-nav")).toBeNull();
  });
});
