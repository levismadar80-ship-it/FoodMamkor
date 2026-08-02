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
      // MEH-1644: the card saves structured delivery_areas rows now.
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: true,
        delivery_areas: [],
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
      // MEH-1644: the card saves structured delivery_areas rows now.
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: true,
        delivery_areas: [],
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

  // MEH-1644 — per-city dispatch-day select, saved as structured rows.
  it("MEH-1644: renders a day select per chosen city and saves rows with the canonical day", async () => {
    const { onSave } = renderCard(DeliveryCard, {
      profile: {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: false,
        delivery_areas: [
          { city: "חיפה", delivery_day: "שישי", min_order: 100 },
          { city: "עכו", delivery_day: null },
        ],
      },
    });
    // Field-standard chrome: label + where-it-appears hint.
    expect(screen.getByText(D.delivery_days_label)).toBeInTheDocument();
    expect(screen.getByText(D.delivery_days_hint)).toBeInTheDocument();
    // Seeded values: חיפה pre-selected שישי, עכו on the arranged empty option.
    const haifa = screen.getByTestId("delivery-day-select-חיפה");
    const akko = screen.getByTestId("delivery-day-select-עכו");
    expect(haifa.value).toBe("שישי");
    expect(akko.value).toBe("");

    // Change עכו → שלישי and save.
    fireEvent.change(akko, { target: { value: "שלישי" } });
    const saveBtn = screen.getByRole("button", { name: D.save_cta });
    expect(saveBtn).not.toBeDisabled(); // a day change alone is a real edit
    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: false,
        delivery_areas: [
          // min_order captured at registration survives the save (the flat
          // path used to wipe it); day "" → null = בתיאום מראש.
          // MEH-1772 chunk 3: delivery_fee rides the same row — null here
          // because neither seeded city states an override (= inherit the
          // business-wide rate).
          { city: "חיפה", delivery_day: "שישי", min_order: 100, delivery_fee: null },
          { city: "עכו", delivery_day: "שלישי", min_order: null, delivery_fee: null },
        ],
        delivery_excluded_cities: [],
        // MEH-1577: every save now carries the cost pair; null = not stated.
        delivery_fee: null,
        free_delivery_above: null,
      }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  // MEH-1772 chunk 3: the per-city fee override. Two separate failure modes,
  // so two assertions in one round-trip — a stored 0 must LOAD as "0" (not
  // blank) and a typed value must SAVE on the right row.
  //
  // The 0 half is the one that matters. `d.delivery_fee || ""` reads as
  // reasonable defaulting and blanks the field on every reopen, so an owner
  // who set "free delivery to עתלית" sees an empty box, saves, and the row
  // silently reverts to inheriting the business rate. Nothing errors.
  it("MEH-1772: a stored per-city fee of 0 loads as 0, and an edit saves on the right row", async () => {
    api.put.mockResolvedValue({ data: {} });
    const { onSave } = renderCard(DeliveryCard, {
      profile: {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: false,
        delivery_fee: 35,
        delivery_areas: [
          { city: "עתלית", delivery_day: "שישי", min_order: null, delivery_fee: 0 },
          { city: "חיפה", delivery_day: "שישי", min_order: 100, delivery_fee: null },
        ],
      },
    });

    expect(screen.getByText(D.area_fee_label)).toBeInTheDocument();
    const atlit = screen.getByTestId("delivery-fee-input-עתלית");
    const haifa = screen.getByTestId("delivery-fee-input-חיפה");
    // 0 survives the load; the un-overridden row stays empty (= inherit).
    expect(atlit.value).toBe("0");
    expect(haifa.value).toBe("");

    fireEvent.change(haifa, { target: { value: "40" } });
    const saveBtn = screen.getByRole("button", { name: D.save_cta });
    expect(saveBtn).not.toBeDisabled(); // a fee change alone is a real edit
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/producers/me",
        expect.objectContaining({
          delivery_areas: [
            // 0 round-trips as 0, NOT null — "free here" is not "inherit".
            { city: "עתלית", delivery_day: "שישי", min_order: null, delivery_fee: 0 },
            { city: "חיפה", delivery_day: "שישי", min_order: 100, delivery_fee: 40 },
          ],
        }),
      ),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("MEH-1644: a legacy free-text day loads as the arranged option, never an unstorable value", () => {
    renderCard(DeliveryCard, {
      profile: {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: false,
        delivery_areas: [{ city: "חיפה", delivery_day: "ימי שישי" }],
      },
    });
    // The select only offers canonical values — the legacy string maps to "".
    expect(screen.getByTestId("delivery-day-select-חיפה").value).toBe("");
    // Loading alone must not mark the card dirty (expand-only: the stored row
    // is rewritten only when the owner actually saves).
    expect(screen.getByRole("button", { name: D.save_cta })).toBeDisabled();
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

// MEH-1821: defaults-first ordering + declared inheritance. The card's field
// order was the bug — the business-level default rendered AFTER the list of
// per-city exceptions that inherit from it, so it read as a repetition of the
// list rather than as its source. These assertions pin the order and the three
// hint states; none of them touch handleSave, which is what makes the
// "payload unchanged" claim in the fourth test meaningful.
describe("MEH-1821 DeliveryCard defaults-first", () => {
  const withCities = {
    has_physical_location: true,
    offers_delivery: true,
    delivery_nationwide: false,
    delivery_fee: 35,
    free_delivery_above: 250,
    delivery_areas: [
      { city: "חיפה", delivery_fee: null }, // inherits
      { city: "עכו", delivery_fee: 0 }, // free for this city
      { city: "נהריה", delivery_fee: 20 }, // own rate
    ],
  };

  it("(a) renders the business-level default block BEFORE the area list", () => {
    renderCard(DeliveryCard, { profile: withCities });
    const block = screen.getByTestId("delivery-default-block");
    const firstAreaRow = screen.getByTestId("delivery-fee-input-חיפה");
    // Node.DOCUMENT_POSITION_FOLLOWING === 4: the area row follows the block.
    expect(
      block.compareDocumentPosition(firstAreaRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // ...and the block announces itself as the default the rows inherit.
    expect(screen.getByText(D.default_block_title)).toBeInTheDocument();
    expect(screen.getByText(D.default_block_hint)).toBeInTheDocument();
  });

  it("(b) a null area fee shows the inherited business-level value", () => {
    renderCard(DeliveryCard, { profile: withCities });
    expect(screen.getByTestId("delivery-fee-hint-חיפה")).toHaveTextContent(
      D.area_fee_inherits.replace("{fee}", "35"),
    );
  });

  it("(c) an area fee of 0 shows free-delivery, never the inheritance hint", () => {
    renderCard(DeliveryCard, { profile: withCities });
    const hint = screen.getByTestId("delivery-fee-hint-עכו");
    expect(hint).toHaveTextContent(D.area_fee_free);
    // The discriminating half: 0 must not be swept into the inherit branch by
    // a truthiness read. A row with its own positive rate declares nothing.
    expect(hint).not.toHaveTextContent("35");
    expect(screen.queryByTestId("delivery-fee-hint-נהריה")).not.toBeInTheDocument();
  });

  it("(d) no inheritance hint at all when the business-level fee is unstated", () => {
    renderCard(DeliveryCard, {
      profile: { ...withCities, delivery_fee: null },
    });
    expect(screen.queryByTestId("delivery-fee-hint-חיפה")).not.toBeInTheDocument();
    // The 0-row still declares itself — it does not depend on the default.
    expect(screen.getByTestId("delivery-fee-hint-עכו")).toHaveTextContent(D.area_fee_free);
  });

  it("(e) the PUT payload is unchanged by the reorder", async () => {
    renderCard(DeliveryCard, { profile: withCities });
    fireEvent.change(screen.getByLabelText(D.fee_label), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: false,
        // min_order rides every row (cards.jsx:1745) — registration captures it
        // and the structured save must not wipe it. Spelled out here so the
        // "payload unchanged" claim covers the whole row, not just the fee.
        delivery_areas: [
          { city: "חיפה", delivery_day: null, min_order: null, delivery_fee: null },
          { city: "עכו", delivery_day: null, min_order: null, delivery_fee: 0 },
          { city: "נהריה", delivery_day: null, min_order: null, delivery_fee: 20 },
        ],
        delivery_excluded_cities: [],
        delivery_fee: 40,
        free_delivery_above: 250,
      }),
    );
  });
});
