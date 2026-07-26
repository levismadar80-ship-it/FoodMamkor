import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * MEH-1609 — the producer page's re-entry point into the MEH-54 AlertPrefsPanel.
 *
 * Before this, the panel was reachable from the producer page only in the
 * instant after a save — and not even then on this surface: FavoriteButton.jsx
 * suppresses the auto-open for variant="quiet" (MEH-1334, "a block panel inside
 * the flex row breaks the layout"). So there is exactly ONE panel owner on this
 * page, the header, and these tests pin that: the control appears only for a
 * logged-in user who has saved the business, toggles exactly one panel, and
 * unmounts cleanly when the save is undone.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.detail.header.review_count") return `${vars?.count} ביקורות`;
    if (key === "producer.detail.header.alerts_reentry") return "מקבלת עדכונים · לעריכה";
    if (key === "producer.detail.header.alerts_reentry_aria") return "עריכת העדפות עדכונים";
    return key;
  },
  useLocale: () => "he",
}));

vi.mock("@/lib/api", () => ({
  default: { get: () => Promise.resolve({ data: { reviews: [] } }) },
}));

vi.mock("@/components/AvailabilityBadge", () => ({ default: () => <div /> }));
vi.mock("@/components/BadgeRow", () => ({ default: () => <div /> }));
vi.mock("@/components/CategoryTag", () => ({ default: () => <span /> }));
vi.mock("@/components/KashrutBadgeStrip", () => ({ default: () => <div /> }));
vi.mock("@/components/TrustBadge", () => ({ default: () => <div /> }));
vi.mock("@/components/FavoriteButton", () => ({
  default: () => <button data-testid="fav-quiet" />,
}));
vi.mock("@/components/ShareButton", () => ({
  default: () => <button data-testid="share-quiet" />,
}));
vi.mock("@phosphor-icons/react", () => ({
  MapPin: () => <span />,
  Heart: () => <span />,
  Star: () => <span />,
  Truck: () => <span />,
  StarOfDavid: () => <span />,
  Bell: () => <span data-testid="bell-glyph" />,
}));

// The real panel pulls in api/auth/push plumbing — stub it. What this suite
// asserts is HOW MANY panels mount and WHEN, never the panel's internals
// (AlertPrefsPanel is explicitly out of scope for MEH-1609).
vi.mock("@/components/AlertPrefsPanel", () => ({
  default: ({ onClose }) => (
    <div data-testid="alert-prefs-panel">
      <button data-testid="panel-close" onClick={onClose} />
    </div>
  ),
}));

// Mutable auth + favorites doubles so each case can set its own state.
let mockUser = null;
let mockFavorited = false;
const favListeners = new Set();

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(),
  isFavorited: () => mockFavorited,
  subscribeFavorites: (fn) => {
    favListeners.add(fn);
    return () => favListeners.delete(fn);
  },
}));

/** Flip the shared favorites-cache the way a heart elsewhere on the page would. */
function setFavoritedExternally(next) {
  mockFavorited = next;
  favListeners.forEach((fn) => fn());
}

import ProducerHeader from "@/app/[locale]/producer/[id]/components/ProducerHeader";

const producer = {
  id: "p-1",
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

const renderHeader = () =>
  render(<ProducerHeader producer={producer} primaryCategory={null} hasImages />);

describe("ProducerHeader — AlertPrefsPanel re-entry (MEH-1609)", () => {
  beforeEach(() => {
    mockUser = null;
    mockFavorited = false;
    favListeners.clear();
  });

  it("guest sees no control and no panel — 0 in DOM", async () => {
    mockFavorited = true; // even if a stale cache says favorited
    renderHeader();
    await waitFor(() => expect(screen.getByTestId("fav-quiet")).toBeInTheDocument());
    expect(screen.queryByTestId("alerts-reentry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });

  it("logged in but NOT favorited — 0 in DOM", async () => {
    mockUser = { id: "u-1" };
    renderHeader();
    await waitFor(() => expect(screen.getByTestId("fav-quiet")).toBeInTheDocument());
    expect(screen.queryByTestId("alerts-reentry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });

  it("favorited + logged in shows exactly ONE control, collapsed", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    renderHeader();
    const control = await screen.findByTestId("alerts-reentry");
    expect(screen.getAllByTestId("alerts-reentry")).toHaveLength(1);
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(control).toHaveAttribute("aria-label", "עריכת העדפות עדכונים");
    expect(control).toHaveTextContent("מקבלת עדכונים · לעריכה");
    // Collapsed by default — the panel is a disclosure, not an auto-open.
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });

  it("tap opens EXACTLY ONE panel, and tapping again closes it", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    renderHeader();
    const control = await screen.findByTestId("alerts-reentry");

    fireEvent.click(control);
    expect(screen.getAllByTestId("alert-prefs-panel")).toHaveLength(1);
    expect(control).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(control);
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
    expect(control).toHaveAttribute("aria-expanded", "false");
  });

  it("the panel's own onClose collapses the control", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    renderHeader();
    const control = await screen.findByTestId("alerts-reentry");
    fireEvent.click(control);

    fireEvent.click(screen.getByTestId("panel-close"));
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
    expect(control).toHaveAttribute("aria-expanded", "false");
  });

  it("un-favoriting while the panel is open unmounts BOTH, and re-saving does not silently re-open", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    renderHeader();
    const control = await screen.findByTestId("alerts-reentry");
    fireEvent.click(control);
    expect(screen.getByTestId("alert-prefs-panel")).toBeInTheDocument();

    // The heart elsewhere on the page removes the favorite.
    setFavoritedExternally(false);
    await waitFor(() => {
      expect(screen.queryByTestId("alerts-reentry")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();

    // Re-saving brings the control back COLLAPSED — a stale `alertsOpen` would
    // otherwise re-open the panel with no user intent.
    setFavoritedExternally(true);
    const back = await screen.findByTestId("alerts-reentry");
    expect(back).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });
});
