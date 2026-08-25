import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterSheet from "@/components/FilterSheet";

// MEH-1075 / MEH-1423 / MEH-1478 / MEH-1507 / MEH-2169: FilterSheet — the grouped
// filter surface mounted by /map and /producers.
// Covers: closed/open render (3 group headers), shared-state toggle (aria-checked),
// the live apply label (incl. zero state with clear link + apply still enabled),
// and the close paths (Escape / backdrop) + focus-into-sheet on open.
// MEH-1468: the sheet-only badge-count helper (countActiveSheetOnlyFilters) test
// was removed here — the helper was deleted (MEH-1368 replaced it with the inline
// "· N" count from useMapFilters.activeAttributeCount).
//
// MEH-2169 changed WHERE the MEH-1507 disclosure is painted, so the assertions
// below moved with it rather than being dropped — that distinction is the point
// of the "disclosure did not disappear" block:
//   · the 5 diet subtexts   → ONE group-level scope line, and the diet axes render
//                             as a 2-col pill grid (still role="switch")
//   · every other subtext   → the content of an ⓘ InfoTooltip beside the row
//   · has_delivery          → still nothing, still asserted absent

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
  pickup_points: false, // MEH-2046
  verified: false,
  open_for_orders_now: false, // MEH-2131
  kosher: false,
  grass_fed: false,
  vegan: false,
  vegetarian: false,
  gluten_free: false,
  lactose_free: false,
  no_added_sugar: false,
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

  it("renders title, the 3 group headers, and every toggle as role=switch when open", () => {
    // MEH-1259: "אורגני" toggle removed. MEH-2169: the diet axes are a 2-col pill
    // GRID again, but they keep role="switch" + aria-checked — the visual form
    // changed, the ARIA vocabulary did not. That is asserted here rather than
    // assumed because __tests__/ProducersFilterSheet.test.jsx:203 reads
    // aria-checked off chip-gluten_free on the /producers mount of this same
    // component; had MEH-2169 copied MEH-1478's aria-pressed, that file would
    // have gone red from a change in a file it does not import.
    renderSheet();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("filters.sheet.title")).toBeInTheDocument();
    for (const group of ["group_diet", "group_quality", "group_service"]) {
      expect(screen.getByText(`filters.sheet.${group}`)).toBeInTheDocument();
    }
    // Labels stay literal (a copy lock — MEH-1418 renamed one of these and this
    // roster is what would catch the next such rename).
    const LABELS = [
      // diet — pills (MEH-2169)
      "טבעוני",
      "צמחוני",
      "ללא גלוטן",
      "ללא לקטוז",
      "ללא סוכר מוסף",
      // quality
      "כשרות מאומתת",
      "גראס פד",
      // service. MEH-1418: "מאומתים" → "רישוי מאומת".
      "רישוי מאומת",
      "משלוח",
      "איסוף עצמי",
      "פתוחים להזמנות עכשיו",
    ];
    for (const label of LABELS) {
      expect(screen.getByRole("switch", { name: label })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    }
    // Exactly this many, not "at least" — the loop above proves each listed axis
    // is present and says nothing about a TWELFTH one. With this line, adding a
    // /map axis without adding it to the roster reds the test instead of passing
    // through a check that reads like full coverage (.claude/rules/testing.md).
    expect(screen.getAllByRole("switch")).toHaveLength(LABELS.length);
    expect(screen.queryByRole("switch", { name: "אורגני" })).not.toBeInTheDocument();
  });

  // MEH-2169 — the MEH-1507 disclosure survived the compaction. This is the block
  // that proves it, because "we shrank the sheet" and "we deleted the scope
  // disclosure" produce the same height number and only this tells them apart.
  //
  // What changed: the five diet subtexts became ONE group line; every other
  // subtext became an ⓘ tap-Popover. What did NOT change: the resolution order in
  // chipSubtext() (contract subtext → BADGE_CONFIG tooltip → nothing), so
  // has_delivery still discloses nothing and still has no ⓘ.
  describe("MEH-1507 disclosure, relocated by MEH-2169", () => {
    it("says the diet scope ONCE at group level, and not per pill", () => {
      renderSheet();
      expect(screen.getByText("filters.sheet.diet_scope")).toBeInTheDocument();
      // The five per-pill paragraphs are gone. Asserted by their LOCKED strings,
      // not by counting <p> elements: a count would pass if the copy silently
      // changed, and these exact sentences are what MEH-1507 locked.
      for (const gone of [
        "עסקים עם מוצרים טבעוניים בקטלוג",
        "עסקים עם מוצרים צמחוניים בקטלוג",
        "עסקים עם מוצרים ללא גלוטן בקטלוג",
        "עסקים עם מוצרים ללא לקטוז בקטלוג",
        "עסקים עם מוצרים ללא סוכר מוסף בקטלוג",
      ]) {
        expect(screen.queryByText(gone)).not.toBeInTheDocument();
      }
      // ...and no diet pill grew an ⓘ of its own (the group line is the disclosure).
      for (const key of ["vegan", "vegetarian", "gluten_free", "lactose_free", "no_added_sugar"]) {
        expect(screen.queryByTestId(`chip-info-${key}`)).not.toBeInTheDocument();
      }
    });

    it("hides each non-diet explanation behind an ⓘ that reveals the SAME string", () => {
      renderSheet();
      // The pairs are [row key, the exact string MEH-1507 resolved for it].
      // grass_fed + pickup_points + open_for_orders_now come from the contract
      // metadata; kosher + verified fall back to their BADGE_CONFIG tooltip.
      const DISCLOSURES = [
        ["grass_fed", "לפי הצהרת בית העסק"],
        ["pickup_points", "עסקים עם נקודת איסוף עצמי או דוכן בשוק"],
        ["open_for_orders_now", "עסקים שחלון ההזמנות שהגדירו פתוח ברגע זה"],
        ["kosher", "המוצרים תחת השגחת כשרות."],
        ["verified", "בית העסק הציג מסמך רישוי או אישור פטור רשמי שנבדק ידנית."],
      ];
      for (const [key, text] of DISCLOSURES) {
        // Closed by default — this is the height saving, and it is the half of
        // the change that could have been faked by simply deleting the string.
        expect(screen.queryByText(text)).not.toBeInTheDocument();
        const info = screen.getByTestId(`chip-info-${key}`);
        fireEvent.click(info);
        expect(screen.getByText(text)).toBeInTheDocument();
        // Close it again so the next iteration's "not in the document" assertion
        // is measuring its own row rather than inheriting a still-open bubble.
        fireEvent.click(info);
        expect(screen.queryByText(text)).not.toBeInTheDocument();
      }
    });

    it("gives has_delivery no ⓘ — it has nothing to disclose", () => {
      renderSheet();
      expect(screen.getByRole("switch", { name: "משלוח" })).toBeInTheDocument();
      expect(screen.queryByTestId("chip-info-has_delivery")).not.toBeInTheDocument();
    });

    it("keeps the ⓘ OUT of the switch's accessible name and out of the switch", () => {
      renderSheet();
      // Two distinct failures guarded: name pollution (the tooltip trigger being
      // read as part of the row's label) and invalid nesting (a <button> inside a
      // <button>, which browsers silently unnest — the reason the ⓘ is a sibling).
      const row = screen.getByRole("switch", { name: "רישוי מאומת" });
      expect(row.querySelector("button")).toBeNull();
      expect(screen.getByRole("switch", { name: "כשרות מאומתת" })).toBeInTheDocument();
    });
  });

  it("toggling a diet / trust row calls onToggleChip; aria-checked mirrors chipState", () => {
    const { props } = renderSheet({
      chipState: { ...ALL_OFF, vegan: true },
    });
    // MEH-2169: diet toggles are role="switch" PILLS writing shared state.
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

  // MEH-2169: filters apply LIVE, so the count is the only thing on this surface
  // that moves when a toggle flips. Without a live region that feedback is
  // sighted-only.
  it("announces the apply count as a polite live region that updates in place", () => {
    const { props, rerender } = renderSheet({ resultCount: 7 });
    const live = screen.getByText("filters.sheet.apply#7");
    expect(live).toHaveAttribute("aria-live", "polite");

    // The region must be UPDATED, not replaced. A live region only announces if
    // the same node's contents change — remount it and assistive tech says
    // nothing, while every static assertion above still passes. Identity is
    // therefore the assertion, and it is what distinguishes this from a
    // decorative attribute.
    rerender(<FilterSheet {...props} resultCount={4} />);
    expect(screen.getByText("filters.sheet.apply#4")).toBe(live);
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
    // MEH-2169: gluten_free is a diet role="switch" pill in the 2-col grid.
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

// MEH-1945 — the apply footer is sticky on EVERY viewport, not just lg+.
//
// SCOPE OF THIS GUARD, stated because it is easy to over-read: jsdom resolves
// no Tailwind, so nothing here proves the footer actually stays on screen. It
// is a TRIPWIRE for one specific regression — someone re-gating the stickiness
// behind `lg:`, which is the state MEH-1481 left and this ticket removed. The
// behavioural proof is `e2e/qa-meh1945-sticky-apply.mjs`, which measures real
// geometry in Chromium and fails when the footer leaves the viewport.
//
// Deliberately NOT asserted here: that the fix is non-inert. It can be — a
// container `padding-bottom` regression would leave every class below intact
// and still park the footer 32px up (measured). Only the harness sees that.
// Per ADR-032 §3.6 that gap is named rather than papered over with a
// className assertion pretending to be behavioural coverage.
describe("FilterSheet apply footer stickiness (MEH-1945)", () => {
  // Below lg the sheet is portaled to <body> (MEH-1075), so it is NOT inside
  // render()'s container — look it up in the document, as the sibling specs do
  // via screen queries.
  const panelOf = () => document.getElementById("filter-sheet-panel");
  // By testid, not by position. `lastElementChild` would keep passing while
  // silently describing a different element the moment anything is appended
  // after the footer (CI reviewer, PR #2695).
  const footerOf = () =>
    panelOf().querySelector('[data-testid="filter-sheet-apply-footer"]');

  it("carries sticky + bottom-0 UNGATED, so mobile gets them too", () => {
    renderSheet();
    const cls = footerOf().className;

    expect(cls).toMatch(/(^|\s)sticky(\s|$)/);
    expect(cls).toMatch(/(^|\s)bottom-0(\s|$)/);
    // The regression this exists to catch: the same utilities behind a
    // breakpoint. `lg:sticky` would satisfy a naive `toContain("sticky")`,
    // which is why both assertions are word-anchored above and negated here.
    expect(cls).not.toMatch(/lg:sticky/);
    expect(cls).not.toMatch(/lg:bottom-0/);
  });

  it("keeps an opaque background and a top hairline — content scrolls UNDER it", () => {
    // Without these the footer is sticky and unreadable: rows slide through it.
    // Ungated for the same reason as above; MEH-1481 had them lg:-only.
    renderSheet();
    const cls = footerOf().className;
    expect(cls).toMatch(/(^|\s)bg-background(\s|$)/);
    expect(cls).toMatch(/(^|\s)border-t(\s|$)/);
  });

  it("pays the safe-area inset on the footer, not on the scroll container", () => {
    // `position: sticky; bottom: 0` resolves against the scrollport (the
    // container's PADDING box), so a container pb pushes the footer up by that
    // much and body content scrolls through the gap. Measured at 390x844:
    // container pb 32px -> footer bottom 812 against an 844 panel edge; pb-0 ->
    // 844, flush. So the inset belongs to the footer.
    renderSheet();
    expect(panelOf().className).toMatch(/(^|\s)pb-0(\s|$)/);
    expect(footerOf().className).toMatch(/safe-area-inset-bottom/);
  });
});
