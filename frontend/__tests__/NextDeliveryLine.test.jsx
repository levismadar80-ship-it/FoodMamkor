/**
 * MEH-3485 — «המשלוח הבא» on the business page: under each delivery-day
 * heading, and under the «מגיעים אלייך?» yes. Real he.json copy, frozen clock.
 * States: 0 lines (vacation · arranged bucket · flat rows · checker "no"),
 * 1 line (one shared day set, hoisted), many (one per day group).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import DeliveryBlock from "@/components/DeliveryBlock";
import DeliveryChecker from "@/components/DeliveryChecker";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/he/p/x",
}));

const D = he.group_buys.delivery;
const line = (date, city) =>
  (city ? D.next_delivery_city.replace("{city}", city) : D.next_delivery).replace("{date}", date);

// Tue 24/11/2026 09:00 Israel.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T07:00:00Z"));
  document.documentElement.lang = "he";
});
afterEach(() => vi.useRealTimers());

function renderIn(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}} timeZone="Asia/Jerusalem">
      {ui}
    </NextIntlClientProvider>,
  );
}

const producer = (over = {}) => ({ id: 1, offers_delivery: true, availability_state: "accepting_orders", ...over });

describe("NextDeliveryLine in DeliveryBlock (MEH-3485)", () => {
  it("many: one date under each day group; none under «בתיאום מראש»", () => {
    const areas = [
      { id: 1, city: "חיפה", delivery_day: "שני", min_order: 100 },
      { id: 2, city: "עכו", delivery_day: "חמישי", min_order: 80 },
      { id: 3, city: "נהריה", min_order: 90 },
    ];
    renderIn(<DeliveryBlock areas={areas} producer={producer({ delivery_areas: areas })} />);
    const lines = screen.getAllByTestId("next-delivery").map((n) => n.textContent);
    expect(lines).toEqual([line("יום שני 30.11"), line("יום חמישי 26.11")]);
  });

  it("1: one shared day set is hoisted, so one line", () => {
    const areas = [
      { id: 1, city: "חיפה", delivery_day: "שישי", min_order: 100 },
      { id: 2, city: "עכו", delivery_day: "שישי", min_order: 80 },
    ];
    renderIn(<DeliveryBlock areas={areas} producer={producer()} />);
    expect(screen.getAllByTestId("next-delivery").map((n) => n.textContent)).toEqual([line("יום שישי 27.11")]);
  });

  it("a single order cutoff moves the date: orders until Tuesday 08:00 are closed, so next week", () => {
    const areas = [{ id: 1, city: "חיפה", delivery_day: "רביעי", min_order: 100 }];
    const order_window = { tuesday: [{ open: "06:00", close: "08:00" }] };
    renderIn(<DeliveryBlock areas={areas} producer={producer({ order_window })} />);
    expect(screen.getByTestId("next-delivery").textContent).toBe(line("יום רביעי 2.12"));
  });

  it("0: on vacation, no line anywhere", () => {
    const areas = [{ id: 1, city: "חיפה", delivery_day: "שני", min_order: 100 }];
    renderIn(<DeliveryBlock areas={areas} producer={producer({ availability_state: "on_vacation" })} />);
    expect(screen.queryByTestId("next-delivery")).toBeNull();
  });

  it("0: rows with no day at all carry no date", () => {
    const areas = [{ id: 1, city: "חיפה", min_order: 100 }];
    renderIn(<DeliveryBlock areas={areas} producer={producer()} />);
    expect(screen.queryByTestId("next-delivery")).toBeNull();
  });
});

describe("NextDeliveryLine in DeliveryChecker (MEH-3485)", () => {
  const areas = [
    { city: "חיפה", delivery_day: "שני", delivery_days: ["שני", "חמישי"] },
    { city: "עכו" },
  ];
  const pick = (city) => {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: city } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  };

  it("yes with days: names the city and the nearest of its days", () => {
    renderIn(<DeliveryChecker offersDelivery areas={areas} producer={producer()} />);
    pick("חיפה");
    const result = screen.getByTestId("delivery-checker-result");
    expect(within(result).getByTestId("next-delivery").textContent).toBe(line("יום חמישי 26.11", "חיפה"));
  });

  it("yes without a day, and no: no date", () => {
    renderIn(<DeliveryChecker offersDelivery areas={areas} producer={producer()} />);
    pick("עכו");
    expect(screen.queryByTestId("next-delivery")).toBeNull();
    pick("אילת");
    expect(screen.getByTestId("delivery-checker-result").dataset.result).toBe("no");
    expect(screen.queryByTestId("next-delivery")).toBeNull();
  });
});
