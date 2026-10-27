/**
 * MEH-2046 — the /map card's fulfillment tag block.
 *
 * The state matrix is (delivers × offers_pickup) = FOUR cells, and all four are
 * asserted below. CLAUDE.md's conditional-UI rule is explicit that counting two
 * lists separately looks like full coverage while leaving a cell unspecced —
 * MEH-1583 shipped exactly that gap to production — so the cells are enumerated
 * rather than the axes.
 *
 * DISCRIMINATION: every case fails against pre-2046 code, where the block did
 * not exist at all (MapProducerCard's header explicitly forbade a delivery
 * pill). The load-bearing assertions are therefore not "a tag rendered" but:
 *   - the block is present in ALL four states, including "neither" — the
 *     always-present property that keeps the 🔒 MEH-1243 §5 uniform-height
 *     guarantee intact once a fourth row exists;
 *   - the legacy operands do NOT drive it — the inverse pin that stops the
 *     MEH-1836 divergence being reintroduced through a fallback.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import MapProducerCard from "@/components/MapProducerCard";

// REUSES: __tests__/MapProducerCard.test.jsx:13-40 — the same provider mocks.
// `useTranslations` returns the KEY, so the cases below assert STRUCTURE (which
// tag key renders in which cell) via data-testid. The Hebrew copy is asserted
// separately, against messages/he.json itself — mocking a lookup table here and
// asserting against it would only prove the table matches itself.
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }) => <img alt={alt} src={typeof src === "string" ? src : ""} />,
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u || "" }));
vi.mock("@/lib/user-location", () => ({ useUserLocation: () => ({ location: null }) }));

const base = {
  id: "p1",
  name: "חוות הבדיקה",
  images: [],
  categories: [{ name: "ירקות" }],
};

const renderCard = (extra) => render(<MapProducerCard producer={{ ...base, ...extra }} />);

describe("MapProducerCard — fulfillment tags, all four cells (MEH-2046)", () => {
  it("both → two tags", () => {
    renderCard({ delivers: true, offers_pickup: true });

    expect(screen.getByTestId("map-fulfillment-delivery")).toBeInTheDocument();
    expect(screen.getByTestId("map-fulfillment-pickup")).toBeInTheDocument();
    // The single-axis wordings must NOT appear when both are true — "משלוח בלבד"
    // next to a pickup tag would be a self-contradicting card.
    expect(screen.queryByTestId("map-fulfillment-delivery_only")).toBeNull();
    expect(screen.queryByTestId("map-fulfillment-pickup_only")).toBeNull();
  });

  it("delivery only → the exclusive wording", () => {
    renderCard({ delivers: true, offers_pickup: false });

    expect(screen.getByTestId("map-fulfillment-delivery_only")).toBeInTheDocument();
    expect(screen.queryByTestId("map-fulfillment-pickup")).toBeNull();
  });

  it("pickup only → the exclusive wording", () => {
    renderCard({ delivers: false, offers_pickup: true });

    expect(screen.getByTestId("map-fulfillment-pickup_only")).toBeInTheDocument();
    expect(screen.queryByTestId("map-fulfillment-delivery")).toBeNull();
  });

  it("neither → the neutral arranged tag, still rendered", () => {
    // The cell most likely to be dropped, and the one the uniform-height
    // guarantee depends on: an absent block here would make these cards shorter
    // than every other card in the list.
    renderCard({ delivers: false, offers_pickup: false });

    expect(screen.getByTestId("map-fulfillment-arranged")).toBeInTheDocument();
  });

  it("the block itself is present in ALL four cells", () => {
    // Asserted as its own case rather than inferred from the four above: this
    // is the property the 🔒 §5 uniform-height lock actually needs, and it must
    // survive someone later making one branch return null.
    for (const cell of [
      { delivers: true, offers_pickup: true },
      { delivers: true, offers_pickup: false },
      { delivers: false, offers_pickup: true },
      { delivers: false, offers_pickup: false },
    ]) {
      const { unmount } = renderCard(cell);
      expect(screen.getByTestId("map-fulfillment")).toBeInTheDocument();
      unmount();
    }
  });

  it("exactly one tag except in the both-cell, which has exactly two", () => {
    // Counts, not presence — a block that rendered every tag unconditionally
    // would pass all the getByTestId assertions above.
    const counts = [
      [{ delivers: true, offers_pickup: true }, 2],
      [{ delivers: true, offers_pickup: false }, 1],
      [{ delivers: false, offers_pickup: true }, 1],
      [{ delivers: false, offers_pickup: false }, 1],
    ];
    for (const [cell, expected] of counts) {
      const { unmount } = renderCard(cell);
      expect(screen.getByTestId("map-fulfillment").children).toHaveLength(expected);
      unmount();
    }
  });
});

describe("MapProducerCard — the 'neither' cell splits on a store with hours (MEH-2438 follow-up)", () => {
  // The «בתיאום אישי» research (27/10): the business address is not "pickup",
  // so a shop with fixed opening hours fell into the "arranged" cell. A store
  // with hours now reads «קנייה במקום»; everything else in the cell keeps the
  // arranged tag. The cell still renders exactly one tag either way (🔒 §5).
  const store = { delivers: false, offers_pickup: false, has_physical_location: true };
  const primaryWithHours = [{ id: 1, is_primary: true, opening_hours: "Sun-Thu 09:00-18:00" }];

  it("a store whose primary location has hours → on_site, not arranged", () => {
    renderCard({ ...store, locations: primaryWithHours });

    expect(screen.getByTestId("map-fulfillment-on_site")).toBeInTheDocument();
    expect(screen.queryByTestId("map-fulfillment-arranged")).toBeNull();
    expect(screen.getByTestId("map-fulfillment").children).toHaveLength(1);
  });

  it("legacy business-level hours count too (same resolver as the detail page)", () => {
    renderCard({ ...store, locations: [], opening_hours: "Fri 08:00-13:00" });

    expect(screen.getByTestId("map-fulfillment-on_site")).toBeInTheDocument();
  });

  it("a store with no hours stays arranged", () => {
    renderCard({ ...store, locations: [{ id: 1, is_primary: true, opening_hours: "  " }] });

    expect(screen.getByTestId("map-fulfillment-arranged")).toBeInTheDocument();
    expect(screen.queryByTestId("map-fulfillment-on_site")).toBeNull();
  });

  it("hours without a physical location stay arranged", () => {
    renderCard({ ...store, has_physical_location: false, opening_hours: "Fri 08:00-13:00" });

    expect(screen.getByTestId("map-fulfillment-arranged")).toBeInTheDocument();
  });

  it("hours never replace a declared service tag", () => {
    renderCard({ delivers: true, offers_pickup: false, has_physical_location: true, locations: primaryWithHours });

    expect(screen.getByTestId("map-fulfillment-delivery_only")).toBeInTheDocument();
    expect(screen.queryByTestId("map-fulfillment-on_site")).toBeNull();
  });
});

describe("MapProducerCard — the tags read the server predicates ONLY (MEH-2046)", () => {
  it("the legacy operands do not produce a delivery tag", () => {
    // The inverse pin. `has_delivery` is a column no backend delivery predicate
    // consults and `delivery_count` counts delivery_areas rows — of which a
    // nationwide business has none. Reintroducing either as a fallback would
    // re-open the MEH-1836 divergence the card was changed to close, and would
    // do it silently, so it is pinned here rather than left to review.
    renderCard({
      delivers: false,
      offers_pickup: false,
      has_delivery: true,
      delivery_count: 7,
    });

    expect(screen.getByTestId("map-fulfillment-arranged")).toBeInTheDocument();
    expect(screen.queryByTestId("map-fulfillment-delivery")).toBeNull();
    expect(screen.queryByTestId("map-fulfillment-delivery_only")).toBeNull();
  });

  it("a missing flag is treated as false, not as unknown", () => {
    // A payload that predates the field (or a surface that skips
    // attach_badge_fields) must degrade to the honest arranged tag rather than
    // crashing or claiming a service.
    renderCard({});

    expect(screen.getByTestId("map-fulfillment-arranged")).toBeInTheDocument();
  });

  it("the MEH-1243 lock still holds — no CTA and no verified seal", () => {
    // The amendment permits TAGS ONLY. If a later change adds a contact button
    // or a seal to this card, this reds and the author has to re-open the
    // decision instead of inheriting MEH-2046 as precedent for it.
    renderCard({ delivers: true, offers_pickup: true, verification_tier: "verified" });

    expect(screen.queryByTestId("map-verified-seal")).toBeNull();
    expect(screen.queryByRole("button", { name: /whatsapp|וואטסאפ|צרו קשר/i })).toBeNull();
  });
});

describe("fulfillment copy — asserted against messages/he.json itself", () => {
  // Deliberately NOT through the component: `useTranslations` is mocked above,
  // so a component-level copy assertion would be checking the mock. These read
  // the real message files, which is where the copy actually lives.
  it("carries all six strings, in both locales, with identical keys", async () => {
    const he = (await import("@/messages/he.json")).default.map.producer_card.fulfillment;
    const en = (await import("@/messages/en.json")).default.map.producer_card.fulfillment;

    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(he).sort()).toEqual([
      "arranged",
      "delivery",
      "delivery_only",
      "on_site",
      "pickup",
      "pickup_only",
    ]);
    for (const value of Object.values(he)) expect(value.trim()).not.toBe("");
    for (const value of Object.values(en)) expect(value.trim()).not.toBe("");
  });

  it("reuses the MEH-1461 locked pickup string verbatim", async () => {
    // "איסוף עצמי" is language-LOCKED (MEH-1461) and is reused here, not
    // re-worded. MEH-2075 (MEH-2046 decision 12) dropped the "בלבד" qualifier
    // from both single-axis cells — the single-axis and both-axes wordings
    // are now IDENTICAL by design (Google's positive-attribute pattern: the
    // tag names what's true, not what's exclusive). testId still
    // distinguishes the cells (map-fulfillment-delivery_only vs
    // map-fulfillment-delivery), so the "both" test above still proves the
    // exclusive tag doesn't ALSO render when both axes are true.
    const he = (await import("@/messages/he.json")).default.map.producer_card.fulfillment;

    expect(he.pickup).toBe("איסוף עצמי");
    expect(he.pickup_only).toBe("איסוף עצמי");
    expect(he.delivery).toBe("משלוח");
    expect(he.delivery_only).toBe("משלוח");
    // MEH-2438 follow-up: one phrase across the site — «בתיאום מראש» is what
    // the delivery block, the city groups and the dashboard already say.
    expect(he.arranged).toBe("בתיאום מראש");
    expect(he.on_site).toBe("קנייה במקום");
  });
});
