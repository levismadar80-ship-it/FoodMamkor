import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1146 chunk B — editorial section order: about → products → delivery →
// reviews → location (MiniMap LAST). Verified via DOM document position.

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useFormatter: () => ({ dateTime: () => "" }),
  useLocale: () => "he",
}));

vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));
// next/dynamic → the MiniMap marker.
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="minimap" /> }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()), // keep real IMAGE_RATIOS
  optimizeCloudinary: (u) => u,
}));
// MEH-1901: CaretLeft joins the set — the product grid row and signature card
// carry a forward chevron (LEFT in RTL) now that they open the detail sheet.
vi.mock("@phosphor-icons/react", () => ({
  Leaf: () => <span />,
  CaretLeft: () => <span />,
  MapPin: () => <span />,
  WhatsappLogo: () => <span />,
  X: () => <span />,
  // MEH-1916: ProductSheet's per-channel CTA icon set loads through this mock.
  Phone: () => <span />,
  Globe: () => <span />,
  EnvelopeSimple: () => <span />,
  InstagramLogo: () => <span />,
  FacebookLogo: () => <span />,
  Receipt: () => <span />,
  // MEH-2264: OrderWindowScheduleBlock's card icon + disclosure chevron.
  CalendarCheck: () => <span />,
  CaretDown: () => <span />,
}));

vi.mock("@/components/DeliveryBlock", () => ({ default: () => <div data-testid="delivery" /> }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => <div data-testid="reviews" /> }));
vi.mock("@/components/OpeningHours", () => ({ default: () => <div data-testid="hours" /> }));
vi.mock("@/components/DirectoryDisclaimer", () => ({ default: () => <div data-testid="disclaimer" /> }));
vi.mock("@/components/ReportButton", () => ({ default: () => <div data-testid="report" /> }));
// MEH-1306: the owner pencil is self-gating chrome irrelevant to these
// assertions — mock it out so its @/i18n/navigation import never loads.
vi.mock("@/components/OwnerSectionEditLink", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children, ...rest }) => <section {...rest}>{children}</section>,
  REVEAL_PRESET: {},
}));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";

