/**
 * MEH-3752 — «ספרו לנו איך אתם מקבלים הזמנות» on the orders tab, and the «?»
 * on its seven fields. The draft states are a matrix: box closed / open × a
 * draft that fills no card / one card / all three × 0 / 1 / many windows.
 * Hard lines held here: the draft never touches «לקבל הזמנות באתר»,
 * auto-confirm or the business ID, and nothing is saved until she presses a
 * card's own button, which saves through that card's existing route.
 *
 * REUSES: __tests__/OrderOnboarding.test.jsx (settings fixture, he.json
 * render) and __tests__/ProductOrderGaps.test.jsx (product rows).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

const apiMock = vi.hoisted(() => {
  const state = { fill: null, products: [] };
  return {
    state,
    get: vi.fn(),
    post: vi.fn((url) =>
      url === "/producers/me/ai-fill/order_setup" ? Promise.resolve({ data: state.fill }) : Promise.resolve({ data: {} }),
    ),
    put: vi.fn(),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/dashboard/orders/OrderCustomersCard", () => ({ default: () => null }));

import OrdersPage from "@/app/[locale]/producer/dashboard/orders/page";
import { applySettingsDraft, draftProductIds, draftWindows } from "@/lib/order-setup-draft";

// Config shape, not behaviour: the field map is the backend's and nothing in
// the frontend runs it, so its keys are read as data (testing.md MEH-3531).
const MAP = JSON.parse(
  readFileSync(resolve(__dirname, "../../backend/app/data/form_maps/order_setup.json"), "utf8"),
);
const KEYS = MAP.fields.map((f) => f.key);
const O = he.dashboard.producer.orders;
const TEXT = "מזמינים עד חמישי בערב, איסוף בשישי בבוקר. עד 20 הזמנות בכל מועד.";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const EMPTY = { slot_cap: null, cancel_cutoff_hours: null, min_order: null, slot_minutes: null, lead_time_hours: null, windows: [], product_ids: [] };
const FRI = { weekday: 5, start_time: "08:00", end_time: "12:00", fulfilment: "pickup" };
const SAVED_WINDOW = { weekday: 1, start_time: "16:00:00", end_time: "19:00:00", fulfilment: "pickup" };

function settings(over = {}) {
  return {
    producer_id: P1,
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

const product = (over = {}) => ({ id: P1, name: "חלה", has_price: true, is_orderable: false, in_stock: true, price_unit: "unit", contains_alcohol: false, ...over });

function mockReads({ windows = [], current = settings() } = {}) {
  apiMock.get.mockImplementation((url) => {
    if (url === "/producers/me/order-settings") return Promise.resolve({ data: current });
    if (url === "/producers/me/order-windows") return Promise.resolve({ data: { windows } });
    if (url === "/producers/me/product-orders") return Promise.resolve({ data: { orders: [], total: 0 } });
    if (url === "/producers/me/products/ordering") return Promise.resolve({ data: { products: apiMock.state.products } });
    return Promise.resolve({ data: null });
  });
}

async function renderPage() {
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem" onError={() => {}}>
      <OrdersPage />
    </NextIntlClientProvider>,
  );
  await screen.findByTestId("order-settings");
}

async function fillFrom(draft) {
  apiMock.state.fill = { form: "order_setup", draft };
  fireEvent.click(screen.getByTestId("form-fill-order_setup-toggle"));
  fireEvent.change(screen.getByTestId("form-fill-order_setup-text"), { target: { value: TEXT } });
  fireEvent.click(screen.getByTestId("form-fill-order_setup-read"));
  await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/producers/me/ai-fill/order_setup", { text: TEXT }));
}

const cap = () => /** @type {HTMLInputElement} */ (screen.getByTestId("orders-slot-cap"));
const rows = () => screen.queryAllByTestId("order-window-row");

beforeEach(() => {
  apiMock.state.fill = null;
  apiMock.state.products = [product(), product({ id: P2, name: "עוגה" })];
  apiMock.get.mockReset();
  apiMock.post.mockClear();
  apiMock.put.mockReset();
  mockReads();
});

