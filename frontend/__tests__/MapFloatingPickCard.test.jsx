/**
 * Module:   MapFloatingPickCard.test
 * Purpose:  MEH-3119 — the phone map's picked-business card floats over the map
 *           above the sheet. Locks (1) the X sits in its own row, outside the
 *           card it used to cover; (2) the card reports its height so the
 *           controls riding the sheet edge clear it; (3) the sheet publishes
 *           the two heights (own / ridden) the card and the controls read.
 * Does NOT: test when the card is mounted (MapPickPan.test.jsx) or what a
 *           marker tap does to the sheet (useMapSync.test.jsx).
 *           MEH-0000 adds the close button's accessible name and Escape. An
 *           audit of that button found everything else already right — real
 *           <button>, 44x44, Hebrew aria-label, focus ring, no physical
 *           directional class — but none of the name or keyboard behaviour was
 *           asserted anywhere, so a regression in it would have been silent.
 * Related:  app/[locale]/map/components/MobileSheetSelectedCard.jsx,
 *           components/MapBottomSheet.jsx
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("@/components/MapProducerCard", () => ({
  default: ({ producer, active }) => (
    <a data-testid="map-producer-card" data-active={String(active)}>{producer.name}</a>
  ),
}));

import MobileSheetSelectedCard from "@/app/[locale]/map/components/MobileSheetSelectedCard";
import MapBottomSheet, { PEEK, HALF } from "@/components/MapBottomSheet";
import NearMePill from "@/app/[locale]/map/components/NearMePill";

afterEach(cleanup);

const producer = { id: "p1", name: "biz" };

describe("MobileSheetSelectedCard — floating card (MEH-3119)", () => {
  it("MEH-3417: the X is on the card's top-end corner, with no row of its own above the card", () => {
    const { getByTestId } = render(<MobileSheetSelectedCard selectedProducer={producer} onClose={() => {}} />);
    const close = getByTestId("map-selected-card-close");
    const card = getByTestId("map-producer-card");
    // Same positioned box as the card, after it in the DOM (painted over it).
    expect(close.parentElement).toBe(card.parentElement);
    expect(card.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(close.parentElement.className).toMatch(/\brelative\b/);
    // The card forces RTL in every locale; the X's `end-0` must resolve the
    // same way, or on /en it lands on the photo.
    expect(close.parentElement.getAttribute("dir")).toBe("rtl");
    // Top-END corner (logical, rtl.md), inside the card, 44px hit area.
    expect(close.className).toMatch(/\babsolute\b/);
    expect(close.className).toMatch(/\btop-0\b/);
    expect(close.className).toMatch(/\bend-0\b/);
    expect(close.className).toMatch(/\bw-11\b/);
    expect(close.className).toMatch(/\bh-11\b/);
    // Without a location label nothing renders above the card: the row is gone.
    expect(getByTestId("map-selected-card").firstElementChild).toBe(close.parentElement);
  });

  it("the card is the active one, and the X deselects", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<MobileSheetSelectedCard selectedProducer={producer} onClose={onClose} />);
    expect(getByTestId("map-producer-card").dataset.active).toBe("true");
    fireEvent.click(getByTestId("map-selected-card-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sits on the sheet's OWN top edge, not on the edge it raises itself", () => {
    const { getByTestId } = render(<MobileSheetSelectedCard selectedProducer={producer} onClose={() => {}} />);
    const bottom = getByTestId("map-selected-card").style.bottom;
    expect(bottom).toContain("--map-sheet-own-h");
    expect(bottom).not.toMatch(/--map-sheet-h\b/);
  });

  it("shows the tapped point's label only when there is one", () => {
    const a = render(<MobileSheetSelectedCard selectedProducer={producer} onClose={() => {}} />);
    expect(a.queryByTestId("map-selected-card-location")).toBeNull();
    a.unmount();
    const b = render(
      <MobileSheetSelectedCard selectedProducer={producer} selectedLocation={{ label: "north" }} onClose={() => {}} />,
    );
    expect(b.getByTestId("map-selected-card-location").textContent).toBe("north");
  });

  it("reports its height plus the gap on both sides, and 0 when it leaves", () => {
    const onHeight = vi.fn();
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(120);
    const { unmount } = render(
      <MobileSheetSelectedCard selectedProducer={producer} onClose={() => {}} onHeight={onHeight} />,
    );
    expect(onHeight).toHaveBeenLastCalledWith(120 + 16);
    unmount();
    expect(onHeight).toHaveBeenLastCalledWith(0);
    height.mockRestore();
  });

  it("renders nothing without a selection", () => {
    const { container } = render(<MobileSheetSelectedCard selectedProducer={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("MapBottomSheet — the edge the controls ride (MEH-3119)", () => {
  const root = document.documentElement;
  const sheet = (extra) => (
    <MapBottomSheet snap={PEEK} onSnapChange={() => {}} count={3} rideExtraPx={extra}>
      <div />
    </MapBottomSheet>
  );

  it("with no card the two heights are the same value", () => {
    render(sheet(0));
    const own = root.style.getPropertyValue("--map-sheet-own-h");
    expect(own).not.toBe("");
    expect(root.style.getPropertyValue("--map-sheet-h")).toBe(own);
  });

  it("with a card the ridden edge is the sheet plus the card, and the own height is unchanged", () => {
    const { rerender, unmount } = render(sheet(0));
    const own = root.style.getPropertyValue("--map-sheet-own-h");
    rerender(sheet(136));
    expect(root.style.getPropertyValue("--map-sheet-own-h")).toBe(own);
    expect(root.style.getPropertyValue("--map-sheet-h")).toBe(`calc(${own} + 136px)`);
    unmount();
    expect(root.style.getPropertyValue("--map-sheet-own-h")).toBe("");
    expect(root.style.getPropertyValue("--map-sheet-h")).toBe("");
  });
});

describe("MapBottomSheet — the handle opens and closes the list (MEH-3119)", () => {
  // A marker tap no longer opens the sheet, so this is the non-touch way in.
  it.each([
    [PEEK, HALF],
    [HALF, PEEK],
  ])("a click on the handle at %i asks for %i", (from, to) => {
    const onSnapChange = vi.fn();
    const { getByTestId } = render(
      <MapBottomSheet snap={from} onSnapChange={onSnapChange} count={3}><div /></MapBottomSheet>,
    );
    fireEvent.click(getByTestId("map-sheet-handle"));
    expect(onSnapChange).toHaveBeenCalledTimes(1);
    expect(onSnapChange).toHaveBeenCalledWith(to);
  });
});

describe("short screens (MEH-3119)", () => {
  it("the near-me button steps aside under 600px of height while the card is up", () => {
    const { getByTestId } = render(<NearMePill onClick={() => {}} />);
    // Tied to the shell's `group/mapshell` + `data-pick="on"` (MapPickPan.test).
    expect(getByTestId("map-near-me-pill").className).toContain(
      "[@media(max-height:600px)]:group-data-[pick=on]/mapshell:hidden",
    );
  });
});

describe("the close button's name and keyboard behaviour (MEH-0000)", () => {
  it("is a real button with an accessible name, and the icon is hidden from it", () => {
    const { getByTestId } = render(<MobileSheetSelectedCard selectedProducer={producer} onClose={() => {}} />);
    const close = getByTestId("map-selected-card-close");
    expect(close.tagName).toBe("BUTTON");
    expect(close.getAttribute("type")).toBe("button");
    // The name comes from i18n; this suite's mock returns the KEY, so assert
    // the key is wired rather than the Hebrew — the Hebrew value itself is
    // covered by the i18n parity suite.
    expect(close.getAttribute("aria-label")).toBe("common.aria.close");
    // An icon that is not hidden gets read out after the label.
    expect(close.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(close.className).toMatch(/focus-ring/);
  });

  it("Escape closes the card", () => {
    const onClose = vi.fn();
    render(<MobileSheetSelectedCard selectedProducer={producer} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("another key does not", () => {
    const onClose = vi.fn();
    render(<MobileSheetSelectedCard selectedProducer={producer} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape inside a text field is the field's, not the card's", () => {
    const onClose = vi.fn();
    render(<MobileSheetSelectedCard selectedProducer={producer} onClose={onClose} />);
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    input.remove();
  });

  it("Escape inside a dialog is the dialog's", () => {
    const onClose = vi.fn();
    render(<MobileSheetSelectedCard selectedProducer={producer} onClose={onClose} />);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("the listener is removed on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(<MobileSheetSelectedCard selectedProducer={producer} onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
