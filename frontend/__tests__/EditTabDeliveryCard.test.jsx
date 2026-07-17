/**
 * Edit-tab DeliveryCard + HoursCard isolation tests (MEH-1242 PR 5).
 *
 * Renders each card directly under the real NextIntlClientProvider + he.json
 * (EditTabCategoriesCard harness). Covers the owner location-mode editor's
 * client guards (delivery needs cities-or-nationwide; neither type blocks save)
 * + the save payload, and the opening-hours editor's save payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { DeliveryCard, HoursCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.delivery;
const H = he.dashboard.producer.hours;

function renderCard(Comp, props = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <Comp profile={{}} onSave={onSave} {...props} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // CitiesAutocomplete /cities
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit-tab DeliveryCard (isolation)", () => {
  it("enabling delivery requires cities-or-nationwide, then saves the location mode", async () => {
    const { onSave } = renderCard(DeliveryCard, {
      profile: {
        has_physical_location: true,
        offers_delivery: false,
        delivery_nationwide: false,
        delivery_areas: [],
      },
    });
    // Seeded, not dirty → save disabled.
    expect(screen.getByRole("button", { name: D.save_cta })).toBeDisabled();

    // Enable delivery → dirty, but no cities yet → blocked + hint.
    fireEvent.click(screen.getByRole("checkbox", { name: D.offers_delivery }));
    expect(screen.getByText(D.delivery_cities_required)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: D.save_cta })).toBeDisabled();

    // Mark nationwide → cities cleared, unblocked.
    fireEvent.click(screen.getByRole("checkbox", { name: D.delivery_nationwide }));
    const saveBtn = screen.getByRole("button", { name: D.save_cta });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: true,
        delivery_area_cities: [],
        delivery_excluded_cities: [],
      }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("nationwide reveals the exclusion field and persists delivery_excluded_cities (MEH-1255)", async () => {
    const { onSave } = renderCard(DeliveryCard, {
      profile: {
        has_physical_location: false,
        offers_delivery: true,
        delivery_nationwide: true,
        delivery_areas: [],
        delivery_excluded_cities: ["אילת"],
      },
    });
    // The exclusion label + hint render in nationwide mode; the delivery-cities
    // label does not (that field is hidden when nationwide).
    expect(screen.getByText(D.delivery_excluded_label)).toBeInTheDocument();
    expect(screen.getByText(D.delivery_excluded_hint)).toBeInTheDocument();
    expect(screen.queryByText(D.delivery_cities_label)).not.toBeInTheDocument();

    // Seeded + not dirty → save disabled. Make a real change (add a physical
    // location) so the seeded exclusion list round-trips through the payload.
    expect(screen.getByRole("button", { name: D.save_cta })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: D.has_physical_location }));
    const saveBtn = screen.getByRole("button", { name: D.save_cta });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: true,
        delivery_area_cities: [],
        delivery_excluded_cities: ["אילת"],
      }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("clearing both physical + delivery blocks save with the type-validation hint", () => {
    renderCard(DeliveryCard, {
      profile: { has_physical_location: true, offers_delivery: false },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: D.has_physical_location }));
    expect(screen.getByText(D.type_validation)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: D.save_cta })).toBeDisabled();
  });
});

describe("Edit-tab HoursCard (isolation)", () => {
  it("saves opening_hours via PUT /producers/me", async () => {
    const { onSave } = renderCard(HoursCard, { profile: { opening_hours: "" } });
    fireEvent.change(screen.getByLabelText(H.field_label), {
      target: { value: "Sun-Thu 9-17" },
    });
    fireEvent.click(screen.getByRole("button", { name: H.save_cta }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        opening_hours: "Sun-Thu 9-17",
      }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ opening_hours: "Sun-Thu 9-17" }),
    );
  });
});
