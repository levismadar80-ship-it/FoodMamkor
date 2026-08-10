import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import HeroSearch from "@/components/HeroSearch";

// MEH-1975 — the hero search dropdown must offer a way OUT of a no-results
// state, not merely report the absence.
//
// This is the site's highest-traffic search surface and it was a dead end: a
// single line, `אין תוצאות עבור "…"`, with no control of any kind. The same
// query submitted to /producers lands on FilterEmptyState, which already does
// this well (category chips + clear-all) — so the fix is a door to that
// surface, not a new pattern.
//
// WHY next-intl is mocked against the REAL he.json rather than identity
// (`k => k`): with identity translations the assertion below would pass
// against ANY markup, because the key string would appear whether or not the
// component renders a link. Feeding real Hebrew means the test fails the
// moment the exit disappears. Same reasoning as
// __tests__/HomeHeroSearchZone.test.jsx (MEH-1619).
vi.mock("next-intl", async () => {
  const he = (await import("../messages/he.json")).default;
  const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
  return {
    useTranslations: (ns) => {
      const fn = (key) => lookup(`${ns}.${key}`) ?? `${ns}.${key}`;
      fn.rich = fn;
      return fn;
    },
    useLocale: () => "he",
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

// The LOCALE-AWARE Link is stubbed, and the stub stamps `data-locale-aware`.
//
// That attribute is the whole point of the stub. routing.js uses
// localePrefix "as-needed" with defaultLocale "he", so in Hebrew the
// locale-aware Link and plain next/link emit the SAME href — meaning an
// href-only assertion passes either way and could never catch a regression
// back to plain next/link, which is exactly the bug this guards (an English
// visitor would be dropped onto the Hebrew route). Asserting the stamp is
// what makes the check discriminate; the prefixing itself is next-intl's job
// and is tested upstream.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} data-locale-aware="true" {...rest}>
      {children}
    </a>
  ),
}));

// The search endpoint returns nothing — the state under test.
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() =>
      Promise.resolve({ data: { producers: [], categories: [], cities: [] } }),
    ),
  },
}));

async function typeQuery(q) {
  render(<HeroSearch placeholder="חיפוש" srLabel="חיפוש" />);
  // queryByRole, not getByRole: get* THROWS on a miss, so a nullish-coalescing
  // fallback after it is dead code — it could never run, and the test would
  // error at the first call instead of falling back. Flagged on #2758.
  const input =
    screen.queryByRole("combobox", { hidden: true }) ?? screen.getByRole("textbox");
  await act(async () => {
    fireEvent.change(input, { target: { value: q } });
  });
  // debounce + resolved fetch
  await act(async () => {
    vi.advanceTimersByTime(500);
    await Promise.resolve();
  });
}

describe("MEH-1975 — hero no-results offers an exit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders a link to the full results page for the same query", async () => {
    await typeQuery("קינואה סגולה");

    // The exit must be a real navigable control, and it must carry the query —
    // dropping the query would send her to an unfiltered list and silently
    // discard what she typed, which is a different kind of dead end.
    const exit = screen.getByRole("link", { name: /כל בתי העסק/ });
    expect(exit).toBeTruthy();
    expect(exit.getAttribute("href")).toContain("/producers?q=");
    expect(decodeURIComponent(exit.getAttribute("href"))).toContain("קינואה סגולה");
    // Must go through the locale-aware Link, or /en visitors land on the
    // Hebrew route. See the mock comment for why the href alone cannot
    // detect this.
    expect(exit.getAttribute("data-locale-aware")).toBe("true");
  });

  it("still names what was searched for", async () => {
    // Principle 3 from the research (NN/g: context-aware messaging) — reflect
    // the query back so she knows the system heard her. This half already
    // worked before MEH-1975; asserted so the fix cannot regress it.
    await typeQuery("קינואה סגולה");
    expect(screen.getByText(/קינואה סגולה/)).toBeTruthy();
  });
});
