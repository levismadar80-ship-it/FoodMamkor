import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import api from "@/lib/api";
import HeroSearch from "@/components/HeroSearch";

// MEH-3257 (Sapir 14/11): «חיפושים פופולריים» is gone until there is a
// real audience — one IP could steer it. With no recent searches the empty
// field opens nothing and asks the server for nothing; with recent searches
// the dropdown is exactly those, as before.
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
// The mock still answers a trending call with rows, so if the fetch came back
// the dropdown would render them and the 0-case below goes red.
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => Promise.resolve({ data: url === "/search/trending" ? ["חלה", "גבינות"] : [] })),
  },
}));

const RECENT_KEY = "mehamakor_recent_searches";

async function focusEmpty() {
  render(<HeroSearch placeholder="חיפוש" srLabel="חיפוש" />);
  await act(async () => {
    fireEvent.focus(screen.getByRole("combobox"));
  });
}

describe("hero search empty-field dropdown (MEH-3257)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.get).mockClear();
  });

  it("0 recent searches: no dropdown, no trending request", async () => {
    await focusEmpty();
    expect(screen.queryByTestId("hero-search-history")).toBeNull();
    expect(vi.mocked(api.get).mock.calls.map((c) => c[0])).not.toContain("/search/trending");
  });

  it("1 recent search: only that row", async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["מחמצת"]));
    await focusEmpty();
    const rows = within(screen.getByTestId("hero-search-history")).getAllByRole("option");
    expect(rows.map((r) => r.textContent.replace("×", ""))).toEqual(["מחמצת"]);
    expect(screen.queryByText("trending_heading")).toBeNull();
  });

  it("many recent searches: all of them, no trending heading", async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["מחמצת", "עיזים", "דבש"]));
    await focusEmpty();
    const rows = within(screen.getByTestId("hero-search-history")).getAllByRole("option");
    expect(rows).toHaveLength(3);
    expect(screen.getByText("recent_heading")).toBeTruthy();
    expect(screen.queryByText("trending_heading")).toBeNull();
  });
});
