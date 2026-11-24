/**
 * MEH-3821 — a filter change on the home page keeps the current results on
 * screen, dimmed and aria-busy, until the new set arrives. The 8-card skeleton
 * is for the first load only. Swapping the results for the skeleton collapsed
 * the grid and moved the mini-map below it up and back (≈ 0.4 CLS, phone).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";

vi.mock("next-intl", () => ({ useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k) }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, ...p }) => <div {...p}>{children}</div>,
  },
}));
vi.mock("@/components/ProducerCard", () => ({
  default: ({ producer }) => <div data-testid="card">{producer.name}</div>,
}));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => <div data-testid="skeleton-grid" /> }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...p }) => <a href={typeof href === "string" ? href : href?.pathname} {...p}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const rows = [
  { id: "a", name: "אלף" },
  { id: "b", name: "בית" },
];
const props = (over) => ({
  producers: rows,
  producersLoading: false,
  visibleProducers: rows,
  hasMore: false,
  visibleCount: 8,
  chips: {},
  categories: [],
  filters: { category: "", delivery_city: "חיפה", has_delivery: false },
  onChipNavigate: () => {},
  onLoadMore: () => {},
  onClearCategory: () => {},
  ...over,
});

describe("HomeProducersGrid refetch (MEH-3821)", () => {
  it("first load: the skeleton, no results block", () => {
    render(<HomeProducersGrid {...props({ producers: [], visibleProducers: [], producersLoading: true })} />);
    expect(screen.getByTestId("skeleton-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("home-producers-results")).toBeNull();
  });

  it("a refetch after the first paint keeps the cards, dimmed and busy; no skeleton", () => {
    const { rerender } = render(<HomeProducersGrid {...props()} />);
    expect(screen.getByTestId("home-producers-results")).not.toHaveAttribute("aria-busy");
    rerender(<HomeProducersGrid {...props({ producersLoading: true })} />);
    expect(screen.queryByTestId("skeleton-grid")).toBeNull();
    expect(screen.getAllByTestId("card")).toHaveLength(2);
    const block = screen.getByTestId("home-producers-results");
    expect(block).toHaveAttribute("aria-busy", "true");
    expect(block.className).toContain("opacity-60");
    rerender(<HomeProducersGrid {...props({ producers: [rows[0]], visibleProducers: [rows[0]] })} />);
    expect(screen.getAllByTestId("card")).toHaveLength(1);
    expect(block).not.toHaveAttribute("aria-busy");
    expect(block.className).not.toContain("opacity-60");
  });

  it("a page whose first load finishes, then refetches, never shows the skeleton again", () => {
    const { rerender } = render(<HomeProducersGrid {...props({ producers: [], visibleProducers: [], producersLoading: true })} />);
    rerender(<HomeProducersGrid {...props()} />);
    rerender(<HomeProducersGrid {...props({ producersLoading: true })} />);
    expect(screen.queryByTestId("skeleton-grid")).toBeNull();
    expect(screen.getAllByTestId("card")).toHaveLength(2);
  });

  it("an empty result is not kept while the next one loads: its copy names the old filter", () => {
    const empty = { producers: [], visibleProducers: [] };
    const { rerender } = render(<HomeProducersGrid {...props(empty)} />);
    expect(screen.queryByTestId("skeleton-grid")).toBeNull();
    rerender(<HomeProducersGrid {...props({ ...empty, producersLoading: true })} />);
    expect(screen.getByTestId("skeleton-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("home-producers-results")).toBeNull();
  });
});
