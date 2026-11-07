/**
 * MEH-1692 — homepage trust band: sentence below the threshold, count above it.
 *
 * Mounts the REAL `app/[locale]/home/HomeClient.jsx` under the REAL NextIntlClientProvider
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
 *   3. MEH-2804 follow-up (07/11, Sapir): the locked sentence renders at EVERY
 *      count, and while /stats loads. From TRUST_COUNT_THRESHOLD (25) a quiet
 *      second line adds «N בתי עסק שהצטרפו עד היום»; below 25 there is no number
 *      at all (MEH-521). The #4143 fact row (31 · 18 · 0₪) was rejected and must
 *      not come back.
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
  HomeFeaturedProducer: () => null,
  HomeRecentlyViewed: () => null,
  HomeFavoritesStrip: () => null,
  HomeCTA: () => null,
}));
// MEH-2724: the favorites strip reads useAuth; this file renders HomeClient
// without an AuthProvider, so the hook is stubbed like useHomePage below.
vi.mock("@/lib/use-favorite-producers", () => ({ useFavoriteProducers: () => ({ items: [], reserve: false }) }));
vi.mock("@/app/[locale]/home/HomeCategoryGrid", () => ({ HomeCategoryGrid: () => null }));
vi.mock("@/app/[locale]/home/HomeProducersGrid", () => ({ HomeProducersGrid: () => null }));
// MEH-1287 chunk B added a child to HomeClient. It is stubbed for the same
// reason as every sibling above and NOT because it is inconvenient: this suite
// mounts the real HomeClient to pin the trust band, and an unstubbed
// HomeSeasonalNow pulls the real ProducerCard into the module graph, whose
// next-intl navigation import does not resolve under vitest's ESM loader
// ("Cannot find module .../next/navigation"). The suite then fails to LOAD —
// zero tests run, and the red says nothing about the trust band.
vi.mock("@/app/[locale]/home/HomeSeasonalNow", () => ({ default: () => null }));
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

// MEH-1832: page.js became an async Server Component (the SSR shell); the
// trust band this file tests lives in the client body, which moved to
// home/HomeClient.jsx. Same subject, same assertions — only the mount point
// changed, because an async component cannot be rendered by RTL.
import HomePage, { TRUST_COUNT_LINE } from "@/app/[locale]/home/HomeClient";

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
    navigateToChip: vi.fn(),
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

/** The rendered text of the whole trust band (sentence + optional count line). */
function bandText() {
  return screen.getByTestId("home-trust-band").textContent;
}

const TRUST = he.home.trust;
const countLine = () => screen.queryByTestId("trust-count");
const COUNT_WORDS = TRUST.count_line.replace(/<num>\{count\}<\/num>\s*/, "");

function renderLoading() {
  useHomePage.mockReturnValue({ ...hookState(30), statsLoaded: false, showStatsCounter: false, showTrustCount: false });
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <HomePage />
    </NextIntlClientProvider>,
  );
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

  it("below 5 the band is the locked sentence and nothing else — no numerals", () => {
    for (const n of [0, 3, 4]) {
      const { unmount } = renderAt(n);
      expect(screen.getByTestId("trust-lead").textContent.trim(), `count=${n}`).toBe(LOCKED_LEAD);
      expect(countLine(), `count=${n}`).toBeNull();
      unmount();
    }
  });
});

