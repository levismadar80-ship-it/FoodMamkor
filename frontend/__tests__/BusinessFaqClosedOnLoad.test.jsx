import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import he from "../messages/he.json";

/**
 * MEH-3003 (Sapir, 12/11) — on /about/for-businesses the first question
 * («כמה זה עולה — ומה יקרה כשתתחילו לגבות?») was open on load. Every question
 * starts closed, the same as /join (MEH-2799, JoinStepNumerals.test.jsx).
 * Same real-catalog mocks as ClosingBandPages.test.jsx.
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

describe("MEH-3003 · /about/for-businesses FAQ starts fully closed", () => {
  it("every question is a <details> and none is open on load", async () => {
    const { container } = render(await ForBusinessesPage({ params: Promise.resolve({ locale: "he" }) }));
    const items = [...container.querySelectorAll("details")];
    // The count comes from the catalog, not a literal, so a question added
    // later (MEH-3000) cannot slip in open, and a dropped one cannot pass as
    // "all closed" on an empty list.
    const questionCount = Object.keys(he.about_business.faq).length;
    expect(questionCount).toBeGreaterThan(0);
    expect(items).toHaveLength(questionCount);
    expect(items.filter((d) => d.open).map((d) => d.querySelector("summary").textContent)).toEqual([]);
    expect(items[0].querySelector("summary").textContent).toContain(he.about_business.faq.cost.q);
  });
});
