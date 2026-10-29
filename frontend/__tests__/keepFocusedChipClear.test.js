import { describe, it, expect, vi, afterEach } from "vitest";
import { keepFocusedChipClear } from "@/lib/keepFocusedChipClear";

// MEH-2569: the helper moved out of HomeProducersGrid and is now shared with
// /producers. jsdom has no layout, so the boxes and computed styles are stubbed.

const box = (left, right) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40 });

function rail({ dir, leadPosition = "sticky", lead, chip }) {
  const row = document.createElement("div");
  const leadEl = document.createElement("div");
  const chipEl = document.createElement("button");
  row.append(leadEl, chipEl);
  leadEl.getBoundingClientRect = () => lead;
  chipEl.getBoundingClientRect = () => chip;
  row.scrollBy = vi.fn();
  vi.spyOn(window, "getComputedStyle").mockImplementation((el) =>
    el === leadEl ? { position: leadPosition } : { direction: dir },
  );
  return { row, leadEl, chipEl };
}

const focus = (row, target) => keepFocusedChipClear({ currentTarget: row, target });

afterEach(() => vi.restoreAllMocks());

describe("keepFocusedChipClear", () => {
  it("he (rtl): a chip under the lead (at the right) scrolls +x by overlap + 8", () => {
    // lead spans 280–375; chip's right edge at 300 → 20px under it.
    const { row, chipEl } = rail({ dir: "rtl", lead: box(280, 375), chip: box(200, 300) });
    focus(row, chipEl);
    expect(row.scrollBy).toHaveBeenCalledWith({ left: 28 });
  });

  it("en (ltr): a chip under the lead (at the left) scrolls −x by overlap + 8", () => {
    // lead spans 0–95; chip's left edge at 80 → 15px under it.
    const { row, chipEl } = rail({ dir: "ltr", lead: box(0, 95), chip: box(80, 180) });
    focus(row, chipEl);
    expect(row.scrollBy).toHaveBeenCalledWith({ left: -23 });
  });

  it("a chip clear of the lead does not scroll", () => {
    const { row, chipEl } = rail({ dir: "rtl", lead: box(280, 375), chip: box(100, 200) });
    focus(row, chipEl);
    expect(row.scrollBy).not.toHaveBeenCalled();
  });

  it("focus inside the lead itself does not scroll", () => {
    const { row, leadEl } = rail({ dir: "rtl", lead: box(280, 375), chip: box(200, 300) });
    focus(row, leadEl);
    expect(row.scrollBy).not.toHaveBeenCalled();
  });

  it("a non-sticky lead (lg+) does not scroll", () => {
    const { row, chipEl } = rail({ dir: "rtl", leadPosition: "relative", lead: box(280, 375), chip: box(200, 300) });
    focus(row, chipEl);
    expect(row.scrollBy).not.toHaveBeenCalled();
  });

  it("focus outside the row's DOM (a portalled panel) does not scroll", () => {
    const { row } = rail({ dir: "rtl", lead: box(280, 375), chip: box(200, 300) });
    focus(row, document.createElement("button"));
    expect(row.scrollBy).not.toHaveBeenCalled();
  });
});
