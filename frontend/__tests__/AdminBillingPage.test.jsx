// MEH-3182 — the admin's read-only billing view. Rendered with the REAL he
// messages, so the plural forms and the amounts are what the admin reads.
// States: error · 0 businesses · 1 · many (5-state rule).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

// A plain function, not vi.fn: vitest tracks a spy's returned promise, and a
// rejected one then fails the test even though the page catches it.
const { fetchState } = vi.hoisted(() => ({ fetchState: { calls: [], reply: () => Promise.resolve({ data: null }) } }));
vi.mock("@/lib/api", () => ({ default: { get: (...args) => (fetchState.calls.push(args), fetchState.reply()) } }));
const get = {
  mock: fetchState,
  mockResolvedValue: (value) => { fetchState.reply = () => Promise.resolve(value); },
  mockRejectedValue: (error) => { fetchState.reply = () => Promise.reject(error); },
};
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import AdminBillingPage from "../app/[locale]/admin/billing/page";

const overview = (rows, extra = {}) => ({
  month: "2026-11",
  threshold_agorot: 100000,
  businesses_over_threshold: rows.filter((r) => r.over_threshold).length,
  businesses_over_two_months: rows.filter((r) => r.months_over_in_a_row >= 2).length,
  start_billing_businesses: 10,
  would_pay_total_agorot: rows.reduce((sum, r) => sum + r.would_pay_agorot, 0),
  phase: "launch",
  rows,
  ...extra,
});
let rowNo = 0;
const row = (name, over, extra = {}) => ({
  // The page parses the answer, so the id has to be a real uuid.
  producer_id: `00000000-0000-4000-8000-${String(++rowNo).padStart(12, "0")}`,
  name,
  bookings: 1,
  value_agorot: over ? 120000 : 30000,
  over_threshold: over,
  months_over_in_a_row: over ? 1 : 0,
  would_pay_agorot: over ? 6000 : 0,
  ...extra,
});

const show = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <AdminBillingPage />
    </NextIntlClientProvider>
  );

describe("AdminBillingPage (MEH-3182)", () => {
  beforeEach(() => {
    fetchState.calls.length = 0;
    get.mockResolvedValue({ data: null });
  });

  it("asks the admin overview route and nothing else", async () => {
    get.mockResolvedValue({ data: overview([]) });
    show();
    await screen.findByTestId("admin-billing");
    expect(get.mock.calls).toEqual([["/admin/billing/overview"]]);
  });

  it("0 businesses: the empty line, zeros in the tiles, billing shown as off", async () => {
    get.mockResolvedValue({ data: overview([]) });
    show();
    expect(await screen.findByTestId("admin-billing-empty")).toHaveTextContent(he.admin.billing.empty);
    expect(screen.queryByTestId("admin-billing-rows")).toBeNull();
    expect(screen.getByTestId("admin-billing-over")).toHaveTextContent("0");
    expect(screen.getByTestId("admin-billing-switch")).toHaveTextContent(he.admin.billing.switch_off);
    expect(screen.getByTestId("admin-billing-threshold")).toHaveTextContent("1,000₪");
  });

  it("1 business under the threshold: no would-pay line", async () => {
    get.mockResolvedValue({ data: overview([row("מאפיית הבוקר", false)]) });
    show();
    const item = await screen.findByTestId("admin-billing-row");
    expect(item).toHaveTextContent("מאפיית הבוקר");
    expect(item).toHaveTextContent(he.admin.billing.row_under);
    expect(item).toHaveTextContent("הזמנה אחת");
    expect(item).toHaveTextContent("300₪");
    expect(item).not.toHaveTextContent("היה משלם");
    expect(screen.queryByTestId("admin-billing-empty")).toBeNull();
  });

  it("many businesses: each row its own state, the tiles carry the server's totals", async () => {
    get.mockResolvedValue({
      data: overview([
        row("א", true, { months_over_in_a_row: 3, bookings: 7 }),
        row("ב", true, { months_over_in_a_row: 2, bookings: 2 }),
        row("ג", false, { bookings: 12 }),
      ]),
    });
    show();
    const rows = await screen.findAllByTestId("admin-billing-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("מעל הסף, 3 חודשים ברצף");
    expect(rows[0]).toHaveTextContent("7 הזמנות");
    expect(rows[0]).toHaveTextContent("היה משלם החודש 60₪");
    expect(rows[1]).toHaveTextContent("מעל הסף, חודשיים ברצף");
    expect(rows[1]).toHaveTextContent("שתי הזמנות");
    expect(rows[2]).toHaveTextContent("12 הזמנות");
    expect(rows[2]).not.toHaveTextContent("היה משלם");
    expect(screen.getByTestId("admin-billing-over")).toHaveTextContent("2");
    const twoMonths = screen.getByTestId("admin-billing-two-months");
    expect(within(twoMonths).getByText("2")).toBeInTheDocument();
    expect(twoMonths).toHaveTextContent("10");
    expect(screen.getByTestId("admin-billing-would-pay")).toHaveTextContent("120₪");
  });

  it("a failed fetch shows an error, never a screen of zeros", async () => {
    get.mockRejectedValue(new Error("down"));
    show();
    expect(await screen.findByTestId("admin-billing-error")).toHaveTextContent(he.admin.billing.load_error);
    expect(screen.queryByTestId("admin-billing")).toBeNull();
    expect(screen.queryByTestId("admin-billing-over")).toBeNull();
  });

  it("an answer missing the new fields (an older server) is the error state, not a half-filled screen", async () => {
    const { would_pay_total_agorot: _total, phase: _phase, ...older } = overview([]);
    get.mockResolvedValue({ data: older });
    show();
    expect(await screen.findByTestId("admin-billing-error")).toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("admin-billing")).toBeNull();
  });

  it("billing reads as on only when the server says the launch phase is over", async () => {
    get.mockResolvedValue({ data: overview([], { phase: "billing" }) });
    show();
    expect(await screen.findByTestId("admin-billing-switch")).toHaveTextContent(he.admin.billing.switch_on);
  });
});
