/**
 * MEH-3483 — «ספרו לנו על העסק»: free text → a draft → a field-by-field
 * preview → only the checked fields are written.
 * Rows (lib/page-fill.js) and the panel: closed / open / 0 rows / 1 / many,
 * a filled field starts unchecked, delivery and hours point elsewhere when
 * they cannot be written safely, a dirty page blocks the save, 503.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { buildRows, buildWrites, startsChecked } from "@/lib/page-fill";
import PageFillPanel from "@/components/PageFillPanel";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/MenuImport", () => ({ default: () => <div data-testid="menu-import-stub" /> }));

const P = he.page_fill;
const EMPTY = {
  description: null, category_ids: [], delivery_cities: [], opening_hours: null, phone: null,
  instagram: null, facebook: null, website: null, contact_email: null, primary_contact_method: null,
};
const draft = (over) => ({ ...EMPTY, ...over });
const fresh = { categories: [], delivery_areas: [], locations: [{ id: "L1", is_primary: true, opening_hours: null }] };

describe("buildRows / buildWrites", () => {
  it("an empty draft is no rows", () => {
    expect(buildRows(draft({}), fresh)).toEqual([]);
  });

  it("a filled field replaces and starts unchecked; a new one starts checked", () => {
    const rows = buildRows(draft({ description: "חדש", phone: "054-1234567" }), { ...fresh, description: "ישן" });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.description.replaces).toBe(true);
    expect(startsChecked(byKey.description)).toBe(false);
    expect(startsChecked(byKey.phone)).toBe(true);
  });

  it("a value equal to what is there is no row", () => {
    expect(buildRows(draft({ phone: "054" }), { ...fresh, phone: "054" })).toEqual([]);
  });

  it("categories are added to the ones the business has, never replace them", () => {
    const profile = { ...fresh, categories: [{ id: 1, name: "א" }] };
    const rows = buildRows(draft({ category_ids: [1, 2] }), profile);
    expect(rows).toEqual([expect.objectContaining({ key: "categories", value: [2], adds: true })]);
    expect(buildWrites(rows, profile).producer).toEqual({ category_ids: [1, 2] });
  });

  it("delivery: written as rows when the business has none; a note when it has some", () => {
    const rows = buildRows(draft({ delivery_cities: ["חיפה"] }), fresh);
    expect(buildWrites(rows, fresh).producer).toEqual({ delivery_areas: [{ city: "חיפה" }], offers_delivery: true });
    const busy = { ...fresh, delivery_areas: [{ city: "עכו", delivery_day: "שני" }] };
    const noted = buildRows(draft({ delivery_cities: ["חיפה"] }), busy);
    expect(noted[0].note).toBe("delivery_exists");
    expect(buildWrites(noted, busy).producer).toBeNull();
  });

  it("hours go to the primary location, never to producer.opening_hours", () => {
    const rows = buildRows(draft({ opening_hours: "Sun-Thu 08:00-18:00" }), fresh);
    expect(buildWrites(rows, fresh)).toEqual({ producer: null, location: { id: "L1", opening_hours: "Sun-Thu 08:00-18:00" } });
    const noLoc = { ...fresh, locations: [] };
    expect(buildRows(draft({ opening_hours: "Sun-Thu 08:00-18:00" }), noLoc)[0].note).toBe("hours_no_location");
    // The admin page has no location route: hours are a note there.
    expect(buildRows(draft({ opening_hours: "Sun-Thu 08:00-18:00" }), fresh, { hours: false })[0].note).toBe("hours_no_location");
  });
});

function renderPanel(props = {}) {
  const onSaved = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <PageFillPanel profile={fresh} readUrl="/producers/me/page-fill/read" saveUrl="/producers/me" onSaved={onSaved} {...props} />
    </NextIntlClientProvider>,
  );
  return onSaved;
}
const TEXT = "אנחנו מאפייה קטנה בחיפה ואופים לחמי מחמצת";
async function readWith(d) {
  api.post.mockResolvedValue({ data: { draft: d } });
  fireEvent.click(screen.getByTestId("page-fill-open"));
  fireEvent.change(screen.getByTestId("page-fill-text"), { target: { value: TEXT } });
  fireEvent.click(screen.getByTestId("page-fill-read"));
  return screen.findByTestId("page-fill-preview");
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [{ id: 2, name: "מאפים" }] });
});

describe("PageFillPanel", () => {
  it("closed: title, intro and one button; nothing is asked", () => {
    renderPanel();
    expect(screen.getByText(P.title)).toBeInTheDocument();
    expect(screen.getByText(P.intro)).toBeInTheDocument();
    expect(screen.queryByTestId("page-fill-text")).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("open: the read button waits for 20 characters; the menu part sits on the same screen", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("page-fill-open"));
    fireEvent.change(screen.getByTestId("page-fill-text"), { target: { value: "קצר" } });
    expect(screen.getByTestId("page-fill-read")).toBeDisabled();
    expect(screen.getByTestId("menu-import-stub")).toBeInTheDocument();
  });

  it("0 rows: says nothing new was found and offers no save", async () => {
    renderPanel();
    await readWith(draft({}));
    expect(screen.getByTestId("page-fill-empty")).toHaveTextContent(P.empty);
    expect(screen.queryByTestId("page-fill-save")).toBeNull();
  });

  it("many rows: only the checked ones are written; nothing before «שמירה»", async () => {
    const onSaved = renderPanel({ profile: { ...fresh, description: "ישן" } });
    await readWith(draft({ description: "מאפייה בחיפה.", phone: "054-1234567", category_ids: [2] }));
    expect(api.post).toHaveBeenCalledWith("/producers/me/page-fill/read", { text: TEXT });
    expect(api.put).not.toHaveBeenCalled();
    expect(await screen.findByText("מאפים")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(P.replaces))).toBeInTheDocument();
    // phone + categories start checked; the description (replaces) does not.
    fireEvent.click(screen.getByTestId("page-fill-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.put).toHaveBeenCalledWith("/producers/me", { phone: "054-1234567", category_ids: [2] });
  });

  it("1 row checked by hand: the replacement is written when she ticks it", async () => {
    renderPanel({ profile: { ...fresh, description: "ישן" } });
    await readWith(draft({ description: "מאפייה בחיפה." }));
    expect(screen.queryByTestId("page-fill-save")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: P.fields.description }));
    fireEvent.click(screen.getByTestId("page-fill-save"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/producers/me", { description: "מאפייה בחיפה." }));
  });

  it("hours are saved on the primary location", async () => {
    renderPanel();
    await readWith(draft({ opening_hours: "Sun-Thu 08:00-18:00" }));
    expect(screen.getByTestId("page-fill-row-hours")).toHaveTextContent("08:00–18:00");
    fireEvent.click(screen.getByTestId("page-fill-save"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/producers/me/locations/L1", { opening_hours: "Sun-Thu 08:00-18:00" }));
  });

  it("hours that replace show today's hours by day name, and the ranges read left to right", async () => {
    const profile = { ...fresh, locations: [{ id: "L1", is_primary: true, opening_hours: "Sun 09:00-12:00" }] };
    renderPanel({ profile });
    await readWith(draft({ opening_hours: "Sun-Thu 08:00-18:00" }));
    const row = screen.getByTestId("page-fill-row-hours");
    expect(row).toHaveTextContent(he.opening_hours.weekdays.sun);
    expect(row).not.toHaveTextContent(/\bsun\b/);
    expect(row.querySelector('[dir="ltr"]')).toHaveTextContent("08:00–18:00");
  });

  it("an @handle is isolated so it reads left to right", async () => {
    renderPanel();
    await readWith(draft({ instagram: "@bakery_haifa" }));
    expect(screen.getByTestId("page-fill-row-instagram").querySelector('[dir="auto"]')).toHaveTextContent("@bakery_haifa");
  });

  it("unsaved cards elsewhere on the page block the save and say why", async () => {
    renderPanel({ blocked: true });
    await readWith(draft({ phone: "054-1234567" }));
    expect(screen.getByTestId("page-fill-save")).toBeDisabled();
    expect(screen.getByText(P.blocked)).toBeInTheDocument();
  });

  it("a failed read shows the server's Hebrew and keeps the text", async () => {
    renderPanel();
    api.post.mockRejectedValue({ response: { status: 503, data: { detail: "לא הצלחנו לקרוא את הטקסט כרגע" } } });
    fireEvent.click(screen.getByTestId("page-fill-open"));
    fireEvent.change(screen.getByTestId("page-fill-text"), { target: { value: TEXT } });
    fireEvent.click(screen.getByTestId("page-fill-read"));
    expect(await screen.findByText("לא הצלחנו לקרוא את הטקסט כרגע")).toBeInTheDocument();
    expect(screen.getByTestId("page-fill-text")).toHaveValue(TEXT);
  });

  it("admin: no menu part on the same screen", () => {
    renderPanel({ owner: false });
    fireEvent.click(screen.getByTestId("page-fill-open"));
    expect(screen.queryByTestId("menu-import-stub")).toBeNull();
  });
});
