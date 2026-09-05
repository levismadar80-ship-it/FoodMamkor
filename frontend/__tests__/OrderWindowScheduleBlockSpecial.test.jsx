/**
 * MEH-2264 (MEH-1889 chunk B) — the "שעות מיוחדות" layer of
 * OrderWindowScheduleBlock: upcoming per-date overrides under the weekly
 * schedule.
 *
 * Same harness as OrderWindowScheduleBlock.test.jsx: the REAL
 * NextIntlClientProvider + he.json, `onError` observed rather than swallowed,
 * so a missing key fails here instead of rendering its path.
 *
 * The clock is pinned with fake timers because "which dates are still ahead"
 * is time-derived: without the pin this file would silently flip red on
 * 2026-09-22, which is the two-causes green testing.md bans.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import en from "../messages/en.json";
import { OrderWindowScheduleBlock } from "@/app/[locale]/producer/[id]/components/OrderWindowStrip";

const COPY = he.producer.detail.order_window;

// Saturday 05/09/2026, 10:00 Israel (IDT, UTC+3).
const NOW = new Date("2026-09-05T07:00:00Z");

const SUN_THU = {
  sunday: [{ open: "09:00", close: "14:00" }],
  monday: [{ open: "09:00", close: "14:00" }],
  tuesday: [{ open: "09:00", close: "14:00" }],
  wednesday: [{ open: "09:00", close: "14:00" }],
  thursday: [{ open: "09:00", close: "14:00" }],
};

const SPECIAL = {
  "2026-08-01": { ranges: [], note: "עבר מזמן" }, // past → never rendered
  "2026-09-21": { ranges: [], note: "יום כיפור" }, // future, closed
  "2026-09-11": { ranges: [{ open: "09:00", close: "13:00" }], note: "ערב ראש השנה" },
};

function renderBlock(orderWindow, specialHours, messages = he, locale = "he") {
  const onError = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale={locale} messages={messages} onError={onError}>
      <OrderWindowScheduleBlock orderWindow={orderWindow} specialHours={specialHours} />
    </NextIntlClientProvider>,
  );
  return { onError, ...utils };
}

const block = () => screen.queryByTestId("order-window-schedule");
const special = () => screen.queryByTestId("order-window-special");
const specialRows = () => screen.queryAllByTestId("order-window-special-row");

describe("OrderWindowScheduleBlock — special hours layer (MEH-2264)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("lists the UPCOMING overrides only, oldest first, with hours or the closed copy", () => {
    const { onError } = renderBlock(SUN_THU, SPECIAL);

    expect(special()).toBeTruthy();
    expect(screen.getByText(COPY.special_heading)).toBeTruthy();
    const rows = specialRows();
    expect(rows.map((r) => r.getAttribute("data-date"))).toEqual(["2026-09-11", "2026-09-21"]);
    // The past date is gone entirely — not greyed, not struck through, gone.
    expect(screen.queryByText("עבר מזמן")).toBeNull();

    expect(rows[0].textContent).toContain("9:00–13:00");
    expect(rows[0].textContent).toContain("ערב ראש השנה");
    expect(rows[0].getAttribute("data-closed")).toBeNull();

    expect(rows[1].textContent).toContain(COPY.special_closed);
    expect(rows[1].textContent).toContain("יום כיפור");
    expect(rows[1].getAttribute("data-closed")).toBe("true");
    expect(onError).not.toHaveBeenCalled();
  });

  it("formats the date in the page locale, in Israel calendar terms", () => {
    renderBlock(SUN_THU, SPECIAL);
    // he-IL long month for 21/09 — the string Intl produces, not a literal we
    // wrote into the component.
    const expected = new Intl.DateTimeFormat("he", {
      day: "numeric",
      month: "long",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(Date.UTC(2026, 8, 21, 12)));
    expect(specialRows()[1].textContent).toContain(expected);
  });

  it("renders NO special layer when every override is in the past", () => {
    renderBlock(SUN_THU, { "2026-08-01": { ranges: [] } });
    expect(block()).toBeTruthy(); // the weekly schedule is still there
    expect(special()).toBeNull();
  });

  it("renders NO special layer when there are no overrides (byte-identical to before)", () => {
    renderBlock(SUN_THU, null);
    expect(block()).toBeTruthy();
    expect(special()).toBeNull();
  });

  it("an override-only producer (no weekly map) still gets the block", () => {
    renderBlock(null, SPECIAL);
    expect(block()).toBeTruthy();
    expect(specialRows()).toHaveLength(2);
    // …and no weekly rows, because there is no weekly schedule to show.
    expect(screen.queryAllByTestId("order-window-schedule-row")).toHaveLength(0);
  });

  it("nothing at all when there is neither a weekly map nor a future override", () => {
    renderBlock(null, { "2026-08-01": { ranges: [] } });
    expect(block()).toBeNull();
  });

  it("the server pass carries the weekly schedule but NOT the clock-derived special list", () => {
    const html = renderToString(
      <NextIntlClientProvider locale="he" messages={he}>
        <OrderWindowScheduleBlock orderWindow={SUN_THU} specialHours={SPECIAL} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('data-testid="order-window-schedule"');
    expect(html).not.toContain('data-testid="order-window-special"');
  });

  it("still states no open/closed verdict — the special list is a schedule, not a status", () => {
    renderBlock(SUN_THU, SPECIAL);
    const html = block().innerHTML;
    for (const forbidden of [
      he.producer.detail.header.status.orders_open.split(" ·")[0],
      he.producer.detail.header.status.closed,
    ]) {
      expect(html).not.toContain(forbidden);
    }
    // Status TONES only — `text-primary-dark` on the card's icon is the
    // pre-existing Info-card styling, not a verdict colour.
    expect(html).not.toMatch(/text-(primary|gold-deep)(?=[\s"])/);
  });

  it("has an en.json twin for both new keys", () => {
    const { onError } = renderBlock(SUN_THU, SPECIAL, en, "en");
    expect(screen.getByText(en.producer.detail.order_window.special_heading)).toBeTruthy();
    expect(specialRows()[1].textContent).toContain(en.producer.detail.order_window.special_closed);
    expect(onError).not.toHaveBeenCalled();
  });
});
