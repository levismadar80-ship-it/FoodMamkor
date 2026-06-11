import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-475 PR-C4a chunk 4b: mock next-intl per established precedent.
// MEH-76 chunk 4: the mock now covers the producer.badge tier keys and does
// simple {param} interpolation so the S12 tooltip strings stay assertable.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values = {}) => {
    const flat = {
      aria: "תגיות בית עסק",
      verified_label: "מאומת",
      declared_label: "מוצהר",
      verified_tooltip_license: "רישיון הוגש ונבדק בתאריך {date}",
      verified_tooltip_exemption: "אישור פטור הוגש ונבדק בתאריך {date}",
      declared_explainer: "העסק חתם על הצהרה מחייבת שהוא פועל כדין.",
      aria_verified: "בית עסק מאומת. {tooltip}",
      aria_verified_plain: "בית עסק מאומת",
      aria_declared: "בית עסק מוצהר",
    };
    let s = flat[key] ?? key;
    for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
    return s;
  },
}));

import BadgeRow from "@/components/BadgeRow";

// Live ADR-022 contract fields (MEH-762) — the S12 chip renders from these.
const VERIFIED_LICENSE = {
  verification_tier: "verified",
  verification_doc_type: "license",
  verified_at: "2026-06-05",
};

describe("BadgeRow", () => {
  it("renders nothing when the producer has no earned badges", () => {
    const { container } = render(
      <BadgeRow producer={{ verification_tier: null, products_count: 0 }} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders one pill per earned badge", () => {
    render(
      <BadgeRow
        producer={{
          ...VERIFIED_LICENSE,
          is_recommended: true,
          days_since_created: 5,
        }}
      />,
    );
    expect(screen.getByText("מאומת")).toBeInTheDocument();
    expect(screen.getByText("מומלץ")).toBeInTheDocument();
    expect(screen.getByText("חדש")).toBeInTheDocument();
  });

  it("respects the limit prop (priority order)", () => {
    render(
      <BadgeRow
        limit={2}
        producer={{
          ...VERIFIED_LICENSE,
          is_recommended: true,
          days_since_created: 5,
          has_delivery: true,
          products_count: 10,
        }}
      />,
    );
    expect(screen.getByText("מאומת")).toBeInTheDocument();
    expect(screen.getByText("מומלץ")).toBeInTheDocument();
    expect(screen.queryByText("חדש")).not.toBeInTheDocument();
    expect(screen.queryByText("משלוח")).not.toBeInTheDocument();
  });

  describe("tooltip interaction", () => {
    it("opens on click, closes on second click", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} />);
      const btn = screen.getByText("מאומת");
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.getByTestId("badge-tooltip-verified")).toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
    });

    it("closes on outside click (mousedown on document body)", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} />);
      fireEvent.click(screen.getByText("מאומת"));
      expect(screen.getByTestId("badge-tooltip-verified")).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
    });

    it("closes on Escape", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} />);
      fireEvent.click(screen.getByText("מאומת"));
      expect(screen.getByTestId("badge-tooltip-verified")).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
    });

    it("badge button has accessible aria-label", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} />);
      const btn = screen.getByRole("button", { name: /מאומת/ });
      expect(btn.getAttribute("aria-label")).toContain("מאומת");
      expect(btn.getAttribute("aria-label")).toMatch(/נבדק/);
    });
  });

  // MEH-76 chunk 4 — S12 tier states from the live ADR-022 contract.
  describe("S12 tier badge", () => {
    it("license tooltip carries the LTR-isolated d.m.yyyy date", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} />);
      fireEvent.click(screen.getByText("מאומת"));
      const tip = screen.getByTestId("badge-tooltip-verified");
      expect(tip.textContent).toContain("רישיון הוגש ונבדק בתאריך");
      expect(tip.textContent).toContain("⁦5.6.2026⁩");
    });

    it("exemption doc type swaps the tooltip string", () => {
      render(
        <BadgeRow
          producer={{ ...VERIFIED_LICENSE, verification_doc_type: "exemption" }}
        />,
      );
      fireEvent.click(screen.getByText("מאומת"));
      expect(screen.getByTestId("badge-tooltip-verified").textContent).toContain(
        "אישור פטור",
      );
    });

    it("cosmetics renders the seal WITHOUT a tooltip (key not yet locked)", () => {
      render(
        <BadgeRow
          producer={{ ...VERIFIED_LICENSE, verification_doc_type: "cosmetics" }}
        />,
      );
      const btn = screen.getByRole("button", { name: "בית עסק מאומת" });
      fireEvent.click(btn);
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
    });

    it("card surface renders the icon-only seal (no word)", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} surface="card" />);
      const btn = screen.getByRole("button", { name: /מאומת/ });
      expect(btn).toHaveAttribute("data-badge", "verified");
      expect(btn.textContent).toBe(""); // seal glyph only — the name stays the hero
    });

    it("declared renders the calm chip + explainer on the hero surface", () => {
      render(<BadgeRow producer={{ verification_tier: "declared" }} />);
      const chip = screen.getByText("מוצהר");
      fireEvent.click(chip);
      expect(screen.getByTestId("badge-tooltip-declared")).toBeInTheDocument();
    });

    it("declared renders NOTHING on the card surface (no negative tag)", () => {
      const { container } = render(
        <BadgeRow producer={{ verification_tier: "declared" }} surface="card" />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("null tier renders no tier badge at all", () => {
      render(
        <BadgeRow producer={{ verification_tier: null, is_recommended: true }} />,
      );
      expect(screen.queryByText("מאומת")).not.toBeInTheDocument();
      expect(screen.queryByText("מוצהר")).not.toBeInTheDocument();
      expect(screen.getByText("מומלץ")).toBeInTheDocument();
    });
  });
});
