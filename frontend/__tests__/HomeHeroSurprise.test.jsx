import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeHero } from "@/app/[locale]/home/HomeHero";

// MEH-1288 — "הפתיעו אותי" button beside near-me:
//  A) renders only when hasProducers (empty catalog → no button)
//  B) clicking it calls onSurprise (navigate to a random approved producer)

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
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
vi.mock("@phosphor-icons/react", () => ({
  Crosshair: (p) => <span data-testid="icon-crosshair" {...p} />,
  Shuffle: (p) => <span data-testid="icon-shuffle" {...p} />,
}));

const baseProps = {
  fridayMode: false,
  geoLoading: false,
  onNearMe: vi.fn(),
  onSurprise: vi.fn(),
  hasProducers: true,
  onScrollDown: vi.fn(),
};

describe("HomeHero surprise-me button (MEH-1288)", () => {
  it("renders the button + Shuffle icon when hasProducers is true", () => {
    render(<HomeHero {...baseProps} />);
    expect(screen.getByText("home.hero.surprise_me")).toBeInTheDocument();
    expect(screen.getByTestId("icon-shuffle")).toBeInTheDocument();
  });

  it("does NOT render the button when hasProducers is false (empty catalog)", () => {
    render(<HomeHero {...baseProps} hasProducers={false} />);
    expect(screen.queryByText("home.hero.surprise_me")).not.toBeInTheDocument();
    // near-me still renders — only the surprise button is gated
    expect(screen.getByText("home.hero.near_me")).toBeInTheDocument();
  });

  it("calls onSurprise on click", () => {
    const onSurprise = vi.fn();
    render(<HomeHero {...baseProps} onSurprise={onSurprise} />);
    fireEvent.click(screen.getByText("home.hero.surprise_me"));
    expect(onSurprise).toHaveBeenCalledTimes(1);
  });
});
