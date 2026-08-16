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
      "steps.products": "מוצר ראשון בקטלוג",
      "steps.contact": "פרטי קשר",
      "steps.phone_verified": "אימות וואטסאפ",
      "steps.hours": "שעות פתיחה",
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
  // MEH-1895: hours joined the checklist as step 5, so a "complete" fixture
  // must declare them or every green case below silently drops one step
  // (83% under the six-step model — see the phone_verified note below).
  opening_hours: "א׳-ה׳ 9:00-17:00",
  // MEH-2100: verification split off from "contact" into its own step
  // (Sapir 16/08), so a "complete" fixture must declare it too — the same
  // reason hours needed declaring when it became step 5. Without it every
  // green case below silently reads 5/6.
  phone_verified: true,
  products: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
};

const EDIT = "/producer/dashboard/edit";

function hrefs(container) {
  return Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
}

describe("ProfileCompletenessCard (MEH-1106 checklist; MEH-1895 5th step)", () => {
  it("renders nothing when producer is null", () => {
    const { container } = render(<ProfileCompletenessCard producer={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("all steps done → collapses to a single confirmation line, no CTA/ring", () => {
    render(<ProfileCompletenessCard producer={base} />);
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
    expect(screen.queryByText("השלימו פרופיל")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shared heuristic is untouched by the card-only products step: short_description missing does NOT block completion", () => {
    // short_desc is in the heuristic (admin) but is not a card step —
    // a producer missing only the description still shows the card complete.
    render(
      <ProfileCompletenessCard
        producer={{ ...base, short_description: null, description: null }}
      />,
    );
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
  });

  it("missing photo → 5/6 = 83% (yellow-high), 6-row checklist, deep-links to #profile-images", () => {
    const { container } = render(
      <ProfileCompletenessCard producer={{ ...base, images: [] }} />,
    );
    expect(screen.getByText("כמעט שם — 83% מוכן")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");

    const list = screen.getByRole("list", { name: "התקדמות השלמת הפרופיל" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getAllByText("הושלם")).toHaveLength(5);
    expect(within(list).getAllByText("עדיין חסר")).toHaveLength(1);

    // Photo is the top-remaining step → echoed in the next-step box + CTA target.
    expect(screen.getByText("השלב הבא:")).toBeInTheDocument();
    expect(screen.getAllByText("תמונה ראשית").length).toBeGreaterThanOrEqual(2);
    const cta = screen.getByRole("link", { name: "השלימו את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", `${EDIT}#profile-images`);
  });

  it("missing 2 steps → 67% (yellow-low, calm progress headline)", () => {
    // images + contact missing → 4 of 6 done → 67%.
    render(
      <ProfileCompletenessCard
        producer={{ ...base, images: [], phone: null, instagram: null }}
      />,
    );
    expect(screen.getByText("הפרופיל שלך 67% מוכן")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
  });

  // MEH-1238: one product now completes the checklist step (badge still needs 3).
  it("one product → products step done → 100% complete", () => {
    render(
      <ProfileCompletenessCard producer={{ ...base, products: [{ id: "p1" }] }} />,
    );
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("products step is card-only: zero products → step todo, CTA → #profile-products", () => {
    const { container } = render(
      <ProfileCompletenessCard producer={{ ...base, products: [] }} />,
    );
    // image/location/contact/phone_verified/hours done, products todo →
    // 5 of 6 → 83%.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");
    const cta = screen.getByRole("link", { name: "השלימו את הפרופיל שלך" });
    expect(cta).toHaveAttribute("href", `${EDIT}#profile-products`);
    // Every checklist row is a deep-link to an editor section.
    expect(hrefs(container)).toEqual(
      expect.arrayContaining([
        `${EDIT}#profile-images`,
        // MEH-1165 item 4 / MEH-2058: the location row lands on
        // LocationsEditor (the duplicate LocationCard target was deleted).
        `${EDIT}#locations`,
        `${EDIT}#profile-products`,
        `${EDIT}#profile-contact`,
        `${EDIT}#hours`,
      ]),
    );
  });

  it("products signal falls back to products_count scalar when the array is absent", () => {
    // No `products` array (e.g. a slimmer payload) but products_count present.
    const { products, ...noArray } = base;
    void products;
    render(<ProfileCompletenessCard producer={{ ...noArray, products_count: 5 }} />);
    // every step done → complete.
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
  });

  it("no products at all → products step todo (not complete)", () => {
    const { products, ...noArray } = base;
    void products;
    render(<ProfileCompletenessCard producer={noArray} />);
    expect(screen.queryByText("הפרופיל מלא")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");
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
          opening_hours: "א׳-ה׳ 9:00-17:00",
          phone: "0500000000",
          phone_verified: true,
          categories: ["dairy"],
          images: ["img1"],
          products: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
        }}
      />,
    );
    // delivery satisfies location (no coords needed) → every step complete.
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
          opening_hours: "א׳-ה׳ 9:00-17:00",
          phone: "0500000000",
          phone_verified: true,
          categories: ["dairy"],
          images: ["img1"],
          products: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
        }}
      />,
    );
    // location todo → 5/6 → 83%, and the location step is the top remaining.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");
    const cta = screen.getByRole("link", { name: "השלימו את הפרופיל שלך" });
    // MEH-1165 item 4 / MEH-2058: the location step's CTA lands on LocationsEditor.
    expect(cta).toHaveAttribute("href", `${EDIT}#locations`);
  });
});

/**
 * MEH-1895 — the gap MEH-1884 left open.
 *
 * MEH-1884 made opening_hours a yellow-tier completeness field, so the card
 * MOUNTS when hours are missing. But the checklist was a fixed four steps, so
 * the owner saw a card with 4/4 green and no indication of why it was there at
 * all. The first test below is the one that could not have passed before: it
 * asserts the card both mounts AND names the reason.
 */
describe("MEH-1895 — hours is the fifth step", () => {
  const noHours = { ...base, opening_hours: "" };

  it("missing ONLY hours → card mounts at 83% with the hours row unchecked", () => {
    // Pre-MEH-1895 this producer rendered "הפרופיל מלא" — mounted, complete,
    // and silent about the field that mounted it.
    render(<ProfileCompletenessCard producer={noHours} />);

    expect(screen.queryByText("הפרופיל מלא")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");

    const list = screen.getByRole("list", { name: "התקדמות השלמת הפרופיל" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getAllByText("הושלם")).toHaveLength(5);
    expect(within(list).getAllByText("עדיין חסר")).toHaveLength(1);

    // Hours is the only remaining step → it drives the next-step box + CTA.
    expect(screen.getAllByText("שעות פתיחה").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("link", { name: "השלימו את הפרופיל שלך" }),
    ).toHaveAttribute("href", `${EDIT}#hours`);
  });

  it("whitespace-only hours count as missing — the same trim the heuristic uses", () => {
    render(<ProfileCompletenessCard producer={{ ...base, opening_hours: "   " }} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");
  });

  it("hours filled + another field missing → hours row is checked, not the other", () => {
    render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);
    const list = screen.getByRole("list", { name: "התקדמות השלמת הפרופיל" });
    const rows = within(list).getAllByRole("listitem");
    const hoursRow = rows.find((r) => r.textContent.includes("שעות פתיחה"));
    const imageRow = rows.find((r) => r.textContent.includes("תמונה ראשית"));

    expect(hoursRow.textContent).toContain("הושלם");
    expect(imageRow.textContent).toContain("עדיין חסר");
  });

  it("step order is stable — hours is last", () => {
    render(<ProfileCompletenessCard producer={noHours} />);
    const list = screen.getByRole("list", { name: "התקדמות השלמת הפרופיל" });
    const labels = within(list)
      .getAllByRole("listitem")
      // MEH-2100: the חובה/מומלץ chip is part of every row now, so it is
      // stripped alongside the sr-only done/todo text. This test is about
      // ORDER and LABELS; which rows are required is asserted separately
      // below, by testid, so stripping here loses no coverage.
      .map((li) =>
        li.textContent
          .replace(/הושלם|עדיין חסר|chip_required|chip_recommended/g, "")
          .trim(),
      );

    expect(labels).toEqual([
      "תמונה ראשית",
      "קטגוריות ומיקום",
      "מוצר ראשון בקטלוג",
      "פרטי קשר",
      "אימות וואטסאפ",
      "שעות פתיחה",
    ]);
  });

  it("chips mark the five gate items required and hours recommended (MEH-2100)", () => {
    // The submit gate blocks on image / products / category+location /
    // contact; opening hours is the one recommended step (Sapir 16/08). A
    // chip on the wrong row would tell the owner she can skip something the
    // server will 422 on, so each of the six is asserted by name rather
    // than counting how many carry each chip.
    render(<ProfileCompletenessCard producer={noHours} />);
    for (const key of ["image", "location", "products", "contact", "phone_verified"]) {
      expect(
        screen.getByTestId(`completeness-chip-${key}`).textContent,
      ).toBe("chip_required");
    }
    expect(screen.getByTestId("completeness-chip-hours").textContent).toBe(
      "chip_recommended",
    );
  });

  // MEH-2100, Sapir 16/08 — the split. This is the state that motivated it and
  // the one that must never regress: contact details are PRESENT, so that row
  // keeps its earned ✓, while the WhatsApp number is unverified, so the gate
  // row is still open. Before the split these were one row, and it read
  // «פרטי קשר ✓ חובה» while the draft banner below refused to submit.
  //
  // Asserted per row rather than by counting: a count would pass if the two
  // rows swapped states, which is precisely the confusion being fixed.
  it("contact ✓ and WhatsApp ✗ can hold at the same time (the split)", () => {
    render(
      <ProfileCompletenessCard
        producer={{ ...base, phone_verified: false }}
      />,
    );
    const list = screen.getByRole("list", { name: "התקדמות השלמת הפרופיל" });
    const rowFor = (label) =>
      within(list)
        .getAllByRole("listitem")
        .find((li) => li.textContent.includes(label));

    expect(rowFor("פרטי קשר").textContent).toContain("הושלם");
    expect(rowFor("אימות וואטסאפ").textContent).toContain("עדיין חסר");
    // And it gates: חובה, not מומלץ.
    expect(
      screen.getByTestId("completeness-chip-phone_verified").textContent,
    ).toBe("chip_required");
    // It points at the OTP card in the dashboard banner, not the edit hub —
    // sending her to the edit page would be a dead end, there is no verify
    // control there.
    expect(rowFor("אימות וואטסאפ").querySelector("a")).toHaveAttribute(
      "href",
      "#phone-verify",
    );
  });

  it("the ring divisor follows the array, so 6 done reads 100 and never over", () => {
    // The guard against the defect the old `STEP_COUNT = 4` constant would have
    // produced on this very change: 6 of 5 = 120%. Asserted on the complete
    // fixture, where the card collapses — a percent over 100 could not render.
    render(<ProfileCompletenessCard producer={base} />);
    expect(screen.getByText("הפרופיל מלא")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
