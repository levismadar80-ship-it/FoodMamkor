import { describe, it, expect } from "vitest";
import he from "../messages/he.json";

// MEH-2421: the events EmptyState renders only when NO filter is applied
// (MEH-1865, `datasetEmpty`), so its copy must not talk about filtering —
// "אין כאן אירועים שתואמים לסינון" with no filter on read as a bug. The
// filtered-to-zero case has its own surface (`no_results_*`).
const L = he.events.list;

describe("events empty-dataset copy (MEH-2421)", () => {
  it.each(["empty_events_title", "empty_events_body", "empty_experiences_title", "empty_experiences_body"])(
    "%s does not mention a filter the reader never applied",
    (key) => {
      expect(L[key]).toBeTruthy();
      expect(L[key]).not.toMatch(/סינון|לסנן|לנקות|הקטגוריה|להרחיב/);
    },
  );

  it.each(["eyebrow_events", "eyebrow_experiences"])("%s is Hebrew only, like every other eyebrow", (key) => {
    expect(L[key]).toBeTruthy();
    expect(L[key]).not.toMatch(/[A-Za-z]/);
  });
});
