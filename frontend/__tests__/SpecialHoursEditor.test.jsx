/**
 * MEH-2264 (MEH-1889 chunk B) — SpecialHoursEditor + lib/special-hours.
 *
 * The 5-state matrix from the card, as cells not lists:
 *   rows: 0 / 1 / many  ×  chip: available / taken / none
 * plus the payload contract (closed row → `ranges: []`, empty → null, past
 * dates dropped on load) and the client mirror of the backend rejections.
 *
 * The clock is pinned: "which dates are past" and "which holidays are
 * upcoming" are both time-derived, and an unpinned suite would flip on its
 * own on 2026-09-23 (two-causes green, testing.md).
 *
 * REUSES: __tests__/OrderWindowEditorRanges.test.jsx (next-intl echo + api
 * mock pattern).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SpecialHoursEditor from "@/app/[locale]/producer/dashboard/edit/SpecialHoursEditor";
import api from "@/lib/api";
import {
  addHolidayRows,
  canAddSpecialRange,
  holidayChips,
  rowsFromSpecialHours,
  serializeSpecialHours,
  specialHoursIssues,
  upcomingSpecialCount,
} from "@/lib/special-hours";
import { HOLIDAYS } from "@/lib/holidays";

vi.mock("next-intl", () => {
  const t = (key) => key;
  return { useTranslations: () => t };
});
vi.mock("@/lib/api", () => ({
  default: { put: vi.fn(() => Promise.resolve({ data: {} })) },
}));

// Saturday 05/09/2026, 10:00 Israel. Every chip expectation below is DERIVED
// from HOLIDAYS rather than naming dates: the chips read that file as-is, so a
// date fix there (MEH-2263) must move the chips and not this suite.
const NOW = new Date("2026-09-05T07:00:00Z");
const TODAY = "2026-09-05";

/** The keys holidays.js says are still ahead of TODAY, oldest first. */
const UPCOMING_KEYS = Object.entries(HOLIDAYS)
  .filter(([, h]) => h.end >= TODAY)
  .sort(([, a], [, b]) => a.start.localeCompare(b.start))
  .map(([key]) => key);
const PAST_KEYS = Object.keys(HOLIDAYS).filter((k) => !UPCOMING_KEYS.includes(k));

const ONE = { "2026-09-21": { ranges: [], note: "יום כיפור" } };
const MANY = {
  "2026-09-21": { ranges: [], note: "יום כיפור" },
  "2026-09-11": { ranges: [{ open: "09:00", close: "13:00" }], note: "ערב ראש השנה" },
  "2026-08-01": { ranges: [] }, // past — must vanish on load
};

const renderEditor = (special_hours) =>
  render(<SpecialHoursEditor profile={{ special_hours }} onSave={() => {}} />);

const rows = () => screen.queryAllByTestId("special-hours-row");

describe("lib/special-hours — rows ⇄ payload", () => {
  it("drops past dates on load, sorts ascending, and reads closed vs open", () => {
    const out = rowsFromSpecialHours(MANY, TODAY);
    expect(out.map((r) => r.date)).toEqual(["2026-09-11", "2026-09-21"]);
    expect(out[0].closed).toBe(false);
    expect(out[0].ranges).toEqual([{ from: "09:00", to: "13:00" }]);
    expect(out[1].closed).toBe(true);
    expect(out[1].note).toBe("יום כיפור");
    expect(upcomingSpecialCount(MANY, TODAY)).toBe(2);
  });

  it("serialises a closed row as `ranges: []`, omits an empty note, and clears to null", () => {
    expect(serializeSpecialHours([])).toBeNull();
    expect(
      serializeSpecialHours([
        { date: "2026-09-21", closed: true, ranges: [{ from: "09:00", to: "14:00" }], note: "  " },
        { date: "2026-09-11", closed: false, ranges: [{ from: "09:00", to: "13:00" }], note: " ערב " },
      ]),
    ).toEqual({
      "2026-09-21": { ranges: [] },
      "2026-09-11": { ranges: [{ open: "09:00", close: "13:00" }], note: "ערב" },
    });
  });

  it("round-trips: load → serialise reproduces the stored future entries", () => {
    const stored = { "2026-09-21": { ranges: [] }, "2026-09-11": { ranges: [{ open: "09:00", close: "13:00" }], note: "ערב" } };
    expect(serializeSpecialHours(rowsFromSpecialHours(stored, TODAY))).toEqual(stored);
  });

  it("flags an empty, past or duplicate date, and reuses the range rules for open rows", () => {
    const issues = specialHoursIssues(
      [
        { date: "", closed: true, ranges: [], note: "" },
        { date: "2026-08-01", closed: true, ranges: [], note: "" },
        { date: "2026-09-21", closed: false, ranges: [{ from: "13:00", to: "09:00" }], note: "" },
        { date: "2026-09-21", closed: true, ranges: [], note: "" },
        { date: "2026-09-22", closed: true, ranges: [{ from: "13:00", to: "09:00" }], note: "" },
      ],
      TODAY,
    );
    expect(issues).toEqual([
      { index: 0, reason: "invalid_date" },
      { index: 1, reason: "invalid_date" },
      { index: 2, reason: "invalid_range" },
      { index: 3, reason: "invalid_date" },
      // index 4: closed → its ranges are ignored, like a closed weekly day.
    ]);
  });
  it("canAddSpecialRange reads the row's `closed` key — a special row has no `open`", () => {
    // The reviewer's finding on PR #3417: a special row passed straight to the
    // order-window helper reads `day.open === undefined` and is refused on
    // EVERY open row. The adapter is what this case discriminates — against
    // the direct call, the first line below is false.
    const open = { date: "2026-09-11", closed: false, ranges: [{ from: "09:00", to: "13:00" }] };
    expect(canAddSpecialRange(open)).toBe(true);
    expect(canAddSpecialRange({ ...open, closed: true })).toBe(false);
    // Under the cap only — three ranges is the shared ceiling.
    const three = [
      { from: "08:00", to: "10:00" },
      { from: "10:00", to: "12:00" },
      { from: "12:00", to: "14:00" },
    ];
    expect(canAddSpecialRange({ ...open, ranges: three })).toBe(false);
    // …and only with room left in the day after the last range.
    expect(canAddSpecialRange({ ...open, ranges: [{ from: "20:00", to: "23:59" }] })).toBe(false);
  });
});

