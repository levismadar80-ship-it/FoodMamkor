import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
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

  it("admin/analytics: fetch failure shows an error message, NOT permanent loading", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() =>
      expect(screen.getByText("admin.common.error_loading")).toBeTruthy(),
    );
    expect(screen.queryByText("admin.common.loading")).toBeNull();
  });
});
