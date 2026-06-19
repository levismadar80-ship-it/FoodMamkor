/**
 * MEH-879 / MEH-881: homepage banner single-slot precedence.
 *
 * The homepage renders AT MOST ONE of {FridayStrip, HolidayBanner,
 * LocationBanner}. Precedence: Friday > Holiday > Location. Each banner
 * keeps its own internal show-condition; higher-precedence banners report
 * visibility via `onVisibilityChange`, lower-precedence banners take a
 * `suppressed` prop that forces null.
 *
 * This test mounts the three REAL banner components inside a harness that
 * mirrors HomePage's slot wiring (the `{fridayMode && <FridayDeliveryStrip>}`
 * + `<HolidayBanner>` + `<LocationBanner>` block), drives each banner's own
 * condition via mocked deps, and asserts the exactly-one (and none) outcomes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, act } from "@testing-library/react";

import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import HolidayBanner from "@/components/HolidayBanner";
import LocationBanner from "@/components/LocationBanner";
import api from "@/lib/api";
import { getActiveHoliday } from "@/lib/holidays";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/holidays", () => ({ getActiveHoliday: vi.fn() }));

const HOLIDAY = {
  key: "test",
  name: "TestHoliday",
  emoji: "🎉",
  color: "#abcdef",
  tagline: "tag",
  cta: "Shop",
  upcoming: false,
  searchParams: { q: "test" },
};

// Mirrors page.js's slot wiring exactly: Friday is gated by fridayMode and
// reports visibility; Holiday is suppressed once Friday is visible; Location
// is suppressed once Friday OR Holiday is visible.
function Slot({ fridayMode, hasCity }) {
  const [fridayVisible, setFridayVisible] = useState(false);
  const [holidayVisible, setHolidayVisible] = useState(false);
  return (
    <>
      {fridayMode && (
        <FridayDeliveryStrip city={null} onVisibilityChange={setFridayVisible} />
      )}
      <HolidayBanner
        suppressed={fridayMode && fridayVisible}
        onVisibilityChange={setHolidayVisible}
      />
      <LocationBanner
        hasCity={hasCity}
        onOpenModal={() => {}}
        suppressed={(fridayMode && fridayVisible) || holidayVisible}
      />
    </>
  );
}

function setConditions({ producers = [], holiday = null }) {
  api.get.mockImplementation((url) => {
    if (url === "/producers") return Promise.resolve({ data: producers });
    if (url === "/holiday-mode") return Promise.resolve({ data: { enabled: false } });
    return Promise.resolve({ data: [] });
  });
  getActiveHoliday.mockReturnValue(holiday);
}

// Queries keyed to each banner's own copy (echoed t() / fixture text).
const fridayShown = () =>
  screen.queryByText("group_buys.friday_delivery.title_alt") !== null;
const holidayShown = () => screen.queryByText(/TestHoliday/) !== null;
const locationShown = () =>
  screen.queryByText("location.banner.choose_city") !== null;

async function renderSlot(props) {
  await act(async () => {
    render(<Slot {...props} />);
  });
  // Flush banner fetch promises + LocationBanner's 3s reveal timer.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  api.get.mockReset();
  getActiveHoliday.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("homepage banner single-slot precedence", () => {
  it("renders ONLY Friday when all three conditions are true", async () => {
    setConditions({ producers: [{ id: 1, name: "P", city: "C", images: [] }], holiday: HOLIDAY });
    await renderSlot({ fridayMode: true, hasCity: false });

    expect(fridayShown()).toBe(true);
    expect(holidayShown()).toBe(false);
    expect(locationShown()).toBe(false);
  });

  it("renders ONLY Holiday when Friday is off but Holiday + Location qualify", async () => {
    setConditions({ producers: [], holiday: HOLIDAY });
    await renderSlot({ fridayMode: false, hasCity: false });

    expect(fridayShown()).toBe(false);
    expect(holidayShown()).toBe(true);
    expect(locationShown()).toBe(false);
  });

  it("renders ONLY Location when neither Friday nor Holiday qualify", async () => {
    setConditions({ producers: [], holiday: null });
    await renderSlot({ fridayMode: false, hasCity: false });

    expect(fridayShown()).toBe(false);
    expect(holidayShown()).toBe(false);
    expect(locationShown()).toBe(true);
  });

  it("renders NONE when no banner condition is met", async () => {
    setConditions({ producers: [], holiday: null });
    await renderSlot({ fridayMode: false, hasCity: true });

    expect(fridayShown()).toBe(false);
    expect(holidayShown()).toBe(false);
    expect(locationShown()).toBe(false);
  });
});
