// MEH-3680 — a signed-in buyer whose phone is verified orders without a code.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "@/messages/he.json";

const { push, auth } = vi.hoisted(() => ({ push: vi.fn(), auth: { value: null } }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => auth.value }));

import api from "@/lib/api";
import OrderSheet from "@/components/public/OrderSheet";
import { orderBody, sameIlPhone } from "@/lib/order-sheet";

const PRODUCER = "7e57a6f0-0000-4000-8000-000000000007";
const BREAD = "0a000000-0000-4000-8000-00000000000a";
const ORDER = "0c000000-0000-4000-8000-00000000000c";
const TOKEN = "t".repeat(43);
const START = "2026-11-20T08:00:00Z";
const MENU = {
  producer_id: PRODUCER,
  min_order_agorot: null,
  cancel_cutoff_hours: 12,
  lead_time_hours: 0,
  business_id_number: "512345678",
  products: [{
    id: BREAD, name: "חלה", image_url: null, price_min_agorot: 2800, price_max_agorot: 2800,
    price_unit: "unit", price_is_estimate: false, in_stock: true, contains_alcohol: false,
  }],
  slots: [{ start: START, end: "2026-11-20T09:00:00Z", fulfilment: "pickup", alcohol_ok: true }],
};
const QUOTE = { subtotal_agorot: 2800, delivery_fee_agorot: 0, total_agorot: 2800, has_estimate: false };
const user = (over = {}) => ({ user: { name: "דנה לוי", phone: "+972501234567", phone_verified: true, ...over } });

function renderSheet() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrderSheet producer={{ id: PRODUCER }} menu={MENU} picks={{ [BREAD]: 1 }} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("sameIlPhone", () => {
  it("matches one mobile in every notation and nothing else", () => {
    expect(sameIlPhone("050-123-4567", "+972501234567")).toBe(true);
    expect(sameIlPhone("972501234567", "0501234567")).toBe(true);
    expect(sameIlPhone("0501234568", "0501234567")).toBe(false);
    expect(sameIlPhone("", "")).toBe(false);
    expect(sameIlPhone("031234567", "031234567")).toBe(false);
  });
});

describe("orderBody", () => {
  it("sends a code only when there is one", () => {
    const base = {
      producerId: PRODUCER, picks: { [BREAD]: 1 }, fulfilment: /** @type {const} */ ("pickup"), slotStart: START,
      name: "דנה", phone: "0501234567", city: "", address: "", note: "", ageDeclared: false, key: "k",
    };
    expect(orderBody({ ...base, code: "" })).not.toHaveProperty("code");
    expect(orderBody({ ...base, code: " 123456 " }).code).toBe("123456");
  });
});

describe("OrderSheet for a signed-in buyer", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockImplementation(async (url) =>
      url === "/product-orders/quote" ? { data: QUOTE } : { data: { id: ORDER, status_token: TOKEN } },
    );
    push.mockReset();
    auth.value = null;
  });

  it("fills her name and verified phone, shows no code step, and sends without a code", async () => {
    auth.value = user();
    renderSheet();
    expect(screen.getByTestId("order-sheet-name").value).toBe("דנה לוי");
    expect(screen.getByTestId("order-sheet-phone").value).toBe("+972501234567");
    expect(screen.queryByTestId("order-sheet-send-code")).toBeNull();
    expect(screen.queryByTestId("order-sheet-code")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("order-sheet-send").disabled).toBe(false));
    fireEvent.submit(screen.getByTestId("order-sheet"));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/order/${ORDER}#t=${TOKEN}`));
    const sent = vi.mocked(api.post).mock.calls.find(([url]) => url === "/product-orders")[1];
    expect(sent).not.toHaveProperty("code");
    expect(sent).toMatchObject({ phone: "+972501234567", customer_name: "דנה לוי" });
    expect(api.post).not.toHaveBeenCalledWith("/product-orders/phone-code", expect.anything());
  });

  it("brings the code step back when she types another phone", () => {
    auth.value = user();
    renderSheet();
    fireEvent.change(screen.getByTestId("order-sheet-phone"), { target: { value: "0529999999" } });
    expect(screen.getByTestId("order-sheet-send-code")).toBeTruthy();
  });

  it("fills only the name, and keeps the code step, when her phone is not verified", () => {
    auth.value = user({ phone_verified: false });
    renderSheet();
    expect(screen.getByTestId("order-sheet-name").value).toBe("דנה לוי");
    expect(screen.getByTestId("order-sheet-phone").value).toBe("");
    expect(screen.getByTestId("order-sheet-send-code")).toBeTruthy();
  });

  it("starts empty with the code step for a guest", () => {
    renderSheet();
    expect(screen.getByTestId("order-sheet-name").value).toBe("");
    expect(screen.getByTestId("order-sheet-send-code")).toBeTruthy();
  });
});
