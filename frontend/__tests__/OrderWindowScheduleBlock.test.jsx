/**
 * MEH-1875 — OrderWindowScheduleBlock: the weekly order schedule as a headed
 * Info block on /producer/[id].
 *
 * Rendered under the REAL NextIntlClientProvider + he.json (DietaryScopeCard
 * harness), so a missing or misspelled message key fails the test instead of
 * silently rendering the key path. `onError` is deliberately NOT swallowed
 * here — next-intl reports a missing key through it, and a mock that ate the
 * error would let this suite pass against copy that does not exist.
 *
 * The block is schedule-only by contract (MEH-1305 A: the page's single
 * open/closed verdict lives in ProducerHeader). Three of the cases below exist
 * to hold that line, not to check rendering.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import en from "../messages/en.json";
import { OrderWindowScheduleBlock } from "@/app/[locale]/producer/[id]/components/OrderWindowStrip";

const COPY = he.producer.detail.order_window;

// Sun–Thu 09:00–14:00 — the staging demo producer's window (מאפיית רוח השדה).
const SUN_THU = {
  sunday: [{ open: "09:00", close: "14:00" }],
  monday: [{ open: "09:00", close: "14:00" }],
  tuesday: [{ open: "09:00", close: "14:00" }],
  wednesday: [{ open: "09:00", close: "14:00" }],
  thursday: [{ open: "09:00", close: "14:00" }],
};

function renderBlock(orderWindow, messages = he, locale = "he") {
  const onError = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale={locale} messages={messages} onError={onError}>
      <OrderWindowScheduleBlock orderWindow={orderWindow} />
    </NextIntlClientProvider>,
  );
  return { onError, ...utils };
}

const block = () => screen.queryByTestId("order-window-schedule");
const rows = () => screen.queryAllByTestId("order-window-schedule-row");

describe("OrderWindowScheduleBlock (MEH-1875)", () => {
  it("renders the headed block with compressed weekly ranges", () => {
    const { onError } = renderBlock(SUN_THU);

    expect(block()).toBeTruthy();
    expect(screen.getByRole("heading", { name: COPY.schedule_heading })).toBeTruthy();
    // Consecutive identical days collapse into ONE row (getOrderWindowRanges).
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain(`${COPY.days.sun}–${COPY.days.thu}`);
    expect(rows()[0].textContent).toContain("09:00–14:00");
    // No missing-message errors → every key above exists in he.json.
    expect(onError).not.toHaveBeenCalled();
  });

  it("renders multiple ranges on one day comma-separated, and does not merge days that differ", () => {
    renderBlock({
      sunday: [
        { open: "09:00", close: "13:00" },
        { open: "16:00", close: "19:00" },
      ],
      monday: [{ open: "09:00", close: "13:00" }],
    });

    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain("09:00–13:00, 16:00–19:00");
    // Sunday's second range makes it a different schedule from Monday, so the
    // two must stay separate rows even though they are consecutive days.
    expect(rows()[0].textContent).toContain(COPY.days.sun);
    expect(rows()[0].textContent).not.toContain(`–${COPY.days.mon}`);
    expect(rows()[1].textContent).toContain(COPY.days.mon);
  });

  it("a single open day renders one label, not a range", () => {
    renderBlock({ wednesday: [{ open: "08:00", close: "12:00" }] });

    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain(COPY.days.wed);
    expect(rows()[0].textContent).not.toContain("–" + COPY.days.wed);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    // Every stored range malformed (close <= open) → normalizeDayEntries drops
    // them all, so there is nothing to show and the block must not render an
    // empty shell.
    ["an all-malformed window", { sunday: [{ open: "14:00", close: "09:00" }] }],
  ])("%s → the block is absent from the DOM entirely", (_label, orderWindow) => {
    const { container } = renderBlock(orderWindow);

    expect(block()).toBeNull();
    expect(rows()).toHaveLength(0);
    // Zero layout shift: not "hidden", not an empty <section> — nothing at all.
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps each range unbreakable and the separator space breakable", () => {
    // jsdom cannot lay out, so this asserts the STRUCTURE the layout depends on.
    // Both halves matter and each was observed failing at 375px:
    //   - a range NOT in a nowrap span broke at the en-dash ("20:00–" / "22:00")
    //   - the separator space INSIDE the span made the list one unbreakable
    //     token, overflowing the card, which then clipped the third range away
    //     (worse: the data vanished rather than wrapping).
    renderBlock({
      sunday: [
        { open: "09:00", close: "13:00" },
        { open: "16:00", close: "19:00" },
        { open: "20:00", close: "22:00" },
      ],
    });

    const nowrapSpans = [...rows()[0].querySelectorAll("span.whitespace-nowrap")];
    expect(nowrapSpans.map((s) => s.textContent)).toEqual([
      "09:00–13:00,",
      "16:00–19:00,",
      "20:00–22:00",
    ]);
    // The comma is inside (it must not start a line); the space is not.
    for (const span of nowrapSpans) {
      expect(span.textContent).not.toMatch(/\s/);
    }
    // …and the space really is present between them, so a break can happen.
    expect(rows()[0].textContent).toContain("09:00–13:00, 16:00–19:00");
  });

  it("states no open/closed verdict and carries no status colour (MEH-1305 A)", () => {
    const { container } = renderBlock(SUN_THU);
    const text = container.textContent;

    // The header owns the verdict. None of its status vocabulary appears here.
    for (const word of ["פתוח", "סגור", "עכשיו"]) {
      expect(text).not.toContain(word);
    }
    // No status tint on any node — the page's single green is the header's.
    const classNames = [...container.querySelectorAll("*")]
      .map((el) => el.getAttribute("class") || "")
      .join(" ");
    expect(classNames).not.toMatch(/\b(bg|text|border)-(success|danger|warning|green|red|amber)/);
  });

  it("is SSR-safe: the server pass already contains the schedule (no mounted guard)", () => {
    // getOrderWindowRanges is clock-free (lib/orderWindow.js:218), which is why
    // this block needs no mounted guard while OrderWindowCtaNote does. If a
    // future edit adds one, the server string goes empty and this fails.
    const html = renderToString(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <OrderWindowScheduleBlock orderWindow={SUN_THU} />
      </NextIntlClientProvider>,
    );
    // Each range is three adjacent text nodes ({open}–{close}), so React's
    // server renderer separates them with `<!-- -->` markers. Strip those before
    // matching — the browser concatenates them and the user sees one string.
    const text = html.replace(/<!-- -->/g, "");

    expect(text).toContain(COPY.schedule_heading);
    expect(text).toContain("09:00–14:00");

    // Discrimination control: the SAME render path with a null window produces
    // nothing, so the assertion above is reading the window and not just the
    // provider's output.
    const empty = renderToString(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <OrderWindowScheduleBlock orderWindow={null} />
      </NextIntlClientProvider>,
    );
    expect(empty).toBe("");
  });

  it("has an en.json twin for every key it renders", () => {
    const { onError } = renderBlock(SUN_THU, en, "en");

    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: en.producer.detail.order_window.schedule_heading }))
      .toBeTruthy();
    expect(rows()[0].textContent).toContain(
      `${en.producer.detail.order_window.days.sun}–${en.producer.detail.order_window.days.thu}`,
    );
  });
});
