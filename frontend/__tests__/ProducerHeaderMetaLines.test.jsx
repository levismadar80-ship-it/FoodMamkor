import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-2592 (30/10/2026, supersedes MEH-2403's two-line block): ONE facts line
// «rating · [glyph] category · city · מאז» (`producer-header-meta`) and ONE
// status line (the status alone, `producer-header-status-line`), then a tags
// row (`producer-header-tags`, the kosher chip; absent with nothing to tag).
// Cells for the facts line: (category+city) · (category only) ·
// (city only) · (neither, no reviews → the line is absent). At zero reviews
// the rating slot is EMPTY — no «אין ביקורות עדיין» pill (Sapir, 30/10). The
// status never sits inside the facts line.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.detail.header.review_count") return `${vars?.count} ביקורות`;
    return key;
  },
  useLocale: () => "he",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({ default: { get: () => Promise.resolve({ data: { reviews: [] } }) } }));
vi.mock("@/components/BadgeRow", () => ({ default: () => <div data-testid="badge-row" /> }));
vi.mock("@/components/KashrutBadgeStrip", () => ({
  default: ({ className }) => <div data-testid="kashrut" className={className} />,
}));
vi.mock("@phosphor-icons/react", async (importOriginal) => ({
  // The category glyph pulls the real Phosphor family through
  // lib/category-registry — keep it and override only the long-standing stubs.
  ...(await importOriginal()),
  MapPin: () => <span />,
  Heart: () => <span />,
  Star: () => <span data-testid="star" />,
  Truck: () => <span />,
  StarOfDavid: () => <span />,
  Bell: () => <span />,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(),
  isFavorited: () => false,
  subscribeFavorites: () => () => {},
}));
vi.mock("@/components/AlertPrefsPanel", () => ({ default: () => <div data-testid="alert-prefs-panel" /> }));
vi.mock("@/components/FavoriteButton", () => ({ default: () => <button data-testid="fav-quiet" /> }));
vi.mock("@/components/ShareButton", () => ({ default: () => <button data-testid="share-quiet" /> }));

import ProducerHeader from "@/app/[locale]/producer/[id]/components/ProducerHeader";

const baseProducer = {
  id: 7,
  name: "מחלבת רמת יותם",
  avg_rating: 0,
  reviews_count: 0,
  trust_tier: 1,
  plan: "basic",
  favorites_count: 0,
  availability_state: "accepting_orders",
  categories: [],
  city: "יקנעם עילית",
};
const category = { id: 12, name: "חלב וגבינות" };

