import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * MEH-2526 — ProducerHeader mounts the permanent «קבלת עדכונים» button.
 *
 * Pins WHERE (exactly one, on every viewport — i.e. NOT inside the desktop-only
 * `hidden lg:flex` actions row) and the WIRING (it opens the page's single
 * AlertPrefsPanel through onOpenAlerts). The button's own behaviour is pinned in
 * ProducerUpdatesButton.test.jsx.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useLocale: () => "he",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: () => Promise.resolve({ data: { reviews: [] } }) },
}));
vi.mock("@/components/BadgeRow", () => ({ default: () => <div /> }));
vi.mock("@/components/KashrutBadgeStrip", () => ({ default: () => <div /> }));
vi.mock("@/components/FavoriteButton", () => ({ default: () => <button data-testid="fav" /> }));
vi.mock("@/components/ShareButton", () => ({ default: () => <button /> }));
const panel = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("@/components/AlertPrefsPanel", async () => {
  const { useEffect } = await import("react");
  return {
    default: function PanelStub() {
      useEffect(() => {
        panel.mounts += 1;
      }, []);
      return <div data-testid="alert-prefs-panel" />;
    },
  };
});
vi.mock("@phosphor-icons/react", () => ({
  Star: () => <span />,
  StarOfDavid: () => <span />,
}));

const seen = vi.hoisted(() => ({ props: [] }));
vi.mock("@/components/ProducerUpdatesButton", () => ({
  default: (props) => {
    seen.props.push(props);
    return (
      <>
        <button data-testid="producer-updates-button" onClick={() => props.onOpenAlerts?.()} />
        <button data-testid="stub-write" onClick={() => props.onChanged?.()} />
      </>
    );
  },
}));

const session = vi.hoisted(() => ({ user: null, favorited: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: session.user }) }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(),
  isFavorited: () => session.favorited,
  subscribeFavorites: () => () => {},
}));

import ProducerHeader from "@/app/[locale]/producer/[id]/components/ProducerHeader";

const producer = {
  id: "p-1",
  name: "חוות הדבש",
  reviews_count: 0,
  availability_state: "accepting_orders",
  categories: [],
  city: "תל אביב",
};

beforeEach(() => {
  seen.props = [];
  panel.mounts = 0;
  session.user = null;
  session.favorited = false;
});

describe("MEH-2526 · ProducerHeader mounts the updates button", () => {
  it("renders exactly one, outside the desktop-only actions row", () => {
    render(<ProducerHeader producer={producer} primaryCategory={null} hasImages />);
    const buttons = screen.getAllByTestId("producer-updates-button");
    expect(buttons).toHaveLength(1);
    expect(screen.getByTestId("producer-actions-row").contains(buttons[0])).toBe(false);
    // No ancestor hides it at any breakpoint.
    for (let el = buttons[0].parentElement; el; el = el.parentElement) {
      expect(el.className || "").not.toMatch(/(^|\s)hidden(\s|$)/);
    }
  });

  it("passes the producer id and the page's onOpenAlerts", () => {
    const onOpenAlerts = vi.fn();
    render(
      <ProducerHeader
        producer={producer}
        primaryCategory={null}
        hasImages
        onOpenAlerts={onOpenAlerts}
      />,
    );
    expect(seen.props.at(-1).producerId).toBe("p-1");
    fireEvent.click(screen.getByTestId("producer-updates-button"));
    expect(onOpenAlerts).toHaveBeenCalledTimes(1);
  });
});

describe("MEH-2526 · an open panel never shows prefs older than the button's write", () => {
  it("a write from the updates button re-mounts (re-reads) the open AlertPrefsPanel", async () => {
    session.user = { id: "u1" };
    session.favorited = true;
    render(
      <ProducerHeader
        producer={producer}
        primaryCategory={null}
        hasImages
        alertsOpen
        onOpenAlerts={() => {}}
        onCloseAlerts={() => {}}
      />,
    );
    await screen.findByTestId("alert-prefs-panel");
    expect(panel.mounts).toBe(1);

    fireEvent.click(screen.getByTestId("stub-write"));

    // The panel reads its prefs once, on mount; a stale mount would let its
    // Save button PUT the pre-write values back over the button's write.
    await waitFor(() => expect(panel.mounts).toBe(2));
    expect(screen.getAllByTestId("alert-prefs-panel")).toHaveLength(1);
  });
});
