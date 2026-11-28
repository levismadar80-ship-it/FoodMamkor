/**
 * MEH-879 / MEH-881: homepage banner single-slot precedence.
 *
 * The homepage renders AT MOST ONE of {FridayStrip, LocationBanner}.
 * Precedence: Friday > Location. Friday reports visibility via
 * `onVisibilityChange`; Location takes a `suppressed` prop that forces null.
 *
 * MEH-3993: the holiday banner left the slot. It is HomeHolidayShelf now, a
 * content row further down the page, so a holiday must no longer push the
 * location banner out. The harness mounts the shelf next to the two banners,
 * as HomeClient does, so the "holiday active" cells below would go red if the
 * shelf were wired back into the slot.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, act } from "@testing-library/react";

import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import HomeHolidayShelf from "@/app/[locale]/home/HomeHolidayShelf";
import LocationBanner, { REVEAL_DELAY_MS } from "@/components/LocationBanner";
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
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()), // keep real IMAGE_RATIOS
  optimizeCloudinary: (u) => u,
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/holidays", () => ({ getActiveHoliday: vi.fn() }));

const HOLIDAY = {
  // MEH-2741: name/tagline/cta come from messages (`holidays.<key>.*`), which
  // the key-echo next-intl mock above renders as the key path.
  key: "test",
  icon: "Sparkle",
  upcoming: false,
  searchParams: { q: "test" },
};

// Mirrors HomeClient.jsx's slot wiring: Friday is gated by fridayMode and
// reports visibility; Location is suppressed once Friday is visible. The shelf
// sits outside the slot and takes no slot props.
function Slot({ fridayMode, hasCity }) {
  const [fridayVisible, setFridayVisible] = useState(false);
  return (
    <>
      {fridayMode && (
        <FridayDeliveryStrip city={null} onVisibilityChange={setFridayVisible} />
      )}
      <LocationBanner
        hasCity={hasCity}
        onOpenModal={() => {}}
        suppressed={fridayMode && fridayVisible}
      />
      <HomeHolidayShelf />
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
const locationShown = () =>
  screen.queryByText("location.banner.choose_city") !== null;

async function renderSlot(props) {
  await act(async () => {
    render(<Slot {...props} />);
  });
  // Flush banner fetch promises + LocationBanner's reveal timer. MEH-2634:
  // read off the component (8s now, 3s before) — a literal here would make the
  // Location cell green-for-nothing after the delay changed.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVEAL_DELAY_MS + 500);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  // MEH-2394: LocationBanner arms its reveal only once cookie consent exists.
  // This suite is about the slot's precedence, not the gate (that is
  // LocationBannerCookieGate.test.jsx), so consent is a given here.
  localStorage.setItem("cookieConsent", "all");
  api.get.mockReset();
  getActiveHoliday.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("homepage banner single-slot precedence", () => {
  it("renders ONLY Friday when Friday and Location both qualify", async () => {
    setConditions({ producers: [{ id: 1, name: "P", city: "C", images: [] }], holiday: HOLIDAY });
    await renderSlot({ fridayMode: true, hasCity: false });

    expect(fridayShown()).toBe(true);
    expect(locationShown()).toBe(false);
  });

  it("renders Location when Friday is off, even with a holiday active (MEH-3993)", async () => {
    setConditions({ producers: [], holiday: HOLIDAY });
    await renderSlot({ fridayMode: false, hasCity: false });

    expect(getActiveHoliday, "control: the holiday was resolved").toHaveBeenCalled();
    expect(fridayShown()).toBe(false);
    expect(locationShown()).toBe(true);
  });

  it("renders ONLY Location when neither Friday nor a holiday qualify", async () => {
    setConditions({ producers: [], holiday: null });
    await renderSlot({ fridayMode: false, hasCity: false });

    expect(fridayShown()).toBe(false);
    expect(locationShown()).toBe(true);
  });

  it("renders NONE when no banner condition is met", async () => {
    setConditions({ producers: [], holiday: null });
    await renderSlot({ fridayMode: false, hasCity: true });

    expect(fridayShown()).toBe(false);
    expect(locationShown()).toBe(false);
  });
});