// MEH-2804 follow-up (07/11, Sapir): the sentence always; the count line from 25.
describe("MEH-2804 follow-up — the sentence always, a count line from 25", () => {
  it("renders the locked sentence at every count", () => {
    for (const n of [0, 3, 5, 12, 24, 25, 30, 500]) {
      const { unmount } = renderAt(n);
      expect(screen.getByTestId("trust-lead").textContent.trim(), `count=${n}`).toBe(LOCKED_LEAD);
      unmount();
    }
  });

  it("below 25 there is no count line and no number in the band (MEH-521)", () => {
    for (const n of [0, 3, 5, 12, 24]) {
      const { unmount } = renderAt(n);
      expect(countLine(), `count=${n}`).toBeNull();
      expect(bandText(), `count=${n}`).not.toMatch(/\d/);
      unmount();
    }
  });

  it("from 25 a second line states «N בתי עסק שהצטרפו עד היום», under the sentence", () => {
    for (const n of [25, 30, 500]) {
      const { unmount } = renderAt(n);
      const line = countLine();
      expect(line, `count=${n}`).not.toBeNull();
      expect(screen.getByTestId("trust-count-value").textContent, `count=${n}`).toBe(String(n));
      expect(line.textContent, `count=${n}`).toContain(COUNT_WORDS);
      // Order: the sentence first, the count line after it.
      const lead = screen.getByTestId("trust-lead");
      expect(lead.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING, `count=${n}`).toBeTruthy();
      unmount();
    }
  });

  it("switches exactly at 25", () => {
    const at = (n) => {
      const r = renderAt(n);
      const out = countLine() !== null;
      r.unmount();
      return out;
    };
    expect([at(24), at(25)]).toEqual([false, true]);
  });

  // Sapir 07/11: Cormorant's old-style italic «31» read as «ɜı» beside Hebrew.
  // The numeral is the line's own face — semibold, brand green, upright.
  it("the numeral is the line's own face: semibold, brand green, upright, LTR-isolated", () => {
    const { unmount } = renderAt(30);
    const num = screen.getByTestId("trust-count-value");
    const cls = num.className.split(/\s+/);
    for (const want of ["font-semibold", "text-primary"]) expect(cls, want).toContain(want);
    for (const banned of ["font-english", "italic", "align-middle", "text-lg"]) expect(cls, banned).not.toContain(banned);
    expect(num.getAttribute("dir")).toBe("ltr");
    unmount();
  });

  it("while /stats loads: the sentence is already up, and a placeholder holds the count line's slot (MEH-1686)", () => {
    const { unmount } = renderLoading();
    const band = screen.getByTestId("home-trust-band");
    expect(band.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("trust-lead").textContent.trim()).toBe(LOCKED_LEAD);
    const slot = screen.getByTestId("trust-count-skeleton");
    for (const c of TRUST_COUNT_LINE.split(" ")) expect(slot.className, c).toContain(c);
    unmount();
    // …and the loaded count line carries the same classes, min-height included.
    const { unmount: unmount2 } = renderAt(30);
    expect(screen.getByTestId("home-trust-band").getAttribute("aria-busy")).toBeNull();
    for (const c of TRUST_COUNT_LINE.split(" ")) expect(countLine().className, c).toContain(c);
    unmount2();
  });

  it("the rejected #4143 fact row does not come back (no columns, no «0₪», no categories count)", () => {
    for (const n of [5, 12, 30]) {
      const { unmount } = renderAt(n);
      expect(screen.queryAllByTestId("trust-fact"), `count=${n}`).toHaveLength(0);
      expect(bandText(), `count=${n}`).not.toContain("0₪");
      expect(bandText(), `count=${n}`).not.toContain(String(CATEGORIES) + " קטגוריות");
      unmount();
    }
    expect(Object.keys(TRUST).sort()).toEqual(["count_line", "lead"]);
  });
});

describe("MEH-1692 — the count is never stated twice", () => {
  // Sapir's added acceptance condition. The three states are the ones the band
  // actually has. NOTE the first row: below 5 the MEH-521 secondary line does
  // not render at all, so the count appears ZERO times, not once — that is the
  // pre-existing "never show a low number" behaviour, deliberately preserved.
  it.each([
    ["N < 5           ", 3, 0],
    ["5 <= N < 25     ", 12, 0], // withheld below 25 (MEH-521)
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
    expect(he.home.hero.subtitle).toBe("ישר מהמקור הביתה. בתי עסק שכבר בדקנו בשבילך.");
  });

  it("nav.trust_strip value is untouched in he.json", () => {
    // MEH-2305 (24.10) changed it on purpose: Sapir does not commit to a call
    // with every business. This guard still pins it against accidental edits.
    expect(he.nav.trust_strip).toBe("היכרות אישית עם כל בית עסק");
  });
});
