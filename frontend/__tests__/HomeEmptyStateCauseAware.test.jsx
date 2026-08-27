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
// MEH-1774: this suite pulls use-home-page transitively (HomeProducersGrid
// imports LOAD_MORE_CAP from it), and that module now imports the locale-aware
// router. Stub it so next-intl's ESM createNavigation never loads under vitest.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

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
  onChipNavigate: () => {},
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

// MEH-1487: when a delivery_city filter returns 0 but the city belongs to a
// region, the empty state is replaced by the region-fallback section.
describe("HomeProducersGrid region fallback (MEH-1487)", () => {
  it("region hit → fallback header + region producer cards, no generic empty state", () => {
    render(
      <HomeProducersGrid
        {...baseProps}
        filters={{ category: "", delivery_city: "אריאל", has_delivery: false }}
        onClearCategory={() => {}}
        regionFallback={{
          regionName: "השרון",
          producers: [{ id: "a" }, { id: "b" }],
        }}
      />,
    );
    expect(screen.getByTestId("region-fallback")).toBeInTheDocument();
    // header interpolates city + region
    expect(
      screen.getByText(/home\.producers\.region_fallback_header/),
    ).toHaveTextContent("אריאל");
    expect(
      screen.getByText(/home\.producers\.region_fallback_header/),
    ).toHaveTextContent("השרון");
    // generic empty state is suppressed
    expect(screen.queryByText("home.producers.empty_heading")).not.toBeInTheDocument();
  });

  it("no fallback (region miss) → generic empty state renders", () => {
    render(
      <HomeProducersGrid
        {...baseProps}
        filters={{ category: "", delivery_city: "עיר קטנה", has_delivery: false }}
        onClearCategory={() => {}}
        regionFallback={null}
      />,
    );
    expect(screen.queryByTestId("region-fallback")).not.toBeInTheDocument();
    expect(screen.getByText("home.producers.empty_heading")).toBeInTheDocument();
  });
});

// MEH-2197: a day-filter zero-result is a DIFFERENT cause from a city-filter
// zero-result. The city IS served — only the chosen day is not — so the
// fallback header must not claim "no deliveries to {city}", the day note must
// be a compact one-liner rather than a hero dead-end, and exactly one empty
// state may render.
describe("HomeProducersGrid day-zero cause-awareness (MEH-2197)", () => {
  const dayZeroProps = {
    ...baseProps,
    filters: { category: "", delivery_city: "רעננה", has_delivery: false },
    onClearCategory: () => {},
    daysActive: ["שלישי", "חמישי"],
  };

  it("day-zero + region fallback → _days header rendered, old header absent", () => {
    render(
      <HomeProducersGrid
        {...dayZeroProps}
        onClearDays={() => {}}
        regionFallback={{ regionName: "השרון", producers: [{ id: "a" }] }}
      />,
    );
    const header = screen.getByText(/home\.producers\.region_fallback_header_days/);
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent("השרון");
    // the old, city-blaming header must not be in the DOM at all
    expect(
      screen.queryByText(/home\.producers\.region_fallback_header:/),
    ).not.toBeInTheDocument();
  });

  it("city-zero without days → old header rendered, _days key absent", () => {
    render(
      <HomeProducersGrid
        {...baseProps}
        filters={{ category: "", delivery_city: "אריאל", has_delivery: false }}
        onClearCategory={() => {}}
        daysActive={[]}
        regionFallback={{ regionName: "השרון", producers: [{ id: "a" }] }}
      />,
    );
    expect(
      screen.getByText(/home\.producers\.region_fallback_header:/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/home\.producers\.region_fallback_header_days/),
    ).not.toBeInTheDocument();
  });

  it("day-empty block carries zero bg-primary elements and clears the days", () => {
    const onClearDays = vi.fn();
    render(
      <HomeProducersGrid {...dayZeroProps} onClearDays={onClearDays} regionFallback={null} />,
    );
    const block = screen.getByTestId("day-empty-suggestion");
    expect(block.querySelectorAll(".bg-primary").length).toBe(0);
    expect(block.className).not.toContain("text-center");
    const cta = screen.getByRole("button", { name: "home.producers.day_empty_clear_cta" });
    expect(cta.className).toContain("underline");
    expect(cta.className).toContain("text-primary");
    fireEvent.click(cta);
    expect(onClearDays).toHaveBeenCalledTimes(1);
  });

  it("day-zero with NO region fallback → exactly ONE empty-state block", () => {
    render(
      <HomeProducersGrid {...dayZeroProps} onClearDays={() => {}} regionFallback={null} />,
    );
    // count, not presence: the pre-MEH-2197 markup rendered TWO (the day block
    // plus the unguarded generic empty state).
    const blocks = [
      ...screen.queryAllByTestId("day-empty-suggestion"),
      ...screen.queryAllByText("home.producers.empty_heading"),
      ...screen.queryAllByText("home.producers.empty_heading_category"),
    ];
    expect(blocks.length).toBe(1);
    expect(screen.getByTestId("day-empty-suggestion")).toBeInTheDocument();
  });
});
