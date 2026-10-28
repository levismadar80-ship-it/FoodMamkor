import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
vi.mock("@/components/AlertPrefsPanel", () => ({
  default: () => <div data-testid="alert-prefs-panel" />,
}));
vi.mock("@phosphor-icons/react", () => ({
  Star: () => <span />,
  StarOfDavid: () => <span />,
}));

const seen = vi.hoisted(() => ({ props: [] }));
vi.mock("@/components/ProducerUpdatesButton", () => ({
  default: (props) => {
    seen.props.push(props);
    return (
      <button data-testid="producer-updates-button" onClick={() => props.onOpenAlerts?.()} />
    );
  },
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(),
  isFavorited: () => false,
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
