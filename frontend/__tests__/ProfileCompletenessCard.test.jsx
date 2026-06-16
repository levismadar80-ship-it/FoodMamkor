import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
      yellow_high_sub: "רק {count} פרטים עד שהפרופיל מלא",
      green_headline: "הפרופיל מלא",
      next_step_prefix: "השלב הבא:",
      cta: "השלימי פרופיל",
      cta_aria: "השלימי את הפרופיל שלך",
      ring_aria: "השלמת פרופיל: {percent}%",
      "fields.city": "עיר",
      "fields.coords": "מיקום על המפה",
      "fields.delivery": "אזורי משלוח",
      "fields.contact": "פרטי קשר (טלפון/אינסטגרם)",
      "fields.category": "קטגוריה",
      "fields.image": "תמונה ראשית",
    };
    const raw = flat[key] ?? key;
    return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
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
    expect(
      screen.getByText("רק 1 פרטים עד שהפרופיל מלא"),
    ).toBeInTheDocument();
  });
});
