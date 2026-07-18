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
      verified_tooltip_license: "רישיון הוגש ונבדק בתאריך {date}",
      verified_tooltip_exemption: "אישור פטור הוגש ונבדק בתאריך {date}",
      aria_verified: "בית עסק מאומת. {tooltip}",
      aria_verified_plain: "בית עסק מאומת",
    };
    let s = flat[key] ?? key;
    for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
    return s;
  },
}));

// MEH-1334: BadgeRow's hero popover links to /about#verification via the
// locale-aware Link — mock the wrapper directly (BottomNav.test precedent).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
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

  it("hideKeys drops the named badges, keeps the rest (MEH-1124)", () => {
    render(
      <BadgeRow
        hideKeys={["products", "delivery"]}
        producer={{ ...VERIFIED_LICENSE, has_delivery: true, products_count: 10 }}
      />,
    );
    expect(screen.getByText("מאומת")).toBeInTheDocument();
    expect(screen.queryByText("משלוח")).not.toBeInTheDocument();
    expect(screen.queryByText("מוצרים")).not.toBeInTheDocument();
  });

  describe("tooltip interaction", () => {
    // MEH-800: card-Link safety — tap on a chip inside a wrapping clickable
    // (the ProducerCard Link pattern) opens the popover, never navigates.
    it("chip tap inside a wrapping clickable does not bubble", () => {
      const parentClick = vi.fn();
      render(
         
        <div onClick={parentClick}>
          <BadgeRow producer={VERIFIED_LICENSE} />
        </div>,
      );
      fireEvent.click(screen.getByText("מאומת"));
      expect(screen.getByTestId("badge-tooltip-verified")).toBeInTheDocument();
      expect(parentClick).not.toHaveBeenCalled();
    });

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
      fireEvent.keyDown(globalThis, { key: "Escape" });
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
  // MEH-1334 (CLARIFY c): the doc-date tooltip now lives ONLY on the card
  // surface — the hero popover shows the locked dateless copy. These assert
  // the date-bearing strings via surface="card" (getVerifiedTooltip owner).
  describe("S12 tier badge", () => {
    it("license tooltip carries the LTR-isolated d.m.yyyy date (card surface)", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} surface="card" />);
      fireEvent.click(screen.getByRole("button", { name: /מאומת/ }));
      const tip = screen.getByTestId("badge-tooltip-verified");
      expect(tip.textContent).toContain("רישיון הוגש ונבדק בתאריך");
      expect(tip.textContent).toContain("⁦5.6.2026⁩");
    });

    it("exemption doc type swaps the tooltip string (card surface)", () => {
      render(
        <BadgeRow
          producer={{ ...VERIFIED_LICENSE, verification_doc_type: "exemption" }}
          surface="card"
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /מאומת/ }));
      expect(screen.getByTestId("badge-tooltip-verified").textContent).toContain(
        "אישור פטור",
      );
    });

    // MEH-1334: the hero seal ALWAYS opens the verification popover with the
    // LOCKED dateless copy (title + body + /about#verification link) — the
    // pre-existing MEH-762 doc-date line was dropped from the hero surface
    // (CLARIFY c). Same content for every doc type; cosmetics included.
    it("hero popover shows the locked dateless copy for license doc type", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} />);
      fireEvent.click(screen.getByText("מאומת"));
      const pop = screen.getByTestId("badge-tooltip-verified");
      expect(pop.querySelector('a[href="/about#verification"]')).not.toBeNull();
      expect(pop.textContent).toContain("verified_popover_body");
      // the pre-existing doc-date line must NOT appear on the hero surface
      expect(pop.textContent).not.toContain("הוגש ונבדק");
    });

    it("hero popover copy is identical for a cosmetics doc type (still no date)", () => {
      render(
        <BadgeRow
          producer={{ ...VERIFIED_LICENSE, verification_doc_type: "cosmetics" }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "בית עסק מאומת" }));
      const pop = screen.getByTestId("badge-tooltip-verified");
      expect(pop.textContent).toContain("verified_popover_body");
      expect(pop.textContent).not.toContain("הוגש ונבדק");
    });

    // CLARIFY a/b: the seal — and therefore this popover — never renders for a
    // non-verified producer, so the "אישור ידני ופועל ברישיון" claim is safe.
    it("renders NO verified seal (and no popover) when verification_tier !== verified", () => {
      const { container } = render(
        <BadgeRow producer={{ verification_tier: "declared" }} />,
      );
      expect(container.querySelector('[data-badge="verified"]')).toBeNull();
    });

    it("card surface renders the icon-only seal (no word)", () => {
      render(<BadgeRow producer={VERIFIED_LICENSE} surface="card" />);
      const btn = screen.getByRole("button", { name: /מאומת/ });
      expect(btn).toHaveAttribute("data-badge", "verified");
      expect(btn.textContent).toBe(""); // seal glyph only — the name stays the hero
    });

    // MEH-1170: the S12 "מוצהר" chip contradicted ADR-022 ("tier 2 = no
    // badge") and was removed. Declared renders no tier badge on ANY surface;
    // the affirmative declared_explainer moved to ProducerHeader as visible copy.
    it("declared renders no tier badge on the hero surface (ADR-022 no-badge)", () => {
      const { container } = render(
        <BadgeRow producer={{ verification_tier: "declared" }} />,
      );
      expect(container.innerHTML).toBe("");
      expect(screen.queryByText("מוצהר")).not.toBeInTheDocument();
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
