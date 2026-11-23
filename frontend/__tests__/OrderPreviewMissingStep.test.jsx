// MEH-3763 — the owner's order preview names the step the form still lacks.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "@/messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { producer_id: "7e57a6f0-0000-4000-8000-000000000007" }, loading: false }),
  useOptionalAuth: () => null,
}));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({ default: () => <div data-testid="detail" /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));

import api from "@/lib/api";
import OrderPreviewClient from "@/app/[locale]/producer/dashboard/orders/preview/OrderPreviewClient";
import OrderSheet from "@/components/public/OrderSheet";

const PRODUCER = "7e57a6f0-0000-4000-8000-000000000007";
const BREAD = "0a000000-0000-4000-8000-00000000000a";
const PRODUCT = {
  id: BREAD, name: "חלה", image_url: null, price_min_agorot: 2800, price_max_agorot: 2800,
  price_unit: "unit", price_is_estimate: false, in_stock: true, contains_alcohol: false,
};
const SLOT = { start: "2026-11-20T08:00:00Z", end: "2026-11-20T09:00:00Z", fulfilment: "pickup", alcohol_ok: true };
const menu = (over) => ({
  producer_id: PRODUCER, min_order_agorot: null, cancel_cutoff_hours: 12, lead_time_hours: 24,
  business_id_number: "", products: [PRODUCT], slots: [SLOT], ...over,
});
const t = he.dashboard.producer.orders;

const page = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrderPreviewClient />
    </NextIntlClientProvider>,
  );

describe("OrderPreviewClient missing-step line", () => {
  // Braces: a function returned from beforeEach runs as its teardown.
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("no product open for ordering → says so, links to the orders tab", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: menu({ products: [] }) });
    page();
    const line = await screen.findByTestId("order-preview-missing");
    expect(line.textContent).toContain(t.preview_no_products);
    expect(screen.getByRole("link", { name: t.preview_fix_link }).getAttribute("href")).toBe("/producer/dashboard/orders");
    expect(api.get).toHaveBeenCalledWith("/producers/me/order-menu/preview");
  });

  it("products but no delivery hours → the hours line", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: menu({ slots: [] }) });
    page();
    const line = await screen.findByTestId("order-preview-missing");
    expect(line.getAttribute("data-step")).toBe("no_slots");
    expect(line.textContent).toContain(t.preview_no_slots);
    expect(line.getAttribute("role")).toBe("status");
    expect(screen.getByRole("link", { name: t.preview_fix_link }).getAttribute("href")).toBe("/producer/dashboard/orders");
  });

  it("read failed → the reload line, with no link", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("500"));
    page();
    const line = await screen.findByTestId("order-preview-missing");
    expect(line.textContent).toContain(t.preview_load_failed);
    expect(line.getAttribute("role")).toBe("alert");
    expect(screen.queryByRole("link", { name: t.preview_fix_link })).toBeNull();
  });

  it("while the menu is still loading → no line flashes", async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    page();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.getByTestId("order-preview").getAttribute("data-menu-step")).toBe("loading");
    expect(screen.getByTestId("order-preview-banner")).toBeTruthy();
    expect(screen.queryByTestId("order-preview-missing")).toBeNull();
  });

  it("a full menu → no line (control)", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: menu() });
    page();
    // Waits for the settled state itself, not for time to pass.
    await waitFor(() => expect(screen.getByTestId("order-preview").getAttribute("data-menu-step")).toBe("ready"));
    expect(screen.queryByTestId("order-preview-missing")).toBeNull();
  });
});

describe("OrderSheet seller line", () => {
  const sheet = (m) =>
    render(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <OrderSheet producer={{ id: PRODUCER, name: "מאפייה", city: "חיפה" }} menu={m} picks={{ [BREAD]: 1 }} onClose={() => {}} />
      </NextIntlClientProvider>,
    );

  it("no business number yet → says it was not entered, never an empty «מס׳ עוסק:»", () => {
    sheet(menu());
    expect(document.body.textContent).toContain("מס׳ עוסק / ת״ז: עוד לא הוזן · חיפה");
  });

  it("with a number → the number (control)", () => {
    sheet(menu({ business_id_number: "512345678" }));
    expect(document.body.textContent).toContain("512345678");
    expect(document.body.textContent).not.toContain("עוד לא הוזן");
  });
});
