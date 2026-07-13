import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1146 chunk B — editorial section order: about → products → delivery →
// reviews → location (MiniMap LAST). Verified via DOM document position.

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useFormatter: () => ({ dateTime: () => "" }),
}));

vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));
// next/dynamic → the MiniMap marker.
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="minimap" /> }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@phosphor-icons/react", () => ({ Leaf: () => <span /> }));

vi.mock("@/components/DeliveryBlock", () => ({ default: () => <div data-testid="delivery" /> }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => <div data-testid="reviews" /> }));
vi.mock("@/components/OpeningHours", () => ({ default: () => <div data-testid="hours" /> }));
vi.mock("@/components/DirectoryDisclaimer", () => ({ default: () => <div data-testid="disclaimer" /> }));
vi.mock("@/components/ReportButton", () => ({ default: () => <div data-testid="report" /> }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children, ...rest }) => <section {...rest}>{children}</section>,
  REVEAL_PRESET: {},
}));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";

const before = (a, b) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("ProducerSections order (MEH-1146 chunk B)", () => {
  it("renders about → products → delivery → reviews → location(minimap last)", () => {
    render(
      <ProducerSections
        producer={{
          id: 1,
          name: "חוות",
          slug: "x",
          description: "תיאור",
          products: [{ id: 9, name: "מוצר", image_url: null }],
          offers_delivery: true,
          delivery_areas: [{ id: 1, city: "עיר", min_order: 50, delivery_day: "שישי" }],
          has_physical_location: true,
          lat: 32,
          lng: 34,
          categories: [{ id: 1, name: "ירקות" }],
        }}
        events={[]}
        similarProducers={[]}
        sectionRefs={{ current: {} }}
        reviewsContainerRef={{ current: null }}
        reviewsVisible={true}
      />,
    );
    const about = screen.getByText("producer.detail.sections.about");
    const products = screen.getByText("producer.detail.sections.products.heading");
    const delivery = screen.getByTestId("delivery");
    const reviews = screen.getByTestId("reviews");
    const minimap = screen.getByTestId("minimap");

    expect(before(about, products)).toBe(true);
    expect(before(products, delivery)).toBe(true);
    expect(before(delivery, reviews)).toBe(true);
    expect(before(reviews, minimap)).toBe(true); // location is last
  });

  // MEH-1168 P3: the editorial DeliveryBlock serves ALL producers (the legacy
  // table retired). It must render when offers_delivery is FALSE but the
  // producer still has delivery_areas rows (or pickup_points).
  const deliveryProps = (overrides) => ({
    producer: { id: 5, name: "חוות", products: [], ...overrides },
    events: [],
    similarProducers: [],
    sectionRefs: { current: {} },
    reviewsContainerRef: { current: null },
    reviewsVisible: false,
  });

  it("renders DeliveryBlock for a !offers_delivery producer that has delivery_areas", () => {
    render(<ProducerSections {...deliveryProps({ offers_delivery: false, delivery_areas: [{ id: 1, city: "עיר", min_order: 50 }] })} />);
    expect(screen.getByTestId("delivery")).toBeInTheDocument();
    // legacy table is gone
    expect(document.querySelector("table")).toBeNull();
  });

  it("renders DeliveryBlock for a pickup-only producer (no offers_delivery, no areas)", () => {
    render(<ProducerSections {...deliveryProps({ offers_delivery: false, delivery_areas: [], pickup_points: "איסוף עצמי" })} />);
    expect(screen.getByTestId("delivery")).toBeInTheDocument();
  });

  it("does not render DeliveryBlock when the producer has no delivery/pickup signal", () => {
    render(<ProducerSections {...deliveryProps({ offers_delivery: false, delivery_areas: [] })} />);
    expect(screen.queryByTestId("delivery")).not.toBeInTheDocument();
  });

  const nearbyProps = (n) => ({
    producer: { id: 3, name: "חוות", city: "עיר", products: [] },
    events: [],
    similarProducers: [],
    nearbyProducers: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, name: `עסק ${i}` })),
    sectionRefs: { current: {} },
    reviewsContainerRef: { current: null },
    reviewsVisible: false,
  });

  it("hides the discovery loop when fewer than MIN_NEARBY_BUSINESSES (4) nearby", () => {
    render(<ProducerSections {...nearbyProps(3)} />);
    expect(screen.queryByText("producer.detail.sections.nearby.heading")).not.toBeInTheDocument();
  });

  it("shows the discovery loop at >= 4 nearby businesses, with the report below it", () => {
    render(<ProducerSections {...nearbyProps(4)} />);
    const loop = screen.getByText("producer.detail.sections.nearby.heading");
    const report = screen.getByTestId("report");
    expect(loop).toBeInTheDocument();
    expect(before(loop, report)).toBe(true); // report stays at the page end, below the loop
  });

  it("shows the signature product at the top of the products section even with no product entries", () => {
    render(
      <ProducerSections
        producer={{
          id: 2,
          name: "חוות",
          top_product_name: "גבינה כפרית",
          starting_price_label: "מ-35₪",
          products: [],
        }}
        events={[]}
        similarProducers={[]}
        sectionRefs={{ current: {} }}
        reviewsContainerRef={{ current: null }}
        reviewsVisible={false}
      />,
    );
    expect(screen.getByText("גבינה כפרית")).toBeInTheDocument();
    expect(screen.getByText("מ-35₪")).toBeInTheDocument();
  });
});
