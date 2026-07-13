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

// ReviewExcerpt (chunk 2) is a child of ProducerHeader — stub its api so the
// header test stays isolated to the trust-strip anchor (empty reviews → the
// excerpt renders nothing, leaving the anchor as the sole link).
vi.mock("@/lib/api", () => ({ default: { get: () => Promise.resolve({ data: { reviews: [] } }) } }));

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

  // MEH-1168 P1: availability moved OUT of the header logistics line into the
  // contact-card status line / vacation+slow-response banners — it must not
  // render in the header anymore (closes the calibration-review coverage gap).
  it("does not render the availability badge in the header", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={null} hasImages />);
    expect(screen.queryByTestId("availability")).not.toBeInTheDocument();
  });
});

// MEH-1170: the removed BadgeRow "מוצהר" chip's tooltip was the only surface of
// declared_explainer; Option 1 relocated it here as quiet visible copy so the
// tier-2 badge absence stays "affirmatively explained" (ADR-022 gate 1). The
// next-intl mock echoes the key, so we assert on the key path.
describe("ProducerHeader declared explainer (MEH-1170)", () => {
  it("renders declared_explainer copy for the declared tier", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, verification_tier: "declared" }}
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.getByText("producer.badge.declared_explainer")).toBeInTheDocument();
  });

  it("does not render the explainer for verified or null tiers", () => {
    const { rerender } = render(
      <ProducerHeader
        producer={{ ...baseProducer, verification_tier: "verified" }}
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.queryByText("producer.badge.declared_explainer")).not.toBeInTheDocument();
    rerender(
      <ProducerHeader
        producer={{ ...baseProducer, verification_tier: null }}
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.queryByText("producer.badge.declared_explainer")).not.toBeInTheDocument();
  });
});
