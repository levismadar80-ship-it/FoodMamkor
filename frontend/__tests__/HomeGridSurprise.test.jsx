import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeHero } from "@/app/[locale]/home/HomeHero";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";

// MEH-1476 — "הפתיעו אותי" surprise-me button relocated from the hero to the
// producers-grid end (was MEH-1288/MEH-1369, a text link beside "how it works").
// It now sits near "load more" as a secondary outline pill:
//  A) the hero no longer renders it (only near-me + how-it-works remain)
//  B) the grid renders it only when hasProducers (empty catalog → no button)
//  C) clicking it calls onSurprise (navigate to a random approved producer)

vi.mock("next-intl", () => ({
  useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("framer-motion", () => {
  const strip = ({ children, initial, animate, whileInView, viewport, transition, ...p }, Tag) => (
    <Tag {...p}>{children}</Tag>
  );
  return {
    MotionConfig: ({ children }) => <>{children}</>,
    motion: {
      div: (props) => strip(props, "div"),
      h1: (props) => strip(props, "h1"),
      p: (props) => strip(props, "p"),
    },
  };
});
vi.mock("@/components/HeroSearch", () => ({ default: () => <div data-testid="hero-search" /> }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: () => "https://img/hero.jpg" }));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div /> }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => <div /> }));
vi.mock("@/components/OnboardingTip", () => ({ default: () => null }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));

const heroProps = {
  fridayMode: false,
  geoLoading: false,
  onNearMe: vi.fn(),
  onScrollDown: vi.fn(),
};

const gridProps = {
  producers: [],
  producersLoading: false,
  visibleProducers: [],
  hasMore: false,
  visibleCount: 8,
  filters: { category: "", delivery_city: "", has_delivery: false },
  chips: {},
  categories: [],
  showNewUserHint: false,
  fridayMode: false,
  step0Visible: false,
  onboardStep: -1,
  onboardAdvance: () => {},
  onboardDismiss: () => {},
  onAdvanceFromStep0: () => {},
  onToggleChip: () => {},
  onClearCategory: () => {},
  onClearLocation: () => {},
  onLoadMore: () => {},
  onSurprise: vi.fn(),
  hasProducers: true,
  geoActive: false,
  cityActive: false,
  geoEmptyNotice: false,
};

describe("HomeHero (MEH-1476 — surprise-me removed)", () => {
  it("no longer renders the surprise-me button; keeps near-me + how-it-works", () => {
    render(<HomeHero {...heroProps} />);
    expect(screen.queryByText("home.hero.surprise_me")).not.toBeInTheDocument();
    expect(screen.getByText("home.hero.near_me")).toBeInTheDocument();
    expect(screen.getByText("home.hero.how_it_works")).toBeInTheDocument();
  });
});

describe("HomeProducersGrid surprise-me button (MEH-1476)", () => {
  it("renders the button at the grid end when hasProducers is true", () => {
    render(<HomeProducersGrid {...gridProps} />);
    expect(screen.getByText("home.hero.surprise_me")).toBeInTheDocument();
  });

  it("does NOT render the button when hasProducers is false (empty catalog)", () => {
    render(<HomeProducersGrid {...gridProps} hasProducers={false} />);
    expect(screen.queryByText("home.hero.surprise_me")).not.toBeInTheDocument();
  });

  it("calls onSurprise on click", () => {
    const onSurprise = vi.fn();
    render(<HomeProducersGrid {...gridProps} onSurprise={onSurprise} />);
    fireEvent.click(screen.getByText("home.hero.surprise_me"));
    expect(onSurprise).toHaveBeenCalledTimes(1);
  });
});
