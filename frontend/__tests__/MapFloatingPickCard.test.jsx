/**
 * Module:   MapFloatingPickCard.test
 * Purpose:  MEH-3119 — the phone map's picked-business card floats over the map
 *           above the sheet. Locks (1) the X sits in its own row, outside the
 *           card it used to cover; (2) the card reports its height so the
 *           controls riding the sheet edge clear it; (3) the sheet publishes
 *           the two heights (own / ridden) the card and the controls read.
 * Does NOT: test when the card is mounted (MapPickPan.test.jsx) or what a
 *           marker tap does to the sheet (useMapSync.test.jsx).
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
  it("the close button is outside the card, in the row before it", () => {
    const { getByTestId } = render(<MobileSheetSelectedCard selectedProducer={producer} onClose={() => {}} />);
    const close = getByTestId("map-selected-card-close");
    const card = getByTestId("map-producer-card");
    expect(card.contains(close)).toBe(false);
    // The X's row precedes the card in the DOM: it is above it, not over it.
    expect(close.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 44px hit area; not absolutely positioned over anything.
    expect(close.className).toMatch(/\bw-11\b/);
    expect(close.className).toMatch(/\bh-11\b/);
    expect(close.className).not.toMatch(/\babsolute\b/);
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
