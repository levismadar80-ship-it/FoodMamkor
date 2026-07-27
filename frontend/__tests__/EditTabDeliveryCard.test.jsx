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

// MEH-1306: cards.jsx now imports @/i18n/navigation (view-on-page link);
// mock it so createNavigation's next/navigation import never loads in jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
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
        // MEH-1577: the card always sends both cost fields; null = not stated.
        delivery_fee: null,
        free_delivery_above: null,
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
        delivery_fee: null,
        free_delivery_above: null,
      }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  // MEH-1577: the ""-vs-0 mapping. An <input> holds strings, the column holds
  // int-or-null, and the two collapse into each other under any truthiness
  // shortcut — `Number(v) || null` turns a typed 0 into null, downgrading
  // "delivery is free" to "cost not stated" with nothing to show for it.
  it("MEH-1577: a typed 0 saves as 0, an empty field saves as null", async () => {
    const { onSave } = renderCard(DeliveryCard, {
      profile: {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: true,
      },
    });
    fireEvent.change(screen.getByLabelText(D.fee_label), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/producers/me",
        expect.objectContaining({
          delivery_fee: 0, // NOT null — the whole point
          free_delivery_above: null, // untouched field stays unstated
        }),
      ),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("MEH-1577: a stored 0 re-seeds the field as 0, not as blank", () => {
    renderCard(DeliveryCard, {
      profile: {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: true,
        delivery_fee: 0,
      },
    });
    // `?? ""` keeps the 0; `|| ""` would blank it on every reopen and the
    // owner's free-delivery setting would quietly disappear from the form.
    expect(screen.getByLabelText(D.fee_label)).toHaveValue(0);
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

// MEH-1276: HoursCard is now the structured editor (HoursEditor) — the preset
// fills the 7-day table, save serialises to the same canonical string, an
// existing string prefills (and round-trips clean → not dirty), and an
// unparseable value warns without being discarded.
describe("Edit-tab HoursCard (structured editor, MEH-1276)", () => {
  it("preset fills the table and saves the canonical string", async () => {
    const { onSave } = renderCard(HoursCard, { profile: { opening_hours: "" } });
    // Empty + not dirty → save disabled.
    expect(screen.getByRole("button", { name: H.save_cta })).toBeDisabled();

    // One-click preset → dirty → save enabled.
    fireEvent.click(screen.getByRole("button", { name: H.preset }));
    const saveBtn = screen.getByRole("button", { name: H.save_cta });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        opening_hours: "Sun-Thu 09:00-18:00, Fri 09:00-14:00",
      }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        opening_hours: "Sun-Thu 09:00-18:00, Fri 09:00-14:00",
      }),
    );
    // Persistent success confirmation (MEH-1270 pattern).
    expect(await screen.findByTestId("hours-save-success")).toBeInTheDocument();
  });

  it("prefills from an existing canonical string and round-trips clean (not dirty)", () => {
    renderCard(HoursCard, {
      profile: { opening_hours: "Sun-Thu 09:00-18:00, Fri 09:00-14:00" },
    });
    // Re-serialises identically → save stays disabled until a real edit.
    expect(screen.getByRole("button", { name: H.save_cta })).toBeDisabled();
    // Seeded times are reflected in the time inputs (Sun-Thu 09:00-18:00).
    expect(screen.getAllByDisplayValue("18:00").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("14:00").length).toBeGreaterThan(0);
  });

  it("warns on an unparseable string without discarding it", () => {
    renderCard(HoursCard, {
      profile: { opening_hours: "whenever we feel like it" },
    });
    expect(screen.getByText(H.unparseable)).toBeInTheDocument();
  });
});