describe("the «?» on the seven order-setup fields (MEH-3752)", () => {
  it("has help text in he and en for exactly the map's keys", () => {
    expect(Object.keys(O.help).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(en.dashboard.producer.orders.help).sort()).toEqual([...KEYS].sort());
  });

  it("opens each field's own text with no server call", async () => {
    await renderPage();
    await screen.findAllByTestId("order-product");
    apiMock.post.mockClear();
    for (const key of KEYS) {
      const button = screen.getByTestId(`order-help-${key}`);
      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(button.getAttribute("aria-controls"))).toHaveTextContent(O.help[key]);
    }
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("keeps each visible label tied to its control", async () => {
    await renderPage();
    expect(screen.getByLabelText(O.settings.slot_cap, { selector: "input" })).toBe(cap());
    expect(screen.getByLabelText(O.settings.min_order, { selector: "input" })).toBe(screen.getByTestId("orders-min-order"));
    for (const label of [O.settings.cutoff_label, O.settings.slot_minutes, O.settings.lead_time]) {
      expect(screen.getByLabelText(label, { selector: "select" })).toBeInTheDocument();
    }
    const first = (await screen.findAllByTestId("order-product"))[0];
    expect(within(first).getByRole("switch", { name: O.products.orderable })).toBeInTheDocument();
  });
});

describe("«ספרו לנו איך אתם מקבלים הזמנות» (MEH-3752)", () => {
  it("is closed until she opens it", async () => {
    await renderPage();
    expect(screen.getByText(O.fill.title)).toBeInTheDocument();
    expect(screen.getByTestId("form-fill-order_setup-text")).not.toBeVisible();
  });

  it("a draft that fills nothing says so, keeps the text and changes no card", async () => {
    await renderPage();
    await fillFrom(EMPTY);
    expect(await screen.findByText(he.page_fill.empty)).toBeInTheDocument();
    expect(screen.getByTestId("form-fill-order_setup-text")).toHaveValue(TEXT);
    expect(cap().value).toBe("");
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it("one card, 0 windows: the numbers fill, the saved week stays", async () => {
    mockReads({ windows: [SAVED_WINDOW] });
    await renderPage();
    await fillFrom({ ...EMPTY, slot_cap: 20, cancel_cutoff_hours: 12 });
    await waitFor(() => expect(cap().value).toBe("20"));
    expect(screen.getByLabelText(O.settings.cutoff_label, { selector: "select" })).toHaveValue("12");
    expect(rows()).toHaveLength(1);
    expect(screen.getAllByDisplayValue("16:00")).toHaveLength(1);
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it("all three cards, 1 window: nothing saves until each card's own button", async () => {
    await renderPage();
    await screen.findAllByTestId("order-product");
    await fillFrom({ ...EMPTY, slot_cap: 20, min_order: 80, slot_minutes: 120, windows: [FRI], product_ids: [P2] });
    await waitFor(() => expect(cap().value).toBe("20"));
    expect(screen.getByTestId("orders-min-order")).toHaveValue("80");
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId(`orderable-${P2}`)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId(`orderable-${P1}`)).toHaveAttribute("aria-checked", "false");
    expect(apiMock.put).not.toHaveBeenCalled();

    apiMock.put.mockImplementation((url, body) => {
      if (url.endsWith("/ordering")) return Promise.resolve({ data: { ...product({ id: P2 }), ...body } });
      if (url === "/producers/me/order-settings") return Promise.resolve({ data: settings(body) });
      return Promise.resolve({ data: { windows: body.windows } });
    });
    fireEvent.click(screen.getByTestId("order-products-save"));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith(`/producers/me/products/${P2}/ordering`, expect.objectContaining({ is_orderable: true })),
    );
    fireEvent.click(screen.getByTestId("order-windows-save"));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith("/producers/me/order-windows", { windows: [FRI] }));
    fireEvent.click(screen.getByTestId("orders-settings-save"));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith(
        "/producers/me/order-settings",
        expect.objectContaining({ auto_confirm_slot_cap: 20, min_order_agorot: 8000, slot_minutes: 120 }),
      ),
    );
    expect(apiMock.put.mock.calls.map(([url]) => url)).not.toContain(`/producers/me/products/${P1}/ordering`);
  });

  it("many windows replace the week, and the save sends them all", async () => {
    mockReads({ windows: [SAVED_WINDOW] });
    await renderPage();
    const many = [FRI, { ...FRI, weekday: 4 }, { ...FRI, weekday: 5, start_time: "17:00", end_time: "21:00", fulfilment: "delivery" }];
    await fillFrom({ ...EMPTY, windows: many });
    await waitFor(() => expect(rows()).toHaveLength(3));
    apiMock.put.mockResolvedValue({ data: { windows: many } });
    fireEvent.click(screen.getByTestId("order-windows-save"));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith("/producers/me/order-windows", { windows: many }));
  });

  it("a set-up business's folded cards open for the draft", async () => {
    mockReads({ windows: [SAVED_WINDOW], current: settings({ enabled: true, business_id_number: "512345678" }) });
    await renderPage();
    expect(screen.getByTestId("order-settings").open).toBe(false);
    await fillFrom({ ...EMPTY, slot_cap: 20 });
    await waitFor(() => expect(screen.getByTestId("order-settings").open).toBe(true));
  });

  it("the products card stays open after its save, and a new draft reopens it", async () => {
    const P3 = "33333333-3333-4333-8333-333333333333";
    apiMock.state.products = [product({ is_orderable: true }), product({ id: P2, name: "עוגה" }), product({ id: P3, name: "פשטידה" })];
    mockReads({ windows: [SAVED_WINDOW], current: settings({ enabled: true, business_id_number: "512345678" }) });
    await renderPage();
    const card = /** @type {HTMLDetailsElement} */ (await screen.findByTestId("order-products"));
    expect(card.open).toBe(false);
    await fillFrom({ ...EMPTY, product_ids: [P2] });
    await waitFor(() => expect(card.open).toBe(true));
    apiMock.put.mockImplementation((url, body) => Promise.resolve({ data: { ...product({ id: url.split("/")[4] }), ...body } }));
    fireEvent.click(screen.getByTestId("order-products-save"));
    await waitFor(() => expect(screen.queryByTestId("order-products-save")).not.toBeInTheDocument());
    expect(card.open).toBe(true);
    card.open = false;
    apiMock.post.mockClear();
    await fillFrom({ ...EMPTY, product_ids: [P3] });
    await waitFor(() => expect(screen.getByTestId(`orderable-${P3}`)).toHaveAttribute("aria-checked", "true"));
    expect(card.open).toBe(true);
  });

  it("never touches «לקבל הזמנות באתר», auto-confirm or the business ID", async () => {
    mockReads({ current: settings({ business_id_number: "512345678" }) });
    await renderPage();
    // Even a draft that carried a number for it (the server never sends the
    // key; a boolean would not pass the response schema at all).
    await fillFrom({ ...EMPTY, slot_cap: 20, business_id_number: "999999999", businessId: "999999999" });
    await waitFor(() => expect(cap().value).toBe("20"));
    expect(screen.getByTestId("orders-enabled")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("orders-auto")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("orders-business-id")).toHaveValue("512345678");
    apiMock.put.mockResolvedValue({ data: settings({ auto_confirm_slot_cap: 20, business_id_number: "512345678" }) });
    fireEvent.click(screen.getByTestId("orders-settings-save"));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe("/producers/me/order-settings");
    expect(body).toMatchObject({ enabled: false, auto_confirm: false, auto_confirm_slot_cap: 20, business_id_number: "512345678" });
  });

  it("a drafted product taken back by a tap is not saved", async () => {
    await renderPage();
    await screen.findAllByTestId("order-product");
    await fillFrom({ ...EMPTY, product_ids: [P1] });
    const toggle = await screen.findByTestId(`orderable-${P1}`);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("order-products-save")).not.toBeInTheDocument();
    expect(apiMock.put).not.toHaveBeenCalled();
  });
});

describe("order-setup-draft (MEH-3752)", () => {
  it("fills only the numbers the draft gives, as the inputs hold them", () => {
    const form = { cap: "5", minimum: "", cancel_cutoff_hours: 24, slot_minutes: 60, lead_time_hours: 0, enabled: true, businessId: "1" };
    const next = applySettingsDraft(form, { ...EMPTY, min_order: 80, lead_time_hours: 48, enabled: false, businessId: "2" });
    expect(next).toEqual({ ...form, minimum: "80", lead_time_hours: 48 });
  });

  it("no windows keeps the week; product ids come back as strings", () => {
    expect(draftWindows(EMPTY)).toBeNull();
    expect(draftWindows({ windows: [FRI] })).toEqual([FRI]);
    expect(draftProductIds({ product_ids: [P1] })).toEqual([P1]);
    expect(draftProductIds({})).toEqual([]);
  });
});
