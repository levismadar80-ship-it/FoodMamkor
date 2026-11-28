import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

// MEH-996 audit finding: DeliveryBlock / HolidayBanner read the
// `producer.delivery` / `producer.holiday_banner` namespaces, but the keys
// live under `group_buys.*` in BOTH locales (he.json + en.json). next-intl
// then renders the raw key path (its MISSING_MESSAGE fallback) instead of
// the Hebrew copy. Same trap FridayDeliveryStrip already dodged (see its
// comment: "the prior producer.friday_delivery namespace never existed in
// the JSONs"). FollowButton was the third case here until MEH-1363
// removed the component (decision A, MEH-1362).
//
// Unlike the rest of the suite (which mocks next-intl per PR-A1/B
// precedent), these tests deliberately use the REAL provider + REAL
// he.json: the bug is in namespace resolution, so a key-echo mock would
// mask it.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "user" } }),
}));

vi.mock("@/lib/api", async () => {
  // MEH-3993: the holiday shelf renders only with 3+ businesses, so
  // /producers answers with three contract-valid rows.
  const { contractRow, uuidFor } = await import("./helpers/contract-row");
  const { GetFavoritesUsersMeFavoritesGetResponseItem: FAV } = await import("@/lib/generated/api.zod");
  const rows = [1, 2, 3].map((i) =>
    contractRow(FAV._zod.def.shape.producer, { id: uuidFor(`p${i}`), name: `עסק ${i}`, city: "x", slug: `b-${i}`, images: [] }));
  return {
  default: {
    get: vi.fn((url) =>
      Promise.resolve({ data: url === "/producers" ? rows : { following: false } })),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  };
});

vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast, default: showToast };
});

// MEH-1467: the WhatsAppButton mock was removed — DeliveryBlock no longer
// imports WhatsAppButton (MEH-1466 dropped it from the delivery CTA), and the
// component itself is deleted, so the mock is a dead no-op.
vi.mock("@/lib/holidays", () => ({
  getActiveHoliday: () => ({
    key: "sukkot",
    name: "סוכות",
    icon: "Leaf",
    tagline: "טעמי החג",
    upcoming: true,
    searchParams: { q: "חג" },
  }),
}));

import DeliveryBlock from "@/components/DeliveryBlock";
import HomeHolidayShelf from "@/app/[locale]/home/HomeHolidayShelf";

const renderHe = (ui) =>
  render(
    // onError muted: with the bug present next-intl fires MISSING_MESSAGE
    // on every t() call, which would spam the test output.
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("i18n namespace resolution (MEH-996 audit — misnested group_buys.* blocks)", () => {
  // MEH-1363: the FollowButton case was removed with the component itself
  // (decision A, MEH-1362 — the heart is the single interest control).

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

  it("HomeHolidayShelf renders the Hebrew eyebrow, not a raw key path", async () => {
    renderHe(<HomeHolidayShelf />);
    // ICU-filled "לקראת {name}" with the mocked holiday (MEH-3993).
    const expected = he.group_buys.holiday_banner.eyebrow.replace("{name}", "סוכות");
    expect(await screen.findByText(expected)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/holiday_banner|holidays\./);
  });
});
