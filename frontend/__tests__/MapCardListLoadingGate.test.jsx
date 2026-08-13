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
import { render, screen } from "@testing-library/react";
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
