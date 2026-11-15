import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-3000 — the business FAQ answers organizers: markets and events have their
 * own sign-up, and only businesses open group buys. Approved word for word by
 * Sapir (12/11). The question is the LAST one, after «ההבדל» (MEH-1770 keeps
 * Q1..Q10 in order; this one is appended, not inserted).
 */

const lookup = (ns) => (key) => `${ns ? `${ns}.` : ""}${key}`.split(".").reduce((o, k) => o?.[k], he);
vi.mock("next-intl/server", () => {
  const make = (ns) => {
    const t = (key) => lookup(ns)(key) ?? key;
    t.rich = t;
    t.raw = (key) => lookup(ns)(key) ?? [];
    return t;
  };
  return {
    setRequestLocale: () => {},
    getTranslations: async (arg) => make(typeof arg === "string" ? arg : arg?.namespace),
  };
});
vi.mock("next-intl", () => ({ useTranslations: (ns) => (key) => lookup(ns)(key) ?? key }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill, priority, unoptimized, ...props }) => <img {...props} />,
}));

import ForBusinessesPage from "@/app/[locale]/about/for-businesses/page";

const params = { params: Promise.resolve({ locale: "he" }) };
const Q = "מארגנים שוק, אירוע או קבוצת רכישה?";
const A = "למארגני שווקים ואירועים יש הרשמה משלהם. באתר רק בתי עסק פותחים קבוצות רכישה, ואפשר להצטרף לקבוצה של בית עסק מהעמוד שלו.";

describe("business FAQ: organizers question (MEH-3000)", () => {
  it("carries the approved Hebrew copy and an English mirror", () => {
    expect(he.about_business.faq.organizers).toEqual({ q: Q, a: A });
    expect(en.about_business.faq.organizers.q).toBeTruthy();
    expect(en.about_business.faq.organizers.a).toBeTruthy();
  });

  it("renders 11 questions, the organizers one last, and keeps Q1..Q10 in order", async () => {
    const { container } = render(await ForBusinessesPage(params));
    const qs = [...container.querySelectorAll("details summary span")].map((s) => s.textContent);
    expect(qs).toHaveLength(11);
    expect(qs[10]).toBe(Q);
    expect(qs[9]).toBe(he.about_business.faq.difference.q);
    expect(qs[0]).toBe(he.about_business.faq.cost.q);
  });

  it("the FAQPage JSON-LD includes it", async () => {
    const { container } = render(await ForBusinessesPage(params));
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]').textContent);
    const names = ld.mainEntity.map((e) => e.name);
    expect(names).toContain(Q);
    expect(ld.mainEntity.find((e) => e.name === Q).acceptedAnswer.text).toBe(A);
  });
});
