import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-3737 — «שאלות נפוצות» under /group-buys and /rescue. Each question is a
 * closed <details>, and the FAQPage JSON-LD carries the same questions and
 * answers as the rows, so what Google reads is what the page shows.
 * Same catalog mocks as BusinessFaqClosedOnLoad.test.jsx.
 */

const lookup = (ns) => (key) => `${ns ? `${ns}.` : ""}${key}`.split(".").reduce((o, k) => o?.[k], he);
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns) => (key) => lookup(ns)(key) ?? key,
}));

import HubFaq from "@/components/HubFaq";

const HUBS = [
  { ns: "group_buys.faq", path: "/group-buys", cat: (m) => m.group_buys.faq },
  { ns: "rescue.faq", path: "/rescue", cat: (m) => m.rescue.faq },
];

describe.each(HUBS)("MEH-3737 · HubFaq $ns", ({ ns, path, cat }) => {
  const keys = Object.keys(cat(he).items);

  it("renders one closed row per question, with the catalog text", async () => {
    expect(keys.length).toBeGreaterThan(0);
    const { container } = render(await HubFaq({ namespace: ns, keys, anchor: "faq", path }));
    const rows = [...container.querySelectorAll("details")];
    expect(rows).toHaveLength(keys.length);
    expect(rows.filter((d) => d.open)).toHaveLength(0);
    expect(rows.map((d) => d.querySelector("summary").textContent.trim())).toEqual(keys.map((k) => cat(he).items[k].q));
    expect(container.querySelector("h2").textContent).toBe(he.diet_pages.faq_heading);
  });

  it("puts the same questions and answers in FAQPage JSON-LD", async () => {
    const { container } = render(await HubFaq({ namespace: ns, keys, anchor: "faq", path }));
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]').textContent);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld["@id"]).toMatch(new RegExp(`${path}#faq$`));
    expect(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
      keys.map((k) => [cat(he).items[k].q, cat(he).items[k].a]),
    );
  });

  it("has every question in English too", () => {
    expect(Object.keys(cat(en).items)).toEqual(keys);
    for (const k of keys) {
      expect(cat(en).items[k].q).toBeTruthy();
      expect(cat(en).items[k].a).toBeTruthy();
    }
  });
});
