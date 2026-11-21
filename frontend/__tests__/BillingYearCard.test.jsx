// MEH-3189 — the admin's year-to-date income against the exempt-dealer
// ceiling. Rendered with the REAL he messages.
// States: launch / billing · 0 · under 70 · 70 · 90 · stale ceiling year.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import BillingYearCard from "../components/admin/BillingYearCard";

const year = (extra = {}) => ({
  year: 2026,
  income_agorot: 0,
  ceiling_agorot: 12283300,
  ceiling_year: 2026,
  percent: 0,
  alert_percent: 0,
  ...extra,
});

const show = (y, charging = false) =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <BillingYearCard year={y} charging={charging} />
    </NextIntlClientProvider>,
  );

describe("BillingYearCard (MEH-3189)", () => {
  it("launch, 0 income: says what it WOULD bring in, the ceiling, 0%, no warning", () => {
    show(year());
    const card = screen.getByTestId("admin-billing-year");
    expect(screen.getByTestId("admin-billing-year-income")).toHaveTextContent(
      "היה מכניס",
    );
    expect(card).toHaveTextContent("122,833");
    expect(card).toHaveTextContent("זה 0% ממנה");
    expect(screen.queryByTestId("admin-billing-year-alert")).toBeNull();
    expect(screen.queryByTestId("admin-billing-year-stale")).toBeNull();
  });

  it("billing on: says what it brought in, not what it would have", () => {
    show(year({ income_agorot: 500000, percent: 4 }), true);
    const line = screen.getByTestId("admin-billing-year-income");
    expect(line).toHaveTextContent("הכניס");
    expect(line).not.toHaveTextContent("היה מכניס");
    expect(line).toHaveTextContent("5,000");
  });

  it("the warning shows the level the server reached: 70, then 90", () => {
    const { unmount } = show(year({ percent: 75, alert_percent: 70 }));
    expect(screen.getByTestId("admin-billing-year-alert")).toHaveTextContent(
      "הגעת ל-70% מהתקרה",
    );
    unmount();
    show(year({ percent: 93, alert_percent: 90 }));
    expect(screen.getByTestId("admin-billing-year-alert")).toHaveTextContent(
      "הגעת ל-90% מהתקרה",
    );
  });

  it("a ceiling set for an earlier year says it needs updating", () => {
    show(year({ year: 2027, ceiling_year: 2026 }));
    expect(screen.getByTestId("admin-billing-year-stale")).toHaveTextContent(
      "צריך לעדכן אותו לשנת 2027",
    );
  });

  it("a past month viewed today is not stale", () => {
    show(year({ year: 2025, ceiling_year: 2026 }));
    expect(screen.queryByTestId("admin-billing-year-stale")).toBeNull();
  });
});
