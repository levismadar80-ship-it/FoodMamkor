import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeHero } from "@/app/[locale]/home/HomeHero";

// MEH-1643 — hero delivery-to-me CTA (4th CTA, .action-ghost beside near-me).
// Two label states (conditional-UI rule — both cells spec'd):
//  A) no saved user_city → generic label (home.hero.delivery_cta); click fires
//     onDeliveryCta (which opens the LocationModal in use-home-page)
//  B) saved user_city   → dynamic label carrying the city
//     (home.hero.delivery_cta_city with {city}); click fires onDeliveryCta
//     (which applies the existing delivery_city filter path)
// The city-vs-modal routing itself lives in use-home-page.handleDeliveryCta —
// HomeHero only renders the label and forwards the click.

vi.mock("next-intl", () => ({
  useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
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

const baseProps = {
  fridayMode: false,
  geoLoading: false,
  onNearMe: vi.fn(),
  onScrollDown: vi.fn(),
};

describe("HomeHero delivery CTA (MEH-1643)", () => {
  it("renders the generic label when no user_city is saved, and forwards the click", () => {
    const onDeliveryCta = vi.fn();
    render(<HomeHero {...baseProps} onDeliveryCta={onDeliveryCta} userCity={null} />);
    const btn = screen.getByTestId("hero-delivery-cta");
    expect(btn).toHaveTextContent("home.hero.delivery_cta");
    // Not the city variant — the two states must be distinguishable.
    expect(btn.textContent).not.toContain("delivery_cta_city");
    fireEvent.click(btn);
    expect(onDeliveryCta).toHaveBeenCalledTimes(1);
  });

  it("renders the dynamic city label when user_city is saved", () => {
    const onDeliveryCta = vi.fn();
    render(<HomeHero {...baseProps} onDeliveryCta={onDeliveryCta} userCity="חיפה" />);
    const btn = screen.getByTestId("hero-delivery-cta");
    expect(btn).toHaveTextContent('home.hero.delivery_cta_city:{"city":"חיפה"}');
    fireEvent.click(btn);
    expect(onDeliveryCta).toHaveBeenCalledTimes(1);
  });

  it("keeps the MEH-1369 single-filled-primary rule — the delivery CTA is a ghost", () => {
    render(<HomeHero {...baseProps} onDeliveryCta={vi.fn()} userCity={null} />);
    expect(screen.getByTestId("hero-delivery-cta").className).toContain("action-ghost");
  });
});
