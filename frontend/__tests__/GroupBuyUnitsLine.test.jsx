import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// MEH-3254 (grill retro D7) — the units line on the owner card.
// Based on GroupBuyOwnerActions.test.jsx (MEH-2435 chunk 3) — the owner's action buttons on /producer/dashboard/group-buys.
//
// Each card shows only the moves its state allows (mirrors OWNER_TRANSITIONS
// in backend/app/routers/group_buys.py):
//   open, before deadline → cancel
//   open, past deadline   → close
//   funded                → deliver + cancel
//   cancelled / fulfilled → nothing
// Every move goes through a confirm dialog; only its confirm button sends the
// PATCH. Matrix covered: 0 / 1 / many cards × dialog closed / open.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key, vals) => (vals ? `${ns}.${key}:${JSON.stringify(vals)}` : `${ns}.${key}`);
    t.rich = (key) => `${ns}.${key}`;
    t.raw = (key) => `${ns}.${key}`;
    return t;
  },
  useLocale: () => "he",
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));

const stableUser = { id: "u1", role: "producer" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a) => captureMessage(...a) }));

const toastSuccess = vi.fn();
vi.mock("@/lib/toast", () => ({
  showToast: { success: (...a) => toastSuccess(...a), error: vi.fn(), info: vi.fn() },
}));

const FUTURE = "2099-01-01T09:00:00Z";
const PAST = "2020-01-01T09:00:00Z";

const groupBuy = (over = {}) => ({
  id: "gb1",
  producer_id: "p1",
  title: "ארגז ירקות שבועי",
  product_name: "ארגז ירקות",
  status: "open",
  price_per_unit_group: "80.00",
  price_per_unit_regular: "100.00",
  commits_count: 2,
  min_participants: 5,
  deadline: FUTURE,
  created_at: "2026-07-01T09:00:00Z",
  ...over,
});

const fixture = { groupBuys: [] };
const getFails = { groupBuys: false };
const patch = vi.fn();
const get = vi.fn((url) => {
  if (url === "/producers/me/dashboard") {
    return Promise.resolve({ data: { producer: { id: "p1", city: "חדרה", status: "approved" } } });
  }
  if (url === "/producers/me/group-buys") {
    return getFails.groupBuys
      ? Promise.reject(new Error("network"))
      : Promise.resolve({ data: fixture.groupBuys });
  }
  return Promise.resolve({ data: [] });
});

vi.mock("@/lib/api", () => ({
  default: {
    get: (...a) => get(...a),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: (...a) => patch(...a),
  },
}));

import ProducerGroupBuysPage from "@/app/[locale]/producer/dashboard/group-buys/page";

const A = "group_buys.dashboard.actions";

async function renderWith(items) {
  fixture.groupBuys = items;
  render(<ProducerGroupBuysPage />);
  if (items.length) await screen.findAllByTestId("manage-group-buy-card");
  else await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/me/group-buys"));
}


const units = () => screen.queryByTestId("group-buy-units")?.textContent ?? null;
const D = "group_buys.dashboard";

beforeEach(() => get.mockClear());

describe("units line (0 / 1 / many × with / without unit)", () => {
  it("0 units: no line", async () => {
    await renderWith([groupBuy({ status: "funded", units_total: 0 })]);
    expect(units()).toBeNull();
  });
  it("missing units_total (public shape): no line", async () => {
    await renderWith([groupBuy({ status: "funded" })]);
    expect(units()).toBeNull();
  });
  it("funded, 1, no unit", async () => {
    await renderWith([groupBuy({ status: "funded", unit: null, units_total: 1 })]);
    expect(units()).toBe(`${D}.units_ordered:{"count":1}`);
  });
  it("funded, many, with unit", async () => {
    await renderWith([groupBuy({ status: "funded", unit: "ליטר", units_total: 14 })]);
    expect(units()).toBe(`${D}.units_ordered_with_unit:{"count":14,"unit":"ליטר"}`);
  });
  it("fulfilled reads as ordered", async () => {
    await renderWith([groupBuy({ status: "fulfilled", unit: null, units_total: 3 })]);
    expect(units()).toBe(`${D}.units_ordered:{"count":3}`);
  });
  it("open reads as requested so far", async () => {
    await renderWith([groupBuy({ status: "open", unit: "מארז", units_total: 4 })]);
    expect(units()).toBe(`${D}.units_requested_with_unit:{"count":4,"unit":"מארז"}`);
  });
  it("cancelled: no line", async () => {
    await renderWith([groupBuy({ status: "cancelled", units_total: 4 })]);
    expect(units()).toBeNull();
  });
});
