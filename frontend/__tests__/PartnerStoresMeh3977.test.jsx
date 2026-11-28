/**
 * MEH-3977 chunk 3: «נמכר דרך חנויות אחרות» — the editor in the owner's
 * DeliveryCard, the page line, and the section-nav pill.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { DeliveryCard } from "@/app/[locale]/producer/dashboard/edit/cards";
import PartnerStoresLine from "@/components/PartnerStoresLine";
import { parsePartnerStores } from "@/components/PartnerStoresField";
import { hasPartnerStores } from "@/lib/quick-answers";
import { getSectionNavItems } from "@/app/[locale]/producer/[id]/lib/section-nav";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.delivery;
const P = he.partner_stores;

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
});

describe("parsePartnerStores", () => {
  it("splits on commas, trims, drops blanks", () => {
    expect(parsePartnerStores(" פארמרים , הענתיות,, ")).toEqual(["פארמרים", "הענתיות"]);
    expect(parsePartnerStores("")).toEqual([]);
  });
});

describe("DeliveryCard — partner stores", () => {
  it("a business with only partner stores can save, and the names are sent", async () => {
    const onSave = vi.fn();
    wrap(
      <DeliveryCard
        profile={{ has_physical_location: true, offers_delivery: false, delivery_areas: [] }}
        onSave={onSave}
      />,
    );
    // Untick the place: neither type → blocked.
    fireEvent.click(screen.getByTestId("delivery-place-onsite"));
    expect(screen.getByText(D.type_validation)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: D.save_cta })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: P.field_label }));
    fireEvent.change(screen.getByTestId("partner-stores-names"), {
      target: { value: "פארמרים, הענתיות, עלה הביתה" },
    });
    expect(screen.queryByText(D.type_validation)).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: D.save_cta });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const body = api.put.mock.calls[0][1];
    expect(body.has_physical_location).toBe(false);
    expect(body.offers_delivery).toBe(false);
    expect(body.partner_stores).toEqual(["פארמרים", "הענתיות", "עלה הביתה"]);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("unticking clears the stored names", async () => {
    wrap(
      <DeliveryCard
        profile={{ has_physical_location: true, offers_delivery: false, partner_stores: ["פארמרים"] }}
        onSave={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("checkbox", { name: P.field_label });
    expect(toggle).toBeChecked();
    expect(screen.getByTestId("partner-stores-names")).toHaveValue("פארמרים");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1].partner_stores).toEqual([]);
  });
});

describe("PartnerStoresLine", () => {
  const stores = ["פארמרים", "הענתיות", "עלה הביתה"];

  it("0 stores renders nothing", () => {
    const { container } = wrap(<PartnerStoresLine producer={{ partner_stores: [] }} standalone />);
    expect(container.textContent).toBe("");
  });

  it("partner-only: own section, no «גם»", () => {
    wrap(
      <PartnerStoresLine
        producer={{ partner_stores: stores, has_physical_location: false, offers_delivery: false }}
        standalone
      />,
    );
    expect(screen.getByRole("heading", { name: P.page_heading })).toBeInTheDocument();
    expect(screen.getByTestId("partner-stores-line")).toHaveTextContent(
      "המוצרים נמכרים דרך פארמרים, הענתיות ועלה הביתה",
    );
  });

  it("with delivery: a line under it, with «גם», one store", () => {
    wrap(<PartnerStoresLine producer={{ partner_stores: ["פארמרים"], offers_delivery: true }} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByTestId("partner-stores-line")).toHaveTextContent("המוצרים נמכרים גם דרך פארמרים");
  });
});

describe("section nav", () => {
  const t = createTranslator({ locale: "he", messages: he });
  const pill = (producer) => getSectionNavItems(producer, t).find((i) => i.id === "section-delivery");

  it("partner-only shows «איפה קונים»; none hides; delivery keeps its label", () => {
    expect(hasPartnerStores({ partner_stores: ["א"] })).toBe(true);
    expect(pill({ partner_stores: ["פארמרים"], has_physical_location: false }).show).toBe(true);
    expect(pill({ partner_stores: ["פארמרים"], has_physical_location: false }).label).toBe(P.page_heading);
    expect(pill({ partner_stores: [], has_physical_location: true }).show).toBe(false);
    expect(pill({ offers_delivery: true, partner_stores: ["פארמרים"] }).label).toBe(
      he.producer.detail.tabs.delivery,
    );
  });
});

describe("review fixes", () => {
  it("fulfillment tag: partner-only says «נמכר בחנויות», not «בתיאום מראש»", async () => {
    const { fulfillmentTags } = await import("@/lib/fulfillment-tags");
    const t = createTranslator({ locale: "he", messages: he, namespace: "map.producer_card" });
    const only = fulfillmentTags({ partnerStores: true }, t);
    expect(only.map((x) => x.label)).toEqual([he.map.producer_card.fulfillment.partner_stores]);
    expect(fulfillmentTags({}, t)[0].key).toBe("arranged");
    // With delivery the stores add no tag.
    expect(fulfillmentTags({ delivers: true, partnerStores: true }, t).map((x) => x.key)).toEqual(["delivery_only"]);
  });

  it("completeness: partner-only is not asked for coordinates or hours", async () => {
    const { producerCompleteness, COMPLETENESS_FIELDS } = await import("@/lib/producer-completeness");
    const base = { city: "שעל", phone: "050", categories: [{}], images: ["x"], description: "משק" };
    const r = producerCompleteness({ ...base, has_physical_location: false, offers_delivery: false, partner_stores: ["פארמרים"] });
    expect(r.missing).not.toContain(COMPLETENESS_FIELDS.coords);
    expect(r.missing).not.toContain(COMPLETENESS_FIELDS.hours);
    expect(r.priority).not.toBe("red");
  });
});
