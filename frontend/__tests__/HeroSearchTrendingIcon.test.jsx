import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import { Fire, TrendUp, ClockCounterClockwise } from "@phosphor-icons/react";
import HeroSearch from "@/components/HeroSearch";

// MEH-2508: the «חיפושים פופולריים» rows led with a green Fire glyph, which
// read as an emoji next to the calm search field (Sapir 28/10). They now lead
// with a muted TrendUp arrow — the trending-query mark Google/YouTube use —
// in the same muted tone as the recent-search clock.
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const fn = (k) => k;
    fn.rich = fn;
    return fn;
  },
  useLocale: () => "he",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => Promise.resolve({ data: url === "/search/trending" ? ["חלה", "גבינות"] : [] })),
  },
}));

const glyph = (Icon) => {
  const { container, unmount } = render(<Icon size={16} />);
  const html = container.querySelector("svg").innerHTML;
  unmount();
  return html;
};

describe("hero search trending rows (MEH-2508)", () => {
  it("lead with a muted TrendUp arrow, not the flame", async () => {
    const trend = glyph(TrendUp);
    const fire = glyph(Fire);
    expect(glyph(ClockCounterClockwise)).not.toBe(trend); // control: the glyphs differ
    expect(fire).not.toBe(trend);

    render(<HeroSearch placeholder="חיפוש" srLabel="חיפוש" />);
    await act(async () => {
      fireEvent.focus(screen.getByRole("combobox"));
    });
    const rows = await within(await screen.findByTestId("hero-search-history")).findAllByRole("option");
    expect(rows.map((r) => r.textContent)).toEqual(["חלה", "גבינות"]);
    for (const row of rows) {
      expect(row.querySelectorAll("svg")).toHaveLength(1);
      const svg = row.querySelector("svg");
      expect(svg.innerHTML).toBe(trend);
      expect(svg.getAttribute("class")).toContain("text-fg-muted");
    }
  });
});
