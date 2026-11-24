/**
 * MEH-3785 — «הטבה» moved from עריכה › מוצרים ומחירים to its own page,
 * reached from «כלים» › «להציע ללקוחות».
 *
 * Cells: business → tile in the offer group linking to /producer/dashboard/offer,
 * and the page renders the offer form; organizer → no tile, and the page
 * sends her back to «כלים»; a failed profile fetch → an error with a retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import ToolsPage from "@/app/[locale]/producer/dashboard/tools/page";
import OfferPage from "@/app/[locale]/producer/dashboard/offer/page";

const { AUTH, ROUTER, state } = vi.hoisted(() => ({
  AUTH: { user: { id: 1, name: "דנה", role: "producer" }, loading: false },
  ROUTER: { push: () => {}, replace: () => {} },
  state: { kind: "producer", profileFails: false },
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => AUTH }));
vi.mock("next-intl", () => {
  const cache = new Map();
  const make = (ns) => {
    const t = (key) => `${ns}.${key}`;
    t.rich = (key) => `${ns}.${key}`;
    return t;
  };
  return {
    useLocale: () => "he",
    useTranslations: (ns) => {
      if (!cache.has(ns)) cache.set(ns, make(ns));
      return cache.get(ns);
    },
  };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ROUTER,
  usePathname: () => "/producer/dashboard/tools",
}));
vi.mock("@/components/producer/RequestReviewCard", () => ({ default: () => null }));
vi.mock("@/components/producer/BusinessQrCard", () => ({ default: () => null }));
vi.mock("@/components/producer/ShareKitSection", () => ({ default: () => null }));
vi.mock("@/lib/rescue", () => ({ rescueBagsEnabled: () => false }));
vi.mock("@/hooks/useWhatsNew", () => ({ useNewTools: () => new Set() }));
vi.mock("@/app/[locale]/producer/dashboard/edit/cards/OffersCard", () => ({
  OffersCard: ({ profile }) => <div data-testid="offers-card-stub">{profile.name}</div>,
}));
const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));

beforeEach(() => {
  state.kind = "producer";
  state.profileFails = false;
  ROUTER.replace = vi.fn();
  get.mockImplementation((url) => {
    if (url === "/producers/me/dashboard") {
      return Promise.resolve({ data: { producer: { id: "7", name: "חוות ערוגות נועם", status: "approved" } } });
    }
    if (url === "/producers/me") {
      if (state.profileFails) return Promise.reject(new Error("network"));
      return Promise.resolve({ data: { id: 7, name: "חוות ערוגות נועם", slug: "arugot-noam", status: "approved", kind: state.kind, images: [], categories: [] } });
    }
    return Promise.resolve({ data: [] });
  });
});

describe("«כלים» › «להציע ללקוחות» carries «הטבה» (MEH-3785)", () => {
  it("a business sees the offer tile, linking to its page", async () => {
    render(<ToolsPage />);
    const group = await screen.findByTestId("tools-group-offer");
    const tile = await within(group).findByTestId("tools-offer-tile");
    expect(tile.getAttribute("href")).toBe("/producer/dashboard/offer");
    expect(tile.textContent).toContain("producer.offer.card_title");
  });

  it("an organizer has no offer tile", async () => {
    state.kind = "organizer";
    AUTH.user = { ...AUTH.user, producer_kind: "organizer" };
    render(<ToolsPage />);
    await screen.findByTestId("tools-group-offer");
    expect(screen.queryByTestId("tools-offer-tile")).toBeNull();
    AUTH.user = { id: 1, name: "דנה", role: "producer" };
  });
});

describe("the offer page (MEH-3785)", () => {
  it("renders the offer form with the owner's profile", async () => {
    render(<OfferPage />);
    expect((await screen.findByTestId("offers-card-stub")).textContent).toBe("חוות ערוגות נועם");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("producer.offer.card_title");
  });

  it("sends an organizer back to «כלים»", async () => {
    state.kind = "organizer";
    render(<OfferPage />);
    await waitFor(() => expect(ROUTER.replace).toHaveBeenCalledWith("/producer/dashboard/tools"));
    expect(screen.queryByTestId("offers-card-stub")).toBeNull();
  });

  it("a failed profile fetch shows an error, and retry loads the form", async () => {
    state.profileFails = true;
    render(<OfferPage />);
    const alert = await screen.findByTestId("offer-page-error");
    state.profileFails = false;
    fireEvent.click(within(alert).getByRole("button"));
    expect(await screen.findByTestId("offers-card-stub")).toBeTruthy();
  });
});
