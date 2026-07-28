import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { HomeHero } from "@/app/[locale]/home/HomeHero";

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
  it("renders both chips in the ONE shared ghost-chip style", () => {
    render(<HomeHero {...baseProps} />);
    const row = screen.getByTestId("hero-chips-row");
    const chips = [...row.querySelectorAll("button")];
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.className).toContain("rounded-full");
      expect(chip.className).toContain("border-primary/35");
      expect(chip.className).toContain("text-primary");
      expect(chip.className).not.toContain("bg-action-primary");
    }
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

  it("carries the trust line, and relocates \"איך זה עובד\" out of the chips row", () => {
    render(<HomeHero {...baseProps} />);
    expect(screen.getByTestId("hero-trust-line")).toHaveTextContent(
      "כל בית עסק נבדק ואושר ידנית"
    );
    // Still on the page — moved, not deleted.
    const link = screen.getByText("איך זה עובד");
    expect(link.className).toContain("underline");
    expect(screen.getByTestId("hero-chips-row").contains(link)).toBe(false);
  });

  it("wraps the search in a full pill (rounded-full), not the old radius-16 card", () => {
    render(<HomeHero {...baseProps} />);
    const pill = screen.getByRole("search");
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).not.toContain("rounded-2xl");
    expect(screen.getByTestId("hero-search-submit").className).toContain("rounded-full");
  });
});

describe("MEH-1684 — rotating placeholder", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const placeholderOf = () => screen.getByTestId("hero-search").getAttribute("placeholder");

  it("starts on the first example and swaps on the interval", () => {
    render(<HomeHero {...baseProps} />);
    expect(placeholderOf()).toBe("לחם מחמצת");
    act(() => vi.advanceTimersByTime(3500));
    expect(placeholderOf()).toBe("ביצים אורגניות");
    act(() => vi.advanceTimersByTime(3500));
    expect(placeholderOf()).toBe("גבינת עיזים");
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
