import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { HomeHero } from "@/app/[locale]/home/HomeHero";

// MEH-1812: HomeHero now mounts EnSearchNotice, which calls useLocale() and
// pulls in LanguageToggle -> @/i18n/navigation. This spec covers HomeHero's own
// behaviour, so the notice is stubbed out rather than dragging the i18n
// navigation stack into it. Its own contract is asserted in
// __tests__/EnSearchNotice.test.jsx, including the /he absence case.
vi.mock("@/components/EnSearchNotice", () => ({ default: () => null }));


// MEH-1684 — hero search-zone redesign. This file carries the ticket's two
// NUMERIC ABSENCE assertions, which are the whole point of the change:
//
//   1. the hero zone holds EXACTLY 1 filled-primary control — the circular
//      search submit — not 2 (the solid "גלו בתי עסק" button is gone);
//   2. the chips row holds 0 occurrences of "גלו בתי עסק" and 0 underlined
//      links ("איך זה עובד" moved out, under the trust line).
//
// WHY next-intl is mocked against the REAL he.json and not against identity
// (`k => k`), which every other HomeHero test does: with identity translations
// the string "גלו בתי עסק" can never appear in the DOM no matter what the
// component renders, so assertion 2 would pass against the pre-MEH-1684 markup
// too — a construction that cannot discriminate is not evidence (MEH-1619).
// Feeding real Hebrew makes the assertion fail the moment that button returns.
vi.mock("next-intl", async () => {
  const he = (await import("../messages/he.json")).default;
  const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
  return {
    useTranslations: (ns) => (key, vars) => {
      const full = ns ? `${ns}.${key}` : key;
      const raw = lookup(full);
      if (typeof raw !== "string") return full;
      return vars
        ? Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), raw)
        : raw;
    },
  };
});
vi.mock("framer-motion", () => {
  const strip = ({ children, initial, animate, whileInView, viewport, transition, ...p }, Tag) => (
    <Tag {...p}>{children}</Tag>
  );
  return {
    MotionConfig: ({ children }) => <>{children}</>,
    motion: {
      div: (props) => strip(props, "div"),
      h1: (props) => strip(props, "h1"),
      p: (props) => strip(props, "p"),
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// HeroSearch fetches /search/trending on focus and /search while typing.
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: () => "https://img/hero.jpg" }));

const baseProps = {
  fridayMode: false,
  geoLoading: false,
  onNearMe: vi.fn(),
  onDeliveryCta: vi.fn(),
  userCity: null,
};

/** Elements carrying the fill token as a standalone class (not `hover:` etc). */
function filledPrimaryControls(container) {
  return [...container.querySelectorAll("*")].filter(
    (el) =>
      typeof el.className === "string" &&
      el.className.split(/\s+/).includes("bg-action-primary")
  );
}

describe("MEH-1684 — hero zone removal assertions (numeric)", () => {
  it("holds EXACTLY 1 filled-primary control, and it is the search submit", () => {
    const { container } = render(<HomeHero {...baseProps} />);
    const filled = filledPrimaryControls(container);
    expect(filled).toHaveLength(1);
    expect(filled[0]).toHaveAttribute("data-testid", "hero-search-submit");
  });

  it("holds 0 occurrences of the solid \"גלו בתי עסק\" control anywhere in the zone", () => {
    const { container } = render(<HomeHero {...baseProps} />);
    const occurrences = (container.textContent.match(/גלו בתי עסק/g) || []).length;
    expect(occurrences).toBe(0);
  });

  it("chips row: 0 occurrences of \"גלו בתי עסק\" and 0 underlined links", () => {
    render(<HomeHero {...baseProps} />);
    const row = screen.getByTestId("hero-chips-row");
    expect((row.textContent.match(/גלו בתי עסק/g) || []).length).toBe(0);
    expect(row.querySelectorAll('[class*="underline"]')).toHaveLength(0);
  });
});

describe("MEH-1684 — the zone speaks one affordance language", () => {
  it("renders both chips in the ONE shared chip style", () => {
    render(<HomeHero {...baseProps} />);
    const row = screen.getByTestId("hero-chips-row");
    const chips = [...row.querySelectorAll("button")];
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.className).toContain("rounded-full");
      // MEH-1690: ghost-on-cream → surface fill, because the row moved onto the
      // scrim (primary green on rgb(28 26 23 / .88) is far under AA). What the
      // assertion actually protects is unchanged: ONE shared style, and no
      // second PRIMARY fill competing with the circular submit (MEH-1369).
      expect(chip.className).toContain("bg-surface");
      expect(chip.className).toContain("text-primary");
      expect(chip.className).not.toContain("bg-action-primary");
    }
    // Still exactly one style — both chips identical, no drift.
    expect(chips[0].className).toBe(chips[1].className);
  });

  it("keeps the near-me and delivery wiring intact behind the restyle", () => {
    const onNearMe = vi.fn();
    const onDeliveryCta = vi.fn();
    render(<HomeHero {...baseProps} onNearMe={onNearMe} onDeliveryCta={onDeliveryCta} />);
    fireEvent.click(screen.getByText("קרוב אליי"));
    fireEvent.click(screen.getByTestId("hero-delivery-cta"));
    expect(onNearMe).toHaveBeenCalledTimes(1);
    expect(onDeliveryCta).toHaveBeenCalledTimes(1);
  });

  // MEH-1690 inverts what MEH-1684 pinned here. These are ABSENCE assertions on
  // purpose (removal spec, MEH-1578): the trust line, its gold seal and the
  // "how it works" link were the three orphaned rows the ticket removes, and a
  // test that only checked the new layout would let any of them creep back.
  it("renders NO trust line and NO gold seal in the hero zone", () => {
    const { container } = render(<HomeHero {...baseProps} />);
    expect(screen.queryByTestId("hero-trust-line")).not.toBeInTheDocument();
    expect(screen.queryByText("כל בית עסק נבדק ואושר ידנית")).not.toBeInTheDocument();
    // The accent token is the gold; nothing above the fold may carry it here.
    expect(container.querySelectorAll(".text-accent")).toHaveLength(0);
  });

  it('no longer renders "איך זה עובד" in the hero zone', () => {
    render(<HomeHero {...baseProps} />);
    expect(screen.queryByText("איך זה עובד")).not.toBeInTheDocument();
  });

  it("renders the chips row INSIDE the hero image section, under the pill", () => {
    const { container } = render(<HomeHero {...baseProps} />);
    const section = container.querySelector("section");
    const pill = screen.getByRole("search");
    const chips = screen.getByTestId("hero-chips-row");
    // Both inside the banded section — the composition fix. If either were to
    // regress to a sibling of the section (the pre-MEH-1690 shape), this reds.
    expect(section.contains(pill)).toBe(true);
    expect(section.contains(chips)).toBe(true);
    // Chips follow the pill in document order.
    expect(pill.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The section itself must not clip, or the search dropdown would be cut off
    // by the very band it now sits inside.
    expect(section.className).not.toContain("overflow-hidden");
  });

  it("wraps the search in a full pill (rounded-full), not the old radius-16 card", () => {
    render(<HomeHero {...baseProps} />);
    const pill = screen.getByRole("search");
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).not.toContain("rounded-2xl");
    const submit = screen.getByTestId("hero-search-submit");
    expect(submit.className).toContain("rounded-full");
    // MEH-1369: the circular submit still holds the zone's ONE primary fill —
    // the half of the invariant HomeHeroDeliveryCta.test.jsx cannot see (it
    // mocks HeroSearch). Load-bearing now that the chips took a surface fill.
    expect(submit.className).toContain("bg-action-primary");
  });
});

