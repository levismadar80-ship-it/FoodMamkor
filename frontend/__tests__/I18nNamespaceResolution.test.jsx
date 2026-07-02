import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

// MEH-996 audit finding: DeliveryBlock / FollowButton / HolidayBanner read
// the `producer.delivery` / `producer.follow` / `producer.holiday_banner`
// namespaces, but the keys live under `group_buys.*` in BOTH locales
// (he.json + en.json). next-intl then renders the raw key path (its
// MISSING_MESSAGE fallback) instead of the Hebrew copy — e.g. the follow
// button label showed "producer.follow.follow_aria" for every signed-in
// user on a producer page. Same trap FridayDeliveryStrip already dodged
// (see its comment: "the prior producer.friday_delivery namespace never
// existed in the JSONs").
//
// Unlike the rest of the suite (which mocks next-intl per PR-A1/B
// precedent), these tests deliberately use the REAL provider + REAL
// he.json: the bug is in namespace resolution, so a key-echo mock would
// mask it.

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "user" } }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { following: false } }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast, default: showToast };
});

// WhatsAppButton drags in schemas/tracking — out of scope for ns resolution.
vi.mock("@/components/WhatsAppButton", () => ({
  default: () => <div data-testid="wa-stub" />,
}));

vi.mock("@/lib/holidays", () => ({
  getActiveHoliday: () => ({
    key: "sukkot",
    name: "סוכות",
    emoji: "🌿",
    color: "#2e6853",
    tagline: "טעמי החג",
    upcoming: true,
    searchParams: { q: "חג" },
  }),
}));

import FollowButton from "@/components/FollowButton";
import DeliveryBlock from "@/components/DeliveryBlock";
import HolidayBanner from "@/components/HolidayBanner";

const renderHe = (ui) =>
  render(
    // onError muted: with the bug present next-intl fires MISSING_MESSAGE
    // on every t() call, which would spam the test output.
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("i18n namespace resolution (MEH-996 audit — misnested group_buys.* blocks)", () => {
  it("FollowButton renders the Hebrew follow label, not a raw key path", () => {
    renderHe(<FollowButton producerId="p1" />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).not.toMatch(/producer\.follow/);
    expect(btn.textContent).toContain(he.group_buys.follow.follow_aria);
  });

  it("DeliveryBlock renders the Hebrew heading + nationwide badge, not raw key paths", () => {
    renderHe(
      <DeliveryBlock
        nationwide
        cities={[]}
        producer={{ id: "p1", name: "עסק", phone: "0501234567" }}
      />,
    );
    expect(document.body.textContent).not.toMatch(/producer\.delivery/);
    expect(
      screen.getByRole("heading", { name: he.group_buys.delivery.heading }),
    ).toBeTruthy();
    expect(
      screen.getByText(he.group_buys.delivery.nationwide),
    ).toBeTruthy();
  });

  it("DeliveryBlock renders the Hebrew arranged-delivery line when no cities", () => {
    renderHe(
      <DeliveryBlock
        nationwide={false}
        cities={[]}
        producer={{ id: "p1", name: "עסק", phone: "0501234567" }}
      />,
    );
    expect(screen.getByText(he.group_buys.delivery.arranged)).toBeTruthy();
  });

  it("HolidayBanner renders the Hebrew approaching line, not a raw key path", () => {
    renderHe(<HolidayBanner />);
    expect(document.body.textContent).not.toMatch(/producer\.holiday_banner/);
    // ICU-filled "{name} מתקרב {emoji}" with the mocked holiday values.
    const expected = he.group_buys.holiday_banner.approaching
      .replace("{name}", "סוכות")
      .replace("{emoji}", "🌿");
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
