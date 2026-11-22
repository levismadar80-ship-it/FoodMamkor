/**
 * MEH-3620 — «כתבו ביקורת» on the buyer's order page: only once the order was
 * handed over and the server sent the business's verified-review link.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import { OrderStatusView } from "@/app/[locale]/order/[id]/OrderStatusClient";

const URL_RT = "https://mehamakor.co.il/p/ruti?rt=abc";
const base = {
  id: "0a000000-0000-4000-8000-00000000000a",
  status: "handed",
  fulfilment: "pickup",
  slot_start: "2026-11-20T07:00:00Z",
  slot_end: "2026-11-20T08:00:00Z",
  items: [],
  estimated_total_agorot: 0,
  final_total_agorot: 0,
  delivery_fee_agorot: 0,
  proposal: null,
  expires_at: null,
  producer_name: "המאפייה של רותי",
  pickup_address: null,
  pickup_code: null,
  can_cancel: false,
  review_url: URL_RT,
};

const show = (over) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrderStatusView order={{ ...base, ...over }} onChange={() => {}} refOf={() => ({})} />
    </NextIntlClientProvider>,
  );

describe("order page «כתבו ביקורת» (MEH-3620)", () => {
  it("a handed order with a link: the button opens the business's review link", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    show({});
    const button = screen.getByTestId("order-write-review");
    expect(button.textContent).toBe("כתבו ביקורת");
    fireEvent.click(button);
    expect(assign).toHaveBeenCalledWith(URL_RT);
    vi.unstubAllGlobals();
  });

  it("a handed order without a link (business not live): no button", () => {
    show({ review_url: null });
    expect(screen.queryByTestId("order-write-review")).toBeNull();
  });

  it.each(["pending", "confirmed", "ready", "cancelled", "declined", "expired"])("%s: no button", (status) => {
    show({ status });
    expect(screen.queryByTestId("order-write-review")).toBeNull();
  });
});
