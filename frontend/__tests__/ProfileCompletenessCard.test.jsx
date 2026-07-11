import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-288/MEH-1106: mock next-intl per the established precedent. The card
// resolves copy from dashboard.producer.completeness.*; the mock returns the
// Hebrew strings + supports {percent} ICU interpolation. The 4-step model
// (MEH-1106) no longer branches on locale, so no useLocale mock is needed.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars = {}) => {
    const flat = {
      yellow_low_headline: "הפרופיל שלך {percent}% מוכן",
      yellow_high_headline: "כמעט שם — {percent}% מוכן",
      green_headline: "הפרופיל מלא",
      next_step_prefix: "השלב הבא:",
      checklist_sub: "עוד כמה צעדים והפרופיל שלכם מוכן לקבל פניות",
      cta: "השלימו פרופיל",
      cta_aria: "השלימו את הפרופיל שלך",
      ring_aria: "השלמת פרופיל: {percent}%",
      checklist_aria: "התקדמות השלמת הפרופיל",
      checklist_done: "הושלם",
      checklist_todo: "עדיין חסר",
      "steps.image": "תמונה ראשית",
      "steps.location": "קטגוריות ומיקום",
      "steps.products": "3 מוצרים בקטלוג",
      "steps.contact": "פרטי קשר",
    };
    const raw = flat[key] ?? key;
    return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  },
}));

import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";

// Minimal producer shapes that drive each state through the REAL heuristic
// (lib/producer-completeness.js) — no mock of the engine, so the test also
// guards the step-mapping end-to-end. `products` is card-only (MEH-1106 B1):
// 3+ items satisfies step ③ without touching the shared heuristic.
const base = {
  city: "תל אביב",
  lat: 32.07,
  lng: 34.78,
  phone: "0500000000",
  categories: ["dairy"],
  images: ["img1"],
  has_physical_location: true,
  short_description: "גבינות עיזים מהחווה",
  products: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
};

const EDIT = "/producer/dashboard/edit";

function hrefs(container) {
  return Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
}

describe("ProfileCompletenessCard (MEH-1106 4-step checklist)", () => {
  it("renders nothing when producer is null", () => {
    const { container } = render(<ProfileCompletenessCard producer={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("all 4 steps done → collapses to a single confirmation line, no CTA/ring", () => {
    render(<ProfileCompletenessCard producer={base} />);
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
    expect(screen.queryByText("השלימו פרופיל")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shared heuristic is untouched by the card-only products step: short_description missing does NOT block completion", () => {
    // short_desc is in the heuristic (admin) but not one of the 4 card steps —
    // a producer missing only the description still shows the card complete.
    render(
      <ProfileCompletenessCard
        producer={{ ...base, short_description: null, description: null }}
      />,
    );
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
  });

  it("missing photo → 3/4 = 75% (yellow-high), 4-row checklist, deep-links to #profile-images", () => {
    const { container } = render(
      <ProfileCompletenessCard producer={{ ...base, images: [] }} />,
    );
    expect(screen.getByText("כמעט שם — 75% מוכן")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");

    const list = screen.getByRole("list", { name: "התקדמות השלמת הפרופיל" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getAllByText("הושלם")).toHaveLength(3);
    expect(within(list).getAllByText("עדיין חסר")).toHaveLength(1);

    // Photo is the top-remaining step → echoed in the next-step box + CTA target.
    expect(screen.getByText("השלב הבא:")).toBeInTheDocument();
    expect(screen.getAllByText("תמונה ראשית").length).toBeGreaterThanOrEqual(2);
    const cta = screen.getByRole("link", { name: "השלימו את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", `${EDIT}#profile-images`);
  });

  it("missing 2 steps → 50% (yellow-low, calm progress headline)", () => {
    // images + contact missing → 2 of 4 done → 50%.
    render(
      <ProfileCompletenessCard
        producer={{ ...base, images: [], phone: null, instagram: null }}
      />,
    );
    expect(screen.getByText("הפרופיל שלך 50% מוכן")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("products step is card-only: fewer than 3 products → step todo, CTA → #profile-products", () => {
    const { container } = render(
      <ProfileCompletenessCard producer={{ ...base, products: [{ id: "p1" }] }} />,
    );
    // image/location/contact done, products todo → 75%.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
    const cta = screen.getByRole("link", { name: "השלימו את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", `${EDIT}#profile-products`);
    // Every checklist row is a deep-link to an editor section.
    expect(hrefs(container)).toEqual(
      expect.arrayContaining([
        `${EDIT}#profile-images`,
        `${EDIT}#profile-categories`,
        `${EDIT}#profile-products`,
        `${EDIT}#profile-contact`,
      ]),
    );
  });

  it("products signal falls back to products_count scalar when the array is absent", () => {
    // No `products` array (e.g. a slimmer payload) but products_count present.
    const { products, ...noArray } = base;
    void products;
    render(<ProfileCompletenessCard producer={{ ...noArray, products_count: 5 }} />);
    // 4/4 → complete.
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
  });

  it("no products at all → products step todo (not complete)", () => {
    const { products, ...noArray } = base;
    void products;
    render(<ProfileCompletenessCard producer={noArray} />);
    expect(screen.queryByText("הפרופיל מלא")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });

  it("missing contact → contact step todo, CTA → #profile-contact", () => {
    render(
      <ProfileCompletenessCard producer={{ ...base, phone: null, instagram: null }} />,
    );
    const cta = screen.getByRole("link", { name: "השלימו את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", `${EDIT}#profile-contact`);
  });

  it("location step honours coords XOR delivery: delivery-only + areas set → step done", () => {
    render(
      <ProfileCompletenessCard
        producer={{
          city: "תל אביב",
          has_physical_location: false,
          offers_delivery: true,
          delivery_areas: [{ city: "חיפה" }],
          phone: "0500000000",
          categories: ["dairy"],
          images: ["img1"],
          products: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
        }}
      />,
    );
    // delivery satisfies location (no coords needed) → 4/4 complete.
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
  });

  it("delivery-only without areas → location step todo", () => {
    render(
      <ProfileCompletenessCard
        producer={{
          city: "תל אביב",
          has_physical_location: false,
          offers_delivery: true,
          delivery_areas: [],
          phone: "0500000000",
          categories: ["dairy"],
          images: ["img1"],
          products: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
        }}
      />,
    );
    // location todo → 3/4 → 75%, and the location step is the top remaining.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
    const cta = screen.getByRole("link", { name: "השלימו את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", `${EDIT}#profile-categories`);
  });
});
