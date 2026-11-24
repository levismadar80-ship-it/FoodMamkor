import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-3737 — «שאלות נפוצות» under /group-buys and /rescue. Each question is a
 * closed <details>, and the FAQPage JSON-LD carries the same questions and
 * answers as the rows, so what Google reads is what the page shows.
 *
 * The mock refuses a getTranslations call without a locale: such a call makes
 * next-intl read headers() and turns the hub page per-request (MEH-3049), and
 * HubRoutesStaticGuard does not scan files under components/.
 */

const CATALOG = { he, en };
const lookup = (msgs, ns) => (key) => `${ns}.${key}`.split(".").reduce((o, k) => o?.[k], msgs);
vi.mock("next-intl/server", () => ({
  getTranslations: async (arg) => {
    if (!arg || typeof arg !== "object" || !arg.locale) throw new Error(`getTranslations without a locale: ${JSON.stringify(arg)}`);
    return (key) => lookup(CATALOG[arg.locale], arg.namespace)(key) ?? key;
  },
}));

import HubFaq from "@/components/HubFaq";
import { HUB_FAQ } from "@/lib/hub-faq";

const HUBS = [
  { name: "groupBuys", cat: (m) => m.group_buys.faq },
  { name: "rescue", cat: (m) => m.rescue.faq },
];

describe.each(HUBS)("MEH-3737 · HubFaq $name", ({ name, cat }) => {
  const faq = HUB_FAQ[name];

  it("shows every question in the catalog, and only those", () => {
    expect(faq.keys.length).toBeGreaterThan(0);
    expect([...faq.keys].sort()).toEqual(Object.keys(cat(he).items).sort());
    expect([...faq.keys].sort()).toEqual(Object.keys(cat(en).items).sort());
  });

  it.each(["he", "en"])("[%s] renders one closed row per question, with the catalog text", async (locale) => {
    const msgs = CATALOG[locale];
    const { container } = render(await HubFaq({ faq, locale }));
    const rows = [...container.querySelectorAll("details")];
    expect(rows).toHaveLength(faq.keys.length);
    expect(rows.filter((d) => d.open)).toHaveLength(0);
    expect(rows.map((d) => d.querySelector("summary").textContent.trim())).toEqual(faq.keys.map((k) => cat(msgs).items[k].q));
    expect(container.querySelector("h2").textContent).toBe(msgs.diet_pages.faq_heading);
  });

  it.each(["he", "en"])("[%s] puts the same questions and answers in FAQPage JSON-LD", async (locale) => {
    const msgs = CATALOG[locale];
    const { container } = render(await HubFaq({ faq, locale }));
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]').textContent);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld["@id"]).toMatch(new RegExp(`${locale === "en" ? "/en" : "[^n]"}${faq.path}#faq$`));
    expect(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
      faq.keys.map((k) => [cat(msgs).items[k].q, cat(msgs).items[k].a]),
    );
  });
});
