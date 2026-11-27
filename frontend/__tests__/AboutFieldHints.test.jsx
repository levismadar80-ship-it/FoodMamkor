// @ts-check
/**
 * MEH-3953 — facts written only in «אודות» are listed on the admin edit page.
 * The descriptions below are taken word for word from live business pages
 * (27/11 audit), so the rules are checked against real text, not only
 * invented sentences.
 */
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderHe } from "./helpers/render-with-he";
import { aboutFieldHints, ABOUT_HINT_CODES } from "@/lib/about-field-hints";
import AdminAboutFieldHints from "@/components/admin/AdminAboutFieldHints";
import he from "../messages/he.json";

// tasty-v (ליקה), live 27/11.
const TASTY = {
  description:
    "מזמינים דרך מערכת ההזמנות שלה, וזמן האספקה יום עד שלושה ימים. אפשר לאסוף מהוד השרון או מאליכין. משלוחים לפי אזור: פתח תקווה והסביבה בימי שלישי, פרדס חנה בימי ראשון וחמישי, ולכפר סבא ורעננה בתוספת 25 ₪. תשלום בביט, פייבוקס, העברה בנקאית או מזומן. ליאת טבעונית. יש גם תבשילים וסדנאות.",
  offers_delivery: true, offers_pickup: false, has_physical_location: false, by_arrangement: false,
  payment_info: null, delivery_fee: null, delivery_days_min: null, vegan_scope: "unknown",
  delivery_areas: [{ city: "פתח תקווה", delivery_fee: null }],
  has_listed_experience: false, has_upcoming_event: false,
};
// havathapere, live 27/11: «לא כשר» even though «השחיטה כשרה».
const HAVA = {
  description: "הבשר לא כשר: השחיטה כשרה, אבל הבשר לא עובר הכשרה.",
  kashrut_badges: [],
};
// pitputim, live 27/11.
const PITPUTIM = { description: "כשר למהדרין, בהשגחת רבנות מועצה אזורית מרום הגליל.", kashrut_badges: [] };
// ohad-nursery, live 27/11.
const OHAD = {
  description: "מגדלת פירות סובטרופיים מאז 1957. מקרר פירות בשירות עצמי, פתוח 24 שעות ביממה. משלמים במזומן, בביט או בפייבוקס. אין משלוחים.",
  opening_hours: "Sun-Thu 08:00-16:00, Fri 08:00-14:00", locations: [], offers_delivery: false,
};

describe("aboutFieldHints (MEH-3953)", () => {
  it("0: empty text, or every fact already in its field → no hint", () => {
    expect(aboutFieldHints({ description: "" })).toEqual([]);
    expect(aboutFieldHints({ ...TASTY, payment_info: { methods: ["bit"] }, offers_pickup: true,
      delivery_fee: 25, delivery_days_min: 1, vegan_scope: "all", has_listed_experience: true })).toEqual([]);
  });

  it("1: «לא כשר» never asks for a kashrut certificate; «כשר למהדרין» does", () => {
    expect(aboutFieldHints(HAVA)).toEqual([]);
    expect(aboutFieldHints(PITPUTIM)).toEqual(["kashrut"]);
    expect(aboutFieldHints({ ...PITPUTIM, kashrut_badges: ["mehadrin"] })).toEqual([]);
  });

  it("many: the live ליקה text names six text-only facts, in display order", () => {
    expect(aboutFieldHints(TASTY)).toEqual(["payment", "pickup", "delivery_fee", "lead_time", "vegan", "experience"]);
  });

  it("the live משתלת אוהד text: payment, 24/7 against fixed hours, year — and «אין משלוחים» agrees with no delivery", () => {
    expect(aboutFieldHints(OHAD)).toEqual(["payment", "hours_24_7", "year"]);
    expect(aboutFieldHints({ ...OHAD, offers_delivery: true })).toContain("no_delivery");
  });

  it("every code has Hebrew and English copy", () => {
    for (const code of ABOUT_HINT_CODES) expect(he.admin.producers.about_hints[code]).toBeTruthy();
  });
});

describe("AdminAboutFieldHints panel (MEH-3953)", () => {
  it("closed: renders nothing when there is no hint", () => {
    const { container } = renderHe(<AdminAboutFieldHints producer={{ description: "לחם" }} />);
    expect(container.querySelector("[data-testid=about-field-hints]")).toBeNull();
  });

  it("open: one row per hint, with its Hebrew line", () => {
    renderHe(<AdminAboutFieldHints producer={PITPUTIM} />);
    expect(screen.getByText(he.admin.producers.about_hints.title)).toBeTruthy();
    const rows = document.querySelectorAll("[data-hint]");
    expect([...rows].map((r) => r.getAttribute("data-hint"))).toEqual(["kashrut"]);
    expect(rows[0].textContent).toBe(he.admin.producers.about_hints.kashrut);
  });
});
