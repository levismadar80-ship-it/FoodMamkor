import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// TrustBadge resolves tier label/tooltip via trust.tier_<n>.{label,tooltip}.
// MEH-1120 (MEH-1074 Task B): TrustBadge is now recognition-only — it renders
// tier 4 (community-leader) and nothing for the verification tiers 2/3,
// which are owned by BadgeRow / verification_tier (ADR-022).
// MEH-2509: tier 5 (ambassador) is retired — the backend no longer computes
// it, and a stale 5 (or any unknown tier) renders nothing.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      "tier_4.label": "מובילת קהילה",
      "tier_4.tooltip": "10+ ביקורות עם דירוג ממוצע 4.5 ומעלה",
    };
    return flat[key] ?? key;
  },
}));

import TrustBadge from "@/components/TrustBadge";

describe("TrustBadge (MEH-1120 recognition-only)", () => {
  it("renders nothing when tier is missing", () => {
    const { container } = render(<TrustBadge tier={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for the verification tiers 2 and 3 (owned by BadgeRow/ADR-022)", () => {
    expect(render(<TrustBadge tier={2} />).container.innerHTML).toBe("");
    expect(render(<TrustBadge tier={3} />).container.innerHTML).toBe("");
  });

  it("renders the tier-4 recognition label", () => {
    render(<TrustBadge tier={4} />);
    expect(screen.getByText("מובילת קהילה")).toBeInTheDocument();
  });

  it("wires the tooltip text into aria-label", () => {
    render(<TrustBadge tier={4} />);
    expect(screen.getByText("מובילת קהילה")).toHaveAttribute(
      "aria-label",
      "10+ ביקורות עם דירוג ממוצע 4.5 ומעלה",
    );
  });

  // MEH-2509: a stale tier 5 must not borrow the tier-4 «מובילת קהילה»
  // badge — that label claims 10+ reviews the business may not have.
  it("renders nothing for the retired ambassador tier 5 (MEH-2509)", () => {
    expect(render(<TrustBadge tier={5} />).container.innerHTML).toBe("");
  });

  it("renders nothing for an unknown tier above 4", () => {
    expect(render(<TrustBadge tier={99} />).container.innerHTML).toBe("");
  });

  it("applies the compact size when compact", () => {
    render(<TrustBadge tier={4} compact />);
    expect(screen.getByText("מובילת קהילה").className).toContain("text-[10px]");
  });
});
