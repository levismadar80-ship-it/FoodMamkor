/**
 * Module:   EditAccordionChips.test
 * Purpose:  MEH-2138 chunk C — every edit-hub accordion header carries a
 *           «חובה» / «רשות» chip, and the required set is DERIVED from the
 *           submit gate rather than hand-listed.
 * Does NOT: assert geometry or colour. The chip's tint is a class string; what
 *           matters here is which cards claim to gate submission.
 * Related:  lib/edit-accordion-chips.js, lib/submission-gate.js,
 *           components/EditAccordionCard.jsx
 * History:  MEH-2138 chunk C (creation).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import EditAccordionCard from "@/components/EditAccordionCard";
import {
  REQUIRED_ANCHORS,
  chipKeyFor,
} from "@/lib/edit-accordion-chips";
import { SUBMISSION_REQUIREMENTS } from "@/lib/submission-gate";

vi.mock("@phosphor-icons/react", () => ({
  CaretDown: (props) => <span data-testid="caret" className={props.className} />,
}));

const ACC = he.dashboard.producer.edit_accordion;

// Every anchorId the edit hub mounts, PARSED from page.js rather than copied.
// A hand-written list would go stale the first time someone adds a card, and it
// would go stale silently — the suite would keep passing while the new card
// rendered no chip at all. Reading the source is the same technique
// ZTokenLedgerSync uses against the z-index ledger, for the same reason.
const PAGE = readFileSync(
  join(__dirname, "..", "app", "[locale]", "producer", "dashboard", "edit", "page.js"),
  "utf8",
);
const ALL_ANCHORS = [...PAGE.matchAll(/anchorId="([^"]+)"/g)].map((m) => m[1]);

function renderCard(anchorId) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditAccordionCard
        anchorId={anchorId}
        title="כותרת"
        summary="סיכום"
        open={false}
        onToggle={() => {}}
      >
        <div />
      </EditAccordionCard>
    </NextIntlClientProvider>,
  );
}

describe("edit accordion — required/optional chips (MEH-2138 chunk C)", () => {
  it("CONTROL: the two chips are DIFFERENT strings", () => {
    // If «חובה» and «רשות» were the same string, every assertion below would
    // pass against a component that always rendered one of them — the chip
    // would carry no information and the suite would not notice.
    expect(ACC.chip_required).not.toBe(ACC.chip_optional);
    expect(ACC.chip_required).toBeTruthy();
    expect(ACC.chip_optional).toBeTruthy();
  });

  it("CONTROL: the anchor list actually parsed — an empty parse is not a pass", () => {
    // If the regex stopped matching (page.js refactored to pass anchorId by
    // variable, say), ALL_ANCHORS would be [] and every loop below would
    // iterate zero times and report green. That null is also the reassuring
    // output, so it gets its own assertion.
    expect(ALL_ANCHORS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ALL_ANCHORS).size).toBe(ALL_ANCHORS.length); // no dupes
  });

  it("every card renders exactly one chip — no card is silent", () => {
    for (const anchor of ALL_ANCHORS) {
      const { unmount } = renderCard(anchor);
      const chip = screen.getByTestId(`section-chip-${anchor}`);
      expect([ACC.chip_required, ACC.chip_optional]).toContain(chip.textContent);
      unmount();
    }
  });

  it("the required cards are the submit-gate cards, and the rest are optional", () => {
    // Derived expectation: whatever the gate currently requires. Asserting a
    // hardcoded list here would re-create the second owner the module exists
    // to avoid — this test would then agree with a stale mapping.
    const required = ALL_ANCHORS.filter((a) => REQUIRED_ANCHORS.has(a));
    const optional = ALL_ANCHORS.filter((a) => !REQUIRED_ANCHORS.has(a));

    // Both sides non-empty, so neither branch is vacuous.
    expect(required.length).toBeGreaterThan(0);
    expect(optional.length).toBeGreaterThan(0);

    for (const anchor of required) {
      const { unmount } = renderCard(anchor);
      expect(screen.getByTestId(`section-chip-${anchor}`).textContent).toBe(
        ACC.chip_required,
      );
      unmount();
    }
    for (const anchor of optional) {
      const { unmount } = renderCard(anchor);
      expect(screen.getByTestId(`section-chip-${anchor}`).textContent).toBe(
        ACC.chip_optional,
      );
      unmount();
    }
  });

  it("the required set tracks SUBMISSION_REQUIREMENTS, not a copy of it", () => {
    // The gate owns five codes; four map to accordion cards and phone_verified
    // maps to the contact card (see the module's note on that judgement). So
    // the required set is smaller than the gate but never larger, and never
    // empty — an empty set would mean the mapping silently stopped resolving.
    expect(SUBMISSION_REQUIREMENTS.length).toBeGreaterThan(0);
    expect(REQUIRED_ANCHORS.size).toBeGreaterThan(0);
    expect(REQUIRED_ANCHORS.size).toBeLessThanOrEqual(
      SUBMISSION_REQUIREMENTS.length,
    );
    // Every required anchor is a card the hub actually mounts — a mapping that
    // pointed at a deleted anchor would gate nothing and say nothing.
    for (const anchor of REQUIRED_ANCHORS) {
      expect(ALL_ANCHORS).toContain(anchor);
    }
  });

  it("chipKeyFor is total — an unknown anchor is optional, never undefined", () => {
    // A future card whose anchor nobody mapped must render «רשות», not crash
    // and not render an empty pill.
    expect(chipKeyFor("a-card-that-does-not-exist")).toBe("chip_optional");
  });
});
