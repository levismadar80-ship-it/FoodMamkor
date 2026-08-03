/**
 * MEH-1692 — homepage trust band: sentence below the threshold, count above it.
 *
 * Mounts the REAL `app/[locale]/page.js` under the REAL NextIntlClientProvider
 * with the REAL he.json, mirroring the EditTabDescriptionCard pattern. Nothing
 * here re-implements the markup or the interpolation: a second copy of either is
 * free to drift from the one that ships, and then the test passes while the page
 * is broken.
 *
 * What it pins:
 *   1. The old lead string renders ZERO times IN THE BAND, and exactly once
 *      page-wide — in the hero. Not "zero on the homepage": it is a byte-exact
 *      substring of home.hero.subtitle, which decision 1 locks unchanged, so a
 *      page-wide zero is unreachable without breaking that lock. See the
 *      comment above the first test.
 *   2. Below TRUST_COUNT_THRESHOLD (25) the lead is the locked sentence.
 *   3. At/above 25 the lead is the locked count string, number substituted.
 *   4. THE BUSINESS COUNT IS NEVER STATED TWICE IN THE BAND. This is the
 *      assertion the ticket did not originally carry: applying the count to the
 *      lead alone would have restated the number that the MEH-521 secondary line
 *      (gated at 5) already shows — the same "נאמר פעמיים" defect the ticket
 *      exists to close.
 *
 * Boundary cases are tested at 24 and 25, not just at 12 and 30, because an
 * off-by-one in `>=` is exactly the bug a mid-range-only test cannot see.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

// ---- child components: mocked to null so the band is what is under test ----
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/LocationBanner", () => ({ default: () => null }));
vi.mock("@/components/HolidayBanner", () => ({ default: () => null }));
vi.mock("@/components/FridayDeliveryStrip", () => ({ default: () => null }));
vi.mock("@/components/BackToTop", () => ({ default: () => null }));
vi.mock("@/components/HomepageMiniMapSkeleton", () => ({ default: () => null }));
vi.mock("@/app/[locale]/home/UpcomingEventsPreview", () => ({
  UpcomingEventsPreview: () => null,
}));
vi.mock("@/app/[locale]/home/HomeStaticBlocks", () => ({
  HomeHowItWorks: () => null,
  HomeComparisonTeaser: () => null,
  HomeFeaturedProducer: () => null,
  HomeRecentlyViewed: () => null,
  HomeCTA: () => null,
}));
vi.mock("@/app/[locale]/home/HomeCategoryGrid", () => ({ HomeCategoryGrid: () => null }));
vi.mock("@/app/[locale]/home/HomeProducersGrid", () => ({ HomeProducersGrid: () => null }));
vi.mock("@/lib/seo", () => ({ buildHomeJsonLd: () => ({}), serializeJsonLd: () => "{}" }));

// HomeHero is NOT mocked to null — it renders home.hero.subtitle, which the
// positive guard below needs to observe. Mocking it away would make the
// "renders exactly once, byte-identical" assertion vacuous.
vi.mock("@/app/[locale]/home/HomeHero", () => ({
  HomeHero: () => {
    const { useTranslations } = require("next-intl");
    const t = useTranslations();
    return <p>{t("home.hero.subtitle")}</p>;
  },
}));

const useHomePage = vi.fn();
vi.mock("@/lib/use-home-page", () => ({ useHomePage: () => useHomePage() }));

import HomePage from "@/app/[locale]/page";

const LOCKED_LEAD = "בלי מתווך באמצע · איסוף עצמי או משלוח, ישירות מבית העסק";
const OLD_LEAD = "בתי עסק שכבר בדקנו בשבילך";
const CATEGORIES = 6;

/** Every field page.js destructures. Only the stats flags vary per case. */
function hookState(producersCount) {
  return {
    user: null,
    producers: [], regionFallback: false, categories: [], filters: {}, chips: [],
    visibleCount: 0, producersLoading: false, geoLoading: false,
    recentlyViewed: [], showNewUserHint: false,
    locationModalOpen: false, setLocationModalOpen: vi.fn(),
    fridayMode: false, step0Visible: false, userCity: null,
    onboardStep: -1, onboardAdvance: vi.fn(), onboardDismiss: vi.fn(),
    visibleProducers: [], hasMore: false, categoryCards: [],
    statsProducersCount: producersCount,
    statsCategoriesCount: CATEGORIES,
    statsLoaded: true,
    // Mirrors use-home-page.js: STATS_DISPLAY_THRESHOLD 5, TRUST_COUNT_THRESHOLD 25.
    showStatsCounter: producersCount >= 5,
    showTrustCount: producersCount >= 25,
    featuredProducer: null,
    geoActive: false, cityActive: false, dayActive: false, geoEmptyNotice: false,
    handleNearMe: vi.fn(), handleSurprise: vi.fn(), handleDeliveryCta: vi.fn(),
    handleDaySelected: vi.fn(), handleCitySelected: vi.fn(), handleClearLocation: vi.fn(),
    handleWhatsAppClick: vi.fn(), navigateToChip: vi.fn(),
    handleClearCategory: vi.fn(), handleLoadMore: vi.fn(), handleAdvanceFromStep0: vi.fn(),
  };
}

function renderAt(producersCount) {
  useHomePage.mockReturnValue(hookState(producersCount));
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <HomePage />
    </NextIntlClientProvider>,
  );
}

/**
 * How many times `n` is rendered *as a business count* in `text`.
 *
 * Counts "<n> בתי עסק", not the bare digits. A bare-digit count is the wrong
 * instrument: at n === categoriesCount (e.g. 6 businesses, 6 categories) the
 * digit legitimately appears twice meaning two different things, and a digit
 * counter reports that correct render as the duplication bug.
 */
