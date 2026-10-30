import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

// SectionAnchorNav — the sticky section anchor-nav on the producer page.
// Three behaviours, each asserted on the real component / real gate function:
//   1. data-gating: a pill exists exactly when its section is rendered
//      (parity against the REAL ProducerSections render, not a copy of its
//      conditions — a drift between the two goes red here).
//   2. aria-current follows the IntersectionObserver-reported section.
//   3. prefers-reduced-motion → scrollIntoView behavior "auto", else "smooth".

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useFormatter: () => ({ dateTime: () => "" }),
  useLocale: () => "he",
}));
vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="minimap" /> }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()),
  optimizeCloudinary: (u) => u,
}));
// Hand-enumerated: every glyph ProducerSections + its children + the nav load.
vi.mock("@phosphor-icons/react", () => ({
  Leaf: () => <span />,
  CaretLeft: () => <span />,
  MapPin: () => <span />,
  WhatsappLogo: () => <span />,
  X: () => <span />,
  Phone: () => <span />,
  Globe: () => <span />,
  EnvelopeSimple: () => <span />,
  InstagramLogo: () => <span />,
  FacebookLogo: () => <span />,
  Receipt: () => <span />,
  CalendarCheck: () => <span />,
  CaretDown: () => <span />,
  // the nav's own glyphs
  Info: () => <span />,
  Package: () => <span />,
  Truck: () => <span />,
  ChatCircleText: () => <span />,
}));
vi.mock("@/components/DeliveryBlock", () => ({ default: () => <div data-testid="delivery" /> }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => <div data-testid="reviews" /> }));
vi.mock("@/components/OpeningHours", () => ({ default: () => <div data-testid="hours" /> }));
vi.mock("@/components/DirectoryDisclaimer", () => ({ default: () => <div /> }));
vi.mock("@/components/ReportButton", () => ({ default: () => <div /> }));
vi.mock("@/components/OwnerSectionEditLink", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children, ...rest }) => <section {...rest}>{children}</section>,
  REVEAL_PRESET: {},
}));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";
import { getSectionNavItems } from "@/app/[locale]/producer/[id]/lib/section-nav";
import SectionAnchorNav from "@/components/SectionAnchorNav";

const t = (key) => key;

const FULL = {
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
  locations: [{ kind: "branch", is_primary: true, lat: 32, lng: 34, precision: "exact", id: 1 }],
  categories: [{ id: 1, name: "ירקות" }],
};

// No description, no products/signature, no delivery/pickup, no location row,
// no hours — only the always-rendered reviews wrapper survives.
const BARE = {
  id: 2,
  name: "חוות",
  slug: "y",
  description: "",
  products: [],
  offers_delivery: false,
  delivery_areas: [],
  has_physical_location: false,
  locations: [],
  categories: [],
};

function renderSections(producer) {
  return render(
    <ProducerSections
      producer={producer}
      events={[]}
      similarProducers={[]}
      sectionRefs={{ current: {} }}
      reviewsContainerRef={{ current: null }}
      reviewsVisible={false}
    />,
  );
}

const pill = (id) => screen.queryByTestId(`section-nav-pill-${id}`);

