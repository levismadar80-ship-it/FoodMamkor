import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-1694 (Sapir's option ב, 13/11): the city in the header facts line links
// to the page's «הגעה ומיקום» section (Waze / Google live there) — the way
// Google's place card makes the address the way in to directions. No new copy:
// the accessible name is the city + the section's existing title.
// Cells: (location) → link to #section-location · (no location: no pin, or
// has_physical_location=false) → plain text, because that section is not
// rendered, so the link would point at nothing.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.detail.header.review_count") return `${vars?.count} ביקורות`;
    if (key === "producer.detail.sections.location") return "הגעה ומיקום";
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
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(),
  isFavorited: () => false,
  subscribeFavorites: () => () => {},
}));
vi.mock("@/components/AlertPrefsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/FavoriteButton", () => ({ default: () => <button /> }));
vi.mock("@/components/ShareButton", () => ({ default: () => <button /> }));
// The header only needs ProducerSections' location gate — stub the heavy
// section tree so this test does not pull Leaflet / the sheets.
vi.mock("@/app/[locale]/producer/[id]/components/ProducerSections", () => ({
  parseHasLocation: (producer, pin) => producer.has_physical_location !== false && pin !== null,
}));

import ProducerHeader from "@/app/[locale]/producer/[id]/components/ProducerHeader";

const base = {
  id: 7,
  name: "מאפיית רוח השדה",
  avg_rating: 0,
  reviews_count: 0,
  trust_tier: 1,
  plan: "basic",
  favorites_count: 0,
  availability_state: "accepting_orders",
  categories: [],
  city: "זכרון יעקב",
};
const withPin = { ...base, locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.57, lng: 34.95 }] };

describe("ProducerHeader city → «הגעה ומיקום» (MEH-1694)", () => {
  it("a business with a location: the city is a link to #section-location", () => {
    render(<ProducerHeader producer={withPin} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    const link = within(meta).getByTestId("producer-header-city-link");
    expect(link).toHaveAttribute("href", "#section-location");
    expect(link).toHaveTextContent("זכרון יעקב");
    expect(link).toHaveAccessibleName("זכרון יעקב · הגעה ומיקום");
  });

  it("no pin: the city stays plain text (no section to land on)", () => {
    render(<ProducerHeader producer={base} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(meta).toHaveTextContent("זכרון יעקב");
    expect(within(meta).queryByTestId("producer-header-city-link")).toBeNull();
  });

  it("has_physical_location=false: plain text even with a pin", () => {
    render(<ProducerHeader producer={{ ...withPin, has_physical_location: false }} hasImages />);
    const meta = screen.getByTestId("producer-header-meta");
    expect(within(meta).queryByTestId("producer-header-city-link")).toBeNull();
  });
});
