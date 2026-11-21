/**
 * MEH-3512 — a pickup point's days, its own order cutoff and the next pickup
 * date, from fields (not from the label). Real he.json copy, frozen clock.
 * States: 0 days + no cutoff (row exactly as before) · 1 day · many days ·
 * own cutoff that moves the date a week · cutoff with no days.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import DeliveryBlock from "@/components/DeliveryBlock";
import PickupSchedule from "@/components/PickupSchedule";
import { nextDeliveryDate, cutoffOfRow } from "@/lib/nextDelivery";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/he/p/x",
}));

// Wed 25/11/2026 16:00 Israel — past a «Wednesday 15:00» cutoff.
const WED_AFTER_CUTOFF = new Date("2026-11-25T14:00:00Z");
// Wed 25/11/2026 09:00 Israel — before it.
const WED_BEFORE_CUTOFF = new Date("2026-11-25T07:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WED_BEFORE_CUTOFF);
  document.documentElement.lang = "he";
});
afterEach(() => vi.useRealTimers());

const point = (extra = {}) => ({
  kind: "pickup",
  label: "שכונת אלונים",
  city: "הבונים",
  lat: 32.6,
  lng: 34.9,
  is_primary: false,
  ...extra,
});

function renderBlock(locations) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}} timeZone="Asia/Jerusalem">
      <DeliveryBlock nationwide={false} areas={[]} pickup producer={{ locations }} />
    </NextIntlClientProvider>,
  );
}

describe("cutoffOfRow + nextDeliveryDate (MEH-3512)", () => {
  const row = { order_cutoff_day: "רביעי", order_cutoff_time: "15:00" };

  it("reads a full cutoff and ignores half of one", () => {
    expect(cutoffOfRow(row)).toEqual({ dayIndex: 3, close: "15:00" });
    expect(cutoffOfRow({ order_cutoff_day: "רביעי" })).toBeNull();
    expect(cutoffOfRow({ order_cutoff_time: "15:00" })).toBeNull();
    expect(cutoffOfRow(null)).toBeNull();
  });

  it("before Wednesday 15:00 the Thursday pickup is tomorrow", () => {
    const next = nextDeliveryDate({ days: ["חמישי"], cutoff: cutoffOfRow(row), now: WED_BEFORE_CUTOFF });
    expect(next?.date).toBe("2026-11-26");
  });

  it("after Wednesday 15:00 it moves a week", () => {
    const next = nextDeliveryDate({ days: ["חמישי"], cutoff: cutoffOfRow(row), now: WED_AFTER_CUTOFF });
    expect(next?.date).toBe("2026-12-03");
  });

  it("the row's cutoff wins over the business order window", () => {
    // Business window: one day, Sunday until 12:00 → without the row cutoff
    // the search starts at Sunday 29/11 and Thursday lands on 3/12.
    const orderWindow = { sunday: [{ open: "08:00", close: "12:00" }] };
    const own = nextDeliveryDate({ days: ["חמישי"], orderWindow, cutoff: cutoffOfRow(row), now: WED_BEFORE_CUTOFF });
    const business = nextDeliveryDate({ days: ["חמישי"], orderWindow, now: WED_BEFORE_CUTOFF });
    expect(own?.date).toBe("2026-11-26");
    expect(business?.date).toBe("2026-12-03");
  });
});

describe("PickupRow schedule lines (MEH-3512)", () => {
  it("a point with no days and no cutoff renders as before", () => {
    renderBlock([point()]);
    expect(screen.getByText("שכונת אלונים")).toBeTruthy();
    expect(screen.queryByTestId("pickup-days")).toBeNull();
    expect(screen.queryByTestId("pickup-cutoff")).toBeNull();
    expect(screen.queryByTestId("next-delivery")).toBeNull();
  });

  it("one day: «איסוף ביום חמישי», own cutoff, next pickup tomorrow", () => {
    renderBlock([point({ pickup_days: ["חמישי"], order_cutoff_day: "רביעי", order_cutoff_time: "15:00" })]);
    expect(screen.getByTestId("pickup-days").textContent).toBe("איסוף ביום חמישי");
    expect(screen.getByTestId("pickup-cutoff").textContent).toBe("מקבלים הזמנות עד יום רביעי 15:00");
    expect(screen.getByTestId("next-delivery").textContent).toBe("האיסוף הבא: יום חמישי 26.11");
  });

  it("many days: joined the Hebrew way", () => {
    renderBlock([point({ pickup_days: ["שלישי", "חמישי"] })]);
    expect(screen.getByTestId("pickup-days").textContent).toBe("איסוף בימים שלישי וחמישי");
  });

  it("a cutoff with no days: only the cutoff line", () => {
    renderBlock([point({ order_cutoff_day: "רביעי", order_cutoff_time: "15:00" })]);
    expect(screen.queryByTestId("pickup-days")).toBeNull();
    expect(screen.getByTestId("pickup-cutoff")).toBeTruthy();
    expect(screen.queryByTestId("next-delivery")).toBeNull();
  });
});

function renderSchedule(loc, props) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}} timeZone="Asia/Jerusalem">
      <PickupSchedule loc={loc} {...props} />
    </NextIntlClientProvider>,
  );
}

// Sapir 20/11 («עמוס»): hours, days and cutoff share one line; days the hours
// already name are not said twice.
describe("PickupSchedule — one line", () => {
  it("hours that name the pickup day: the days are not repeated", () => {
    renderSchedule({ pickup_days: ["שלישי"], order_cutoff_day: "שני", order_cutoff_time: "15:00" }, { hours: "יום שלישי 17:00-19:00", hoursText: "יום שלישי 17:00-19:00" });
    const line = screen.getByTestId("pickup-terms");
    expect(line.textContent).toBe("יום שלישי 17:00-19:00מקבלים הזמנות עד יום שני 15:00");
    expect(screen.queryByTestId("pickup-days")).toBeNull();
  });

  it("hours that do not name it: days stay, on the same line", () => {
    renderSchedule({ pickup_days: ["חמישי"] }, { hours: "8-13", hoursText: "8-13" });
    expect(screen.getByTestId("pickup-terms").textContent).toBe("8-13איסוף ביום חמישי");
  });

  it("hours only: one line with the hours", () => {
    renderSchedule({}, { hours: "שישי 8-13", hoursText: "שישי 8-13" });
    expect(screen.getByTestId("pickup-terms").textContent).toBe("שישי 8-13");
  });
});
