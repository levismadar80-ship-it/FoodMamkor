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
  // MEH-1334: ProducerHeader reads the locale for the vacation return date.
  useLocale: () => "he",
}));

// ReviewExcerpt (chunk 2) is a child of ProducerHeader — stub its api so the
// header test stays isolated to the trust-strip anchor (empty reviews → the
// excerpt renders nothing, leaving the anchor as the sole link).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ default: { get: () => Promise.resolve({ data: { reviews: [] } }) } }));

// Stub the child components + Phosphor icons ProducerHeader composes.
vi.mock("@/components/BadgeRow", () => ({ default: () => <div data-testid="badge-row" /> }));
vi.mock("@/components/CategoryTag", () => ({ default: () => <span data-testid="cat" /> }));
vi.mock("@/components/KashrutBadgeStrip", () => ({ default: () => <div data-testid="kashrut" /> }));
vi.mock("@/components/TrustBadge", () => ({ default: () => <div data-testid="trust" /> }));
vi.mock("@phosphor-icons/react", async (importOriginal) => ({
  // MEH-2592: the header now renders the category's registry glyph, which
  // pulls the whole Phosphor family through lib/category-registry — keep the
  // real module and override only the stubs this file always stubbed.
  ...(await importOriginal()),
  MapPin: () => <span />,
  Heart: () => <span />,
  Star: () => <span data-testid="star" />,
  Truck: () => <span />,
  StarOfDavid: () => <span />,
  Bell: () => <span />,
}));
// MEH-1609: the header now reads auth + the favorites-cache to decide whether
// to offer the alerts re-entry control. This suite is about the trust strip,
// so it stays logged-out (control absent) — the control's own states are
// covered in ProducerHeaderAlertsReentry.test.jsx.
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(),
  isFavorited: () => false,
  subscribeFavorites: () => () => {},
}));
vi.mock("@/components/AlertPrefsPanel", () => ({
  default: () => <div data-testid="alert-prefs-panel" />,
}));
// MEH-1334: the quiet-actions row children are separately tested — stub them
// so this suite stays focused on the header's own render logic.
vi.mock("@/components/FavoriteButton", () => ({
  default: () => <button data-testid="fav-quiet" />,
}));
vi.mock("@/components/ShareButton", () => ({
  default: () => <button data-testid="share-quiet" />,
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

  // MEH-1168 P1 moved availability OUT of the header logistics line into the
  // contact-card status line / vacation+slow-response banners. The test that
  // guarded that ("does not render the availability badge in the header",
  // asserting queryByTestId("availability") is absent) was DELETED under
  // MEH-1860, not merely un-mocked: `data-testid="availability"` was produced
  // ONLY by the vi.mock factory in this file, so once the mock went the
  // assertion could never fail — it passed in every possible world, the
  // "decoration, not a guard" shape in .claude/rules/testing.md. The
  // regression it watched for is unreachable now anyway: AvailabilityBadge no
  // longer exists, so nothing can put it back in the header.
});

// MEH-2710: the declared (tier 2) header carries NO line about the badge it
// lacks — «ללא תג מאומת · מה זה אומר?» was removed (Sapir 06/11). ADR-022
// gate 1's affirmative explanation lives on /about/process. The cells assert
// on rendered text, not a testid, so a re-added line under a new testid still
// goes red: the next-intl mock echoes keys, so any producer.badge.* key or the
// Hebrew "מאומת" in the header would show up in textContent.
describe("ProducerHeader declared tier — no badge-absence line (MEH-2710)", () => {
  for (const tier of ["declared", "verified", null]) {
    it(`renders no badge-absence copy for tier=${tier}`, () => {
      const { container } = render(
        <ProducerHeader
          producer={{ ...baseProducer, verification_tier: tier }}
          primaryCategory={null}
          hasImages
        />,
      );
      expect(container.textContent).not.toMatch(/producer\.badge\.declared/);
      expect(container.textContent).not.toMatch(/ללא תג/);
      expect(screen.queryByTestId("declared-explainer-trigger")).not.toBeInTheDocument();
    });
  }
});

// MEH-1334 chunk 1: the page's single order-status line lives in the header
// meta line — 3 states (open / closed / vacation), plus the zero-reviews
// "חדש" fallback in the rating slot.
describe("ProducerHeader status line + חדש fallback (MEH-1334)", () => {
  it("renders the open status by default (accepting_orders)", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={null} hasImages />);
    expect(screen.getByTestId("status-open")).toBeInTheDocument();
    expect(screen.queryByTestId("status-closed")).not.toBeInTheDocument();
  });

  it("renders the closed status for full_this_week (and no open status)", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, availability_state: "full_this_week" }}
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.getByTestId("status-closed")).toBeInTheDocument();
    expect(screen.queryByTestId("status-open")).not.toBeInTheDocument();
  });

  it("renders the gold vacation status when on vacation", () => {
    render(
      <ProducerHeader
        producer={{
          ...baseProducer,
          availability_state: "on_vacation",
          vacation_until: "2026-08-03",
        }}
        isVacation
        vacationReturnLabel="x"
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.getByTestId("status-vacation")).toBeInTheDocument();
    expect(screen.queryByTestId("status-open")).not.toBeInTheDocument();
  });

  it("zero reviews: NOTHING in the rating slot — the MEH-1411 pill is retired (MEH-2592, 30/10/2026)", () => {
    // Wolt / Booking / Airbnb show nothing in the rating's place until a
    // review exists; a line announcing the absence only underlined it.
    render(
      <ProducerHeader
        producer={{ ...baseProducer, reviews_count: 0 }}
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.queryByTestId("new-mark")).toBeNull();
    expect(screen.queryByText("producer.detail.header.new_mark")).toBeNull();
  });
});

// MEH-1508 ch2 Phase B: the gluten production-facility line — plain text, three
// states. The next-intl mock echoes the key, so we assert on the key path.
const SHARED_KEY = "producer.detail.header.gluten_facility.shared";
const DEDICATED_KEY = "producer.detail.header.gluten_facility.dedicated";

describe("ProducerHeader gluten facility line (MEH-1508 ch2)", () => {
  it("renders the shared line (only) when gluten_free_facility === 'shared'", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, gluten_free_facility: "shared" }}
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.getByText(SHARED_KEY)).toBeInTheDocument();
    expect(screen.queryByText(DEDICATED_KEY)).not.toBeInTheDocument();
  });

  it("renders the dedicated line (only) when gluten_free_facility === 'dedicated'", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, gluten_free_facility: "dedicated" }}
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.getByText(DEDICATED_KEY)).toBeInTheDocument();
    expect(screen.queryByText(SHARED_KEY)).not.toBeInTheDocument();
  });

  it("renders NOTHING for 'unknown' (the render-nothing case)", () => {
    render(
      <ProducerHeader
        producer={{ ...baseProducer, gluten_free_facility: "unknown" }}
        primaryCategory={null}
        hasImages
      />,
    );
    expect(screen.queryByText(SHARED_KEY)).not.toBeInTheDocument();
    expect(screen.queryByText(DEDICATED_KEY)).not.toBeInTheDocument();
  });

  it("renders nothing when the field is absent (older payloads)", () => {
    render(<ProducerHeader producer={baseProducer} primaryCategory={null} hasImages />);
    expect(screen.queryByText(SHARED_KEY)).not.toBeInTheDocument();
    expect(screen.queryByText(DEDICATED_KEY)).not.toBeInTheDocument();
  });
});
