import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActiveFilterChip } from "@/app/[locale]/home/ActiveFilterChip";

// MEH-1269: the "קרוב אליי" geo filter (and an explicit city choice) must be
// VISIBLE and dismissible via a chip above the producers grid — the previous
// behaviour silent-filtered by an invisible localStorage delivery_city. This
// guards: (a) the geo label, (b) the city label with {city} interpolation,
// (c) the ✕ firing onClear, (d) self-hiding when no location filter is active.

vi.mock("next-intl", () => ({
  useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
}));

describe("ActiveFilterChip (MEH-1269)", () => {
  it("geo active → renders the geo label and ✕ fires onClear", () => {
    const onClear = vi.fn();
    render(<ActiveFilterChip geoActive cityActive={null} onClear={onClear} />);
    expect(screen.getByText("home.producers.geo_chip")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("location-filter-chip"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("city active → renders the city label with the interpolated city name", () => {
    render(
      <ActiveFilterChip geoActive={false} cityActive="חיפה" onClear={() => {}} />,
    );
    // useTranslations mock echoes the key + interpolation values as JSON.
    expect(
      screen.getByText('home.producers.city_chip:{"city":"חיפה"}'),
    ).toBeInTheDocument();
  });

  it("geo takes precedence when (defensively) both are set", () => {
    render(<ActiveFilterChip geoActive cityActive="חיפה" onClear={() => {}} />);
    expect(screen.getByText("home.producers.geo_chip")).toBeInTheDocument();
    expect(
      screen.queryByText('home.producers.city_chip:{"city":"חיפה"}'),
    ).not.toBeInTheDocument();
  });

  it("no location filter active → renders nothing", () => {
    const { container } = render(
      <ActiveFilterChip geoActive={false} cityActive={null} onClear={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("location-filter-chip")).not.toBeInTheDocument();
  });
});