describe("SectionAnchorNav — data gating", () => {
  afterEach(cleanup);

  it.each([
    ["full", FULL],
    ["bare", BARE],
  ])("every gate agrees with the real ProducerSections render (%s producer)", (_, producer) => {
    const items = getSectionNavItems(producer, t);
    const { container } = renderSections(producer);
    for (const item of items) {
      const rendered = !!container.querySelector(`#${item.id}`);
      expect({ id: item.id, show: item.show }).toEqual({ id: item.id, show: rendered });
    }
  });

  it("covers the five sections, in page order", () => {
    expect(getSectionNavItems(FULL, t).map((i) => i.id)).toEqual([
      "section-bio",
      "section-products",
      "reviews",
      "section-delivery",
      "section-location",
    ]);
  });

  // MEH-2592: the pill order is read off the REAL render, so moving a section
  // on one side only goes red here instead of leaving the nav out of order.
  it("pill order matches the DOM order of the rendered sections", () => {
    const { container } = renderSections(FULL);
    const ids = getSectionNavItems(FULL, t).map((i) => i.id);
    const domOrder = [...container.querySelectorAll(ids.map((id) => `#${id}`).join(","))].map((el) => el.id);
    expect(domOrder).toEqual(ids);
  });

  it("renders a pill per shown section and NO pill for an absent one", () => {
    render(<SectionAnchorNav items={getSectionNavItems(BARE, t)} ariaLabel="nav" />);
    expect(pill("section-products")).toBeNull();
    expect(pill("section-bio")).toBeNull();
    expect(pill("section-delivery")).toBeNull();
    expect(pill("section-location")).toBeNull();
    expect(pill("reviews")).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("renders all five pills for a full producer", () => {
    render(<SectionAnchorNav items={getSectionNavItems(FULL, t)} ariaLabel="nav" />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("renders nothing at all when no section is shown", () => {
    const { container } = render(
      <SectionAnchorNav items={[{ id: "a", label: "a", show: false }]} ariaLabel="nav" />,
    );
    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("SectionAnchorNav — active section (aria-current)", () => {
  let ioCallback;
  let observed;
  beforeEach(() => {
    observed = [];
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(function IO(cb) {
        ioCallback = cb;
        this.observe = (el) => observed.push(el);
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function mountWithSections() {
    const items = [
      { id: "s-a", label: "A", show: true },
      { id: "s-b", label: "B", show: true },
      { id: "s-c", label: "C", show: false },
    ];
    return render(
      <>
        <SectionAnchorNav items={items} ariaLabel="nav" />
        <div id="s-a" />
        <div id="s-b" />
      </>,
    );
  }

  it("marks the first shown pill current before any intersection", () => {
    mountWithSections();
    expect(pill("s-a")).toHaveAttribute("aria-current", "true");
    expect(pill("s-b")).not.toHaveAttribute("aria-current");
  });

  it("observes exactly the rendered sections of the shown pills", () => {
    mountWithSections();
    expect(observed.map((el) => el.id).sort()).toEqual(["s-a", "s-b"]);
  });

  it("moves aria-current to the section the observer reports", () => {
    mountWithSections();
    const b = document.getElementById("s-b");
    const a = document.getElementById("s-a");
    act(() => {
      ioCallback([
        { target: a, isIntersecting: false },
        { target: b, isIntersecting: true },
      ]);
    });
    expect(pill("s-b")).toHaveAttribute("aria-current", "true");
    expect(pill("s-a")).not.toHaveAttribute("aria-current");
  });

  it("pills are keyboard-reachable links to their section id", () => {
    mountWithSections();
    expect(pill("s-a").tagName).toBe("A");
    expect(pill("s-a")).toHaveAttribute("href", "#s-a");
    expect(pill("s-a")).not.toHaveAttribute("tabindex", "-1");
  });
});

describe("SectionAnchorNav — prefers-reduced-motion", () => {
  let originalMatchMedia;
  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });
  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
  });

  function clickWith(reduce) {
    window.matchMedia = vi.fn((query) => ({
      matches: query.includes("prefers-reduced-motion") ? reduce : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    render(
      <>
        <SectionAnchorNav items={[{ id: "s-x", label: "X", show: true }]} ariaLabel="nav" />
        <div id="s-x" />
      </>,
    );
    const target = document.getElementById("s-x");
    target.scrollIntoView = vi.fn();
    fireEvent.click(pill("s-x"));
    return target.scrollIntoView;
  }

  it("reduced motion → instant jump (behavior: auto)", () => {
    const spy = clickWith(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ behavior: "auto", block: "start" });
  });

  it("no preference → smooth scroll", () => {
    const spy = clickWith(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ behavior: "smooth", block: "start" });
  });

  it("a click marks that pill current", () => {
    clickWith(false);
    expect(pill("s-x")).toHaveAttribute("aria-current", "true");
  });
});
