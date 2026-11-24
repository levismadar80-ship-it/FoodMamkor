/**
 * MEH-2880 + MEH-2882 PR 1 — the share surfaces, against the REAL response
 * shapes: GET /producers/me/dashboard has no `slug`; GET /producers/me does.
 *
 * Home (daily): «לצפייה בעמוד שלך» renders from the profile's slug. Since
 * MEH-3767 «הלינק שלי» sits on «שיתוף», first, with its share-gate (complete
 * AND approved, else the locked hint); the home carries none of the three.
 * «שיתוף» (one-time / occasional): the QR card and «ערכת שיתוף» on a page of
 * their own since MEH-3749, reached from one «שיתוף» tile in «כלים»;
 * approved business only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ProducerDashboardPage from "@/app/[locale]/producer/dashboard/page";
import ToolsPage from "@/app/[locale]/producer/dashboard/tools/page";
import SharePage from "@/app/[locale]/producer/dashboard/share/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
// A stable user object, as the real AuthProvider gives: the tools page's fetch
// effect depends on `user`, and a fresh object per render would refetch forever.
const { AUTH } = vi.hoisted(() => ({ AUTH: { user: { id: 1, name: "דנה", role: "producer" }, loading: false } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => AUTH }));
vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return { useLocale: () => "he", useTranslations: () => t };
});
// One stable router, so a test can see where the share page sent the owner.
const { ROUTER } = vi.hoisted(() => ({ ROUTER: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ROUTER,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/StoryCardCanvas", () => ({ default: () => <div data-testid="story-card-canvas-stub" /> }));
vi.mock("@/components/ReviewCardCanvas", () => ({ default: () => <div data-testid="review-card-canvas-stub" /> }));
vi.mock("@/components/producer/RequestReviewCard", () => ({ default: () => null }));
vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/components/PhoneVerifyCard", () => ({ default: () => null }));
vi.mock("@/components/ProfileCompletenessCard", () => ({ default: () => null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));
vi.mock("@/components/HolidayIcon", () => ({ default: () => null }));

const { stateRef } = vi.hoisted(() => ({ stateRef: { current: { status: "approved", complete: true, kind: "producer", profileFails: false } } }));

vi.mock("@/lib/producer-completeness", () => ({
  producerCompleteness: () => ({ missing: stateRef.current.complete ? [] : ["city"], priority: "green" }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        // The real payload (producer_me.py): no slug, no images, no categories.
        return Promise.resolve({
          data: {
            producer: { id: "7", name: "חוות ערוגות נועם", availability_state: "accepting_orders", vacation_until: null, status: stateRef.current.status, plan: "free" },
            favorites_count: 0,
            whatsapp_clicks_week: 0,
          },
        });
      }
      if (url === "/producers/me/analytics") return Promise.resolve({ data: stateRef.current.analytics ?? null });
      if (url === "/producers/me") {
        if (stateRef.current.profileFails) return Promise.reject(new Error("network"));
        return Promise.resolve({
          data: { id: 7, name: "חוות ערוגות נועם", slug: stateRef.current.noSlug ? null : "arugot-noam", status: stateRef.current.status, kind: stateRef.current.kind, images: [], categories: [] },
        });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
  },
}));

beforeEach(() => {
  stateRef.current = { status: "approved", complete: true, kind: "producer", profileFails: false };
  AUTH.user = { id: 1, name: "דנה", role: "producer" };
  ROUTER.push.mockClear();
  ROUTER.replace.mockClear();
});

describe("home — no second page link and no share surface (MEH-2880 · MEH-3767 · MEH-3783)", () => {
  it("an approved, complete business sees no view-public link on home (the tab bar's eye is the one)", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.queryByTestId("view-public-link")).toBeNull();
  });

  it("no share surface on home: no «הלינק שלי», no QR card, no «ערכת שיתוף» (MEH-3767)", async () => {
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    expect(screen.queryByTestId("vanity-share")).toBeNull();
    expect(screen.queryByTestId("business-qr-card")).toBeNull();
    expect(screen.queryByTestId("share-kit-section")).toBeNull();
  });
});

describe("home — the numbers come before the status switch (MEH-3076)", () => {
  it("the numbers' slot renders above «מצב נוכחי»", async () => {
    stateRef.current = { ...stateRef.current, analytics: {} };
    render(<ProducerDashboardPage />);
    const numbers = await screen.findByTestId("overview-zero-state");
    const status = await screen.findByTestId("availability-pause-switch");
    expect(numbers.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("«שיתוף» — «הלינק שלי» first, with its share-gate (MEH-3767)", () => {
  it("approved + complete: the link card comes before the QR card", async () => {
    render(<SharePage />);
    const link = await screen.findByTestId("vanity-share");
    await waitFor(() => expect(screen.queryByTestId("business-qr-card")).not.toBeNull());
    const qr = screen.getByTestId("business-qr-card");
    expect(link.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/\/p\/arugot-noam/)).toBeInTheDocument();
    expect(screen.queryByTestId("share-locked-hint")).toBeNull();
  });

  it("approved + incomplete: the locked hint instead of the link", async () => {
    stateRef.current = { ...stateRef.current, complete: false };
    render(<SharePage />);
    expect(await screen.findByTestId("share-locked-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("vanity-share")).toBeNull();
  });

  it("approved + complete but no slug yet: neither the link nor the locked hint, the rest of the page stays", async () => {
    stateRef.current = { ...stateRef.current, noSlug: true };
    render(<SharePage />);
    await screen.findByTestId("share-page-content");
    expect(screen.queryByTestId("vanity-share")).toBeNull();
    expect(screen.queryByTestId("share-locked-hint")).toBeNull();
  });

  it("«שתפו» opens the share sheet with the /p/{slug} link as url (MEH-2876)", async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });
    try {
      render(<SharePage />);
      fireEvent.click(await screen.findByTestId("vanity-share"));
      expect(shareSpy).toHaveBeenCalledTimes(1);
      expect(shareSpy.mock.calls[0][0].url).toMatch(/\/p\/arugot-noam$/);
    } finally {
      delete navigator.share;
    }
  });
});

describe("«שיתוף» — its own page, one tile in «כלים» (MEH-3749)", () => {
  it("approved: «כלים» has the «שיתוף» tile and no QR card or share kit of its own", async () => {
    render(<ToolsPage />);
    const tile = await screen.findByTestId("tools-share-tile");
    expect(tile.getAttribute("href")).toBe("/producer/dashboard/share");
    expect(screen.queryByTestId("business-qr-card")).toBeNull();
    expect(screen.queryByTestId("share-kit-section")).toBeNull();
  });

  it("approved: the share page holds the QR card and the share kit", async () => {
    render(<SharePage />);
    const content = await screen.findByTestId("share-page-content");
    await waitFor(() => expect(content.querySelector('[data-testid="business-qr-card"]')).not.toBeNull());
    expect(content.querySelector('[data-testid="share-kit-section"]')).not.toBeNull();
  });

  it("pending: no tile in «כלים», and the share page says it waits for approval", async () => {
    stateRef.current = { ...stateRef.current, status: "pending" };
    const { unmount } = render(<ToolsPage />);
    await screen.findByTestId("tools-grid");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("tools-share-tile")).toBeNull();
    unmount();
    render(<SharePage />);
    expect(await screen.findByTestId("share-page-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("share-page-content")).toBeNull();
  });
});

describe("review of #4263 — the gates on the slug's new source", () => {
  it("a business that is not approved (slug kept from before) gets no view-public link — the public route would 404", async () => {
    stateRef.current = { ...stateRef.current, status: "inactive" };
    render(<ProducerDashboardPage />);
    await screen.findByTestId("producer-overview");
    // Wait for the profile (the slug's source) before asserting an absence.
    const api = (await import("@/lib/api")).default;
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/producers/me"));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("view-public-link")).toBeNull();
  });

  it("an approved organizer's view link is /organizers/{slug}, and tools has no share tile for it", async () => {
    stateRef.current = { ...stateRef.current, kind: "organizer" };
    const { unmount } = render(<ProducerDashboardPage />);
    const view = await screen.findByTestId("view-public-link");
    expect(view.getAttribute("href")).toBe("/organizers/arugot-noam");
    expect(screen.queryByTestId("vanity-share")).toBeNull();
    unmount();
    render(<ToolsPage />);
    await screen.findByTestId("tools-grid");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("tools-share-tile")).toBeNull();
  });

  it("share page: a failed profile fetch says so instead of rendering nothing", async () => {
    stateRef.current = { ...stateRef.current, profileFails: true };
    render(<SharePage />);
    expect(await screen.findByTestId("share-page-error")).toBeInTheDocument();
    expect(screen.queryByTestId("share-page-content")).toBeNull();
  });
});

describe("share page — redirects and recovery (MEH-3749 review)", () => {
  it("an organizer is sent back to «כלים»", async () => {
    stateRef.current = { ...stateRef.current, kind: "organizer" };
    render(<SharePage />);
    await waitFor(() => expect(ROUTER.replace).toHaveBeenCalledWith("/producer/dashboard/tools"));
    expect(screen.queryByTestId("share-page-content")).toBeNull();
  });

  it("a visitor who is not a business owner is sent to /login", async () => {
    AUTH.user = { id: 2, name: "רוני", role: "consumer" };
    render(<SharePage />);
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/login"));
    expect(screen.queryByTestId("share-page-content")).toBeNull();
  });

  it("«נסו שוב» after a failed load fetches again and shows the page", async () => {
    stateRef.current = { ...stateRef.current, profileFails: true };
    render(<SharePage />);
    const error = await screen.findByTestId("share-page-error");
    stateRef.current = { ...stateRef.current, profileFails: false };
    fireEvent.click(error.querySelector("button"));
    expect(await screen.findByTestId("share-page-content")).toBeInTheDocument();
    expect(screen.queryByTestId("share-page-error")).toBeNull();
  });
});
