import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterSheet from "@/components/FilterSheet";
import { countActiveSheetOnlyFilters } from "@/lib/map-chips";

// MEH-1075 / MEH-1423: FilterSheet — grouped /map filter surface. Covers:
// closed/open render (3 group headers + all 7 toggle rows), shared-state toggle
// via role="switch" + aria-checked, the MEH-1423 subtext narrowing (explainer
// under ONLY kosher / verified / grass_fed — not the other 4), the sheet-only
// badge count helper, the live apply label (incl. zero state with clear link +
// apply still enabled), and the close paths (Escape / backdrop) + focus-into-
// sheet on open.

// Namespace-less t() that returns the key; interpolated values are appended
// as `key#value` so the apply-count assertions can target them.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values) =>
    values && values.count !== undefined ? `${key}#${values.count}` : key,
}));

const ALL_OFF = {
  categoryKey: "all",
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

  it("renders title, the 3 group headers, and all 7 toggle rows as switches when open", () => {
    // MEH-1259: "אורגני" toggle removed. MEH-1423: each toggle is now a full-
    // width row exposing role="switch" (was a plain chip button).
    renderSheet();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("filters.sheet.title")).toBeInTheDocument();
    for (const group of ["group_diet", "group_quality", "group_service"]) {
      expect(screen.getByText(`filters.sheet.${group}`)).toBeInTheDocument();
    }
    for (const label of [
      "טבעוני",
      "ללא גלוטן",
      "ללא לקטוז",
      "כשרות מאומתת",
      "גראס פד",
      "משלוח",
      // MEH-1418: "מאומתים" → "רישוי מאומת".
      "רישוי מאומת",
    ]) {
      expect(screen.getByRole("switch", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("switch", { name: "אורגני" })).not.toBeInTheDocument();
  });

  // MEH-1423: the muted explainer is kept for ONLY the 3 unfamiliar terms
  // (kosher · verified · grass_fed) — sourced byte-identically from the
  // BADGE_CONFIG tooltips (no new copy). It sits OUTSIDE the switch so the row
  // label stays the accessible name (getByRole name assertions above).
  it("renders a BADGE_CONFIG subtext under ONLY kosher / verified / grass_fed", () => {
    renderSheet();
    // Present — the 3 trust-loaded / loanword terms:
    // verified → BADGE_CONFIG.verified.tooltip
    expect(
      screen.getByText("בית העסק הציג מסמך רישוי או אישור פטור רשמי שנבדק ידנית."),
    ).toBeInTheDocument();
    // kosher → BADGE_CONFIG.kosher.tooltip
    expect(screen.getByText("המוצרים תחת השגחת כשרות.")).toBeInTheDocument();
    // grass_fed → BADGE_CONFIG.grass_fed.tooltip
    expect(
      screen.getByText("בעלי החיים גדלים על מרעה ולא על תערובת תעשייתית."),
    ).toBeInTheDocument();
    // Absent — the 4 everyday-vocabulary toggles no longer carry a subtext:
    // has_delivery → BADGE_CONFIG.delivery.tooltip
    expect(screen.queryByText("העסק מוסר או שולח לכתובת שלך.")).not.toBeInTheDocument();
    // vegan → BADGE_CONFIG.vegan.tooltip
    expect(
      screen.queryByText("כל המוצרים טבעוניים — ללא כל מרכיב מן החי."),
    ).not.toBeInTheDocument();
    // the subtext must NOT leak into the switch's accessible name
    expect(
      screen.getByRole("switch", { name: "רישוי מאומת" }),
    ).toBeInTheDocument();
  });

  it("toggling a row calls onToggleChip with the chip key; aria-checked mirrors chipState", () => {
    const { props } = renderSheet({
      chipState: { ...ALL_OFF, vegan: true },
    });
    // MEH-1423: rows are role="switch" with aria-checked (was button/aria-pressed).
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

  it("countActiveSheetOnlyFilters counts sheet-only actives, excluding the quick chips", () => {
    expect(countActiveSheetOnlyFilters(ALL_OFF)).toBe(0);
    // verified + has_delivery are quick chips — never counted for the badge.
    expect(
      countActiveSheetOnlyFilters({
        ...ALL_OFF,
        verified: true,
        has_delivery: true,
      }),
    ).toBe(0);
    // MEH-1259: was vegan + organic — grass_fed replaces organic as the 2nd
    // sheet-only quality active (verified is a quick chip, never counted).
    expect(
      countActiveSheetOnlyFilters({
        ...ALL_OFF,
        vegan: true,
        grass_fed: true,
        verified: true,
      }),
    ).toBe(2);
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
