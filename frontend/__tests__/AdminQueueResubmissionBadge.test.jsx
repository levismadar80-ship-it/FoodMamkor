import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ResubmissionBadge } from "@/app/[locale]/admin/producers/AdminProducersTable";

// next-intl: dotted key + interpolated values, so the assertions pin the KEY
// and the count without depending on the Hebrew copy (AdminQueueWaitingBadge
// convention).
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, vals) =>
    `${scope}.${key}${vals ? `|${JSON.stringify(vals)}` : ""}`,
}));

afterEach(cleanup);

function renderBadge(producer) {
  render(<ResubmissionBadge producer={producer} />);
  return screen.queryByTestId("resubmission-badge");
}

describe("MEH-2210 chunk C — resubmission badge on the admin queue", () => {
  it("pending + count 1 → badge with the count and the PRIOR reason as title", () => {
    const badge = renderBadge({
      status: "pending",
      resubmission_count: 1,
      rejection_reason: "תמונה ראשית חסרה — רק לוגו",
    });
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('admin.producers.table.resubmission_badge|{"n":1}');
    expect(badge).toHaveAttribute("title", "תמונה ראשית חסרה — רק לוגו");
    expect(badge).toHaveAttribute("data-count", "1");
  });

  it("pending + count 3 → the count is the one rendered (not a boolean)", () => {
    const badge = renderBadge({ status: "pending", resubmission_count: 3, rejection_reason: null });
    expect(badge.textContent).toContain('{"n":3}');
    expect(badge).not.toHaveAttribute("title");
  });

  // The 0 / 1 / many matrix on the OTHER axis: status. A count on a business
  // that is no longer in the queue must not wear the badge — the count is
  // history and approve does not reset it (chunk A), so this is the case
  // that would otherwise mis-tag every previously-resubmitted business.
  it.each([["approved"], ["rejected"], ["inactive"], ["draft"]])(
    "count 2 but status %s → no badge",
    (status) => {
      expect(renderBadge({ status, resubmission_count: 2 })).toBeNull();
    },
  );

  it.each([[0], [undefined], [null]])("pending but count %s → no badge", (count) => {
    expect(renderBadge({ status: "pending", resubmission_count: count })).toBeNull();
  });
});