describe("MEH-1684 — rotating placeholder", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const placeholderOf = () => screen.getByTestId("hero-search").getAttribute("placeholder");

  // MEH-1690: the pool now teaches the four scopes `search.py` actually serves
  // — product / category / city / business-name — instead of four product-ish
  // marketing phrases, three of which returned zero results against staging.
  it("starts on the first example and swaps on the interval", () => {
    render(<HomeHero {...baseProps} />);
    expect(placeholderOf()).toBe("לחם מחמצת");
    act(() => vi.advanceTimersByTime(3500));
    expect(placeholderOf()).toBe("לחמים ואפייה");
    act(() => vi.advanceTimersByTime(3500));
    expect(placeholderOf()).toBe("זכרון יעקב");
    act(() => vi.advanceTimersByTime(3500));
    expect(placeholderOf()).toBe("מאפיית המחמצת");
  });

  it("pauses while the field is focused and resumes on blur", () => {
    render(<HomeHero {...baseProps} />);
    const input = screen.getByTestId("hero-search");
    fireEvent.focus(input);
    const frozen = placeholderOf();
    act(() => vi.advanceTimersByTime(3500 * 3));
    expect(placeholderOf()).toBe(frozen);
    fireEvent.blur(input);
    act(() => vi.advanceTimersByTime(3500));
    expect(placeholderOf()).not.toBe(frozen);
  });

  it("pauses while the field holds text", () => {
    render(<HomeHero {...baseProps} />);
    const input = screen.getByTestId("hero-search");
    fireEvent.change(input, { target: { value: "גבינה" } });
    fireEvent.blur(input);
    const frozen = placeholderOf();
    act(() => vi.advanceTimersByTime(3500 * 3));
    expect(placeholderOf()).toBe(frozen);
  });

  it("stays on the first example under prefers-reduced-motion", () => {
    const prev = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      render(<HomeHero {...baseProps} />);
      expect(placeholderOf()).toBe("לחם מחמצת");
      act(() => vi.advanceTimersByTime(3500 * 4));
      expect(placeholderOf()).toBe("לחם מחמצת");
    } finally {
      window.matchMedia = prev;
    }
  });
});
