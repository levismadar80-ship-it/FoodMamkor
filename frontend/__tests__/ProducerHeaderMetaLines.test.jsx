import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-2592 (30/10/2026, supersedes MEH-2403's two-line block): ONE facts line
// «rating · [glyph] category · city · מאז» (`producer-header-meta`) and ONE
// status line (the status alone, `producer-header-status-line`), then a tags
// row (`producer-header-tags`, the kosher chip; absent with nothing to tag).
// Cells for the facts line: (category+city) · (category only) ·
// (city only) · (neither → the line still carries the rating slot). The status
// never sits inside the facts line.
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

  it("the rating slot opens the line: «אין ביקורות עדיין» at zero reviews, before the category", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    const mark = within(meta).getByTestId("new-mark");
    expect(meta.textContent.indexOf(mark.textContent)).toBeLessThan(meta.textContent.indexOf("חלב וגבינות"));
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

  it("category only: no stray separator between the category and nothing", () => {
    render(<ProducerHeader producer={{ ...baseProducer, city: null }} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(within(meta).getByRole("link", { name: "חלב וגבינות" })).toHaveAttribute("href", "/producers?category=12");
    // new-mark · category → exactly one separator.
    expect(meta.textContent.match(/·/g)).toHaveLength(1);
  });

  it("city only: just the city after the rating slot, no link", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={null} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(meta).toHaveTextContent("יקנעם עילית");
    expect(within(meta).queryByRole("link")).toBeNull();
    expect(meta.textContent.match(/·/g)).toHaveLength(1);
  });

  it("neither city nor category: the line is only the rating slot, no separator at all", () => {
    render(<ProducerHeader producer={{ ...baseProducer, city: null }} primaryCategory={null} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(meta.textContent).not.toContain("·");
    expect(within(meta).getByTestId("new-mark")).toBeInTheDocument();
    expect(screen.getByTestId("status-open")).toBeInTheDocument();
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

  it("full this week: the grey tag is fg-muted, not muted", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, availability_state: "full_this_week" }}
        primaryCategory={category}
        hasImages
      />,
    );
    const tag = screen.getByTestId("status-closed");
    expect(tag.className).toMatch(/\btext-fg-muted\b/);
    expect(tag.className).not.toMatch(/(^|\s)text-muted(\s|$)/);
  });

  it("vacation: the tag keeps gold-deep (4.90:1 on its tint)", () => {
    render(<ProducerHeader producer={baseProducer} isVacation primaryCategory={category} hasImages />);
    const tag = screen.getByTestId("status-vacation");
    expect(tag.className).toContain("bg-[color-mix(in_srgb,currentColor_10%,transparent)]");
    expect(tag.className).toMatch(/\btext-gold-deep\b/);
  });
});
