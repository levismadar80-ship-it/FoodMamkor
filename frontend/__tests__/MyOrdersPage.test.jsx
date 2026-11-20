// MEH-3525: «ההזמנות שלי». GET /users/me/product-orders had no screen.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import MyOrdersClient from "@/app/[locale]/my-orders/MyOrdersClient";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
const push = vi.fn();
const router = { push }; // stable, like Next's
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/my-orders" }));
const authRef = { current: { user: { id: "u1" }, loading: false } };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authRef.current }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const order = (id, status, name, created) => ({
  id, status, producer_id: "7d1f5f3e-1c2b-4e5a-9f00-000000000001", producer_name: name,
  created_at: created, can_cancel: false, customer_name: "דנה", delivery_city: null,
  delivery_fee_agorot: 0, estimated_total_agorot: 5000, expires_at: null, final_total_agorot: null,
  fulfilment: "pickup", items: [], note: null, phone_masked: "05x-xxx-1234", pickup_code: null,
  proposal: null, slot_start: created, slot_end: created,
});
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const copy = he.my_orders;
const mount = () => render(
  <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
    <MyOrdersClient />
  </NextIntlClientProvider>,
);

describe("MyOrdersClient", () => {
  beforeEach(() => {
    api.get.mockReset();
    push.mockReset();
    authRef.current = { user: { id: "u1" }, loading: false };
  });

  it("0 orders: the empty state with a way to the businesses", async () => {
    api.get.mockResolvedValueOnce({ data: { orders: [] } });
    mount();
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
    expect(screen.getByText(copy.empty_cta).closest("a")).toHaveAttribute("href", expect.stringContaining("/producers"));
  });

  it("1 order: one row «business · date · status» that opens its status page", async () => {
    api.get.mockResolvedValueOnce({ data: { orders: [order(A, "confirmed", "מאפיית השכונה", "2026-11-18T09:00:00+00:00")] } });
    mount();
    const row = await screen.findByTestId("my-orders-row");
    expect(row).toHaveTextContent("מאפיית השכונה · 18.11.2026 · " + copy.status.confirmed);
    expect(row).toHaveAttribute("href", `/order/${A}`);
  });

  it("many orders keep the server's newest-first order", async () => {
    api.get.mockResolvedValueOnce({ data: { orders: [
      order(B, "pending", "גבינות הגליל", "2026-11-19T09:00:00+00:00"),
      order(A, "handed", "מאפיית השכונה", "2026-11-10T09:00:00+00:00"),
    ] } });
    mount();
    await waitFor(() => expect(screen.getAllByTestId("my-orders-row")).toHaveLength(2));
    const rows = screen.getAllByTestId("my-orders-row");
    expect(rows[0]).toHaveTextContent(copy.status.pending);
    expect(rows[1]).toHaveTextContent(copy.status.handed);
  });

  it("ordering switched off (404) reads as no orders, not an error", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    mount();
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  });

  it("a failed read shows an error with a retry that reads again", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    api.get.mockResolvedValueOnce({ data: { orders: [] } });
    mount();
    expect(await screen.findByText(copy.load_error)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("my-orders-error-retry"));
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  });

  it("a malformed body is an error, not an empty list (rule 19)", async () => {
    api.get.mockResolvedValueOnce({ data: { orders: [{ id: "x" }] } });
    mount();
    expect(await screen.findByText(copy.load_error)).toBeInTheDocument();
  });

  it("a guest is sent to login and nothing is read", async () => {
    authRef.current = { user: null, loading: false };
    mount();
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
  });
});
