/**
 * MEH-1054 (MAP-16) — MapBottomSheet loading skeleton.
 *
 * While the feed's first fetch is in flight the sheet must show static
 * skeleton geometry (list rows + count-slot bar) instead of flashing
 * "0 businesses" + an empty list; on data it must swap to children + count
 * with no skeleton remnants. The prop is additive — omitted `loading`
 * renders exactly the pre-MEH-1054 sheet (locks the MapClient contract).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MapBottomSheet from "@/components/MapBottomSheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, values) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

const noop = () => {};

describe("MapBottomSheet — MEH-1054 loading skeleton", () => {
  it("loading: renders list + count skeletons, hides children and count", () => {
    render(
      <MapBottomSheet snap={45} onSnapChange={noop} count={0} loading>
        <div data-testid="real-card">card</div>
      </MapBottomSheet>
    );
    expect(screen.getByTestId("sheet-list-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("sheet-count-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("real-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/^count:/)).not.toBeInTheDocument();
  });

  it("loaded: renders children + count, no skeleton remnants", () => {
    render(
      <MapBottomSheet snap={45} onSnapChange={noop} count={7} loading={false}>
        <div data-testid="real-card">card</div>
      </MapBottomSheet>
    );
    expect(screen.getByTestId("real-card")).toBeInTheDocument();
    expect(screen.getByText('count:{"count":7}')).toBeInTheDocument();
    expect(screen.queryByTestId("sheet-list-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sheet-count-skeleton")).not.toBeInTheDocument();
  });

  it("prop omitted: behaves as loaded (additive contract for MapClient)", () => {
    render(
      <MapBottomSheet snap={45} onSnapChange={noop} count={3}>
        <div data-testid="real-card">card</div>
      </MapBottomSheet>
    );
    expect(screen.getByTestId("real-card")).toBeInTheDocument();
    expect(screen.queryByTestId("sheet-list-skeleton")).not.toBeInTheDocument();
  });

  it("loading skeleton announces via role=status; bars + count stay aria-hidden", () => {
    render(
      <MapBottomSheet snap={45} onSnapChange={noop} count={0} loading>
        <div>card</div>
      </MapBottomSheet>
    );
    const list = screen.getByTestId("sheet-list-skeleton");
    // Mirrors SkeletonProducerGrid: role=status + the existing
    // common.skeleton.loading_businesses label (mocked t returns the key).
    expect(list).toHaveAttribute("role", "status");
    expect(list).toHaveAttribute("aria-label", "loading_businesses");
    expect(list.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.getByTestId("sheet-count-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });
});
