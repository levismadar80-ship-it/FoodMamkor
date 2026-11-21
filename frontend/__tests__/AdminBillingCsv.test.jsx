// MEH-3189 — the monthly billing CSV on /admin/billing.
// The file is built from the server's overview; a business name cannot run
// as a formula; a failed read toasts instead of downloading a broken file.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

const { state } = vi.hoisted(() => ({
  state: { calls: [], reply: () => Promise.resolve({ data: null }), toasts: [] },
}));
vi.mock("@/lib/api", () => ({
  default: { get: (...args) => (state.calls.push(args), state.reply()) },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { error: (m) => state.toasts.push(m), success: () => {}, info: () => {} },
}));

import { buildBillingCsv, csvCell } from "../lib/admin-billing-export";
import BillingCsvButton from "../components/admin/BillingCsvButton";

const words = {
  headers: he.admin.billing.csv.headers,
  yes: "כן",
  no: "לא",
  phaseOn: "on",
  phaseOff: "off",
};
const overview = (rows, phase = "launch") => ({
  month: "2026-10",
  threshold_agorot: 100000,
  businesses_over_threshold: 0,
  businesses_over_two_months: 0,
  start_billing_businesses: 10,
  start_billing_months: 2,
  would_pay_total_agorot: 0,
  phase,
  year: { year: 2026, income_agorot: 0, ceiling_agorot: 12283300, ceiling_year: 2026, percent: 0, alert_percent: 0 },
  history: [],
  rows,
});
const row = (name, extra = {}) => ({
  producer_id: "00000000-0000-4000-8000-000000000001",
  name,
  bookings: 3,
  value_agorot: 123456,
  over_threshold: true,
  months_over_in_a_row: 1,
  would_pay_agorot: 6173,
  ...extra,
});

describe("buildBillingCsv (MEH-3189)", () => {
  it("0 businesses: BOM and the header line only", () => {
    const csv = buildBillingCsv(overview([]), words);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\n")).toHaveLength(1);
    expect(csv).toContain('"בית עסק"');
  });

  it("1 business: amounts in shekels from agorot, the month, yes/no, the phase", () => {
    const lines = buildBillingCsv(overview([row("משק")]), words).split("\n");
    expect(lines[1]).toBe(
      '"2026-10","משק","00000000-0000-4000-8000-000000000001","3","1234.56","כן","61.73","off"',
    );
  });

  it("many businesses, billing on: one line each, phase says on", () => {
    const rows = [row("א"), row("ב", { over_threshold: false, would_pay_agorot: 0 })];
    const lines = buildBillingCsv(overview(rows, "billing"), words).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('"לא","0.00","on"');
  });

  it("a name that starts like a formula is neutralised; quotes are doubled", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@x")).toBe(`"'@x"`);
    expect(csvCell('משק "הגבעה"')).toBe('"משק ""הגבעה"""');
    // tab, CR, LF, and a formula behind leading whitespace or a zero-width mark
    expect(csvCell("\t=1")).toBe(`"'\t=1"`);
    expect(csvCell("\r=1")).toBe(`"'\r=1"`);
    expect(csvCell("\n=1")).toBe(`"'\n=1"`);
    expect(csvCell("  =1")).toBe(`"'  =1"`);
    expect(csvCell("\u200B=1")).toBe(`"'\u200B=1"`);
    // an ordinary name, and a dash INSIDE a name, are left alone
    expect(csvCell("משק הגבעה - רמת גן")).toBe('"משק הגבעה - רמת גן"');
  });
});

describe("BillingCsvButton (MEH-3189)", () => {
  beforeEach(() => {
    state.calls = [];
    state.toasts = [];
    globalThis.URL.createObjectURL = vi.fn(() => "blob:x");
    globalThis.URL.revokeObjectURL = vi.fn();
  });
  const show = () =>
    render(
      <NextIntlClientProvider locale="he" messages={he}>
        <BillingCsvButton month="2026-10" />
      </NextIntlClientProvider>,
    );

  it("reads that month's overview and downloads billing-YYYY-MM.csv", async () => {
    state.reply = () => Promise.resolve({ data: overview([row("משק")]) });
    const clicked = [];
    const spy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function () {
        clicked.push(this.download);
      });
    show();
    fireEvent.click(screen.getByTestId("admin-billing-csv-2026-10"));
    await waitFor(() => expect(clicked).toEqual(["billing-2026-10.csv"]));
    expect(state.calls[0][0]).toBe("/admin/billing/overview?month=2026-10");
    expect(state.toasts).toEqual([]);
    spy.mockRestore();
  });

  it("a rejected read toasts the error", async () => {
    state.reply = () => Promise.reject(new Error("network"));
    show();
    fireEvent.click(screen.getByTestId("admin-billing-csv-2026-10"));
    await waitFor(() => expect(state.toasts).toEqual([he.admin.billing.csv.error]));
  });

  it("a failed or malformed read toasts the error and downloads nothing", async () => {
    state.reply = () => Promise.resolve({ data: { month: "2026-10" } });
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click");
    show();
    fireEvent.click(screen.getByTestId("admin-billing-csv-2026-10"));
    await waitFor(() => expect(state.toasts).toEqual([he.admin.billing.csv.error]));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
