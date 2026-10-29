import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * MEH-2526 — ProducerHeader mounts the permanent «קבלת עדכונים» button.
 * MEH-2562 moved it: desktop = quiet variant inside the actions row; mobile =
 * a circle on the hero (ImageGallery), so the header has no below-lg mount.
 *
 * Pins WHERE and the WIRING (it opens the page's single AlertPrefsPanel through
 * onOpenAlerts; writes reach the page through onUpdatesChanged). The button's own behaviour is pinned in
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

describe("MEH-2562 · ProducerHeader mounts the updates bell in the quiet actions row", () => {
  it("renders exactly one, the quiet variant, inside the desktop actions row", () => {
    render(<ProducerHeader producer={producer} primaryCategory={null} hasImages />);
    const buttons = screen.getAllByTestId("producer-updates-button");
    expect(buttons).toHaveLength(1);
    // Mobile gets its own circle on the hero (ImageGallery); a second header
    // mount below lg would be the orphaned pill MEH-2562 removed.
    expect(screen.getByTestId("producer-actions-row").contains(buttons[0])).toBe(true);
    expect(seen.props.at(-1).variant).toBe("quiet");
  });

  it("passes the producer id, the page's onOpenAlerts, onUpdatesChanged and updatesSignal", () => {
    const onOpenAlerts = vi.fn();
    const onUpdatesChanged = vi.fn();
    render(
      <ProducerHeader
        producer={producer}
        primaryCategory={null}
        hasImages
        onOpenAlerts={onOpenAlerts}
        onUpdatesChanged={onUpdatesChanged}
        updatesSignal="true:3"
      />,
    );
    expect(seen.props.at(-1).producerId).toBe("p-1");
    expect(seen.props.at(-1).refreshSignal).toBe("true:3");
    fireEvent.click(screen.getByTestId("producer-updates-button"));
    expect(onOpenAlerts).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("stub-write"));
    expect(onUpdatesChanged).toHaveBeenCalledTimes(1);
  });
});

describe("MEH-2526 · an open panel never shows prefs older than the button's write", () => {
  it("a new panelKey from the page re-mounts (re-reads) the open AlertPrefsPanel", async () => {
    session.user = { id: "u1" };
    session.favorited = true;
    const props = {
      producer,
      primaryCategory: null,
      hasImages: true,
      alertsOpen: true,
      onOpenAlerts: () => {},
      onCloseAlerts: () => {},
    };
    const { rerender } = render(<ProducerHeader {...props} panelKey={0} />);
    await screen.findByTestId("alert-prefs-panel");
    expect(panel.mounts).toBe(1);

    // The page bumps panelKey after any bell write (hero circle or this row).
    // A stale mount would let the panel's Save PUT the pre-write values back.
    rerender(<ProducerHeader {...props} panelKey={1} />);

    await waitFor(() => expect(panel.mounts).toBe(2));
    expect(screen.getAllByTestId("alert-prefs-panel")).toHaveLength(1);
  });
});
