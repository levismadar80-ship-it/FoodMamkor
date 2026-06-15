import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// TrustBadge resolves tier label/tooltip via trust.tier_<n>.{label,tooltip}.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      "tier_2.label": "רשום",
      "tier_2.tooltip": "בית עסק רשום במערכת",
      "tier_3.label": "מאומת",
      "tier_3.tooltip": "פרטי הקשר אומתו",
      "tier_5.label": "מומלץ",
      "tier_5.tooltip": "בית עסק מומלץ על ידי הצוות",
    };
    return flat[key] ?? key;
  },
}));

import TrustBadge from "@/components/TrustBadge";

describe("TrustBadge", () => {
  it("renders nothing when tier is missing", () => {
    const { container } = render(<TrustBadge tier={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for tier < 2", () => {
    const { container } = render(<TrustBadge tier={1} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the tier label", () => {
    render(<TrustBadge tier={3} />);
    expect(screen.getByText("מאומת")).toBeInTheDocument();
  });

  it("wires the tooltip text into aria-label", () => {
    render(<TrustBadge tier={3} />);
    expect(screen.getByText("מאומת")).toHaveAttribute(
      "aria-label",
      "פרטי הקשר אומתו",
    );
  });

  it("applies the tier-specific class set", () => {
    render(<TrustBadge tier={5} />);
    expect(screen.getByText("מומלץ").className).toContain("bg-state-selected/10");
  });

  it("falls back to tier 2 styling for an unknown tier", () => {
    render(<TrustBadge tier={99} />);
    // Unknown tier resolves to the tier_2 label + class set.
    expect(screen.getByText("רשום").className).toContain("bg-gray-100");
  });

  it("applies the compact size when compact", () => {
    render(<TrustBadge tier={3} compact />);
    expect(screen.getByText("מאומת").className).toContain("text-[10px]");
  });
});
