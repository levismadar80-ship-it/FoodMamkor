import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-288: mock next-intl per the established precedent (AvailabilityBadge).
// The card resolves copy from dashboard.producer.completeness.*; the mock
// returns the Hebrew strings + supports {percent}/{count} ICU interpolation.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars = {}) => {
    const flat = {
      red_headline: "הפרופיל שלך חסר פרטים קריטיים",
      red_sub: "בלעדיהם לקוחות לא יראו אותך במפה ובחיפוש",
      yellow_low_headline: "הפרופיל שלך {percent}% מוכן",
      yellow_low_sub: "עוד כמה פרטים ותוכלי להתחיל לקבל לקוחות",
      yellow_high_headline: "כמעט שם — {percent}% מוכן",
      yellow_high_sub: "רק {count, plural, one {פרט אחד} two {שני פרטים} other {# פרטים}} עד שהפרופיל מלא",
      green_headline: "הפרופיל מלא",
      next_step_prefix: "השלב הבא:",
      cta: "השלימי פרופיל",
      cta_aria: "השלימי את הפרופיל שלך",
      ring_aria: "השלמת פרופיל: {percent}%",
      checklist_aria: "התקדמות השלמת הפרופיל",
      checklist_done: "הושלם",
      checklist_todo: "עדיין חסר",
      "fields.city": "עיר",
      "fields.coords": "מיקום על המפה",
      "fields.delivery": "אזורי משלוח",
      "fields.contact": "פרטי קשר (טלפון/אינסטגרם)",
      "fields.category": "קטגוריה",
      "fields.image": "תמונה ראשית",
    };
    const raw = flat[key] ?? key;
    // Resolve {var, plural, one {…} other {…}} (mirrors next-intl ICU) before
    // simple {var} interpolation, so plural-aware copy is tested faithfully.
    const withPlurals = raw.replace(
      /\{(\w+), plural, one \{([^}]*)\} two \{([^}]*)\} other \{([^}]*)\}\}/g,
      (_, k, one, two, other) => {
        const n = vars[k];
        const branch = n === 1 ? one : n === 2 ? two : other;
        return branch.replace(/#/g, String(n));
      },
    );
    return withPlurals.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  },
}));

import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";

// Minimal producer shapes that drive each state through the REAL heuristic
// (lib/producer-completeness.js) — no mock of the engine, so the test also
// guards the percent math + state mapping end-to-end.
const base = {
  city: "תל אביב",
  lat: 32.07,
  lng: 34.78,
  phone: "0500000000",
  categories: ["dairy"],
  images: ["img1"],
  has_physical_location: true,
};

describe("ProfileCompletenessCard", () => {
  it("renders nothing when producer is null", () => {
    const { container } = render(<ProfileCompletenessCard producer={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("green/complete → collapses to a single confirmation line, no CTA", () => {
    render(<ProfileCompletenessCard producer={base} />);
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
    expect(screen.queryByText("השלימי פרופיל")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("red → critical-missing headline + progressbar + CTA", () => {
    // Missing city → red. 1 of 5 missing → 80% filled, but the red copy wins.
    render(<ProfileCompletenessCard producer={{ ...base, city: null }} />);
    expect(
      screen.getByText("הפרופיל שלך חסר פרטים קריטיים"),
    ).toBeInTheDocument();
    const ring = screen.getByRole("progressbar");
    expect(ring).toHaveAttribute("aria-valuenow", "80");
    const cta = screen.getByRole("link", { name: "השלימי את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", "/settings");
  });

  it("yellow low (≤70%) → percent headline + names the next missing field", () => {
    // city/coords/contact present, category + image missing → 60%, yellow-low.
    render(
      <ProfileCompletenessCard
        producer={{ ...base, categories: [], images: [] }}
      />,
    );
    expect(screen.getByText("הפרופיל שלך 60% מוכן")).toBeInTheDocument();
    // missing[0] === "קטגוריה" → next step label rendered.
    expect(screen.getByText("קטגוריה")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
  });

  it("yellow high (>70%) → 'almost there' headline + remaining count", () => {
    // Only image missing → 80%, yellow-high.
    render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);
    expect(screen.getByText("כמעט שם — 80% מוכן")).toBeInTheDocument();
    // count=1 (only image missing) → ICU singular grammar, not "רק 1 פרטים".
    expect(
      screen.getByText("רק פרט אחד עד שהפרופיל מלא"),
    ).toBeInTheDocument();
  });

  // MEH-897: yellow >70 swaps the single next-step line for a 5-row checklist.
  it("yellow high (>70%) → 5-row checklist (4 done + 1 remaining) + next-step box", () => {
    // Only image missing → 80%. Physical-location producer → coords row applies.
    render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);

    const list = screen.getByRole("list", {
      name: "התקדמות השלמת הפרופיל",
    });
    expect(list).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);

    // 4 completed + 1 remaining, exposed to AT via per-row sr-only state.
    expect(within(list).getAllByText("הושלם")).toHaveLength(4);
    expect(within(list).getAllByText("עדיין חסר")).toHaveLength(1);

    // The remaining row is the missing field (image → "תמונה ראשית"), and the
    // top-remaining field is also echoed in the emphasized next-step box, so the
    // label appears twice (checklist row + box) while the prefix appears once.
    expect(screen.getByText("השלב הבא:")).toBeInTheDocument();
    expect(screen.getAllByText("תמונה ראשית").length).toBeGreaterThanOrEqual(2);
    // CTA still present below the box.
    expect(
      screen.getByRole("link", { name: "השלימי את הפרופיל שלך" }),
    ).toBeInTheDocument();
  });

  it("yellow high checklist honors coords XOR delivery (delivery-only producer)", () => {
    // Delivery-only, only image missing → 80%, yellow-high. Heuristic flags
    // `delivery` not `coords`, so the checklist must show the delivery row.
    render(
      <ProfileCompletenessCard
        producer={{
          city: "תל אביב",
          has_physical_location: false,
          offers_delivery: true,
          delivery_areas: [{ city: "חיפה" }],
          phone: "0500000000",
          categories: ["dairy"],
          images: [],
        }}
      />,
    );
    const list = screen.getByRole("list", {
      name: "התקדמות השלמת הפרופיל",
    });
    expect(within(list).getByText("אזורי משלוח")).toBeInTheDocument();
    expect(within(list).queryByText("מיקום על המפה")).not.toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
  });
});