describe("lib/special-hours — holiday chips read HOLIDAYS as-is", () => {
  it("lists only holidays that have not ended, oldest first, with their remaining dates", () => {
    const chips = holidayChips([], TODAY);
    expect(chips.map((c) => c.key)).toEqual(UPCOMING_KEYS);
    for (const past of PAST_KEYS) expect(chips.map((c) => c.key)).not.toContain(past);
    // The self-test of the fixture: on 05/09/2026 the file must have at least
    // one holiday ahead, or every case below is vacuous.
    expect(chips.length).toBeGreaterThan(0);
    const first = chips[0];
    const h = HOLIDAYS[first.key];
    expect(first.name).toBe(h.name);
    expect(first.dates[0]).toBe(h.start < TODAY ? TODAY : h.start);
    expect(first.dates[first.dates.length - 1]).toBe(h.end);
    expect(first.added).toBe(false);
  });

  it("a chip whose every date is already a row reads as taken; a partial one does not", () => {
    const chip = holidayChips([], TODAY)[0];
    const all = addHolidayRows([], chip);
    expect(all.map((r) => r.date)).toEqual(chip.dates);
    expect(all.every((r) => r.closed && r.note === chip.name)).toBe(true);
    expect(holidayChips(all, TODAY)[0].added).toBe(true);
    expect(holidayChips(all.slice(1), TODAY)[0].added).toBe(false);
  });

  it("adding a chip never overwrites a row the owner already has", () => {
    const chip = holidayChips([], TODAY)[0];
    const mine = { date: chip.dates[0], closed: false, ranges: [{ from: "08:00", to: "11:00" }], note: "שלי" };
    const out = addHolidayRows([mine], chip);
    expect(out.find((r) => r.date === chip.dates[0])).toEqual(mine);
    expect(out).toHaveLength(chip.dates.length);
  });

  it("no chips at all once every holiday in the file has passed", () => {
    expect(holidayChips([], "2099-01-01")).toEqual([]);
  });
});

