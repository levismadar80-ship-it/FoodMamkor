import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProducerActions } from "@/app/[locale]/admin/producers/AdminProducersTable";

// next-intl: identity-ish mock — return the full dotted key so we can
// assert on stable key strings rather than translated copy.
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

const APPROVE_KEY = "admin.producers.table.actions.approve_short";

function renderActions(status) {
  const onQuickApprove = vi.fn();
  render(
    <ProducerActions
      producer={{ id: "p1", status }}
      isStoryOpen={false}
      onQuickApprove={onQuickApprove}
      onToggleStatus={vi.fn()}
      onToggleAmbassador={vi.fn()}
      onDeleteProducer={vi.fn()}
      onToggleStoryCard={vi.fn()}
    />
  );
  return { onQuickApprove };
}

describe("ProducerActions — approve gate (MEH-745)", () => {
  it("renders approve for a self-registered pending_whatsapp producer", () => {
    renderActions("pending_whatsapp");
    expect(screen.getByText(APPROVE_KEY)).toBeInTheDocument();
  });

  it("still renders approve for a classic pending producer (no regression)", () => {
    renderActions("pending");
    expect(screen.getByText(APPROVE_KEY)).toBeInTheDocument();
  });

  it("does not render approve for an approved producer", () => {
    renderActions("approved");
    expect(screen.queryByText(APPROVE_KEY)).not.toBeInTheDocument();
  });
});
