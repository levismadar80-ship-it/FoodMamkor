import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// TrustBadge resolves tier label/tooltip via trust.tier_<n>.{label,tooltip}.
// MEH-1120 (MEH-1074 Task B): TrustBadge is now recognition-only — it renders
// tiers 4 (community-leader) and 5 (ambassador) and nothing for the
// verification tiers 2/3, which are owned by BadgeRow / verification_tier
// (ADR-022).
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      "tier_4.label": "מובילת קהילה",
      "tier_4.tooltip": "10+ ביקורות עם דירוג ממוצע 4.5 ומעלה",
      "tier_5.label": "שגרירת מהמקור",
      "tier_5.tooltip": "בעלת העסק המובילה באזור",
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
    render(<TrustBadge tier={5} />);
    expect(screen.getByText("שגרירת מהמקור")).toHaveAttribute(
      "aria-label",
      "בעלת העסק המובילה באזור",
    );
  });

  it("applies the tier-5 (ambassador) class set", () => {
    render(<TrustBadge tier={5} />);
    expect(screen.getByText("שגרירת מהמקור").className).toContain("bg-state-selected/10");
  });

  it("falls back to tier-4 label + styling for an unknown tier ≥ 4", () => {
    render(<TrustBadge tier={99} />);
    // unknown tier resolves tierKey → 4 (label + class set both from tier 4)
    expect(screen.getByText("מובילת קהילה").className).toContain("bg-amber-50");
  });

  it("applies the compact size when compact", () => {
    render(<TrustBadge tier={4} compact />);
    expect(screen.getByText("מובילת קהילה").className).toContain("text-[10px]");
  });
});
