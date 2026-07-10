import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterSheet from "@/components/FilterSheet";
import { countActiveSheetOnlyFilters } from "@/lib/map-chips";

// MEH-1075: FilterSheet — grouped /map filter surface. Covers: closed/open
// render (3 group headers + all 7 chips), shared-state chip toggle +
// aria-pressed, the sheet-only badge count helper, the live apply label
// (incl. zero state with clear link + apply still enabled), and the
// close paths (Escape / backdrop) + focus-into-sheet on open.

// Namespace-less t() that returns the key; interpolated values are appended
// as `key#value` so the apply-count assertions can target them.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values) =>
    values && values.count !== undefined ? `${key}#${values.count}` : key,
}));

const ALL_OFF = {
  categoryKey: "all",
  organic: false,
  has_delivery: false,
  verified: false,
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

  it("renders title, the 3 group headers, and all 7 toggle chips when open", () => {
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
      "אורגני",
      "גראס פד",
      "משלוח אליי",
      "מאומתים",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("toggling a chip calls onToggleChip with the chip key; aria-pressed mirrors chipState", () => {
    const { props } = renderSheet({
      chipState: { ...ALL_OFF, vegan: true },
    });
    const veganChip = screen.getByRole("button", { name: "טבעוני" });
    expect(veganChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "אורגני" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "ללא גלוטן" }));
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
    expect(
      countActiveSheetOnlyFilters({
        ...ALL_OFF,
        vegan: true,
        organic: true,
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
});
