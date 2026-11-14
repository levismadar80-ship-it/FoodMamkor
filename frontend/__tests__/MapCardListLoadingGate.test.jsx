/**
 * MEH-1671 — the desktop /map sidebar must not flash the empty state while
 * the first /producers fetch is in flight.
 *
 * The mobile sheet was guarded one level up since MEH-1054; the desktop
 * mount rendered MapCardList bare, so `visibleProducers.length === 0` showed
 * "לא נמצאו" during load. The gate lives in MapCardList so no host can
 * reproduce the flash.
 *
 * Discrimination: run against the pre-MEH-1671 component (no `loading`
 * prop), the FIRST test fails — the empty heading renders during load —
 * while tests 2–4 pass in both worlds and are controls, not evidence.
 * (Demonstrated in the PR body by construction.)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MapCardList from "@/app/[locale]/map/components/MapCardList";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("@/components/MapProducerCard", () => ({
  default: ({ producer }) => <div data-testid="producer-card">{producer.name}</div>,
}));

const base = {
  hoveredProducerId: null,
  activeProducerId: null,
  cardRefs: { current: new Map() },
  onCardMouseEnter: () => {},
  onCardMouseLeave: () => {},
  onCardClick: () => {},
  onResetAll: () => {},
};

describe("MapCardList — MEH-1671 loading gate", () => {
  it("loading + empty: skeleton, and the empty state does NOT render (the discriminator)", () => {
    render(<MapCardList {...base} visibleProducers={[]} loading />);
    expect(screen.getByTestId("sidebar-list-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("map.card_list.empty.heading")).not.toBeInTheDocument();
  });

  it("resolved + empty: the true empty state still renders (DoD pin)", () => {
    render(<MapCardList {...base} visibleProducers={[]} loading={false} />);
    expect(screen.getByText("map.card_list.empty.heading")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-list-skeleton")).not.toBeInTheDocument();
  });

  it("loading + stale rows: rows stay, no skeleton (refetch must not flash)", () => {
    render(
      <MapCardList {...base} visibleProducers={[{ id: 1, name: "חוות בדיקה" }]} loading />,
    );
    expect(screen.getByTestId("producer-card")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-list-skeleton")).not.toBeInTheDocument();
  });

  it("prop omitted: behaves as loaded — additive contract for other hosts", () => {
    render(<MapCardList {...base} visibleProducers={[]} />);
    expect(screen.getByText("map.card_list.empty.heading")).toBeInTheDocument();
  });
});

// MEH-2425: "נקו את הסינון" under an UNFILTERED empty area offered nothing to
// clear (seen on the 1440 sidebar with no filter on).
describe("MapCardList — MEH-2425 reset only when something is filtered", () => {
  it("empty + filtered → reset button", () => {
    render(<MapCardList {...base} visibleProducers={[]} filtered />);
    expect(screen.getByTestId("map-card-list-reset")).toBeInTheDocument();
  });

  it("empty + not filtered → empty state without the reset button", () => {
    render(<MapCardList {...base} visibleProducers={[]} filtered={false} />);
    expect(screen.getByText("map.card_list.empty.heading")).toBeInTheDocument();
    expect(screen.queryByTestId("map-card-list-reset")).toBeNull();
  });
});

// MEH-3198: after a failed load, an empty list is "could not load", not "no
// results". DISCRIMINATION: the pre-MEH-3198 component has no loadError prop,
// so the first two cases fail (the empty heading renders, no retry button).
describe("MapCardList — MEH-3198 load error", () => {
  it("error + empty: the error with «נסו שוב», not the empty state", () => {
    const onRetry = vi.fn();
    render(<MapCardList {...base} visibleProducers={[]} loadError onRetry={onRetry} />);
    expect(screen.getByTestId("map-card-list-error")).toBeInTheDocument();
    expect(screen.getByText("map.errors.load_failed")).toBeInTheDocument();
    expect(screen.queryByText("map.card_list.empty.heading")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("map-card-list-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("error while loading again: the skeleton, not the error", () => {
    render(<MapCardList {...base} visibleProducers={[]} loadError loading onRetry={() => {}} />);
    expect(screen.getByTestId("sidebar-list-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("map-card-list-error")).not.toBeInTheDocument();
  });

  it("no error + empty (a filter with no results): the normal empty state", () => {
    render(<MapCardList {...base} visibleProducers={[]} loadError={false} filtered />);
    expect(screen.getByText("map.card_list.empty.heading")).toBeInTheDocument();
    expect(screen.queryByTestId("map-card-list-error")).not.toBeInTheDocument();
  });

  it("error flag with one row and with many: the rows stay", () => {
    const { rerender } = render(
      <MapCardList {...base} visibleProducers={[{ id: 1, name: "א" }]} loadError onRetry={() => {}} />,
    );
    expect(screen.getAllByTestId("producer-card")).toHaveLength(1);
    rerender(
      <MapCardList {...base} visibleProducers={[{ id: 1, name: "א" }, { id: 2, name: "ב" }]} loadError onRetry={() => {}} />,
    );
    expect(screen.getAllByTestId("producer-card")).toHaveLength(2);
    expect(screen.queryByTestId("map-card-list-error")).not.toBeInTheDocument();
  });
});