describe("ProducerHeader facts line (MEH-2592)", () => {
  it("category + city: «category · city» with the category linking to its listing, the status outside", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    const link = within(meta).getByRole("link", { name: "חלב וגבינות" });
    expect(link).toHaveAttribute("href", "/producers?category=12");
    // Category first, city second — the Google/Yelp order, not the old city-first row.
    expect(meta.textContent.indexOf("חלב וגבינות")).toBeLessThan(meta.textContent.indexOf("יקנעם עילית"));
    expect(within(meta).queryByTestId("status-open")).toBeNull();
  });

  it("zero reviews: no pill, no anchor — the line opens with the category, one «·» before the city", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(within(meta).queryByTestId("new-mark")).toBeNull();
    expect(within(meta).queryByTestId("trust-strip-rating")).toBeNull();
    expect(meta.textContent).not.toContain("producer.detail.header.new_mark");
    expect(meta.textContent.trim().startsWith("חלב וגבינות")).toBe(true);
    expect(meta.textContent.match(/·/g)).toHaveLength(1);
  });

  it("with reviews the #reviews anchor opens the line, separated from the category by one «·»", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, avg_rating: 4.8, reviews_count: 12 }}
        primaryCategory={category}
        hasImages
      />,
    );
    const meta = screen.getByTestId("producer-header-meta");
    const anchor = within(meta).getByTestId("trust-strip-rating");
    expect(anchor).toHaveAttribute("href", "#reviews");
    // rating · category · city → exactly two separators.
    expect(meta.textContent.match(/·/g)).toHaveLength(2);
    expect(meta.textContent.indexOf("4.8")).toBeLessThan(meta.textContent.indexOf("חלב וגבינות"));
  });

  it("the category carries its registry glyph in the category's own colour", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={{ id: 3, name: "לחמים ואפייה" }} hasImages />);
    const link = screen.getByTestId("producer-header-category-link");
    const glyph = within(link).getByTestId("producer-header-category-glyph");
    // CATEGORY_STYLES["לחמים ואפייה"].color — the same colour as its map pin.
    expect(glyph.style.color).toBe("rgb(137, 103, 20)");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
  });

  it("MEH-2831: the category name is underlined WITHOUT hover (phones have none); the glyph is not; the rating keeps its own", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, avg_rating: 4.8, reviews_count: 12 }}
        primaryCategory={{ id: 3, name: "לחמים ואפייה" }}
        hasImages
      />,
    );
    const link = screen.getByTestId("producer-header-category-link");
    const name = within(link).getByTestId("producer-header-category-name");
    const cls = (el) => (el.getAttribute("class") || "").split(/\s+/);
    // The permanent cue is the bare `underline`, not a hover:/group-hover: variant.
    expect(cls(name)).toContain("underline");
    expect(cls(name)).toEqual(expect.arrayContaining(["decoration-text/35", "underline-offset-[5px]", "group-hover:decoration-primary"]));
    expect(name).toHaveTextContent("לחמים ואפייה");
    expect(cls(link)).not.toContain("hover:underline");
    expect(cls(within(link).getByTestId("producer-header-category-glyph"))).not.toContain("underline");
    const ratingCount = within(screen.getByTestId("trust-strip-rating")).getByText(/ביקורות|review_count/);
    expect(cls(ratingCount)).toEqual(expect.arrayContaining(["underline", "underline-offset-4"]));
  });

  it("an unknown category gets a link but no glyph (no fallback Leaf)", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={{ id: 99, name: "קטגוריה חדשה" }} hasImages />);
    const link = screen.getByTestId("producer-header-category-link");
    expect(link).toHaveTextContent("קטגוריה חדשה");
    expect(within(link).queryByTestId("producer-header-category-glyph")).toBeNull();
  });

  it("«מאז {שנה}» closes the line, after the city, with the year dir=ltr", () => {
    render(<ProducerHeader producer={{ ...baseProducer, established_year: 1998 }} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    const since = within(meta).getByTestId("established-year");
    expect(meta.textContent.indexOf("יקנעם עילית")).toBeLessThan(meta.textContent.indexOf(since.textContent));
    expect(within(since).getByText("1998")).toHaveAttribute("dir", "ltr");
  });

  it("category only (no reviews): the link alone, no separator", () => {
    render(<ProducerHeader producer={{ ...baseProducer, city: null }} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(within(meta).getByRole("link", { name: "חלב וגבינות" })).toHaveAttribute("href", "/producers?category=12");
    expect(meta.textContent).not.toContain("·");
    expect(meta.textContent.trim()).toBe("חלב וגבינות");
  });

  it("city only (no reviews): just the city, no link, no separator", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={null} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(meta.textContent.trim()).toBe("יקנעם עילית");
    expect(within(meta).queryByRole("link")).toBeNull();
  });

  it("neither city nor category nor reviews: the line is absent from the DOM, the status stays", () => {
    render(<ProducerHeader producer={{ ...baseProducer, city: null }} primaryCategory={null} hasImages />);
    expect(screen.queryByTestId("producer-header-meta")).toBeNull();
    expect(screen.getByTestId("status-open")).toBeInTheDocument();
  });

  it("reviews but neither city nor category: the line is the rating anchor alone, no separator", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, city: null, avg_rating: 4.8, reviews_count: 12 }}
        primaryCategory={null}
        hasImages
      />,
    );
    const meta = screen.getByTestId("producer-header-meta");
    expect(within(meta).getByTestId("trust-strip-rating")).toBeInTheDocument();
    expect(meta.textContent).not.toContain("·");
  });
});

