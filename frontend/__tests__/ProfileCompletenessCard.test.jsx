import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-288: mock next-intl per the established precedent (AvailabilityBadge).
// The card resolves copy from dashboard.producer.completeness.*; the mock
// returns the Hebrew strings + supports {percent}/{count} ICU interpolation.
// MEH-897: locale is mutable (vi.hoisted) so a test can exercise the /en gate.
const { mockLocale } = vi.hoisted(() => ({ mockLocale: { current: "he" } }));
vi.mock("next-intl", () => ({
  useLocale: () => mockLocale.current,
  useTranslations: () => (key, vars = {}) => {
    const flat = {
      red_headline: "עוד כמה פרטים חשובים ואתם באוויר",
      red_sub: "מיקום ופרטי קשר עוזרים ללקוחות למצוא אתכם ולפנות אליכם",
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
      "fields.short_desc": "תיאור קצר",
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
  // MEH-1002: 6th field — tagline (short_description) OR story (description).
  short_description: "גבינות עיזים מהחווה",
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

  it("red-tier → positive (non-threat) headline + progressbar + CTA", () => {
    // Missing city → red tier. 1 of 6 missing → 83% filled. MEH-1092: the
    // headline is framed positively (no "critical/threat" copy), the ring is
    // gold not red — but the tier still drives the CTA target (/settings).
    render(<ProfileCompletenessCard producer={{ ...base, city: null }} />);
    expect(
      screen.getByText("עוד כמה פרטים חשובים ואתם באוויר"),
    ).toBeInTheDocument();
    const ring = screen.getByRole("progressbar");
    expect(ring).toHaveAttribute("aria-valuenow", "83");
    const cta = screen.getByRole("link", { name: "השלימי את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", "/settings");
  });

  it("yellow low (≤70%) → percent headline + names the next missing field", () => {
    // city/coords/contact/short_desc present, category + image missing →
    // 4 of 6 = 67%, yellow-low.
    render(
      <ProfileCompletenessCard
        producer={{ ...base, categories: [], images: [] }}
      />,
    );
    expect(screen.getByText("הפרופיל שלך 67% מוכן")).toBeInTheDocument();
    // missing[0] === "קטגוריה" → next step label rendered.
    expect(screen.getByText("קטגוריה")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "67",
    );
  });

  it("yellow high (>70%) → 'almost there' headline + remaining count", () => {
    // Only image missing → 5 of 6 = 83%, yellow-high.
    render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);
    expect(screen.getByText("כמעט שם — 83% מוכן")).toBeInTheDocument();
    // count=1 (only image missing) → ICU singular grammar, not "רק 1 פרטים".
    expect(
      screen.getByText("רק פרט אחד עד שהפרופיל מלא"),
    ).toBeInTheDocument();
  });

  // MEH-897: yellow >70 swaps the single next-step line for a checklist
  // (6 rows since MEH-1002 added the short-description field).
  it("yellow high (>70%) → 6-row checklist (5 done + 1 remaining) + next-step box", () => {
    // Only image missing → 83%. Physical-location producer → coords row applies.
    render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);

    const list = screen.getByRole("list", {
      name: "התקדמות השלמת הפרופיל",
    });
    expect(list).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);

    // 5 completed + 1 remaining, exposed to AT via per-row sr-only state.
    expect(within(list).getAllByText("הושלם")).toHaveLength(5);
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

  // MEH-1002: the new short-description field drives the card like any other
  // yellow-tier field — named as next step, CTA routes to the profile hub.
  it("only description missing → yellow-high, תיאור קצר named, CTA → edit hub", () => {
    render(
      <ProfileCompletenessCard
        producer={{ ...base, short_description: null }}
      />,
    );
    expect(screen.getByText("כמעט שם — 83% מוכן")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "התקדמות השלמת הפרופיל" });
    expect(within(list).getByText("תיאור קצר")).toBeInTheDocument();
    expect(within(list).getAllByText("הושלם")).toHaveLength(5);
    const cta = screen.getByRole("link", { name: "השלימי את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", "/producer/dashboard/edit");
  });

  // MEH-897: he-only gate — /en falls back to the inline next-step (the
  // checklist a11y keys live in he.json only until MEH-472). Mirrors MEH-884.
  it("yellow high on /en → no checklist, falls back to inline next-step", () => {
    mockLocale.current = "en";
    try {
      render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);
      // Headline still renders (key present in both locales)…
      expect(screen.getByText("כמעט שם — 83% מוכן")).toBeInTheDocument();
      // …but the checklist <ul> is gated out, and the inline next-step remains.
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(screen.getByText("השלב הבא:")).toBeInTheDocument();
    } finally {
      mockLocale.current = "he";
    }
  });

  it("yellow high checklist honors coords XOR delivery (delivery-only producer)", () => {
    // Delivery-only, only image missing → 83%, yellow-high. Heuristic flags
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
          short_description: "גבינות עיזים מהחווה",
        }}
      />,
    );
    const list = screen.getByRole("list", {
      name: "התקדמות השלמת הפרופיל",
    });
    expect(within(list).getByText("אזורי משלוח")).toBeInTheDocument();
    expect(within(list).queryByText("מיקום על המפה")).not.toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
  });
});
