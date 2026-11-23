/**
 * MEH-3755 — the order page's business block: the name links to the business
 * page, the contact button uses the business's own channel, and a pickup
 * order gets Waze / Google Maps for its address. A business whose page cannot
 * be read shows no block (the nav links stay, they come from the order).
 * Rendered with the real he.json.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/lib/contact-tracking", () => ({ trackChannelClick: vi.fn() }));

import api from "@/lib/api";
import { GetProducerProducersProducerIdGetResponse } from "@/lib/generated/api.zod";
import OrderBusinessLinks from "@/app/[locale]/order/[id]/OrderBusinessLinks";
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
    const btn = await screen.findByTestId("order-contact");
    expect(btn.textContent).toBe(he.contact_cta.whatsapp);
    expect(btn.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/972521234567\?text=/);
  });

  it("a business with no contact detail gets no contact button", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: business({ phone: null }) });
    show({});
    await screen.findByTestId("order-business-link");
    expect(screen.queryByTestId("order-contact")).toBeNull();
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
    // Let the failed read settle before the assertions and the unmount.
    await new Promise((r) => setTimeout(r, 50));
    expect(api.get).toHaveBeenCalledWith(`/producers/${ID}`, undefined);
    expect(screen.getByTestId("order-nav")).toBeTruthy();
    expect(screen.queryByTestId("order-business")).toBeNull();
  });

  it("a body that does not parse is treated as no business (rule 19)", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: ID } });
    show({});
    // Long enough for the read to settle (the 200 case renders by then).
    await new Promise((r) => setTimeout(r, 50));
    expect(api.get).toHaveBeenCalledWith(`/producers/${ID}`, undefined);
    expect(screen.queryByTestId("order-business")).toBeNull();
  });
});
