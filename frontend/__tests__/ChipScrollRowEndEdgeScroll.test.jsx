import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ChipScrollRow from "@/components/ChipScrollRow";

// MEH-3911: a newly picked chip that is cut off at the row's END edge (or sits
// in the scroll-pe-12 zone under the end fade) scrolls to inline "start" — its
// own snap position — because a "nearest" landing was re-snapped by
// snap-proximity to the chip before it, leaving the picked chip 1px out
// (e2e/flows/manual/map-01.spec.ts:618, CI on #5432). Any other chip keeps
// "nearest". jsdom has no layout, so the rects are stubbed per element.

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

const CHIPS = [
  { key: "all", label: "כל" },
  { key: "meat", label: "בשר ודגים" },
  { key: "bread", label: "מאפים וקינוחים" },
];
const ROW = { left: 12, right: 290 };
const PAD_END = 48;

function rect(left, right) {
  return { left, right, x: left, y: 0, top: 0, bottom: 44, width: right - left, height: 44, toJSON() {} };
}

function setup({ dir, chipRect }) {
  const props = { variant: "category", chips: CHIPS, onChipClick: () => {} };
  const { container, rerender } = render(<ChipScrollRow {...props} activeKey="all" />);
  const row = container.querySelector('[role="toolbar"]');
  row.style.direction = dir;
  row.style.scrollPaddingInlineEnd = `${PAD_END}px`;
  row.getBoundingClientRect = () => rect(ROW.left, ROW.right);
  const bread = [...row.querySelectorAll("button")].find((b) => b.textContent.includes("מאפים"));
  bread.getBoundingClientRect = () => rect(...chipRect);
  Element.prototype.scrollIntoView.mockClear();
  rerender(<ChipScrollRow {...props} activeKey="bread" />);
  const calls = Element.prototype.scrollIntoView.mock.calls;
  expect(calls.length, "control: picking a chip scrolls it").toBe(1);
  return calls[0][0].inline;
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("ChipScrollRow — a picked chip past the end edge scrolls to its own start (MEH-3911)", () => {
  it("RTL, chip cut off past the left (end) edge → start", () => {
    expect(setup({ dir: "rtl", chipRect: [-306, -157] })).toBe("start");
  });
  it("RTL, chip visible but under the end fade (inside scroll-pe-12) → start", () => {
    expect(setup({ dir: "rtl", chipRect: [30, 181] })).toBe("start");
  });
  it("RTL, chip fully clear of the end zone → nearest", () => {
    expect(setup({ dir: "rtl", chipRect: [100, 251] })).toBe("nearest");
  });
  it("RTL, chip cut off past the right (start) edge → nearest", () => {
    expect(setup({ dir: "rtl", chipRect: [250, 401] })).toBe("nearest");
  });
  it("LTR, chip cut off past the right (end) edge → start", () => {
    expect(setup({ dir: "ltr", chipRect: [250, 401] })).toBe("start");
  });
  it("LTR, chip cut off past the left (start) edge → nearest", () => {
    expect(setup({ dir: "ltr", chipRect: [-100, 51] })).toBe("nearest");
  });
});
