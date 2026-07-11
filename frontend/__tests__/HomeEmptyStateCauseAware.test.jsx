import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";

// MEH-1085 (MEH-1077 DISC-07): the homepage grid empty state must be
// cause-aware — a category-filtered zero-result shows category copy + a
// clear-category action instead of blaming geography and exiting to /map.
// The geographic (no-category) branch stays byte-identical.

vi.mock("next-intl", () => ({ useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, ...p }) => (
      <div {...p}>{children}</div>
    ),
  },
}));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div /> }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => <div /> }));
vi.mock("@/components/OnboardingTip", () => ({ default: () => null }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));

const baseProps = {
  producers: [],
  producersLoading: false,
  visibleProducers: [],
  hasMore: false,
  visibleCount: 8,
  chips: {},
  categories: [{ id: 3, name: "חלב וגבינות" }],
  showNewUserHint: false,
  fridayMode: false,
  step0Visible: false,
  onboardStep: -1,
  onboardAdvance: () => {},
  onboardDismiss: () => {},
  onAdvanceFromStep0: () => {},
  onToggleChip: () => {},
  onLoadMore: () => {},
};

describe("HomeProducersGrid empty state (MEH-1085 DISC-07)", () => {
  it("category filter active → category-aware copy + clear-category button", () => {
    const onClearCategory = vi.fn();
    render(
      <HomeProducersGrid
        {...baseProps}
        filters={{ category: "3", delivery_city: "", has_delivery: false }}
        onClearCategory={onClearCategory}
      />,
    );
    expect(screen.getByText("home.producers.empty_heading_category")).toBeInTheDocument();
    expect(screen.getByText("home.producers.empty_subtext_category")).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "home.producers.clear_category_cta" });
    fireEvent.click(cta);
    expect(onClearCategory).toHaveBeenCalledTimes(1);
    // the geographic /map escape must not be the primary CTA in this branch
    expect(screen.queryByText("home.producers.explore_map")).not.toBeInTheDocument();
  });

  it("no category (geographic) → existing copy + /map link unchanged", () => {
    render(
      <HomeProducersGrid
        {...baseProps}
        filters={{ category: "", delivery_city: "", has_delivery: false }}
        onClearCategory={() => {}}
      />,
    );
    expect(screen.getByText("home.producers.empty_heading")).toBeInTheDocument();
    expect(screen.getByText("home.producers.empty_subtext")).toBeInTheDocument();
    const link = screen.getByText("home.producers.explore_map").closest("a");
    expect(link).toHaveAttribute("href", "/map");
    expect(screen.queryByText("home.producers.empty_heading_category")).not.toBeInTheDocument();
  });
});