describe("ProducerHeader status line + tags row (MEH-2592)", () => {
  it("the status renders alone on its own line, keeping its MEH-1546 id and tone", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={category} hasImages />);
    const statusLine = screen.getByTestId("producer-header-status-line");
    const status = within(statusLine).getByTestId("status-open");
    expect(status.className).toMatch(/text-primary/);
    expect(statusLine.textContent).toBe(status.textContent);
  });

  it("no kosher data: no tags row at all (no empty gap under the status)", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={category} hasImages />);
    expect(screen.queryByTestId("producer-header-tags")).toBeNull();
  });

  it("with kashrut badges: ONE outlined kosher chip in the tags row, BELOW the status line", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, kashrut_badges: ["badatz", "mehadrin"] }}
        primaryCategory={category}
        hasImages
      />,
    );
    const row = screen.getByTestId("producer-header-tags");
    const kosher = within(row).getByTestId("kashrut");
    expect(row.children).toHaveLength(1);
    expect(kosher.className).toMatch(/\bborder-border\b/);
    expect(kosher.className).toMatch(/\brounded-full\b/);
    const statusLine = screen.getByTestId("producer-header-status-line");
    expect(statusLine.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(statusLine).queryByTestId("kashrut")).toBeNull();
  });

  it("the generic «כשר» fallback renders as the same chip in the tags row", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, kashrut_badges: [], kashrut_verified_at: "2026-01-01T00:00:00", kashrut_expires_at: null }}
        primaryCategory={category}
        hasImages
      />,
    );
    const row = screen.getByTestId("producer-header-tags");
    const kosher = within(row).getByText("producer.detail.header.attr.kosher");
    expect(row.children).toHaveLength(1);
    expect(kosher.className).toMatch(/\brounded-full\b/);
  });

  it("the gluten sentence stays plain text BELOW the status, never a tag", () => {
    render(
      <ProducerHeader producer={{ ...baseProducer, gluten_free_facility: "shared" }} primaryCategory={category} hasImages />,
    );
    const statusLine = screen.getByTestId("producer-header-status-line");
    const gluten = screen.getByTestId("gluten-facility-shared");
    expect(screen.queryByTestId("producer-header-tags")).toBeNull();
    expect(statusLine.compareDocumentPosition(gluten) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// PR #3974: with products, the facility sentence moves to the products section.
describe("ProducerHeader gluten facility line — products present vs none", () => {
  it("no products: the header shows it", () => {
    render(<ProducerHeader producer={{ ...baseProducer, products: [], gluten_free_facility: "shared" }} primaryCategory={category} hasImages />);
    expect(screen.getByTestId("gluten-facility-shared")).toBeInTheDocument();
  });
  it("one product or more: the header does not", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, products: [{ id: 1, name: "לחם" }], gluten_free_facility: "shared" }}
        primaryCategory={category}
        hasImages
      />,
    );
    expect(screen.queryByTestId("gluten-facility-shared")).toBeNull();
  });
});

// MEH-2518: the generic «כשר» fallback (no badge codes) shares the strip's
// expiry gate. It used to read kashrut_verified_at only, so a lapsed
// certificate still said «כשר». Cells: (current) · (lapsed) · (legacy NULL expiry).
describe("ProducerHeader kosher fallback line — expiry gate (MEH-2518)", () => {
  const verified = { ...baseProducer, kashrut_badges: [], kashrut_verified_at: "2026-01-01T00:00:00" };
  const KOSHER = "producer.detail.header.attr.kosher";

  it("current certificate: the line renders", () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    render(<ProducerHeader producer={{ ...verified, kashrut_expires_at: future }} primaryCategory={category} hasImages />);
    expect(screen.getByText(KOSHER)).toBeInTheDocument();
  });

  it("lapsed certificate: the line is absent", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    render(<ProducerHeader producer={{ ...verified, kashrut_expires_at: past }} primaryCategory={category} hasImages />);
    expect(screen.queryByText(KOSHER)).toBeNull();
  });

  it("naive-UTC wire format (no Z) is read as UTC, not local time", () => {
    // The backend sends kashrut_expires_at without a zone. 2h ago in UTC,
    // spelled the way the API spells it: lapsed in every viewer timezone.
    const past = new Date(Date.now() - 2 * 3600000).toISOString().replace("Z", "");
    render(<ProducerHeader producer={{ ...verified, kashrut_expires_at: past }} primaryCategory={category} hasImages />);
    expect(screen.queryByText(KOSHER)).toBeNull();
  });

  it("legacy NULL expiry (MEH-1260): the line renders", () => {
    render(<ProducerHeader producer={{ ...verified, kashrut_expires_at: null }} primaryCategory={category} hasImages />);
    expect(screen.getByText(KOSHER)).toBeInTheDocument();
  });
});

