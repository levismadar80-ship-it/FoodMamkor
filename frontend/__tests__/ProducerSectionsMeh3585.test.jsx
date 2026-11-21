import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-3585 (Sapir 21/11): two things on the business page.
// 1. The rescue bag sits inside the «מוצרים» anchor, so the tab lands on it and
//    stays lit over it — and with no catalogue there is no anchor (the tab's
//    gate cannot see a bag).
// 2. «שאלו על אלרגנים» is said once above the product list, only while at
//    least one product has no allergen answer (0 / 1 / many undeclared).
// The vi.mock header is repeated from ProducerSectionsProducts.test.jsx.
vi.mock("@/components/rescue/RescueSection", () => ({
  default: () => <section data-testid="rescue-section-stub" />,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.card.aria.image_missing") return `${vars?.name ?? ""} — תמונה חסרה`;
    // MEH-3055: the «show all N» count is asserted, so it is rendered.
    if (key === "producer.detail.sections.products.show_all") return `${key}:${vars?.count}`;
    return key;
  },
  useFormatter: () => ({ dateTime: () => "" }),
  useLocale: () => "he",
}));

vi.mock("next/image", () => ({
  default: (props) => <img data-testid="product-image" src={props.src} alt={props.alt} />,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => new Promise(() => {})) },
}));
// MEH-2659: ProducerActivities (events + group buys) has its own test file.
vi.mock("@/app/[locale]/producer/[id]/components/ProducerActivities", () => ({ default: () => null }));

vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()), // keep real IMAGE_RATIOS
  optimizeCloudinary: (url) => `optimized:${url}`,
}));

vi.mock("@phosphor-icons/react", () => ({
  Info: () => <span />, // MEH-2999: fine-print icon
  Leaf: (props) => <span data-testid="leaf-icon" data-weight={props.weight} className={props.className} />,
  // MEH-1901: the grid row + signature card gained a forward chevron (CaretLeft,
  // LEFT in RTL) and the sheet's own icons load through this same mock.
  // MEH-3052: the products toggle is the shared ShowMore, which draws a caret.
  CaretDown: () => <span />,
  CaretUp: () => <span />,
  CaretLeft: (props) => <span data-testid="row-chevron" className={props.className} />,
  // MEH-2045: the sheet's "previous" chevron in RTL. Loaded through this mock
  // for the same reason CaretLeft is — paging itself is asserted in
  // ProductSheetNavigation.test.jsx.
  CaretRight: (props) => <span data-testid="sheet-caret-right" className={props.className} />,
  MapPin: () => <span data-testid="map-pin" />,
  WhatsappLogo: () => <span data-testid="wa-logo" />,
  X: () => <span data-testid="x-icon" />,
  // MEH-1916: the sheet's CTA is now per-channel, so its whole icon set loads
  // through this mock too. Routing itself is asserted in ProductSheet.test.jsx.
  Phone: () => <span data-testid="icon-phone" />,
  Globe: () => <span data-testid="icon-globe" />,
  EnvelopeSimple: () => <span data-testid="icon-email" />,
  InstagramLogo: () => <span data-testid="icon-instagram" />,
  FacebookLogo: () => <span data-testid="icon-facebook" />,
  Receipt: () => <span data-testid="icon-receipt" />,
  // MEH-2654: the product rows render diet glyphs through lib/chip-icons, which
  // imports its whole icon set from this module.
  SealCheck: () => <span />,
  Truck: () => <span />,
  Package: () => <span />,
  Certificate: () => <span />,
  Carrot: () => <span />,
  GrainsSlash: () => <span />,
  Barn: () => <span />,
  Medal: () => <span />,
  HandHeart: () => <span />,
  DropSlash: () => <span />,
  Cube: () => <span />,
  Clock: () => <span />,
  Storefront: () => <span />,
}));

// MEH-1901: the sheet's beacon helpers — asserted in ProductSheet.test.jsx;
// stubbed here so the module's localStorage/fetch reach never runs under these
// grid-rendering assertions.
vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
}));

vi.mock("@/components/DeliveryBlock", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children }) => <div>{children}</div>,
  REVEAL_PRESET: {},
}));
vi.mock("@/components/DirectoryDisclaimer", () => ({ default: () => null }));
// MEH-1306: the owner pencil is self-gating chrome irrelevant to these
// assertions — mock it out so its @/i18n/navigation import never loads.
vi.mock("@/components/OwnerSectionEditLink", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/ReportButton", () => ({ default: () => null }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => null }));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";
import { seedColorFor } from "@/lib/brand-seeds";
const baseProps = {
  events: [],
  similarProducers: [],
  sectionRefs: { current: {} },
  reviewsContainerRef: { current: null },
  reviewsVisible: false,
};

const producerWith = (products) => ({
  id: 1,
  name: "טבע פור",
  products,
});


const NOTE = "products-allergens-note";
const bread = (extra = {}) => ({ id: 1, name: "לחם", image_url: null, ...extra });
const cake = (extra = {}) => ({ id: 2, name: "עוגה", image_url: null, ...extra });

describe("MEH-3585 — the rescue bag belongs to the «מוצרים» anchor", () => {
  it("with a catalogue: the bag comes first inside #section-products", () => {
    const { container } = render(<ProducerSections {...baseProps} producer={producerWith([bread()])} />);
    const anchor = container.querySelector("#section-products");
    const bag = screen.getByTestId("rescue-section-stub");
    const catalogue = screen.getByTestId("section-products-catalogue");
    expect(anchor.contains(bag)).toBe(true);
    expect(anchor.contains(catalogue)).toBe(true);
    expect(bag.compareDocumentPosition(catalogue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll("#section-products")).toHaveLength(1);
  });

  it("no catalogue: the bag still renders, and there is no products anchor", () => {
    const { container } = render(<ProducerSections {...baseProps} producer={producerWith([])} />);
    expect(screen.getByTestId("rescue-section-stub")).toBeInTheDocument();
    expect(container.querySelector("#section-products")).toBeNull();
  });
});

describe("MEH-3585 — one allergen note for the list", () => {
  it("0 undeclared (every product answered): no note", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([bread({ allergens: ["gluten"] }), cake({ no_allergens: true })])}
      />,
    );
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });

  it("1 undeclared among answered ones: one note", () => {
    render(
      <ProducerSections {...baseProps} producer={producerWith([bread({ may_contain: ["sesame"] }), cake()])} />,
    );
    expect(screen.getAllByTestId(NOTE)).toHaveLength(1);
    expect(screen.getByTestId(NOTE)).toHaveTextContent("producer.detail.sections.products.allergens_note");
  });

  it("many undeclared: still exactly one note, inside the products anchor", () => {
    const { container } = render(<ProducerSections {...baseProps} producer={producerWith([bread(), cake()])} />);
    expect(screen.getAllByTestId(NOTE)).toHaveLength(1);
    expect(container.querySelector("#section-products").contains(screen.getByTestId(NOTE))).toBe(true);
  });

  it("an unknown code alone is not an answer (the sheet shows nothing for it)", () => {
    render(<ProducerSections {...baseProps} producer={producerWith([bread({ allergens: ["not_a_code"] })])} />);
    expect(screen.getByTestId(NOTE)).toBeInTheDocument();
  });
});
