import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterSheet from "@/components/FilterSheet";

// MEH-1075 / MEH-1423 / MEH-1478 / MEH-1507: FilterSheet — grouped /map filter surface.
// Covers: closed/open render (3 group headers; MEH-1507 makes ALL toggles —
// diet + quality + service — full-width role="switch" rows, retiring the MEH-1478
// diet pill grid), shared-state toggle (aria-checked), the MEH-1507 scope-explicit
// subtext on every diet row + grass_fed with a BADGE_CONFIG fallback on the trust
// rows (kosher / verified; has_delivery none), the live apply label (incl. zero
// state with clear link + apply still enabled), and the close paths (Escape /
// backdrop) + focus-into-sheet on open.
// MEH-1468: the sheet-only badge-count helper (countActiveSheetOnlyFilters) test
// was removed here — the helper was deleted (MEH-1368 replaced it with the inline
// "· N" count from useMapFilters.activeAttributeCount).

// Namespace-less t() that returns the key; interpolated values are appended
// as `key#value` so the apply-count assertions can target them.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values) =>
    values && values.count !== undefined ? `${key}#${values.count}` : key,
}));

const ALL_OFF = {
  categoryKeys: [], // MEH-1465: /map category state is a multi-select array now.
  // MEH-1259: organic removed from the /map FilterSheet toggle set.
  has_delivery: false,
  verified: false,
  kosher: false,
  grass_fed: false,
  vegan: false,
  gluten_free: false,
  lactose_free: false,
};

function renderSheet(overrides = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    chipState: ALL_OFF,
    onToggleChip: vi.fn(),
    resultCount: 12,
    onClearAll: vi.fn(),
    ...overrides,
  };
  const utils = render(<FilterSheet {...props} />);
  return { props, ...utils };
}

describe("FilterSheet (MEH-1075)", () => {
  it("renders nothing when closed", () => {
    const { container } = renderSheet({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title, the 3 group headers, and every toggle as a role=switch row when open", () => {
    // MEH-1259: "אורגני" toggle removed. MEH-1507: the MEH-1478 diet pill GRID is
    // retired — ALL toggles (diet + quality + service) are now full-width
    // role="switch" rows so each diet term can carry its scope subtext.
    renderSheet();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("filters.sheet.title")).toBeInTheDocument();
    for (const group of ["group_diet", "group_quality", "group_service"]) {
      expect(screen.getByText(`filters.sheet.${group}`)).toBeInTheDocument();
    }
    // Every toggle is a role="switch" row (MEH-1507).
    for (const label of [
      // diet
      "טבעוני",
      "צמחוני",
      "ללא גלוטן",
      "ללא לקטוז",
      // quality + service
      "כשרות מאומתת",
      "גראס פד",
      "משלוח",
      // MEH-1418: "מאומתים" → "רישוי מאומת".
      "רישוי מאומת",
    ]) {
      const row = screen.getByRole("switch", { name: label });
      expect(row).toHaveAttribute("aria-checked", "false");
    }
    expect(screen.queryByRole("switch", { name: "אורגני" })).not.toBeInTheDocument();
  });

  // MEH-1507 — Label Scope Contract: every diet row now shows its scope-explicit
  // LOCKED subtext ("עסקים עם מוצרים … בקטלוג"); grass_fed reads "לפי הצהרת בית
  // העסק"; the trust rows (kosher · verified) fall back to their BADGE_CONFIG
  // tooltip; has_delivery has no subtext. Subtext sits OUTSIDE the switch so the
  // row label stays the accessible name (getByRole name assertions above).
  it("renders scope-explicit subtext on every diet row + grass_fed, BADGE_CONFIG on the trust rows", () => {
    renderSheet();
    // Diet rows — the LOCKED scope-explicit copy (MEH-1507):
    expect(screen.getByText("עסקים עם מוצרים טבעוניים בקטלוג")).toBeInTheDocument();
    expect(screen.getByText("עסקים עם מוצרים צמחוניים בקטלוג")).toBeInTheDocument();
    expect(screen.getByText("עסקים עם מוצרים ללא גלוטן בקטלוג")).toBeInTheDocument();
    expect(screen.getByText("עסקים עם מוצרים ללא לקטוז בקטלוג")).toBeInTheDocument();
    // grass_fed — evidence framing (MEH-1507 locked copy):
    expect(screen.getByText("לפי הצהרת בית העסק")).toBeInTheDocument();
    // Trust rows fall back to BADGE_CONFIG tooltips (unchanged):
    // verified → BADGE_CONFIG.verified.tooltip
    expect(
      screen.getByText("בית העסק הציג מסמך רישוי או אישור פטור רשמי שנבדק ידנית."),
    ).toBeInTheDocument();
    // kosher → BADGE_CONFIG.kosher.tooltip
    expect(screen.getByText("המוצרים תחת השגחת כשרות.")).toBeInTheDocument();
    // has_delivery has no contract subtext and no BADGE_CONFIG["has_delivery"] → absent.
    expect(screen.queryByText("העסק מוסר או שולח לכתובת שלך.")).not.toBeInTheDocument();
    // the subtext must NOT leak into the switch's accessible name
    expect(
      screen.getByRole("switch", { name: "רישוי מאומת" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "טבעוני" })).toBeInTheDocument();
  });

  it("toggling a diet / trust row calls onToggleChip; aria-checked mirrors chipState", () => {
    const { props } = renderSheet({
      chipState: { ...ALL_OFF, vegan: true },
    });
    // MEH-1507: diet toggles are role="switch" rows writing shared state.
    const veganRow = screen.getByRole("switch", { name: "טבעוני" });
    expect(veganRow).toHaveAttribute("aria-checked", "true");
    // MEH-1259: was the organic chip (removed) — grass_fed is the other quality toggle.
    expect(screen.getByRole("switch", { name: "גראס פד" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.click(screen.getByRole("switch", { name: "ללא גלוטן" }));
    expect(props.onToggleChip).toHaveBeenCalledWith("gluten_free");
  });

  it("apply button shows the live result count and closes the sheet", () => {
    const { props } = renderSheet({ resultCount: 7 });
    const apply = screen.getByRole("button", { name: "filters.sheet.apply#7" });
    fireEvent.click(apply);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("zero state: apply shows count 0 and stays enabled; clear link resets sheet filters", () => {
    const { props } = renderSheet({ resultCount: 0 });
    const apply = screen.getByRole("button", { name: "filters.sheet.apply#0" });
    expect(apply).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "filters.sheet.clear" }));
    expect(props.onClearAll).toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Escape and backdrop click both close the sheet", () => {
    const { props } = renderSheet();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("filters.sheet.close_aria"));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("moves focus into the sheet on open", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  // PR #1565 review regression: FilterChipsBar re-renders on every chipState
  // change; a new onClose ref + a single [open, onClose] effect used to tear
  // down the focus capture and yank focus back to the first chip mid-
  // interaction. Focus capture now keys on [open] only.
  it("keeps focus in place when the caller re-renders with a new onClose ref", () => {
    const { rerender, props } = renderSheet();
    // MEH-1507: gluten_free is a diet role="switch" row now.
    const glutenFree = screen.getByRole("switch", { name: "ללא גלוטן" });
    glutenFree.focus();
    rerender(
      <FilterSheet
        {...props}
        chipState={{ ...ALL_OFF, gluten_free: true }}
        onClose={vi.fn()}
        resultCount={3}
      />,
    );
    expect(document.activeElement).toBe(glutenFree);
  });
});
