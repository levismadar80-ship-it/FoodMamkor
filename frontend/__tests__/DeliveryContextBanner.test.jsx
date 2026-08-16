/**
 * MEH-2046 PR-6 — the /map day-bridge context banner.
 *
 * DISCRIMINATION: every case in the second `describe` block (FilterChipsBar
 * gating) fails against pre-PR-6 code for two independent reasons — neither
 * a `cityFilter` prop nor a `DeliveryContextBanner` import/render existed on
 * FilterChipsBar, so `screen.queryByTestId("delivery-context-banner")` was
 * always null regardless of chipState/cityFilter. The first `describe` block
 * (the component in isolation) fails for the simpler reason that the file
 * itself did not exist before this PR.
 *
 * REUSES: __tests__/MapProducerCardFulfillment.test.jsx — the `useTranslations
 * → key` + `next/link → <a>` mock pair, and asserting the raw Hebrew/English
 * copy against messages/*.json directly rather than through a translation
 * mock (mocking a lookup table and then asserting against it would only
 * prove the table matches itself).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import DeliveryContextBanner from "@/app/[locale]/map/components/DeliveryContextBanner";
import FilterChipsBar from "@/app/[locale]/map/components/FilterChipsBar";
import heMessages from "@/messages/he.json";
import enMessages from "@/messages/en.json";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

describe("DeliveryContextBanner — the component in isolation", () => {
  it("renders the explanation, the dismiss control, and the bridge CTA", () => {
    render(<DeliveryContextBanner city="חיפה" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("map.filter.delivery_context_banner")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "map.filter.banner_dismiss_aria" })
    ).toBeInTheDocument();
    expect(screen.getByText("map.filter.day_bridge_cta")).toBeInTheDocument();
  });

  it("the bridge CTA links to /producers with the city query param — not delivery_city", () => {
    render(<DeliveryContextBanner city="חיפה" />);

    const link = screen.getByText("map.filter.day_bridge_cta").closest("a");
    // MEH-1826 serializer trap: ProducersClient hydrates from `city`, not
    // `delivery_city` (that name is the backend's internal param only).
    expect(link).toHaveAttribute("href", `/producers?city=${encodeURIComponent("חיפה")}`);
  });

  it("dismiss hides the banner — component state only, nothing else to assert changed", () => {
    render(<DeliveryContextBanner city="חיפה" />);

    fireEvent.click(screen.getByRole("button", { name: "map.filter.banner_dismiss_aria" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("DeliveryContextBanner copy — asserted against the message files directly", () => {
  it("he.json interpolates {city} into the locked Hebrew sentence", () => {
    expect(heMessages.map.filter.delivery_context_banner).toBe(
      "בתי עסק שמחלקים ל{city}. הסימון במפה הוא מקום העסק — לא אזור המשלוח"
    );
  });

  it("en.json carries a translation for the same three keys", () => {
    expect(typeof enMessages.map.filter.delivery_context_banner).toBe("string");
    expect(enMessages.map.filter.delivery_context_banner).toContain("{city}");
    expect(typeof enMessages.map.filter.banner_dismiss_aria).toBe("string");
    expect(typeof enMessages.map.filter.day_bridge_cta).toBe("string");
  });
});

describe("FilterChipsBar — Option C REFINED-state gating (delivery chip + city)", () => {
  // REUSES: __tests__/ChipScrollRow.test.jsx:74-76 — jsdom doesn't implement
  // the scroll methods ChipScrollRow (the category row FilterChipsBar mounts)
  // calls on mount.
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const baseProps = {
    visibleCategoryChips: [],
    onCategoryChipClick: () => {},
    onToggleChipClick: () => {},
    onSheetToggleChip: () => {},
    clearSheetFilters: () => {},
    resultCount: 0,
    activeFilterTags: [],
    resetAllFilters: () => {},
    activeAttributeCount: 0,
  };
  const chipState = (overrides) => ({
    categoryKeys: [],
    organic: false,
    has_delivery: false,
    pickup_points: false,
    verified: false,
    kosher: false,
    grass_fed: false,
    vegan: false,
    gluten_free: false,
    lactose_free: false,
    ...overrides,
  });

  it("no banner: delivery chip off, no city (the default, unscoped everything)", () => {
    render(<FilterChipsBar {...baseProps} chipState={chipState()} cityFilter="" />);
    expect(screen.queryByTestId("delivery-context-banner")).not.toBeInTheDocument();
  });

  it("no banner: delivery chip ON but UNSCOPED (no city) — decision 1's non-blocking state", () => {
    render(
      <FilterChipsBar {...baseProps} chipState={chipState({ has_delivery: true })} cityFilter="" />
    );
    expect(screen.queryByTestId("delivery-context-banner")).not.toBeInTheDocument();
  });

  it("no banner: a city is set but delivery is NOT active (e.g. plain city search)", () => {
    render(<FilterChipsBar {...baseProps} chipState={chipState()} cityFilter="חיפה" />);
    expect(screen.queryByTestId("delivery-context-banner")).not.toBeInTheDocument();
  });

  it("banner present: delivery chip ON + city set — the REFINED state", () => {
    render(
      <FilterChipsBar
        {...baseProps}
        chipState={chipState({ has_delivery: true })}
        cityFilter="חיפה"
      />
    );
    const banner = screen.getByTestId("delivery-context-banner");
    expect(banner).toBeInTheDocument();
    const link = screen.getByText("map.filter.day_bridge_cta").closest("a");
    expect(link).toHaveAttribute("href", `/producers?city=${encodeURIComponent("חיפה")}`);
  });

  it("pickup_points alone (no delivery) does NOT trigger the banner — it is delivery-specific copy", () => {
    render(
      <FilterChipsBar
        {...baseProps}
        chipState={chipState({ pickup_points: true })}
        cityFilter="חיפה"
      />
    );
    expect(screen.queryByTestId("delivery-context-banner")).not.toBeInTheDocument();
  });
});
