/**
 * Sapir 13/11: the pickup-layer toggle (MEH-1412 / MEH-2046) is removed from
 * /map, and with it the «שכבת נקודות האיסוף כבויה» reminder. On a phone that
 * reminder could not be closed and sat over the zoom buttons; a new user also
 * read the icon (the "layers" glyph) as a map-style switch, and it shared the
 * name «איסוף עצמי» with the filter chip while doing something else.
 *
 * DISCRIMINATION: every case below fails against the pre-13/11 MapPane, which
 * rendered both toggle instances, mounted the notice when `secondaryHidden`
 * was passed, and kept the "?" key one slot higher (bottom-[204px] on desktop).
 *
 * `useTranslations` is mocked to return the KEY.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import MapPane from "@/app/[locale]/map/components/MapPane";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("next/link", () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
// MapComponent pulls in Leaflet; record the props it receives instead.
const mapProps = vi.hoisted(() => ({ last: null }));
vi.mock("@/components/MapComponent", () => ({
  default: (props) => {
    mapProps.last = props;
    return <div data-testid="map-component-stub" />;
  },
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
  focusedProducerId: null,
  mapMoved: true,
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

// Old callers passed these; passing them now must change nothing.
const LEGACY = { showSecondaryLayer: false, secondaryHidden: true, onToggleSecondaryLayer: () => {} };

describe("the pickup-layer toggle is gone (Sapir 13/11)", () => {
  it("renders no toggle in either shell", () => {
    render(<MapPane {...baseProps} {...LEGACY} />);
    expect(screen.queryByTestId("pickup-layer-toggle-desktop")).toBeNull();
    expect(screen.queryByTestId("pickup-layer-toggle-mobile")).toBeNull();
    expect(screen.queryByLabelText("map.pane.pickup_layer.aria")).toBeNull();
  });

  it("renders no hidden-businesses reminder", () => {
    render(<MapPane {...baseProps} {...LEGACY} />);
    expect(screen.queryByTestId("pickup-layer-hidden-notice")).toBeNull();
    expect(screen.queryByText("map.pane.pickup_layer.hidden_notice")).toBeNull();
  });

  it("never asks the map to hide pickup points", () => {
    render(<MapPane {...baseProps} {...LEGACY} />);
    expect(mapProps.last).not.toBeNull();
    expect(mapProps.last.showSecondaryLayer).toBeUndefined(); // MapComponent default = true
  });

  it("moves the ? key down into the slot the toggle left", () => {
    render(<MapPane {...baseProps} />);
    const desktop = screen.getByTestId("map-key-toggle-desktop");
    expect(desktop.className).toMatch(/\bbottom-\[152px\]/);
    const mobile = screen.getByTestId("map-key-toggle-mobile");
    expect(mobile.style.bottom).toContain("+ 68px");
  });
});

describe("the copy keys left with the control", () => {
  it("no locale keeps map.pane.pickup_layer", async () => {
    const he = (await import("@/messages/he.json")).default.map.pane;
    const en = (await import("@/messages/en.json")).default.map.pane;
    expect(he.pickup_layer).toBeUndefined();
    expect(en.pickup_layer).toBeUndefined();
  });
});
