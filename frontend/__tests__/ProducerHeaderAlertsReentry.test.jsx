import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * MEH-1693 — the producer page's ONE AlertPrefsPanel mount, after the bell retired.
 *
 * MEH-1609 added an alerts_reentry bell to the actions row because the panel was
 * otherwise unreachable here: FavoriteButton suppresses its inline auto-open for
 * variant="quiet" AND variant="gallery" (MEH-1334 — "a block panel inside the
 * flex row breaks the layout"), which are the only two variants this page uses.
 * MEH-1693 removed the bell and lifted the open-state to ProducerDetail, so the
 * SAVE opens the panel instead — for the desktop quiet heart and the mobile hero
 * heart alike.
 *
 * What this suite pins is unchanged in spirit: HOW MANY panels mount and WHEN.
 * The header no longer owns the state, so `alertsOpen` arrives as a prop and the
 * close paths are asserted as callbacks. The panel's internals stay out of scope.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.detail.header.review_count") return `${vars?.count} ביקורות`;
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
// Expose onFavorited so a test can fire the save the way the real heart does.
vi.mock("@/components/FavoriteButton", () => ({
  default: ({ onFavorited }) => (
    <button data-testid="fav-quiet" onClick={() => onFavorited?.()} />
  ),
}));
vi.mock("@/components/ShareButton", () => ({
  default: () => <button data-testid="share-quiet" />,
}));
// Bell is deliberately NOT in this map — if a future edit re-imports it, the
// component throws here rather than silently rendering a second entry point.
vi.mock("@phosphor-icons/react", () => ({
  MapPin: () => <span />,
  Heart: () => <span />,
  Star: () => <span />,
  Truck: () => <span />,
  StarOfDavid: () => <span />,
}));

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

const renderHeader = (props = {}) =>
  render(
    <ProducerHeader producer={producer} primaryCategory={null} hasImages {...props} />
  );

describe("ProducerHeader — single AlertPrefsPanel mount (MEH-1693)", () => {
  beforeEach(() => {
    mockUser = null;
    mockFavorited = false;
    favListeners.clear();
  });

  it("the retired bell is gone — no control, no its testid, at any state", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    renderHeader({ alertsOpen: true });
    await waitFor(() => expect(screen.getByTestId("fav-quiet")).toBeInTheDocument());
    expect(screen.queryByTestId("alerts-reentry")).not.toBeInTheDocument();
    // Assert on the i18n KEY, not the Hebrew string: the key is deleted from
    // both message twins, so the mocked useTranslations falls through to
    // echoing the key — which is what would render if the control came back
    // under a different testid. Keeping the literal here would also put Hebrew
    // copy in source, which the repo forbids outside messages/*.json.
    expect(
      screen.queryByText("producer.detail.header.alerts_reentry")
    ).not.toBeInTheDocument();
  });

  it("guest sees no panel even when the page asks for it", async () => {
    mockFavorited = true; // even if a stale cache says favorited
    renderHeader({ alertsOpen: true });
    await waitFor(() => expect(screen.getByTestId("fav-quiet")).toBeInTheDocument());
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });

  it("logged in but NOT favorited — no panel even when alertsOpen", async () => {
    mockUser = { id: "u-1" };
    renderHeader({ alertsOpen: true });
    await waitFor(() => expect(screen.getByTestId("fav-quiet")).toBeInTheDocument());
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });

  it("favorited + logged in + alertsOpen renders EXACTLY ONE panel", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    renderHeader({ alertsOpen: true });
    await waitFor(() =>
      expect(screen.getAllByTestId("alert-prefs-panel")).toHaveLength(1)
    );
  });

  it("alertsOpen=false keeps the panel closed — it is not self-opening", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    renderHeader({ alertsOpen: false });
    await waitFor(() => expect(screen.getByTestId("fav-quiet")).toBeInTheDocument());
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });

  it("the quiet heart's save asks the PAGE to open — it does not open locally", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    const onOpenAlerts = vi.fn();
    renderHeader({ alertsOpen: false, onOpenAlerts });
    const heart = await screen.findByTestId("fav-quiet");

    fireEvent.click(heart);
    expect(onOpenAlerts).toHaveBeenCalledTimes(1);
    // Still closed: the header does not own the state, so nothing opens until
    // the page flips the prop. This is the lift, asserted.
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });

  it("the panel's own onClose delegates upward", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    const onCloseAlerts = vi.fn();
    renderHeader({ alertsOpen: true, onCloseAlerts });
    await screen.findByTestId("alert-prefs-panel");

    fireEvent.click(screen.getByTestId("panel-close"));
    expect(onCloseAlerts).toHaveBeenCalled();
  });

  it("un-saving while the panel is open asks the page to close it", async () => {
    mockUser = { id: "u-1" };
    mockFavorited = true;
    const onCloseAlerts = vi.fn();
    renderHeader({ alertsOpen: true, onCloseAlerts });
    await screen.findByTestId("alert-prefs-panel");
    onCloseAlerts.mockClear();

    // A heart on ANY surface un-saves — the shared cache is the channel.
    setFavoritedExternally(false);
    await waitFor(() => expect(onCloseAlerts).toHaveBeenCalled());
    expect(screen.queryByTestId("alert-prefs-panel")).not.toBeInTheDocument();
  });
});
