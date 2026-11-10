/**
 * MEH-2884 — dashboard placement audit items 6 + 9.
 * (6) /producer/dashboard/followers is a redirect to insights; the insights
 *     «שמרו במועדפים» card carries the count AND the share action.
 * (9) «שתפו את העמוד» SHARES the public link (share sheet, else copy) — it
 *     used to be a link that navigated to the page.
 *
 * ONE click per file, in the LAST test. Measured 10/11: on this page, after a
 * click, any later waitFor / findBy in the same worker never settles and the
 * file hangs — each click test passes alone, two hang; two renders without a
 * click pass. The same hang MEH-2876 quarantined; the copy path therefore
 * lives in DashboardInsightsFollowersCopy.test.jsx. No waitFor is needed
 * after the click: shareOrCopy calls navigator.share / clipboard.writeText
 * synchronously inside it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { SITE_URL } from "@/lib/env";
import InsightsPage from "@/app/[locale]/producer/dashboard/insights/page";

const { redirectSpy } = vi.hoisted(() => ({ redirectSpy: vi.fn() }));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, role: "producer" }, loading: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: redirectSpy,
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

const zero = { last_7d: 0, last_30d: 0, total: 0 };
const analytics = (follower_count) => ({
  profile_views: zero,
  search_appearances: zero,
  whatsapp_clicks: zero,
  contact_clicks: zero,
  follower_count,
  new_followers_this_week: 0,
  average_rating: 0,
  total_reviews: 0,
  views_by_day: [],
  top_cities: [],
});

function mockApi(profile, followers) {
  api.get.mockImplementation((url) => {
    if (url === "/producers/me/analytics") return Promise.resolve({ data: analytics(followers) });
    if (url === "/producers/me") return Promise.resolve({ data: profile });
    return Promise.resolve({ data: [] });
  });
}

const renderPage = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <InsightsPage />
    </NextIntlClientProvider>,
  );

const APPROVED = { id: 1, status: "approved", slug: "arugot-noam" };
const SHARE_URL = `${SITE_URL}/p/${APPROVED.slug}`;
let shareSpy;

beforeEach(() => {
  vi.clearAllMocks();
  shareSpy = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });
});
afterEach(() => {
  delete navigator.share;
});

describe("insights followers card (MEH-2884 items 6 + 9)", () => {
  it("pending: no public page yet, so no share button (plain text)", async () => {
    mockApi({ id: 1, status: "pending", slug: null }, 0);
    renderPage();
    await screen.findByTestId("followers-zero-cta");
    expect(screen.queryByTestId("followers-share")).toBeNull();
  });

  it("many followers: the count and a «שתפו» button on the same card (item 6)", async () => {
    mockApi(APPROVED, 12);
    renderPage();
    const button = await screen.findByTestId("followers-share");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveTextContent(he.share.trigger);
    const card = button.parentElement;
    expect(card).toHaveTextContent("12");
    expect(card).toHaveTextContent(he.dashboard.producer.analytics.simple_cards.followers_label);
  });

  it("/producer/dashboard/followers redirects to the insights tab (item 6)", async () => {
    const { default: FollowersRedirect } = await import(
      "@/app/[locale]/producer/dashboard/followers/page"
    );
    await FollowersRedirect({ params: Promise.resolve({ locale: "en" }) });
    expect(redirectSpy).toHaveBeenCalledWith({ href: "/producer/dashboard/insights", locale: "en" });
  });

  // LAST — see the header.
  it("0 followers, approved: «שתפו את העמוד» is a button that opens the share sheet with /p/{slug} (item 9)", async () => {
    mockApi(APPROVED, 0);
    renderPage();
    const cta = await screen.findByTestId("followers-zero-cta");
    const button = screen.getByTestId("followers-share");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveTextContent(he.dashboard.producer.analytics.simple_cards.followers_zero_share);
    expect(cta.querySelector("a"), "no longer a navigation").toBeNull();
    fireEvent.click(button);
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy.mock.calls[0][0].url).toBe(SHARE_URL);
  });
});
