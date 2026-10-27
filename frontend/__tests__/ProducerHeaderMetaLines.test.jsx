import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-2403: the header meta block is TWO lines — "category · city" (muted, the
// category a link to its /producers listing) and the status alone underneath.
// Cells: (category+city) · (city only) · (neither → line 1 absent, status
// present). The status never shares a <p> with the grey words.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.detail.header.review_count") return `${vars?.count} ביקורות`;
    return key;
  },
  useLocale: () => "he",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
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
