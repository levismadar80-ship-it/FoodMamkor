import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1048: the header "trust strip" turns the rating + review count into an
// anchor (#reviews) next to the h1. Zero reviews → nothing. This covers the
// anchor render, the guard, and the dir="ltr" numeric run on the rating.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.detail.header.review_count") return `${vars?.count} ביקורות`;
    return key;
  },
}));

// Stub the child components + Phosphor icons ProducerHeader composes.
vi.mock("@/components/AvailabilityBadge", () => ({ default: () => <div data-testid="availability" /> }));
vi.mock("@/components/BadgeRow", () => ({ default: () => <div data-testid="badge-row" /> }));
vi.mock("@/components/CategoryTag", () => ({ default: () => <span data-testid="cat" /> }));
vi.mock("@/components/KashrutBadgeStrip", () => ({ default: () => <div data-testid="kashrut" /> }));
vi.mock("@/components/TrustBadge", () => ({ default: () => <div data-testid="trust" /> }));
vi.mock("@phosphor-icons/react", () => ({
  MapPin: () => <span />,
  Heart: () => <span />,
  Star: () => <span data-testid="star" />,
  Truck: () => <span />,
  StarOfDavid: () => <span />,
}));

import ProducerHeader from "@/app/[locale]/producer/[id]/components/ProducerHeader";

const baseProducer = {
  name: "חוות הדבש של מירי",
  avg_rating: 4.8,
  reviews_count: 12,
  trust_tier: 1,
  plan: "basic",
  favorites_count: 0,
  availability_state: "accepting_orders",
  categories: [],
  city: "תל אביב",
};

describe("ProducerHeader trust strip (MEH-1048)", () => {
  it("renders a #reviews anchor with rating + count when reviews exist", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={null} hasImages />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#reviews");
    expect(link).toHaveTextContent("4.8");
    expect(link).toHaveTextContent("12 ביקורות");
  });

  it("puts the rating decimal in a dir=ltr .numeric run (RTL flip guard)", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={null} hasImages />);
    const rating = screen.getByText("4.8");
    expect(rating).toHaveAttribute("dir", "ltr");
    expect(rating.className).toMatch(/numeric/);
  });

  it("renders nothing (no anchor) when there are zero reviews", () => {
    render(<ProducerHeader producer={{ ...baseProducer, reviews_count: 0 }} primaryCategory={null} hasImages />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
