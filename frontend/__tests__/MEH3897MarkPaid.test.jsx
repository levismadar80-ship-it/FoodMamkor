/**
 * MEH-3897 — «סמן כשולם»: a business that takes payment ahead marks it by
 * hand, and the buyer stops seeing a pay button once it did.
 *
 * Keys resolve against the real messages/he.json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import he from "../messages/he.json";
import { israelToday } from "@/lib/israel-date";

function lookup(key) {
  return key.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
}
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, values = {}) => {
    const raw = lookup(ns ? `${ns}.${key}` : key);
    return typeof raw === "string" ? raw.replace(/\{(\w+)\}/g, (_m, k) => String(values[k] ?? `{${k}}`)) : raw;
  },
}));

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), put: vi.fn(() => Promise.resolve({ data: {} })) },
}));

const { default: RescueTab } = await import("@/components/dashboard/RescueTab");
const { default: RescueConfirmation } = await import("@/components/rescue/RescueConfirmation");

const HOUR = 3_600_000;
const order = (over = {}) => ({
  id: "o1",
  offer_id: "of1",
  date: israelToday(),
  qty: 1,
  pickup_code: "0431",
  status: "reserved",
  handed_at: null,
  paid_at: null,
  prepay: true,
  price_agorot: 1500,
  pickup_start: new Date(Date.now() - HOUR).toISOString(),
  pickup_end: new Date(Date.now() + HOUR).toISOString(),
  cancel_until: new Date(Date.now() + HOUR).toISOString(),
  ...over,
});
function serve(rows) {
  get.mockImplementation((url) => {
    if (url.includes("typical-items")) return Promise.resolve({ data: { items: [] } });
    if (url === "/producers/me/locations") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: rows });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: {} });
});

describe("the business's order row", () => {
  it("offers «סמן כשולם» on a prepay reservation and posts paid:true", async () => {
    serve([order()]);
    render(<RescueTab />);
    const btn = await screen.findByTestId("rescue-order-mark-paid");
    expect(btn.textContent).toBe("סמן כשולם");
    fireEvent.click(btn);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/rescue/orders/o1/paid", { paid: true }));
  });

  it("a paid row says «שולם» and undo posts paid:false", async () => {
    serve([order({ paid_at: new Date().toISOString() })]);
    render(<RescueTab />);
    expect((await screen.findByTestId("rescue-order-paid")).textContent).toBe("✓ שולם");
    expect(screen.queryByTestId("rescue-order-mark-paid")).toBeNull();
    fireEvent.click(screen.getByTestId("rescue-order-unpaid"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/rescue/orders/o1/paid", { paid: false }));
  });

  it("a handed bag can still be marked; a cancelled or no-show one cannot", async () => {
    serve([
      order({ id: "h", status: "handed", pickup_code: "0001", handed_at: new Date().toISOString() }),
      order({ id: "c", status: "cancelled", pickup_code: "0002" }),
      order({ id: "n", status: "no_show", pickup_code: "0003" }),
    ]);
    render(<RescueTab />);
    await screen.findAllByTestId("rescue-order-row");
    expect(screen.getAllByTestId("rescue-order-mark-paid")).toHaveLength(1);
  });

  it("a business that is paid at the counter sees no payment control", async () => {
    serve([order({ prepay: false })]);
    render(<RescueTab />);
    await screen.findAllByTestId("rescue-order-row");
    expect(screen.queryByTestId("rescue-order-paid-cell")).toBeNull();
  });
});

describe("the buyer's confirmation", () => {
  const BIT = "https://www.bitpay.co.il/app/me/ABCD-1234";
  it("before the mark: the pay button, no confirmation line", () => {
    render(<RescueConfirmation order={order()} prepay={{ link: BIT, timing: "advance" }} />);
    expect(screen.getByTestId("rescue-prepay")).toBeTruthy();
    expect(screen.queryByTestId("rescue-paid-confirmed")).toBeNull();
  });

  it("after the mark: the line replaces the button", () => {
    render(<RescueConfirmation order={order({ paid_at: new Date().toISOString() })} prepay={{ link: BIT, timing: "advance" }} />);
    expect(screen.queryByTestId("rescue-prepay")).toBeNull();
    expect(screen.getByTestId("rescue-paid-confirmed").textContent).toBe("בית העסק אישר שהתשלום התקבל");
    // The price line keeps saying the bag was paid ahead, never «לשלם בקופה».
    expect(screen.getByTestId("rescue-confirmation-price").textContent).toBe("שולם מראש: 15 ₪");
  });

  it("a deposit stays a deposit after the mark: the rest is still paid at the counter", () => {
    render(<RescueConfirmation order={order({ paid_at: new Date().toISOString() })} prepay={{ link: BIT, timing: "deposit" }} />);
    expect(screen.getByTestId("rescue-confirmation-price").textContent).toBe("מחיר הסל: 15 ₪ · את היתרה משלמים בקופה");
  });
});
