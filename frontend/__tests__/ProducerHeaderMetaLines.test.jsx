import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-2403: the header meta block is TWO lines — "category · city" (muted, the
// category a link to its /producers listing) and the status alone underneath.
// Cells: (category+city) · (category only) · (city only) · (neither → line 1 absent, status
// present). The status never shares a <p> with the grey words.
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
vi.mock("@/components/KashrutBadgeStrip", () => ({ default: () => <div data-testid="kashrut" /> }));
vi.mock("@phosphor-icons/react", () => ({
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

describe("ProducerHeader meta block — two lines (MEH-2403)", () => {
  it("category + city: line 1 is 'category · city' with the category linking to its listing", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    const link = within(meta).getByRole("link", { name: "חלב וגבינות" });
    expect(link).toHaveAttribute("href", "/producers?category=12");
    // Category first, city second — the Google/Yelp order, not the old city-first row.
    expect(meta.textContent.indexOf("חלב וגבינות")).toBeLessThan(meta.textContent.indexOf("יקנעם עילית"));
    // The status is NOT inside the grey line.
    expect(within(meta).queryByTestId("status-open")).toBeNull();
  });

  it("the status renders alone on its own line, keeping its MEH-1546 test id and tone", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={category} hasImages />);
    const statusLine = screen.getByTestId("producer-header-status-line");
    const status = within(statusLine).getByTestId("status-open");
    expect(status.className).toMatch(/text-primary/);
    // Nothing but the status in that line.
    expect(statusLine.textContent).toBe(status.textContent);
  });

  it("category only: line 1 is the link alone, no stray separator", () => {
    render(<ProducerHeader producer={{ ...baseProducer, city: null }} primaryCategory={category} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(within(meta).getByRole("link", { name: "חלב וגבינות" })).toHaveAttribute("href", "/producers?category=12");
    expect(meta.textContent).not.toContain("·");
    expect(meta.textContent.trim()).toBe("חלב וגבינות");
  });

  it("city only: line 1 is just the city, no link, no stray separator", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={null} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(meta).toHaveTextContent("יקנעם עילית");
    expect(within(meta).queryByRole("link")).toBeNull();
    expect(meta.textContent).not.toContain("·");
  });

  it("neither city nor category: line 1 is absent from the DOM, the status line stays", () => {
    render(<ProducerHeader producer={{ ...baseProducer, city: null }} primaryCategory={null} hasImages />);
    expect(screen.queryByTestId("producer-header-meta")).toBeNull();
    expect(screen.getByTestId("status-open")).toBeInTheDocument();
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
});
