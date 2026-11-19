/**
 * MEH-3409 — under «נקלט, בהשלמה», the admin sees what the owner still has to
 * fill in before she can send the draft for review. Rendered inside the real
 * AdminProducersTable with the real he.json copy.
 *
 * Cells: unclaimed draft (nothing) · claimed draft with 0 / 1 / many missing ·
 * a non-draft row (nothing) · a backend without the field (nothing) · an
 * unknown code (shown as-is, never dropped).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import AdminProducersTable from "@/app/[locale]/admin/producers/AdminProducersTable";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const D = he.admin.producers.table.draft_claim;
const M = he.dashboard.producer.draft.missing;

let seq = 0;
function row(over = {}) {
  seq += 1;
  return {
    id: `p-${seq}`,
    name: `עסק ${seq}`,
    status: "draft",
    has_owner: true,
    created_at: "2026-10-01T10:00:00+00:00",
    _completeness: { missing: [], priority: "green" },
    ...over,
  };
}

function renderTable(rows) {
  const noop = vi.fn();
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminProducersTable
        rows={rows}
        incompleteOnly={false}
        storyCardOpenId={null}
        onSetStoryCardOpenId={noop}
        loadError={false}
        onRetryLoad={noop}
        onQuickApprove={noop}
        onRequestChanges={noop}
        onReject={noop}
        onToggleStatus={noop}
        onDeleteProducer={noop}
        onUploadStoryCard={noop}
        isBusy={() => false}
        page={1}
        totalPages={1}
        perPage={25}
        onPageChange={noop}
        onPerPageChange={noop}
        visibleCount={rows.length}
      />
    </NextIntlClientProvider>,
  );
}

const lines = () => screen.queryAllByTestId("draft-missing").map((n) => n.textContent);

beforeEach(() => {
  seq = 0;
});

describe("draft missing line (MEH-3409)", () => {
  it("lists many missing items in the owner's own words", () => {
    renderTable([row({ draft_missing: ["image", "product", "phone_verified"] })]);
    expect(lines()).toEqual([
      D.missing.replace("{items}", [M.image, M.product, M.phone_verified].join(", ")),
    ]);
  });

  it("lists a single missing item", () => {
    renderTable([row({ draft_missing: ["location"] })]);
    expect(lines()).toEqual([D.missing.replace("{items}", M.location)]);
  });

  it("says all is filled in when nothing is missing", () => {
    renderTable([row({ draft_missing: [] })]);
    expect(lines()).toEqual([D.all_filled]);
  });

  it("shows an unknown code as-is rather than dropping it", () => {
    renderTable([row({ draft_missing: ["image", "new_rule"] })]);
    expect(lines()).toEqual([D.missing.replace("{items}", `${M.image}, new_rule`)]);
  });

  it.each([
    ["an unclaimed draft", { has_owner: false, draft_missing: null }],
    ["a pending business", { status: "pending", draft_missing: ["image"] }],
    ["a backend that does not send the field", {}],
  ])("shows nothing for %s", (_label, over) => {
    renderTable([row(over)]);
    expect(lines()).toEqual([]);
  });
});
