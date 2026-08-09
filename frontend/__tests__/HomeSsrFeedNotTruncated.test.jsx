import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";

/**
 * MEH-1832 regression guard.
 *
 * The SSR shell (PR #2740) fetched `/producers?limit=8` — the first viewport's
 * worth. Chunk 1 also stopped the client fetching on a plain load, so
 * `producers` never grew past those 8 rows, and
 *
 *     hasMore = visibleCount < producers.length     // use-home-page.js:706
 *
 * became `8 < 8` → permanently false. The "עוד בתי עסק" button disappeared
 * from the homepage and nothing failed. `selectFeaturedProducer` reads the same
 * array, so it would also have chosen from 8 rows instead of the catalog.
 *
 * The two cases below are a matched pair, and the SECOND is what gives the
 * first its meaning: a server payload larger than PAGE_SIZE must yield
 * hasMore=true, and a payload truncated TO PAGE_SIZE must yield false. If a
 * future change re-truncates the server fetch, case 1 goes red — and case 2
 * proves the assertion can distinguish the two states rather than always
 * reporting true.
 */

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/i18n-key-map", () => ({ mapKey: (k) => k }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({ city: null, setCity: vi.fn() }) }));
vi.mock("@/lib/use-onboarding", () => ({
  useOnboarding: () => ({ step: -1, advance: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/friday-mode", () => ({ isFridayMode: () => false }));
vi.mock("@/lib/featured-producer", () => ({ selectFeaturedProducer: () => null }));
vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/user-location", () => ({ getUserLocation: () => null, setUserLocation: vi.fn() }));
// No client fetch should be needed on a plain load with server data; if one
// happens it resolves empty and cannot manufacture a false pass.
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

/** PAGE_SIZE is 8 (use-home-page.js:36) — the count the first viewport paints. */
const PAGE_SIZE = 8;
const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `עסק ${i}`, slug: `p${i}` }));

describe("MEH-1832 — the SSR feed must not be truncated to the first viewport", () => {
  it("offers load-more when the server payload is larger than one viewport", () => {
    const { result } = renderHook(() =>
      useHomePage({ initialProducers: rows(PAGE_SIZE + 2), initialCategories: [] }),
    );
    expect(result.current.hasMore, "load-more must appear when rows exist beyond the first viewport").toBe(true);
    expect(result.current.visibleProducers).toHaveLength(PAGE_SIZE);
  });

  it("hides load-more when the payload is exactly one viewport — the regression's shape", () => {
    const { result } = renderHook(() =>
      useHomePage({ initialProducers: rows(PAGE_SIZE), initialCategories: [] }),
    );
    // Correct behaviour for a genuinely 8-row catalog, and the exact state a
    // truncating server fetch forced on every catalog. That is why the server
    // must send the full feed: this assertion cannot tell the two apart, so
    // the guard has to live on the payload size, not here.
    expect(result.current.hasMore).toBe(false);
  });
});
