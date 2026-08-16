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
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    expect(rows()[0].textContent).toContain("9:00–14:00");
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
    expect(rows()[0].textContent).toContain("9:00–13:00, 16:00–19:00");
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
      "9:00–13:00,",
      "16:00–19:00,",
      "20:00–22:00",
    ]);
    // The comma is inside (it must not start a line); the space is not.
    for (const span of nowrapSpans) {
      expect(span.textContent).not.toMatch(/\s/);
    }
    // …and the space really is present between them, so a break can happen.
    expect(rows()[0].textContent).toContain("9:00–13:00, 16:00–19:00");
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
    expect(text).toContain("9:00–14:00");

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

/**
 * MEH-1917 — layer 2: the full week, per day, behind a quiet disclosure.
 *
 * Covered as a MATRIX, not two lists (CLAUDE.md conditional-UI rule, and the
 * MEH-1583 lesson where (many × open) was the cell that shipped unchecked):
 *
 *            | closed (default) | open
 *   0 days   | block absent — no disclosure to have either way
 *   1 day    | no disclosure    | n/a — there is nothing to disclose
 *   many, unmerged | no disclosure | n/a — same reason
 *   many, merged   | summary only  | full per-day list
 */
describe("OrderWindowScheduleBlock — full-week disclosure (MEH-1917)", () => {
  const toggle = () => screen.queryByTestId("order-window-week-toggle");
  const weekPanel = () => screen.queryByTestId("order-window-week");
  const weekRows = () => screen.queryAllByTestId("order-window-week-row");

  // Sun–Thu identical → getOrderWindowRanges merges 5 days into 1 summary row,
  // which is exactly the compression this layer undoes.
  it("many + merged × CLOSED — the summary is compressed and the week is not shown", () => {
    renderBlock(SUN_THU);
    expect(rows()).toHaveLength(1);
    expect(toggle()).toBeTruthy();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(weekPanel()).toBeNull();
    expect(weekRows()).toHaveLength(0);
  });

  it("many + merged × OPEN — one row per open day, un-merged, no day span anywhere", () => {
    renderBlock(SUN_THU);
    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(weekPanel()).toBeTruthy();
    // FIVE rows, not the one merged row above — this is the whole point.
    expect(weekRows()).toHaveLength(5);
    const labels = weekRows().map((r) => r.textContent);
    for (const key of ["sun", "mon", "tue", "wed", "thu"]) {
      expect(labels.some((l) => l.includes(COPY.days[key]))).toBe(true);
    }
    // Not one of them is a merged span like "ראשון–חמישי".
    for (const label of labels) {
      expect(label).not.toContain(`${COPY.days.sun}–`);
    }
    // Days that are closed never appear.
    expect(labels.some((l) => l.includes(COPY.days.fri))).toBe(false);
    expect(labels.some((l) => l.includes(COPY.days.sat))).toBe(false);
  });

  it("expanding REPLACES the summary — the same schedule never prints twice", () => {
    renderBlock(SUN_THU);
    expect(rows()).toHaveLength(1);
    fireEvent.click(toggle());
    // The merged summary row is gone; only the per-day list remains. Stacking
    // the two printed "ראשון–חמישי" directly above ראשון/שני/שלישי/…, which is
    // what the first build did and what the eye pass caught.
    expect(rows()).toHaveLength(0);
    expect(weekRows()).toHaveLength(5);
    fireEvent.click(toggle());
    expect(rows()).toHaveLength(1);
  });

  it("closes again on a second click", () => {
    renderBlock(SUN_THU);
    fireEvent.click(toggle());
    expect(weekPanel()).toBeTruthy();
    fireEvent.click(toggle());
    expect(weekPanel()).toBeNull();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("one open day → NO disclosure (the summary already is the per-day list)", () => {
    renderBlock({ wednesday: [{ open: "08:00", close: "12:00" }] });
    expect(rows()).toHaveLength(1);
    expect(toggle()).toBeNull();
    expect(weekPanel()).toBeNull();
  });

  it("many open days with no merging → still no disclosure, nothing is hidden", () => {
    renderBlock({
      sunday: [{ open: "09:00", close: "13:00" }],
      monday: [{ open: "10:00", close: "15:00" }],
      tuesday: [{ open: "08:00", close: "11:00" }],
    });
    // Three summary rows for three open days: the summary is already un-merged.
    expect(rows()).toHaveLength(3);
    expect(toggle()).toBeNull();
  });

  it("zero open days → no block, and therefore no disclosure in either state", () => {
    renderBlock({});
    expect(block()).toBeNull();
    expect(toggle()).toBeNull();
    expect(weekPanel()).toBeNull();
  });

  it("a split day stacks its ranges instead of comma-joining them", () => {
    renderBlock({
      sunday: [
        { open: "09:00", close: "13:00" },
        { open: "16:00", close: "19:00" },
      ],
      monday: [
        { open: "09:00", close: "13:00" },
        { open: "16:00", close: "19:00" },
      ],
    });
    fireEvent.click(toggle());

    const spans = [...weekRows()[0].querySelectorAll("span.whitespace-nowrap")];
    expect(spans.map((s) => s.textContent)).toEqual(["9:00–13:00", "16:00–19:00"]);
    // Stacked, not run together: no comma separator in the expanded view.
    expect(weekRows()[0].textContent).not.toContain(",");
  });

  it("times are humanised in BOTH layers — one card, one grammar", () => {
    renderBlock(SUN_THU);
    expect(rows()[0].textContent).toContain("9:00–14:00");
    expect(rows()[0].textContent).not.toContain("09:00");
    fireEvent.click(toggle());
    expect(weekRows()[0].textContent).toContain("9:00–14:00");
    expect(weekRows()[0].textContent).not.toContain("09:00");
  });

  it("the numerals stay bidi-isolated on the RTL page", () => {
    renderBlock(SUN_THU);
    fireEvent.click(toggle());
    const times = weekRows()[0].querySelector('[dir="ltr"]');
    expect(times).toBeTruthy();
    expect(times.textContent).toContain("9:00–14:00");
  });

  it("has an en.json twin for every new key", () => {
    const { onError } = renderBlock(SUN_THU, en, "en");
    const EN = en.producer.detail.order_window;
    expect(screen.getByTestId("order-window-week-toggle").textContent).toContain(EN.show_week);
    fireEvent.click(toggle());
    expect(screen.getByTestId("order-window-week-toggle").textContent).toContain(EN.hide_week);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("OrderWindowScheduleBlock — today marker (MEH-1917)", () => {
  const toggle = () => screen.getByTestId("order-window-week-toggle");

  afterEach(() => {
    vi.useRealTimers();
  });

  // 2026-08-05 12:00 UTC is a Wednesday; Asia/Jerusalem is ahead of UTC, so it
  // is still Wednesday locally. Pinning the clock is what makes "today" a
  // deterministic assertion instead of one that passes six days in seven.
  const pinTo = (iso) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("marks exactly one row as today, and it is the right one", () => {
    pinTo("2026-08-05T12:00:00Z"); // Wednesday
    renderBlock(SUN_THU);
    fireEvent.click(toggle());

    const marked = screen.getAllByTestId("order-window-week-row").filter(
      (r) => r.getAttribute("data-today") === "true",
    );
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute("data-day")).toBe("3"); // 0=Sunday → 3=Wednesday
    expect(marked[0].textContent).toContain(COPY.days.wed);
    expect(marked[0].textContent).toContain(COPY.today);
    expect(screen.getAllByTestId("order-window-today-chip")).toHaveLength(1);
  });

  it("marks NO row when today is a day the business is closed", () => {
    pinTo("2026-08-08T12:00:00Z"); // Saturday — not in SUN_THU
    renderBlock(SUN_THU);
    fireEvent.click(toggle());

    expect(
      screen
        .getAllByTestId("order-window-week-row")
        .filter((r) => r.getAttribute("data-today") === "true"),
    ).toHaveLength(0);
    expect(screen.queryByTestId("order-window-today-chip")).toBeNull();
  });

  /**
   * RETRACTED ASSERTION, kept as a note because the retraction is the finding.
   *
   * This started as "the SERVER pass carries no today marker", asserting
   * `html` lacked `data-today="true"`. It passed — and it passed for the WRONG
   * reason. Running the control (initialising todayIndex from the clock
   * instead of in an effect) did NOT red it: the week panel is collapsed on
   * the server, so the clock-derived branch is not rendered there under EITHER
   * implementation. A green with two causes, indistinguishable at read time.
   *
   * So the honest statement of why SSR is safe is not "the highlight is
   * guarded" — it is "the panel that contains the highlight is closed on the
   * server". That is what this asserts, and it is discriminating: flip the
   * default to open and it reds immediately. The mounted guard in the
   * component stays as defence for exactly that day, and is documented there
   * as such rather than as the thing currently doing the work.
   */
  it("the server pass renders the panel CLOSED, which is what keeps the clock out of it", () => {
    pinTo("2026-08-05T12:00:00Z"); // Wednesday — a marker would appear if it could
    const html = renderToString(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <OrderWindowScheduleBlock orderWindow={SUN_THU} />
      </NextIntlClientProvider>,
    );

    // The block itself IS server-rendered — so this is not green by rendering
    // nothing at all.
    expect(html).toContain(COPY.schedule_heading);
    expect(html).toContain(COPY.show_week);
    // …and the panel holding the clock-derived row is absent.
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="order-window-week"');
    expect(html).not.toContain('data-today="true"');
  });
});
