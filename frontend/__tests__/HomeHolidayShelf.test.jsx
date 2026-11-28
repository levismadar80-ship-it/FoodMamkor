// MEH-3993 — the homepage holiday shelf: around a holiday, 3–5 businesses for
// the holiday's search, or nothing at all. Replaces the dismissable
// HolidayBanner (MEH-3986's dismissal test lived in this file's place).
import { contractRow, uuidFor } from "./helpers/contract-row";
import { GetFavoritesUsersMeFavoritesGetResponseItem as FAV } from "@/lib/generated/api.zod";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";

const MESSAGES = {
  "group_buys.holiday_banner.eyebrow": "לקראת {name}",
  "holidays.chanuka.name": "חנוכה",
  "holidays.chanuka.shelf_heading": "שמן זית מהמסיק של השנה",
  "holidays.chanuka.tagline": "כתית מעולה, ישר מבית הבד.",
  "holidays.chanuka.cta": "לכל השמנים",
  "holidays.sukkot.name": "סוכות",
  "holidays.sukkot.tagline": "פירות העונה",
  "holidays.sukkot.cta": "הצגת פירות",
};
vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key, vars) => {
      const msg = MESSAGES[`${ns}.${key}`] ?? `${ns}.${key}`;
      return vars ? msg.replace("{name}", vars.name) : msg;
    };
    t.has = (key) => `${ns}.${key}` in MESSAGES;
    return t;
  },
  useLocale: () => "he",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/hooks/useScrollAffordance", () => ({
  default: () => ({ scrollRef: { current: null }, canScrollStart: false, canScrollEnd: false }),
  ScrollArrows: () => null,
}));
vi.mock("@/components/BusinessCtaLink", () => ({ default: () => null }));
// ProducerCard is reused as-is (its own suites cover it); here it only has to
// say which business it got.
vi.mock("@/components/ProducerCard", () => ({
  default: ({ producer }) => <article data-testid="card">{producer.name}</article>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }) => <img alt={alt} src={src} />,
}));
const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));
const getActiveHoliday = vi.fn();
vi.mock("@/lib/holidays", () => ({ getActiveHoliday: (...a) => getActiveHoliday(...a) }));

import HomeHolidayShelf, { HOLIDAY_SHELF_MAX } from "@/app/[locale]/home/HomeHolidayShelf";

const CHANUKA = { key: "chanuka", icon: "Flame", upcoming: true, searchParams: { q: "שמן זית" } };
const producer = (i) =>
  contractRow(FAV._zod.def.shape.producer, { id: uuidFor(`p${i}`), name: `בית בד ${i}`, city: "גליל", slug: `oil-${i}`, images: [] });
const many = (n) => Array.from({ length: n }, (_, i) => producer(i + 1));

/** @param {{ rows?: any[], fail?: boolean, holiday?: any }} opts */
async function mount({ rows = [], fail = false, holiday = CHANUKA } = {}) {
  getActiveHoliday.mockReturnValue(holiday);
  apiGet.mockImplementation((url) => {
    if (url === "/holiday-mode") return Promise.resolve({ data: { enabled: false } });
    if (url === "/producers") return fail ? Promise.reject(new Error("503")) : Promise.resolve({ data: rows });
    return Promise.resolve({ data: [] });
  });
  await act(async () => {
    render(<HomeHolidayShelf />);
  });
}
const shelf = () => screen.queryByTestId("home-holiday-shelf");
const producersCalls = () => apiGet.mock.calls.filter(([url]) => url === "/producers");

beforeEach(() => {
  cleanup();
  apiGet.mockReset();
  getActiveHoliday.mockReset();
});

describe("HomeHolidayShelf (MEH-3993)", () => {
  it("3 businesses → eyebrow, heading, subline, 3 cards and the link to all results", async () => {
    await mount({ rows: many(3) });
    expect(shelf()).not.toBeNull();
    expect(screen.getByText("לקראת חנוכה")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "שמן זית מהמסיק של השנה" })).toBeTruthy();
    expect(screen.getByText("כתית מעולה, ישר מבית הבד.")).toBeTruthy();
    expect(shelf().querySelectorAll("li")).toHaveLength(3);
    const all = screen.getByRole("link", { name: /לכל השמנים/ });
    expect(all.getAttribute("href")).toBe(`/producers?q=${encodeURIComponent("שמן זית")}`);
  });

  it("asks for the holiday's query with a limit of 5, and shows at most 5", async () => {
    await mount({ rows: many(7) });
    expect(producersCalls()).toHaveLength(1);
    expect(producersCalls()[0][1]).toEqual({ params: { q: "שמן זית", limit: HOLIDAY_SHELF_MAX } });
    expect(HOLIDAY_SHELF_MAX).toBe(5);
    expect(shelf().querySelectorAll("li")).toHaveLength(5);
  });

  it("2 businesses → renders nothing", async () => {
    await mount({ rows: many(2) });
    expect(producersCalls(), "control: the shelf did ask").toHaveLength(1);
    expect(shelf()).toBeNull();
    expect(screen.queryByText("לקראת חנוכה")).toBeNull();
  });

  it("the request fails → renders nothing", async () => {
    await mount({ fail: true });
    expect(producersCalls(), "control: the shelf did ask").toHaveLength(1);
    expect(shelf()).toBeNull();
  });

  it("no holiday → no request and nothing on screen", async () => {
    await mount({ rows: many(3), holiday: null });
    expect(producersCalls()).toHaveLength(0);
    expect(shelf()).toBeNull();
  });

  it("no close button, no colour, no border or shadow — content, not an alert", async () => {
    await mount({ rows: many(3) });
    expect(screen.queryByRole("button", { name: /סגרו|close/i })).toBeNull();
    const el = shelf();
    expect(el.getAttribute("style")).toBeNull();
    expect(el.className).not.toMatch(/\b(shadow|border)\b|shadow-/);
  });

  it("a holiday without shelf words falls back: heading = name, link = cta; during the holiday no repeated eyebrow", async () => {
    await mount({ rows: many(3), holiday: { key: "sukkot", icon: "Leaf", upcoming: false, searchParams: { q: "פירות" } } });
    expect(screen.getByRole("heading", { name: "סוכות" })).toBeTruthy();
    expect(screen.getAllByText("סוכות")).toHaveLength(1);
    expect(screen.getByText("פירות העונה")).toBeTruthy();
    expect(screen.getByRole("link", { name: /הצגת פירות/ })).toBeTruthy();
  });
});
