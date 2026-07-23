import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// MEH-996 audit finding (family 4 — silent failure paths, MEH-977 class):
// 1. FavoritesClient: the favorites fetch had `.catch(() => {})` +
//    `.finally(setLoading(false))` — on a failed request the page rendered
//    the "no favorites yet" empty state, indistinguishable from a real
//    empty list. A user WITH favorites saw them "gone" with no error.
// 2. admin/analytics: `.catch(() => {})` left `data` null forever → the
//    page showed the loading text permanently, no error, no retry signal.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key) => (ns ? `${ns}.${key}` : key);
    t.rich = (key) => (ns ? `${ns}.${key}` : key);
    t.raw = (key) => (ns ? `${ns}.${key}` : key);
    return t;
  },
  useLocale: () => "he",
}));

// MEH-1479: stable router ref (real useRouter is stable). A fresh object per
// render would re-fire FavoritesClient's fetch effect (router is in its deps)
// every render and consume the retry test's `...Once` mocks out of order.
vi.mock("next/navigation", () => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return { useRouter: () => router };
});

// MEH-1334: BadgeRow (in the ProducerCard import chain) now imports the
// locale-aware Link for its hero popover — mock the wrapper.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const stableUser = { id: "u1", role: "user" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.reject(new Error("network down"))),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import api from "@/lib/api";
import FavoritesClient from "@/app/[locale]/favorites/FavoritesClient";
import AdminAnalyticsPage from "@/app/[locale]/admin/analytics/page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("failed data fetches surface an error, not a misleading state (MEH-996 family 4)", () => {
  it("FavoritesClient: fetch failure shows an error message, NOT the empty state", async () => {
    render(<FavoritesClient />);
    await waitFor(() =>
      expect(screen.getByText("error.generic")).toBeTruthy(),
    );
    // The misleading "no favorites yet" state must NOT render on error.
    expect(screen.queryByText("favorites.empty_title")).toBeNull();
    expect(screen.queryByText("favorites.empty_cta")).toBeNull();
  });

  // MEH-1479: the error state now carries a "נסו שוב" retry that refetches
  // without a full reload. First fetch rejects → error + button; click → the
  // effect re-runs (attempt in deps), second fetch resolves → grid renders.
  it("FavoritesClient: retry button refetches and clears the error on success", async () => {
    api.get
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ data: [{ producer_id: "p1", producer: { id: "p1", name: "טסט" } }] });

    render(<FavoritesClient />);

    const retry = await screen.findByTestId("favorites-retry");
    expect(screen.getByText("error.generic")).toBeTruthy();

    const callsBeforeRetry = api.get.mock.calls.length;
    fireEvent.click(retry);

    // error clears and the populated-list hint renders (favorites.length > 0)
    await waitFor(() => expect(screen.getByText("favorites.list_alerts_hint")).toBeTruthy());
    expect(screen.queryByText("error.generic")).toBeNull();
    // the click triggered at least one more favorites fetch (the retry). Exact
    // count is not asserted: rendering ProducerCard also hydrates the shared
    // favorites-cache (favorites-cache.js:47), an unrelated extra GET.
    expect(api.get.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it("admin/analytics: fetch failure shows an error message, NOT permanent loading", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() =>
      expect(screen.getByText("admin.common.error_loading")).toBeTruthy(),
    );
    expect(screen.queryByText("admin.common.loading")).toBeNull();
  });
});
