/**
 * MEH-3786: the dashboard reviews page carries the request-a-review card at
 * the top, for an approved business only (the link endpoint 403s otherwise).
 * Cells: 0 reviews / many reviews × approved, and every unapproved status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import ReviewsPage from "@/app/[locale]/producer/dashboard/reviews/page";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, role: "producer" };
  return { useAuth: () => ({ user, loading: false }) };
});
vi.mock("next-intl", () => {
  const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
  t.rich = t;
  return { useLocale: () => "he", useTranslations: () => t };
});
vi.mock("@/components/producer/RequestReviewCard", () => ({
  default: () => <div data-testid="request-review-stub" />,
}));

const { state } = vi.hoisted(() => ({ state: { status: "approved", reviews: [] } }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me") return Promise.resolve({ data: { id: "p1", status: state.status } });
      if (url === "/reviews") return Promise.resolve({ data: state.reviews });
      return Promise.resolve({ data: null });
    }),
    put: vi.fn(),
  },
}));

const FreshCache = ({ children }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);
const renderPage = () => render(<ReviewsPage />, { wrapper: FreshCache });
const review = (id) => ({
  id, user_name: `לקוחה ${id}`, stars: 5, body: `גוף ${id}`,
  created_at: "2026-11-10T10:00:00Z", reply: null, reply_at: null,
});

describe("request-a-review card on the dashboard reviews page (MEH-3786)", () => {
  beforeEach(() => {
    state.status = "approved";
    state.reviews = [];
  });

  it("approved, 0 reviews: the card sits above the empty state", async () => {
    renderPage();
    const empty = await screen.findByText("owner_empty_title");
    const card = await screen.findByTestId("request-review-stub");
    expect(card.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("approved, many reviews: one card, above the summary", async () => {
    state.reviews = [review("a"), review("b")];
    renderPage();
    const summary = await screen.findByTestId("owner-reviews-summary");
    const cards = screen.getAllByTestId("request-review-stub");
    expect(cards).toHaveLength(1);
    expect(cards[0].compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([["pending"], ["draft"], ["rejected"], ["inactive"], [undefined]])(
    "status %s: no card",
    async (status) => {
      state.status = status;
      state.reviews = [review("a")];
      renderPage();
      await screen.findByTestId("owner-reviews-summary");
      expect(screen.queryByTestId("request-review-stub")).toBeNull();
    },
  );
});
