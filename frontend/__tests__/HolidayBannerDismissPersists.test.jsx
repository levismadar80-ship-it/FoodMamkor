/**
 * MEH-3986: closing the holiday banner keeps it closed for that holiday on the
 * next visit, and only for that holiday.
 *
 * Before: the dismissal went to sessionStorage, so a new visit (new tab, or the
 * browser reopened) showed the banner again for the whole two-week window. A
 * new visit is simulated here by unmounting and clearing sessionStorage, which
 * is what a new session starts with; localStorage survives it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";

import HolidayBanner from "@/components/HolidayBanner";
import api from "@/lib/api";
import { getActiveHoliday } from "@/lib/holidays";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/holidays", () => ({ getActiveHoliday: vi.fn() }));

const CHANUKA_2026 = {
  key: "chanuka",
  start: "2026-12-04",
  end: "2026-12-12",
  icon: "Flame",
  color: "#1D4ED8",
  upcoming: true,
  searchParams: { q: "שמן זית" },
};

async function visit() {
  await act(async () => {
    render(<HolidayBanner />);
  });
}
const bannerShown = () => screen.queryByTestId("holiday-banner") !== null;

function newSession() {
  cleanup();
  sessionStorage.clear();
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  api.get.mockResolvedValue({ data: { enabled: false } });
});

describe("holiday banner dismissal (MEH-3986)", () => {
  it("stays closed on the next visit during the same holiday", async () => {
    getActiveHoliday.mockReturnValue(CHANUKA_2026);
    await visit();
    expect(bannerShown(), "control: the banner shows before it is closed").toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "group_buys.holiday_banner.close_aria" }));
    expect(bannerShown()).toBe(false);

    newSession();
    await visit();
    expect(bannerShown(), "a new visit must not bring a closed banner back").toBe(false);
  });

  it("shows again for the same holiday next year", async () => {
    getActiveHoliday.mockReturnValue(CHANUKA_2026);
    await visit();
    fireEvent.click(screen.getByRole("button", { name: "group_buys.holiday_banner.close_aria" }));

    newSession();
    getActiveHoliday.mockReturnValue({ ...CHANUKA_2026, start: "2027-12-24", end: "2028-01-01" });
    await visit();
    expect(bannerShown(), "closing this year's Hanukkah must not hide next year's").toBe(true);
  });
});
