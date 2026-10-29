/**
 * MEH-2561 — DeliveryCard's "בכרטיס במפה יופיע" preview.
 *
 * The /map card's fulfillment tag is inferred, never chosen; this preview is
 * the only place the owner sees it. Cells (MEH-1583: enumerate cells, not
 * axes): delivery+pickup (2 tags) · delivery only · pickup only · store with
 * hours («קנייה במקום») · nothing («בתיאום מראש» + the hint). The hint renders
 * in the arranged cell ONLY. Labels are asserted against the real he.json, so
 * the preview must say exactly what the map card says.
 *
 * DISCRIMINATION: the block did not exist before MEH-2561 — every case reds
 * against the old card. The live-toggle case also reds if delivery were read
 * from the saved profile instead of the form.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { DeliveryCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.delivery;
const F = he.map.producer_card.fulfillment;

const base = {
  has_physical_location: true,
  offers_delivery: false,
  delivery_nationwide: false,
  delivery_areas: [],
  locations: [],
};

function renderCard(profile) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <DeliveryCard profile={{ ...base, ...profile }} onSave={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

const keys = () =>
  screen
    .getAllByTestId(/^delivery-map-preview-(?!hint)/)
    .map((el) => el.dataset.testid.replace("delivery-map-preview-", ""));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

describe("DeliveryCard map-tag preview (MEH-2561)", () => {
  it("nothing declared → «בתיאום מראש» + the hint", () => {
    renderCard({});
    expect(keys()).toEqual(["arranged"]);
    expect(screen.getByTestId("delivery-map-preview-arranged").textContent).toBe(F.arranged);
    expect(screen.getByTestId("delivery-map-preview-hint").textContent).toBe(D.map_preview_arranged_hint);
    expect(screen.getByTestId("delivery-map-preview").textContent).toContain(D.map_preview_label);
  });

  it("store with hours on the primary location → «קנייה במקום», no hint", () => {
    renderCard({ locations: [{ kind: "primary", is_primary: true, opening_hours: "א-ה 8-14" }] });
    expect(keys()).toEqual(["on_site"]);
    expect(screen.getByTestId("delivery-map-preview-on_site").textContent).toBe(F.on_site);
    expect(screen.queryByTestId("delivery-map-preview-hint")).toBeNull();
  });

  it("hours but the physical-store toggle off → still «בתיאום מראש»", () => {
    renderCard({
      has_physical_location: false,
      offers_delivery: true,
      locations: [{ kind: "primary", is_primary: true, opening_hours: "א-ה 8-14" }],
    });
    // offers_delivery with no area and not nationwide does not deliver either.
    expect(keys()).toEqual(["arranged"]);
  });

  it("pickup point only → «איסוף עצמי»", () => {
    renderCard({ locations: [{ kind: "pickup" }] });
    expect(keys()).toEqual(["pickup_only"]);
    expect(screen.queryByTestId("delivery-map-preview-hint")).toBeNull();
  });

  it("delivery areas only → «משלוח»", () => {
    renderCard({ offers_delivery: true, delivery_areas: [{ city: "חיפה" }] });
    expect(keys()).toEqual(["delivery_only"]);
  });

  it("delivery + market stand → two tags", () => {
    renderCard({ offers_delivery: true, delivery_nationwide: true, locations: [{ kind: "market_stand" }] });
    expect(keys()).toEqual(["delivery", "pickup"]);
    expect(screen.queryByTestId("delivery-map-preview-hint")).toBeNull();
  });

  it("follows the live form: ticking nationwide delivery flips the preview before saving", () => {
    renderCard({});
    expect(keys()).toEqual(["arranged"]);
    fireEvent.click(screen.getByLabelText(D.offers_delivery));
    expect(keys()).toEqual(["arranged"]); // delivery on, no area yet
    fireEvent.click(screen.getByLabelText(D.delivery_nationwide));
    expect(keys()).toEqual(["delivery_only"]);
    expect(screen.queryByTestId("delivery-map-preview-hint")).toBeNull();
  });
});