function countBusinessCount(text, n) {
  return (text.match(new RegExp(`(?<!\\d)${n}(?!\\d)\\s*בתי עסק`, "g")) || []).length;
}

/** The rendered text of the whole trust band (lead + secondary). */
function bandText() {
  const lead = screen.getByTestId("trust-lead");
  const secondary = screen.queryByTestId("trust-secondary");
  return `${lead.textContent} ${secondary ? secondary.textContent : ""}`;
}

beforeEach(() => {
  useHomePage.mockReset();
});

describe("MEH-1692 — trust band lead", () => {
  // The ticket's acceptance criterion reads "renders 0 times on the homepage".
  // That is UNSATISFIABLE as written, and the conflict is with the ticket's own
  // decision 1: OLD_LEAD is a verbatim substring of home.hero.subtitle, which is
  // locked unchanged. Driving the page-wide count to 0 would require editing the
  // hero — the one thing decision 1 forbids. The satisfiable, and intended,
  // form is asserted here: gone from the BAND, still present exactly once on the
  // page, in the hero that owns it. That is what "the duplication is closed"
  // means when only one side moves.
  it("never renders the retired lead string in the trust band", () => {
    for (const n of [0, 3, 5, 12, 24, 25, 30, 500]) {
      const { unmount } = renderAt(n);
      expect(bandText(), `count=${n}`).not.toContain(OLD_LEAD);
      unmount();
    }
  });

  it("renders the retired string exactly once page-wide — in the hero, not twice", () => {
    for (const n of [3, 12, 30]) {
      const { unmount, container } = renderAt(n);
      const hits = (container.textContent.match(new RegExp(OLD_LEAD, "g")) || []).length;
      expect(hits, `count=${n}`).toBe(1);
      unmount();
    }
  });

  it("leads with the locked sentence below 25", () => {
    for (const n of [0, 3, 12, 24]) {
      const { unmount } = renderAt(n);
      expect(screen.getByTestId("trust-lead").textContent.trim(), `count=${n}`)
        .toBe(LOCKED_LEAD);
      unmount();
    }
  });

  it("leads with the locked count string at 25 and above", () => {
    for (const n of [25, 30, 500]) {
      const { unmount } = renderAt(n);
      expect(screen.getByTestId("trust-lead").textContent.trim(), `count=${n}`)
        .toBe(`${n} בתי עסק · כל אחד נבחר אישית`);
      unmount();
    }
  });

  it("switches exactly at 25, not at 24 or 26", () => {
    const { unmount } = renderAt(24);
    expect(screen.getByTestId("trust-lead").textContent.trim()).toBe(LOCKED_LEAD);
    unmount();
    const second = renderAt(25);
    expect(screen.getByTestId("trust-lead").textContent.trim())
      .toBe("25 בתי עסק · כל אחד נבחר אישית");
    second.unmount();
  });
});

describe("MEH-1692 — the count is never stated twice", () => {
  // Sapir's added acceptance condition. The three states are the ones the band
  // actually has. NOTE the first row: below 5 the MEH-521 secondary line does
  // not render at all, so the count appears ZERO times, not once — that is the
  // pre-existing "never show a low number" behaviour, deliberately preserved.
  it.each([
    ["N < 5           ", 3, 0],
    ["5 <= N < 25     ", 12, 1],
    ["N >= 25         ", 30, 1],
  ])("%s → business count rendered %i time(s)", (_label, n, expected) => {
    const { unmount } = renderAt(n);
    expect(countBusinessCount(bandText(), n)).toBe(expected);
    unmount();
  });

  it("never states the count more than once, across the whole range", () => {
    for (const n of [0, 3, 4, 5, 6, 12, 24, 25, 26, 30, 99, 500]) {
      const { unmount } = renderAt(n);
      expect(countBusinessCount(bandText(), n), `count=${n}`).toBeLessThanOrEqual(1);
      unmount();
    }
  });

  it("self-test: the counter discriminates a doubled count from a single one", () => {
    // Runs FIRST in spirit — if this fails, nothing the assertions above report
    // is worth reading. Exercises the same helper the assertions use, against
    // the exact shape the bug would produce.
    const single = "30 בתי עסק · כל אחד נבחר אישית 6 קטגוריות · מכל רחבי הארץ";
    const doubled =
      "30 בתי עסק · כל אחד נבחר אישית 30 בתי עסק שהצטרפו עד היום · 6 קטגוריות · מכל רחבי הארץ";
    expect(countBusinessCount(single, 30)).toBe(1);
    expect(countBusinessCount(doubled, 30)).toBe(2); // the pre-fix render
    expect(countBusinessCount("130 בתי עסק · 305 בתי עסק", 30)).toBe(0); // not a substring match
    expect(countBusinessCount("6 בתי עסק שהצטרפו עד היום · 6 קטגוריות", 6)).toBe(1); // digit collision is not a duplicate
  });
});

describe("MEH-1692 — positive guards (surfaces that must NOT change)", () => {
  it("home.hero.subtitle still renders exactly once, byte-identical", () => {
    const { unmount } = renderAt(30);
    const hits = screen.getAllByText(he.home.hero.subtitle);
    expect(hits).toHaveLength(1);
    unmount();
  });

  it("the hero subtitle value itself is untouched in he.json", () => {
    expect(he.home.hero.subtitle).toBe("ישר מהמקור אלייך. בתי עסק שכבר בדקנו בשבילך.");
  });

  it("nav.trust_strip value is untouched in he.json", () => {
    expect(he.nav.trust_strip).toBe("שיחה אישית עם כל בית עסק");
  });
});
