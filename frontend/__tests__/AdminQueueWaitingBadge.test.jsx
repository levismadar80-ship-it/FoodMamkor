import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WaitingBadge } from "@/app/[locale]/admin/producers/AdminProducersTable";

// next-intl: return the dotted key plus the interpolated values, so the
// assertions below pin the KEY and the day count without depending on the
// Hebrew copy (which is Sapir's to change without breaking this suite).
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, vals) =>
    `${scope}.${key}${vals ? `|${JSON.stringify(vals)}` : ""}`,
}));

afterEach(cleanup);

function renderBadge(producer) {
  render(<WaitingBadge producer={producer} />);
  return screen.queryByTestId("waiting-badge");
}

const queued = (days, extra = {}) => ({
  status: "pending",
  business_days_waiting: days,
  submitted_for_review_at: "2026-08-16T09:00:00Z",
  ...extra,
});

describe("MEH-2110 — waiting badge colour thresholds", () => {
  // The AC's boundaries: 0–1 neutral · 2 amber · >=3 red. Each boundary is
  // asserted on BOTH sides, so an off-by-one in either direction fails —
  // testing only 0 and 5 would pass against almost any threshold pair.
  it.each([
    [0, "bg-gray-100"],
    [1, "bg-gray-100"],
    [2, "bg-amber-100"],
    [3, "bg-red-100"],
    [9, "bg-red-100"],
  ])("%i business days -> %s", (days, expectedClass) => {
    const badge = renderBadge(queued(days));
    expect(badge).not.toBeNull();
    expect(badge.className).toContain(expectedClass);
    expect(badge.getAttribute("data-days")).toBe(String(days));
  });

  it("pending_whatsapp escalates the same as pending", () => {
    const badge = renderBadge(queued(4, { status: "pending_whatsapp" }));
    expect(badge.className).toContain("bg-red-100");
  });
});

describe("MEH-2110 — which rows carry SLA colour at all", () => {
  it("a draft shows its age but never an SLA colour", () => {
    // A draft has not asked to be reviewed, so the 3-business-day promise
    // does not apply to it. RED against a build that colours by day count
    // alone and ignores status.
    const badge = renderBadge({
      status: "draft",
      business_days_waiting: 9,
      submitted_for_review_at: null,
      created_at: "2026-08-01T09:00:00Z",
    });
    expect(badge).not.toBeNull();
    expect(badge.className).toContain("bg-gray-100");
    expect(badge.className).not.toContain("bg-red-100");
    expect(badge.className).not.toContain("bg-amber-100");
  });

  it.each(["approved", "rejected", "inactive"])(
    "%s renders no badge — it is not waiting for anything",
    (status) => {
      expect(renderBadge({ status, business_days_waiting: 12 })).toBeNull();
    },
  );
});

describe("MEH-2110 — the tooltip names which timestamp it shows", () => {
  it("uses the submission key when a stamp exists", () => {
    const badge = renderBadge(queued(2));
    expect(badge.getAttribute("title")).toContain(
      "admin.producers.table.waiting_tooltip_submitted",
    );
  });

  it("falls back to the creation key, not a mislabelled submission", () => {
    // A pre-MEH-2100 row has no stamp. Presenting created_at under the
    // "submitted" label would misreport when the clock started — this is the
    // assertion that fails if the two keys are ever collapsed into one.
    const badge = renderBadge({
      status: "pending",
      business_days_waiting: 1,
      submitted_for_review_at: null,
      created_at: "2026-08-10T09:00:00Z",
    });
    expect(badge.getAttribute("title")).toContain(
      "admin.producers.table.waiting_tooltip_created",
    );
    expect(badge.getAttribute("title")).not.toContain("waiting_tooltip_submitted");
  });

  it("omits the tooltip entirely when there is no timestamp at all", () => {
    const badge = renderBadge({ status: "pending", business_days_waiting: 0 });
    expect(badge.getAttribute("title")).toBeNull();
  });
});
