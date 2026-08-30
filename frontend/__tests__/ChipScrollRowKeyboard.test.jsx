import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ChipScrollRow from "@/components/ChipScrollRow";

// MEH-2199 chunk 1 — ChipScrollRow declares role="toolbar" (ChipScrollRow.jsx:252,
// MEH-1465) and until this ticket carried none of the keyboard that contract
// promises: every chip was its own tab stop and the arrow keys did nothing.
//
// FOUR mount sites across THREE routes — /events (EventsClient), /map
// (FilterChipsBar) and /producers (ProducersClient, twice). One component, so
// one fix; these assertions drive the component directly.
//
// RTL arrow mapping is the house one — ArrowLeft = next, ArrowRight = prev
// (Lightbox.jsx:58, mirrored in hooks/useTabsKeyboard.js). The assertions are
// direction-EXPLICIT on purpose: a suite that only checked "some other chip got
// focus" passes against the LTR mapping, which is the regression most likely to
// be introduced here.
//
// THE DIFFERENCE FROM THE TABS SIBLING, AND WHY IT IS ASSERTED
// ------------------------------------------------------------
// `useTabsKeyboard` activates on move ("tabs with automatic activation"). A
// toolbar of TOGGLE buttons must not: arrowing across a filter row would fire a
// filter change per keystroke and leave the user's selection unrecognisable.
// `test_arrowing_does_not_toggle` is the assertion that pins that apart, and it
// is the one that would go red if someone reached for the tabs hook here.

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

const CHIPS = [
  { key: "all", label: "כל" },
  { key: "bread", label: "לחמים" },
  { key: "meat", label: "בשר" },
];

const chipButtons = () =>
  Array.from(document.querySelectorAll('[role="toolbar"] button'));
const tabIndexes = () => chipButtons().map((b) => b.getAttribute("tabindex"));
const labels = () => chipButtons().map((b) => b.textContent.trim());

function renderRow(props = {}) {
  return render(
    <ChipScrollRow
      variant="toggle"
      chips={CHIPS}
      activeKeys={{}}
      onChipClick={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom implements neither, and ChipScrollRow calls both on mount
  // (ChipScrollRow.jsx:158 scrollTo, and scrollIntoView for the active chip).
  // Same two stubs the sibling suite installs — __tests__/ChipScrollRow.test.jsx:75.
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("ChipScrollRow — the keyboard its role=toolbar promises (MEH-2199 chunk 1)", () => {
  it("CONTROL — the toolbar and all three chips actually render", () => {
    renderRow();
    expect(document.querySelector('[role="toolbar"]')).toBeTruthy();
    expect(chipButtons()).toHaveLength(3);
    expect(labels()).toEqual(["כל", "לחמים", "בשר"]);
  });

  it("is ONE tab stop, not three — roving tabindex", () => {
    renderRow();
    // The whole point of a toolbar: Tab reaches the row once, arrows move
    // inside it. Three tab stops is the state this ticket exists to end, and
    // asserting the exact array (not just "some are -1") is what catches a
    // half-applied fix.
    expect(tabIndexes()).toEqual(["0", "-1", "-1"]);
    expect(tabIndexes().filter((v) => v === "0")).toHaveLength(1);
  });

  it("the tab stop is the ACTIVE chip when one is active, not blindly the first", () => {
    renderRow({ activeKeys: { meat: true } });
    expect(tabIndexes()).toEqual(["-1", "-1", "0"]);
  });

  it("ArrowLeft moves focus to the NEXT chip (RTL contract)", () => {
    renderRow();
    const [first] = chipButtons();
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement.textContent.trim()).toBe("לחמים");
    expect(tabIndexes()).toEqual(["-1", "0", "-1"]);
  });

  it("ArrowRight moves focus to the PREVIOUS chip, wrapping (RTL contract)", () => {
    renderRow();
    const [first] = chipButtons();
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    // From the first chip, "previous" wraps to the last.
    expect(document.activeElement.textContent.trim()).toBe("בשר");
    expect(tabIndexes()).toEqual(["-1", "-1", "0"]);
  });

  it("End goes to the last chip and Home to the first", () => {
    renderRow();
    const [first] = chipButtons();
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(document.activeElement.textContent.trim()).toBe("בשר");

    fireEvent.keyDown(document.activeElement, { key: "Home" });
    expect(document.activeElement.textContent.trim()).toBe("כל");
    expect(tabIndexes()).toEqual(["0", "-1", "-1"]);
  });

  it("arrowing does NOT toggle a chip — a toolbar is not a tablist", () => {
    // The discriminating case. `useTabsKeyboard` activates on move; reusing that
    // here would fire a filter change on every keystroke. If someone swaps this
    // implementation for the tabs hook, this is the assertion that goes red.
    const onChipClick = vi.fn();
    renderRow({ onChipClick });
    const [first] = chipButtons();
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowLeft" });
    fireEvent.keyDown(document.activeElement, { key: "ArrowLeft" });
    fireEvent.keyDown(document.activeElement, { key: "End" });
    fireEvent.keyDown(document.activeElement, { key: "Home" });

    expect(onChipClick).not.toHaveBeenCalled();
  });

  it("still activates on click, so the keyboard layer did not replace the mouse", () => {
    const onChipClick = vi.fn();
    renderRow({ onChipClick });
    fireEvent.click(screen.getByText("לחמים"));
    expect(onChipClick).toHaveBeenCalledWith("bread");
  });

  it("scrolls the newly focused chip into view, the same way a click does", () => {
    // CI reviewer, #3186. `.focus()` on an off-screen chip triggers the
    // browser's INSTANT auto-scroll, while the click/activation path uses
    // scrollIntoView({ behavior: "smooth" }) — the same movement would jump on
    // the keyboard and glide on the pointer. jsdom lays everything out at zero
    // size so overflow cannot be reproduced here; what CAN be asserted is that
    // the call is made with the smooth behaviour, on every key that moves.
    renderRow();
    const [first] = chipButtons();
    first.focus();
    Element.prototype.scrollIntoView.mockClear();

    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      Element.prototype.scrollIntoView.mockClear();
      fireEvent.keyDown(document.activeElement, { key });
      expect(
        Element.prototype.scrollIntoView,
        `${key} moved focus without scrolling the chip into view`,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: "smooth" }),
      );
    }
  });

  it("does NOT scroll for a key that moves nothing", () => {
    // The mirror of the case above — otherwise the assertion could be satisfied
    // by a component that scrolls on every keystroke, which is not the claim.
    renderRow();
    const [first] = chipButtons();
    first.focus();
    Element.prototype.scrollIntoView.mockClear();
    fireEvent.keyDown(first, { key: "a" });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("leaves every other key alone", () => {
    // A handler that preventDefault'd everything would break type-ahead and
    // browser shortcuts and still pass an arrows-only suite.
    renderRow();
    const [first] = chipButtons();
    first.focus();
    const evt = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    first.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
  });
});
