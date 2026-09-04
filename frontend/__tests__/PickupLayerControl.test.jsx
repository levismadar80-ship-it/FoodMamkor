/**
 * MEH-2046 — the pickup/market-stand layer control, relocated off the canvas,
 * and the reminder that fires when it is hiding businesses.
 *
 * DISCRIMINATION, stated for what each block actually exercises:
 *
 *   - the "no labelled pill" cases fail against pre-2046 MapPane, which
 *     rendered `map.pane.pickup_layer.label` as visible text inside the
 *     toggle. That is the whole point of the move: a labelled pill at
 *     top-start read as a filter.
 *   - the notice cases fail against pre-2046 MapPane, which had no notice at
 *     all — and the `secondaryHidden={false}` case is the inverse pin: without
 *     it, a notice rendered unconditionally would pass every other case here.
 *   - the `hiddenWhenSecondaryOff` block is a pure unit test of the predicate
 *     the notice is keyed on, including the rule-3 case that is easy to get
 *     backwards (a pickup-only business does NOT fall back to its own
 *     coordinates — it disappears).
 *
 * `useTranslations` is mocked to return the KEY, so the text assertions below
 * are about which key renders where, not about the Hebrew. The copy itself is
 * asserted against messages/*.json at the bottom, where it actually lives.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import MapPane from "@/app/[locale]/map/components/MapPane";
import { hiddenWhenSecondaryOff } from "@/lib/producerPoints";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("next/link", () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
// The real one pulls in Leaflet, which needs a DOM canvas; this pane test is
// about the overlay chrome, not the map.
vi.mock("@/components/MapComponent", () => ({
  default: () => <div data-testid="map-component-stub" />,
}));

const baseProps = {
  producers: [],
  visibleProducers: [{ id: "p1" }],
  allProducers: [{ id: "p1" }],
  onProducerClick: () => {},
  onProducerHover: () => {},
  onBoundsChange: () => {},
  onMapMove: () => {},
  onMapCanvasClick: () => {},
  registerApi: () => {},
  mapRef: { current: null },
  visitedIds: new Set(),
  showSecondaryLayer: true,
  onToggleSecondaryLayer: () => {},
  focusedProducerId: null,
  mapMoved: false,
  onSearchThisArea: () => {},
  gpsLoading: false,
  onGpsClick: () => {},
  legendOpen: false,
  legendRef: { current: null },
  onLegendToggle: () => {},
  isCategoryActive: () => false,
  toggleCategory: () => {},
  activeCategoryNames: null,
  setActiveCategoryNames: () => {},
  viewportCategoryCounts: {},
};

const renderPane = (extra) => render(<MapPane {...baseProps} {...extra} />);

describe("the layer toggle left the canvas (MEH-2046)", () => {
  it("renders no labelled pill — the control is icon-only", () => {
    // The pre-2046 failure: this key rendered as visible text in a pill sitting
    // where the filter chips sit, so the control read as a filter.
    renderPane();

    expect(screen.queryByText("map.pane.pickup_layer.label")).toBeNull();
  });

  it("carries the same aria-label on both breakpoint instances", () => {
    // Icon-only means the accessible name is the ONLY name. Losing it would be
    // invisible on screen and total for a screen reader.
    renderPane();

    const toggles = screen.getAllByLabelText("map.pane.pickup_layer.aria");
    expect(toggles).toHaveLength(2);
    for (const toggle of toggles) expect(toggle.textContent).toBe("");
  });

  it("reports layer state through aria-pressed, both instances", () => {
    const { unmount } = renderPane({ showSecondaryLayer: true });
    for (const el of screen.getAllByLabelText("map.pane.pickup_layer.aria")) {
      expect(el).toHaveAttribute("aria-pressed", "true");
    }
    unmount();

    renderPane({ showSecondaryLayer: false });
    for (const el of screen.getAllByLabelText("map.pane.pickup_layer.aria")) {
      expect(el).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("toggles from either instance", () => {
    const onToggleSecondaryLayer = vi.fn();
    renderPane({ onToggleSecondaryLayer });

    fireEvent.click(screen.getByTestId("pickup-layer-toggle-desktop"));
    fireEvent.click(screen.getByTestId("pickup-layer-toggle-mobile"));

    expect(onToggleSecondaryLayer).toHaveBeenCalledTimes(2);
  });

  it("keeps the 44px tap target on both", () => {
    // The ticket specifies 44px deliberately (below the 48px ideal) to match
    // the GPS circle and NearMePill. A smaller icon button would be under the
    // bar every other control on this surface meets.
    renderPane();

    for (const el of screen.getAllByLabelText("map.pane.pickup_layer.aria")) {
      expect(el.className).toMatch(/\bw-11\b/);
      expect(el.className).toMatch(/\bh-11\b/);
    }
  });
});

describe("the hidden-businesses reminder (MEH-2046)", () => {
  it("renders when businesses are being hidden", () => {
    renderPane({ showSecondaryLayer: false, secondaryHidden: true });

    expect(screen.getByTestId("pickup-layer-hidden-notice")).toBeInTheDocument();
    expect(screen.getByText("map.pane.pickup_layer.hidden_notice")).toBeInTheDocument();
  });

  it("does NOT render when nothing is hidden", () => {
    // Inverse pin. A notice rendered whenever the layer is off would pass the
    // case above while crying wolf on every map that has no pickup-only
    // business — which is most of them.
    renderPane({ showSecondaryLayer: false, secondaryHidden: false });

    expect(screen.queryByTestId("pickup-layer-hidden-notice")).toBeNull();
  });

  it("defaults to absent when the prop is omitted", () => {
    renderPane();

    expect(screen.queryByTestId("pickup-layer-hidden-notice")).toBeNull();
  });

  it("is announced, not just drawn", () => {
    renderPane({ showSecondaryLayer: false, secondaryHidden: true });

    expect(screen.getByTestId("pickup-layer-hidden-notice")).toHaveAttribute("role", "status");
  });
});

describe("hiddenWhenSecondaryOff — the predicate the notice is keyed on", () => {
  const row = (kind, lat = 32.1, lng = 34.8) => ({ kind, lat, lng });

  it("is true for a business whose only points are pickup rows", () => {
    expect(hiddenWhenSecondaryOff({ locations: [row("pickup")] })).toBe(true);
  });

  it("is true for market_stand too — the layer covers both kinds", () => {
    expect(hiddenWhenSecondaryOff({ locations: [row("market_stand")] })).toBe(true);
  });

  it("is FALSE when a branch survives alongside the pickup", () => {
    expect(
      hiddenWhenSecondaryOff({ locations: [row("branch"), row("pickup", 32.2, 34.9)] }),
    ).toBe(false);
  });

  it("is true even when the business has its own lat/lng — the columns never rescue it", () => {
    // The case that is easy to get backwards, and the reason the notice is
    // needed at all: a pickup-only business does NOT reappear at its own
    // coordinates when the layer hides its pickup. Until MEH-1938 chunk 5a
    // that was producerPoints' rule 3 (fallback judged before the toggle);
    // since 5a there is no fallback at all, so the columns are inert here.
    // Same outcome, one fewer rule — pinned so neither version can regress.
    expect(
      hiddenWhenSecondaryOff({ locations: [row("pickup")], lat: 32.0, lng: 34.7 }),
    ).toBe(true);
  });

  it("is false for a business with no mappable points at all", () => {
    // Nothing to hide — it was never on the map, so the layer is not why the
    // user cannot see it. Counting it would inflate the notice into noise.
    expect(hiddenWhenSecondaryOff({ locations: [] })).toBe(false);
    expect(hiddenWhenSecondaryOff({ locations: [{ kind: "pickup", lat: null, lng: null }] })).toBe(
      false,
    );
  });

  it("is false for a plain branch-only business", () => {
    expect(hiddenWhenSecondaryOff({ locations: [row("branch")] })).toBe(false);
    expect(hiddenWhenSecondaryOff({ lat: 32.0, lng: 34.7 })).toBe(false);
  });
});

describe("the reminder copy — asserted against messages/*.json", () => {
  it("exists in both locales under the key the ticket locks", async () => {
    const he = (await import("@/messages/he.json")).default.map.pane.pickup_layer;
    const en = (await import("@/messages/en.json")).default.map.pane.pickup_layer;

    expect(he.hidden_notice).toBe("שכבת נקודות האיסוף כבויה — חלק מבתי העסק לא מוצגים");
    expect(en.hidden_notice.trim()).not.toBe("");
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
  });
});
