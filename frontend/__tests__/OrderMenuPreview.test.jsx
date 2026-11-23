// MEH-3746 — the owner's preview of the order form.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "@/messages/he.json";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import api from "@/lib/api";
import OrderSheet, { forgetOrderDrafts } from "@/components/public/OrderSheet";
import { PreviewModeProvider } from "@/lib/preview-mode";
import { useOrderCart } from "@/lib/use-order-cart";

const PRODUCER = "7e57a6f0-0000-4000-8000-000000000007";
const BREAD = "0a000000-0000-4000-8000-00000000000a";
const MENU = {
  producer_id: PRODUCER,
  min_order_agorot: null,
  cancel_cutoff_hours: 12,
  lead_time_hours: 24,
  business_id_number: "",
  products: [
    {
      id: BREAD, name: "חלה", image_url: null, price_min_agorot: 2800, price_max_agorot: 2800,
      price_unit: "unit", price_is_estimate: false, in_stock: true, contains_alcohol: false,
    },
  ],
  slots: [{ start: "2026-11-20T08:00:00Z", end: "2026-11-20T09:00:00Z", fulfilment: "pickup", alcohol_ok: true }],
};
const t = he.producer.detail.order_sheet;

function sheet(inPreview) {
  const tree = (
    <OrderSheet producer={{ id: PRODUCER, name: "מאפייה" }} menu={MENU} picks={{ [BREAD]: 1 }} onClose={() => {}} />
  );
  return render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      {inPreview ? <PreviewModeProvider ownerOrderMenu>{tree}</PreviewModeProvider> : tree}
    </NextIntlClientProvider>,
  );
}

const OwnerPreview = ({ children }) => <PreviewModeProvider ownerOrderMenu>{children}</PreviewModeProvider>;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe("OrderSheet inside the owner's preview", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockReset();
    forgetOrderDrafts();
  });

  it("asks no quote, and its send button says it cannot send", async () => {
    sheet(true);
    const send = screen.getByTestId("order-sheet-send");
    expect(send.textContent).toBe(t.preview_send);
    expect(send).toBeDisabled();
    await wait(700); // past the quote's debounce
    expect(api.post).not.toHaveBeenCalled();
  });

  // With a valid phone, so only the preview guard can keep the button off
  // (an empty phone disables it anyway — fresh review).
  it("sends no WhatsApp code, even with a valid phone", () => {
    sheet(true);
    fireEvent.change(screen.getByTestId("order-sheet-phone"), { target: { value: "0501234567" } });
    const ask = screen.getByTestId("order-sheet-send-code");
    expect(ask).toBeDisabled();
    fireEvent.click(ask);
    expect(api.post).not.toHaveBeenCalledWith("/product-orders/phone-code", expect.anything());
  });

  it("outside the preview the same phone can ask for the code (control)", () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    sheet(false);
    fireEvent.change(screen.getByTestId("order-sheet-phone"), { target: { value: "0501234567" } });
    expect(screen.getByTestId("order-sheet-send-code")).toBeEnabled();
  });

  it("a submit of the form (Enter in a field) posts no order", async () => {
    sheet(true);
    fireEvent.submit(screen.getByTestId("order-sheet-phone").closest("form"));
    await wait(50);
    expect(api.post).not.toHaveBeenCalledWith("/product-orders", expect.anything());
  });

  it("outside the preview the sheet quotes as before (control)", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { subtotal_agorot: 2800, delivery_fee_agorot: 0, total_agorot: 2800, has_estimate: false },
    });
    sheet(false);
    expect(screen.getByTestId("order-sheet-send").textContent).not.toBe(t.preview_send);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/product-orders/quote", expect.anything()));
  });
});

describe("useOrderCart inside the owner's preview", () => {
  beforeEach(() => vi.mocked(api.get).mockReset());

  it("reads her own preview menu even while the page says she takes no orders", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: MENU });
    const { result } = renderHook(() => useOrderCart({ id: PRODUCER, takes_site_orders: false }), {
      wrapper: OwnerPreview,
    });
    await waitFor(() => expect(result.current.menu?.producer_id).toBe(PRODUCER));
    expect(api.get).toHaveBeenCalledWith("/producers/me/order-menu/preview");
  });

  // The draft-preview page (no login) is in preview mode too: it must not
  // call the owner route (fresh review).
  it("preview mode without ownerOrderMenu reads nothing", async () => {
    const { result } = renderHook(() => useOrderCart({ id: PRODUCER, takes_site_orders: false }), {
      wrapper: PreviewModeProvider,
    });
    await wait(50);
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.menu).toBeNull();
  });

  it("a menu of another business is dropped", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...MENU, producer_id: "7e57a6f0-0000-4000-8000-000000000099" } });
    const { result } = renderHook(() => useOrderCart({ id: PRODUCER, takes_site_orders: false }), {
      wrapper: OwnerPreview,
    });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await wait(20);
    expect(result.current.menu).toBeNull();
  });

  it("outside the preview a business that takes no orders reads nothing (control)", async () => {
    const { result } = renderHook(() => useOrderCart({ id: PRODUCER, takes_site_orders: false }));
    await wait(50);
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.menu).toBeNull();
  });
});
