/**
 * MEH-2425 — the map pane's empty overlay under an active filter.
 *
 * The overlay fires when the loaded set is non-empty but nothing survives the
 * client-side filters, i.e. mostly because of a filter. It used to say
 * "אין עסקים באזור זה עדיין" + "הוסיפו עסק", which reads as an empty region.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import MapPane from "@/app/[locale]/map/components/MapPane";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));
vi.mock("next/dynamic", () => ({
  default: () => function MapComponentStub() {
    return <div data-testid="map-canvas-stub" />;
  },
}));

const base = {
  producers: [],
  onProducerClick: () => {},
  onProducerHover: () => {},
  onBoundsChange: () => {},
  onMapMove: () => {},
  onMapCanvasClick: () => {},
  registerApi: () => {},
  mapRef: { current: null },
  showSecondaryLayer: true,
  onToggleSecondaryLayer: () => {},
  focusedProducerId: null,
  onSearchThisArea: () => {},
  visibleProducers: [],
  allProducers: [{ id: 1 }],
  mapMoved: false,
  gpsLoading: false,
  onGpsClick: () => {},
  legendOpen: false,
  legendRef: { current: null },
  onLegendToggle: () => {},
};

describe("MapPane empty overlay (MEH-2425)", () => {
  it("filter on → names the filters and clears them; no 'add a business' CTA", () => {
    const onReset = vi.fn();
    render(<MapPane {...base} filtered onResetFilters={onReset} />);
    expect(screen.getByTestId("map-pane-filtered-empty")).toHaveTextContent("map.bottom_sheet.count_filtered_zero");
    expect(screen.queryByText("map.pane.empty.heading")).toBeNull();
    expect(screen.queryByText("map.pane.empty.cta")).toBeNull();
    fireEvent.click(screen.getByText("map.bottom_sheet.reset_filters"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("no filter → the empty-region overlay with its CTA, unchanged", () => {
    render(<MapPane {...base} />);
    expect(screen.getByText("map.pane.empty.heading")).toBeInTheDocument();
    expect(screen.getByText("map.pane.empty.cta")).toBeInTheDocument();
    expect(screen.queryByTestId("map-pane-filtered-empty")).toBeNull();
  });
});