const before = (a, b) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("ProducerSections order (MEH-1146 chunk B, MEH-2592)", () => {
  it("renders about → owner → products → reviews → delivery → location → fine print", () => {
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
          // MEH-1938 chunk 5a: the MiniMap gates on primaryPoint(), i.e. the row.
          locations: [{ kind: "branch", is_primary: true, lat: 32, lng: 34, precision: "exact", id: 1 }],
          categories: [{ id: 1, name: "ירקות" }],
          contact_name: "יעל",
        }}
        events={[]}
        similarProducers={[]}
        sectionRefs={{ current: {} }}
        reviewsContainerRef={{ current: null }}
        reviewsVisible={true}
      />,
    );
    const about = screen.getByText("producer.detail.sections.about");
    const owner = screen.getByText("יעל");
    const products = screen.getByText("producer.detail.sections.products.heading");
    const delivery = screen.getByTestId("delivery");
    const reviews = screen.getByTestId("reviews");
    const minimap = screen.getByTestId("minimap");
    const disclaimer = screen.getByTestId("disclaimer");
    const report = screen.getByTestId("report");

    // Split per pair so a failure names the pair that moved.
    expect(before(about, owner), "owner card directly under about").toBe(true);
    expect(before(owner, products), "owner card before products").toBe(true);
    expect(before(products, reviews), "products before reviews").toBe(true);
    expect(before(reviews, delivery), "reviews before delivery (MEH-2592)").toBe(true);
    expect(before(delivery, minimap), "delivery before location").toBe(true);
    expect(before(minimap, disclaimer), "fine print after location").toBe(true);
    expect(before(disclaimer, report), "disclaimer above the report link").toBe(true);
  });

  // MEH-1938 chunk 5a — the removal path, so the gate cannot quietly revert
  // to `!!producer.lat && !!producer.lng`: coordinates on the columns alone
  // (no row) render NO location section and NO MiniMap. Against the pre-5a
  // gate this producer mounts both.
  it("hides the location section and the MiniMap for coordinates that live only on the columns (MEH-1938 chunk 5a)", () => {
    const { container } = render(
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
          locations: [],
          categories: [{ id: 1, name: "ירקות" }],
        }}
        events={[]}
        similarProducers={[]}
        sectionRefs={{ current: {} }}
        reviewsContainerRef={{ current: null }}
        reviewsVisible={true}
      />,
    );
    expect(screen.queryByTestId("minimap")).toBeNull();
    expect(container.querySelector("#section-location")).toBeNull();
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

  // MEH-2592: the similar / nearby rows left ProducerSections for
  // <OtherBusinesses> (ProducerDetail, full width below both columns). Even
  // with a full nearby list, nothing of them renders in this column any more.
  it("renders no other-businesses rows, whatever nearby/similar it is handed", () => {
    render(
      <ProducerSections
        producer={{ id: 3, name: "חוות", city: "עיר", products: [] }}
        events={[]}
        similarProducers={Array.from({ length: 5 }, (_, i) => ({ id: `s${i}` }))}
        nearbyProducers={Array.from({ length: 6 }, (_, i) => ({ id: `n${i}` }))}
        sectionRefs={{ current: {} }}
        reviewsContainerRef={{ current: null }}
        reviewsVisible={false}
      />,
    );
    expect(screen.queryByText("producer.detail.sections.nearby.heading")).not.toBeInTheDocument();
    expect(screen.queryByText("producer.detail.sections.similar.heading")).not.toBeInTheDocument();
  });

  it("shows the signature product at the top of the products section even with no product entries", () => {
    render(
      <ProducerSections
        producer={{
          id: 2,
          name: "חוות",
          top_product_name: "גבינה כפרית",
          price_range: "מ-35₪",
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

// MEH-1291 — the "עודכן לאחרונה" freshness line renders only after a real edit
// stamps producer.updated_at (nullable, no backfill). The next-intl mock returns
// the key literal, so we assert on the key string.
// MEH-2592 E: «מאחורי העסק» sits INSIDE «אודות» when there is a description,
// and keeps its own section when there is none.
describe("ProducerSections — owner card placement (MEH-2592)", () => {
  const props = (producer) => ({
    producer: { id: 7, name: "חוות", products: [], contact_name: "יעל", ...producer },
    events: [],
    sectionRefs: { current: {} },
    reviewsContainerRef: { current: null },
    reviewsVisible: false,
  });

  it("with a description: the owner card is nested inside #section-bio", () => {
    const { container } = render(<ProducerSections {...props({ description: "תיאור" })} />);
    const bio = container.querySelector("#section-bio");
    const cards = screen.getAllByTestId("owner-card");
    expect(cards).toHaveLength(1);
    expect(bio).toContainElement(cards[0]);
    expect(cards[0].dataset.nested).toBe("true");
  });

  it("without a description: one standalone owner card, no #section-bio", () => {
    const { container } = render(<ProducerSections {...props({ description: "" })} />);
    expect(container.querySelector("#section-bio")).toBeNull();
    const cards = screen.getAllByTestId("owner-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.nested).toBeUndefined();
  });
});

describe("ProducerSections last-updated line (MEH-1291)", () => {
  const freshnessProps = (overrides) => ({
    producer: { id: 7, name: "חוות", products: [], ...overrides },
    events: [],
    similarProducers: [],
    sectionRefs: { current: {} },
    reviewsContainerRef: { current: null },
    reviewsVisible: false,
  });

  it("renders the freshness line, after the report, when updated_at is set", () => {
    render(<ProducerSections {...freshnessProps({ updated_at: "2026-07-18T10:00:00Z" })} />);
    const line = screen.getByText("producer.detail.last_updated");
    const report = screen.getByTestId("report");
    expect(line).toBeInTheDocument();
    expect(before(report, line)).toBe(true); // page-end footnote, below the report
  });

  it("renders nothing when updated_at is null (untouched producer)", () => {
    render(<ProducerSections {...freshnessProps({ updated_at: null })} />);
    expect(screen.queryByText("producer.detail.last_updated")).not.toBeInTheDocument();
  });
});

describe("ProducerSections → OrderWindowScheduleBlock special_hours pass-through (MEH-2264)", () => {
  it("renders the upcoming special-dates layer from producer.special_hours", () => {
    // Clock pinned: "upcoming" is time-derived. Saturday 05/09/2026 10:00 Israel.
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-05T07:00:00Z") });
    try {
      render(
        <ProducerSections
          producer={{
            id: 2,
            name: "חוות",
            slug: "y",
            description: "תיאור",
            products: [],
            offers_delivery: false,
            delivery_areas: [],
            categories: [],
            order_window: { sunday: [{ open: "09:00", close: "14:00" }] },
            special_hours: {
              "2026-09-21": { ranges: [], note: "יום כיפור" },
              "2026-08-01": { ranges: [] },
            },
          }}
          events={[]}
          similarProducers={[]}
          sectionRefs={{ current: {} }}
          reviewsContainerRef={{ current: null }}
          reviewsVisible={true}
        />,
      );
      const rows = screen.getAllByTestId("order-window-special-row");
      expect(rows.map((r) => r.dataset.date)).toEqual(["2026-09-21"]);
      expect(rows[0].textContent).toContain("יום כיפור");
    } finally {
      vi.useRealTimers();
    }
  });
});

// MEH-2438 follow-up («בתיאום אישי» research, 27/10): a business with a place
// to visit but no hours showed Waze/Google buttons and nothing else — an
// invitation to turn up unannounced at a home producer. The location section
// now says to coordinate first. Cells: hours × location.
describe("ProducerSections — no-hours line in the location section", () => {
  const renderWith = (extra) =>
    render(
      <ProducerSections
        producer={{
          id: 3,
          name: "חוות",
          slug: "z",
          description: "תיאור",
          products: [],
          offers_delivery: false,
          delivery_areas: [],
          categories: [],
          has_physical_location: true,
          ...extra,
        }}
        events={[]}
        similarProducers={[]}
        sectionRefs={{ current: {} }}
        reviewsContainerRef={{ current: null }}
        reviewsVisible={true}
      />,
    );
  const pin = { kind: "branch", is_primary: true, lat: 32, lng: 34, precision: "exact", id: 1 };

  it("location without hours → the coordinate-first line", () => {
    renderWith({ locations: [pin] });

    expect(screen.getByTestId("minimap")).toBeInTheDocument();
    expect(screen.getByTestId("location-no-hours").textContent).toBe(
      "producer.detail.sections.location_no_hours",
    );
  });

  it("location with hours → no line", () => {
    renderWith({ locations: [{ ...pin, opening_hours: "Sun-Thu 09:00-18:00" }] });

    expect(screen.getByTestId("minimap")).toBeInTheDocument();
    expect(screen.queryByTestId("location-no-hours")).toBeNull();
  });

  it("only a secondary location has hours → the line still shows (store hours are the primary's)", () => {
    // resolveStoreHours reads the PRIMARY row (then the legacy column); a pickup
    // point's hours are not the shop's, and DeliveryBlock lists them separately.
    renderWith({
      locations: [pin, { kind: "pickup", is_primary: false, lat: 32.1, lng: 34.1, id: 2, opening_hours: "Fri 08:00-13:00" }],
    });

    expect(screen.getByTestId("location-no-hours")).toBeInTheDocument();
  });

  it("hours without a location → no line (nowhere to arrive at)", () => {
    renderWith({ has_physical_location: false, locations: [], opening_hours: "Fri 08:00-13:00" });

    expect(screen.queryByTestId("minimap")).toBeNull();
    expect(screen.queryByTestId("location-no-hours")).toBeNull();
  });

  it("the Hebrew line is the approved wording", async () => {
    const he = (await import("@/messages/he.json")).default;
    const en = (await import("@/messages/en.json")).default;

    expect(he.producer.detail.sections.location_no_hours).toBe("אין שעות קבועות — כדאי לתאם לפני שמגיעים");
    expect(en.producer.detail.sections.location_no_hours.trim()).not.toBe("");
  });
});