describe("SpecialHoursEditor — the state matrix", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    api.put.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("0 rows: empty state, chips offered, no revert, save disabled", () => {
    renderEditor(null);
    expect(screen.getByTestId("special-hours-empty")).toBeTruthy();
    expect(rows()).toHaveLength(0);
    expect(screen.getByTestId("special-hours-chips")).toBeTruthy();
    expect(screen.queryByTestId("special-hours-revert")).toBeNull();
    expect(screen.getByTestId("special-hours-save")).toBeDisabled();
  });

  it("1 row: no empty state, the row prefilled closed with its note", () => {
    renderEditor(ONE);
    expect(screen.queryByTestId("special-hours-empty")).toBeNull();
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId("special-hours-date-0").value).toBe("2026-09-21");
    expect(screen.getByTestId("special-hours-closed-0").checked).toBe(true);
    expect(screen.getByTestId("special-hours-note-0").value).toBe("יום כיפור");
    // Closed → no time inputs shown for that row.
    expect(screen.queryByTestId("special-hours-add-range-0")).toBeNull();
  });

  it("many rows: past dates are gone, order is by date, an open row shows its range", () => {
    renderEditor(MANY);
    expect(rows().map((r) => r.dataset.date)).toEqual(["2026-09-11", "2026-09-21"]);
    expect(screen.getByDisplayValue("09:00")).toBeTruthy();
    expect(screen.getByDisplayValue("13:00")).toBeTruthy();
  });

  it("tapping a chip ADDS closed rows (never applies anything by itself) and the chip turns taken", async () => {
    renderEditor(null);
    const firstKey = UPCOMING_KEYS[0];
    const chip = screen.getByTestId(`special-hours-chip-${firstKey}`);
    expect(chip).not.toBeDisabled();
    fireEvent.click(chip);
    const expected = holidayChips([], TODAY).find((c) => c.key === firstKey).dates;
    expect(rows().map((r) => r.dataset.date)).toEqual(expected);
    expect(chip).toBeDisabled();
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    // Nothing was saved — the owner decides.
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByTestId("special-hours-save")).not.toBeDisabled();
  });

  it("an open row offers «+ range», adds one adjacent to the last, and saves both", async () => {
    renderEditor(MANY);
    // Row 0 is 2026-09-11, open 09:00–13:00. Against the pre-fix editor the
    // control never renders on an open special row, so this line is the red.
    const add = screen.getByTestId("special-hours-add-range-0");
    fireEvent.click(add);
    // nextOrderRange: starts where the last one ended, runs two hours.
    expect(screen.getByTestId("special-hours-remove-range-0-0")).toBeTruthy();
    expect(screen.getByTestId("special-hours-remove-range-0-1")).toBeTruthy();
    expect(screen.getByDisplayValue("15:00")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("special-hours-save"));
    });
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      special_hours: {
        "2026-09-11": {
          ranges: [
            { open: "09:00", close: "13:00" },
            { open: "13:00", close: "15:00" },
          ],
          note: "ערב ראש השנה",
        },
        "2026-09-21": { ranges: [], note: "יום כיפור" },
      },
    });
  });

  it("saves the payload the backend expects: closed → ranges [], note trimmed", async () => {
    renderEditor(ONE);
    fireEvent.change(screen.getByTestId("special-hours-note-0"), { target: { value: " כיפור " } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("special-hours-save"));
    });
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      special_hours: { "2026-09-21": { ranges: [], note: "כיפור" } },
    });
    expect(screen.getByTestId("special-hours-save-success")).toBeTruthy();
  });

  it("removing the last row saves an explicit null (clear)", async () => {
    renderEditor(ONE);
    fireEvent.click(screen.getByTestId("special-hours-remove-0"));
    expect(rows()).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByTestId("special-hours-save"));
    });
    expect(api.put).toHaveBeenCalledWith("/producers/me", { special_hours: null });
  });

  it("refuses to save a duplicate date and names the problem — no request is made", async () => {
    renderEditor(ONE);
    fireEvent.click(screen.getByTestId("special-hours-add-date"));
    fireEvent.change(screen.getByTestId("special-hours-date-1"), { target: { value: "2026-09-21" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("special-hours-save"));
    });
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").some((el) => el.textContent.includes("invalid_date"))).toBe(true);
  });

  it("an open row with close before open is refused with the shared range copy", async () => {
    renderEditor(ONE);
    fireEvent.click(screen.getByTestId("special-hours-closed-0")); // open it
    const [from, to] = screen.getAllByDisplayValue(/^\d\d:\d\d$/);
    fireEvent.change(from, { target: { value: "14:00" } });
    fireEvent.change(to, { target: { value: "09:00" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("special-hours-save"));
    });
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").some((el) => el.textContent.includes("invalid_range"))).toBe(true);
  });

  it("surfaces the backend's Hebrew 422 detail and never shows success on a rejected save", async () => {
    api.put.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          data: {
            detail: [
              {
                loc: ["body", "special_hours"],
                msg: "Value error, התאריך 2026-08-05 כבר עבר — אפשר להגדיר שעות מיוחדות רק לתאריכים מה-30 הימים האחרונים ואילך",
                type: "value_error",
              },
            ],
          },
        },
      }),
    );
    renderEditor(ONE);
    fireEvent.change(screen.getByTestId("special-hours-note-0"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("special-hours-save"));
    });
    expect(api.put).toHaveBeenCalledTimes(1);
    const alerts = screen.getAllByRole("alert").map((el) => el.textContent);
    expect(alerts.some((t) => t.includes("התאריך 2026-08-05 כבר עבר"))).toBe(true);
    expect(alerts.some((t) => t.startsWith("Value error"))).toBe(false);
    expect(screen.queryByTestId("special-hours-save-success")).toBeNull();
  });

  it("revert restores the seeded rows", () => {
    renderEditor(ONE);
    fireEvent.click(screen.getByTestId("special-hours-remove-0"));
    expect(rows()).toHaveLength(0);
    fireEvent.click(screen.getByTestId("special-hours-revert"));
    expect(rows()).toHaveLength(1);
    expect(screen.queryByTestId("special-hours-revert")).toBeNull();
  });
});