// MEH-2596: the status renders as a tinted tag, and the grey state uses the
// darker fg-muted inside it (muted is 4.33:1 on its own 10% tint).
describe("ProducerHeader status tag (MEH-2596)", () => {
  it("open: a tinted tag in primary", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={category} hasImages />);
    const tag = screen.getByTestId("status-open");
    expect(tag.className).toContain("bg-[color-mix(in_srgb,currentColor_10%,transparent)]");
    expect(tag.className).toMatch(/\btext-primary\b/);
  });

  it("MEH-2759: full_this_week no longer greys the tag — it reads as open", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, availability_state: "full_this_week" }}
        primaryCategory={category}
        hasImages
      />,
    );
    expect(screen.queryByTestId("status-closed")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-open")).toBeInTheDocument();
  });

  it("vacation: the tag keeps gold-deep (4.90:1 on its tint)", () => {
    render(<ProducerHeader producer={baseProducer} isVacation primaryCategory={category} hasImages />);
    const tag = screen.getByTestId("status-vacation");
    expect(tag.className).toContain("bg-[color-mix(in_srgb,currentColor_10%,transparent)]");
    expect(tag.className).toMatch(/\btext-gold-deep\b/);
  });
});

// MEH-3033 (Sapir chose א, 13/11): the distance is its own fact after the
// city — «עיר · 3.2 ק"מ» — the same label as the cards (formatDistance, no
// «ממך», MEH-1307), measured to the NEAREST location row (producerPoints),
// and only when the visitor's location is already cached. Never asks.
describe("ProducerHeader distance fact (MEH-3033)", () => {
  const LOC_KEY = "user_location";
  // Haifa → the business's two rows: ~850 m (not primary) and ~20 km (primary).
  const near = { id: 1, kind: "branch", is_primary: false, lat: 32.8100, lng: 34.9950 };
  const far = { id: 2, kind: "branch", is_primary: true, lat: 32.6500, lng: 35.1000 };
  const withLocs = { ...baseProducer, locations: [far, near] };
  afterEach(() => localStorage.removeItem(LOC_KEY));

  it("no cached location: no distance, nothing asks for one", () => {
    render(<ProducerHeader producer={withLocs} primaryCategory={category} hasImages />);
    expect(screen.queryByTestId("producer-header-distance")).toBeNull();
  });

  it("cached location: the distance follows the city, to the NEAREST row, with no «ממך»", () => {
    localStorage.setItem(LOC_KEY, JSON.stringify({ lat: 32.8040, lng: 34.9890 }));
    render(<ProducerHeader producer={withLocs} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    const d = within(meta).getByTestId("producer-header-distance");
    // 850 m to the near (non-primary) row — not the ~20 km primary row.
    expect(d.textContent).toBe("850 מ'");
    expect(d.textContent).not.toContain("ממך");
    expect(meta.textContent.indexOf("יקנעם עילית")).toBeLessThan(meta.textContent.indexOf(d.textContent));
  });

  it("cached location but no usable location row (delivery-only): no distance", () => {
    localStorage.setItem(LOC_KEY, JSON.stringify({ lat: 32.8040, lng: 34.9890 }));
    render(<ProducerHeader producer={{ ...baseProducer, locations: [] }} primaryCategory={category} hasImages />);
    expect(screen.queryByTestId("producer-header-distance")).toBeNull();
  });

  it("the distance is its own fact, not inside the city span (MEH-1694 links the city)", () => {
    localStorage.setItem(LOC_KEY, JSON.stringify({ lat: 32.8040, lng: 34.9890 }));
    render(<ProducerHeader producer={withLocs} primaryCategory={category} hasImages />);
    const d = screen.getByTestId("producer-header-distance");
    expect(d.textContent).not.toContain("יקנעם");
    expect(d.getAttribute("dir")).toBe("rtl");
  });
});
