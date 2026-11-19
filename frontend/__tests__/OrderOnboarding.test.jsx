/**
 * MEH-3216 — telling a business that on-site ordering exists and what it
 * still needs (copy approved by Sapir 19/11).
 *
 * The checklist is a matrix (CLAUDE.md 5-state rule): steps missing 0 / 1 /
 * many × arrived-done or done-here. The home card: ordering off on the server
 * (404), off for the business, on for the business, closed before. Rendered
 * with the real he.json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import OrderSetupChecklist, { setupSteps } from "@/components/dashboard/orders/OrderSetupChecklist";
import OrdersIntroCard, { ORDERS_INTRO_KEY } from "@/components/producer/OrdersIntroCard";
import OrderSettingsCard from "@/components/dashboard/orders/OrderSettingsCard";
import OrderProductsCard from "@/components/dashboard/orders/OrderProductsCard";
import OrderWindowsCard from "@/components/dashboard/orders/OrderWindowsCard";
import api from "@/lib/api";

const wrap = (ui) => (
  <NextIntlClientProvider locale="he" messages={he}>
    {ui}
  </NextIntlClientProvider>
);
const t = he.dashboard.producer.orders;
const SET = { enabled: true, business_id_number: "512345678" };

function settings(over = {}) {
  return {
    producer_id: "11111111-1111-4111-8111-111111111111",
    alcohol_licensed: false,
    enabled: false,
    business_id_number: null,
    auto_confirm: false,
    auto_confirm_slot_cap: null,
    shabbat_observant: false,
    min_order_agorot: null,
    slot_minutes: 60,
    lead_time_hours: 0,
    cancel_cutoff_hours: 24,
    ...over,
  };
}

describe("setupSteps", () => {
  it("names the four steps in the order the cards ask for them", () => {
    expect(setupSteps({ settings: {}, windowsCount: 0, orderableCount: 0 }).map((s) => s.key)).toEqual([
      "business_id",
      "windows",
      "product",
      "enabled",
    ]);
  });
  it("sends the product step to «עריכה» when the business has no products", () => {
    const step = (hasProducts) =>
      setupSteps({ settings: {}, windowsCount: 0, orderableCount: 0, hasProducts }).find((s) => s.key === "product");
    expect(step(true).href).toBe("#order-products");
    expect(step(false).href).toBe("/producer/dashboard/edit");
  });
});

describe("OrderSetupChecklist", () => {
  it("many missing: all four lines, none done", () => {
    render(wrap(<OrderSetupChecklist settings={settings()} windowsCount={0} orderableCount={0} />));
    expect(screen.getByRole("heading", { name: t.checklist.title })).toBeTruthy();
    for (const key of ["business_id", "windows", "product", "enabled"]) {
      expect(screen.getByTestId(`order-setup-${key}`).dataset.done).toBe("false");
    }
  });

  it("one missing: three done, «להדליק» still open", () => {
    render(wrap(<OrderSetupChecklist settings={settings({ business_id_number: "512345678" })} windowsCount={2} orderableCount={3} />));
    expect(screen.getByTestId("order-setup-business_id").dataset.done).toBe("true");
    expect(screen.getByTestId("order-setup-windows").dataset.done).toBe("true");
    expect(screen.getByTestId("order-setup-product").dataset.done).toBe("true");
    expect(screen.getByTestId("order-setup-enabled").dataset.done).toBe("false");
    expect(screen.getByText(t.checklist.enabled)).toBeTruthy();
  });

  it("0 missing on arrival: renders nothing", () => {
    const { container } = render(wrap(<OrderSetupChecklist settings={settings(SET)} windowsCount={1} orderableCount={1} />));
    expect(container.textContent).toBe("");
  });

  it("0 missing after finishing here: says «הכל מוכן»", () => {
    const { rerender } = render(wrap(<OrderSetupChecklist settings={settings({ business_id_number: "512345678" })} windowsCount={1} orderableCount={1} />));
    expect(screen.queryByTestId("order-setup-done")).toBeNull();
    rerender(wrap(<OrderSetupChecklist settings={settings(SET)} windowsCount={1} orderableCount={1} />));
    expect(screen.getByTestId("order-setup-done").textContent).toBe(t.checklist.done);
    expect(screen.queryByTestId("order-setup")).toBeNull();
  });

  it("products not known yet: renders nothing", () => {
    const { container } = render(wrap(<OrderSetupChecklist settings={settings()} windowsCount={0} orderableCount={null} />));
    expect(container.textContent).toBe("");
  });
});

describe("OrdersIntroCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    api.get.mockReset();
  });
  const fallback = <p data-testid="fallback">fallback</p>;

  it("ordering off for the business: the card, with the approved copy", async () => {
    api.get.mockResolvedValue({ data: settings() });
    render(wrap(<OrdersIntroCard fallback={fallback} />));
    expect(await screen.findByTestId("orders-intro-card")).toBeTruthy();
    expect(screen.getByRole("heading", { name: t.intro.title })).toBeTruthy();
    expect(screen.getByText(t.intro.body)).toBeTruthy();
    expect(screen.getByTestId("orders-intro-cta").getAttribute("href")).toBe("/producer/dashboard/orders");
    expect(screen.queryByTestId("fallback")).toBeNull();
  });

  it("«לא עכשיו» closes it for good and gives the slot back", async () => {
    api.get.mockResolvedValue({ data: settings() });
    render(wrap(<OrdersIntroCard fallback={fallback} />));
    fireEvent.click(await screen.findByText(t.intro.later));
    expect(screen.getByTestId("fallback")).toBeTruthy();
    expect(window.localStorage.getItem(ORDERS_INTRO_KEY)).toBe("1");
  });

  it("closed before: the fallback, without asking the server", async () => {
    window.localStorage.setItem(ORDERS_INTRO_KEY, "1");
    render(wrap(<OrdersIntroCard fallback={fallback} />));
    expect(await screen.findByTestId("fallback")).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("ordering already on for the business: the fallback", async () => {
    api.get.mockResolvedValue({ data: settings(SET) });
    render(wrap(<OrdersIntroCard fallback={fallback} />));
    expect(await screen.findByTestId("fallback")).toBeTruthy();
    expect(screen.queryByTestId("orders-intro-card")).toBeNull();
  });

  it("ordering off on the server (404): the fallback", async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });
    render(wrap(<OrdersIntroCard fallback={fallback} />));
    await waitFor(() => expect(screen.getByTestId("fallback")).toBeTruthy());
  });
});

describe("OrderSettingsCard commission line", () => {
  it("says a commission applies and links to the terms' pricing section", () => {
    render(wrap(<OrderSettingsCard settings={settings()} onSaved={() => {}} />));
    const line = screen.getByTestId("orders-commission");
    expect(line.textContent).toBe("על הזמנות דרך האתר חלה עמלה לפי המסלול שלכם. הפרטים בתקנון.");
    expect(line.querySelector("a").getAttribute("href")).toBe("/terms#pricing");
  });
});

describe("OrderSetupChecklist jump", () => {
  it("opens a folded card before jumping to it", () => {
    render(
      wrap(
        <>
          <OrderSetupChecklist settings={settings()} windowsCount={0} orderableCount={0} />
          <details id="order-windows" data-testid="folded">
            <summary>x</summary>
          </details>
        </>,
      ),
    );
    expect(screen.getByTestId("folded").open).toBe(false);
    fireEvent.click(screen.getByText(t.checklist.windows));
    expect(screen.getByTestId("folded").open).toBe(true);
  });
});

describe("the cards tell the page what changed (checklist wiring)", () => {
  it("OrderProductsCard reports its rows, and a failed read", async () => {
    const onChange = vi.fn();
    render(wrap(<OrderProductsCard initial={[{ id: "a", name: "חלה", is_orderable: true, in_stock: true }]} onChange={onChange} />));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "a", is_orderable: true })]);
    const onError = vi.fn();
    api.get.mockRejectedValueOnce(new Error("down"));
    render(wrap(<OrderProductsCard onChange={() => {}} onError={onError} />));
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it("OrderWindowsCard hands the saved week to the page", async () => {
    const onSaved = vi.fn();
    const win = { weekday: 0, start_time: "09:00", end_time: "12:00", fulfilment: "pickup" };
    api.put.mockResolvedValueOnce({ data: { windows: [win] } });
    render(wrap(<OrderWindowsCard windows={[win]} orderWindow={null} onSaved={onSaved} />));
    fireEvent.click(screen.getByTestId("order-windows-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([expect.objectContaining({ weekday: 0 })]));
  });
});
