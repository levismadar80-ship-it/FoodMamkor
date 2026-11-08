import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import he from "../messages/he.json";

/**
 * MEH-2827 PR 2 — /about/why-local per the FinalWhyLocal board (Sapir 08/11):
 * numbered reasons, the «מה שמשתנה בדרך» lines as a list in a card, the
 * sources line above the ending, and the CTA in a full-green band that meets
 * the footer. Rendered with the REAL Hebrew catalog.
 */

const W = he.about_why_local;
const lookup = (key) => key.split(".").reduce((o, k) => o?.[k], W);
vi.mock("next-intl/server", () => {
  const t = (key) => lookup(key) ?? key;
  t.rich = (key) => lookup(key) ?? key;
  return { setRequestLocale: () => {}, getTranslations: async () => t };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill, priority, ...props }) => <img {...props} />,
}));

import WhyLocalPage from "@/app/[locale]/about/why-local/page";

const params = { params: Promise.resolve({ locale: "he" }) };
const classes = (el) => (el?.getAttribute("class") || "").split(/\s+/);
const REASONS = ["taste_h", "money_h", "fairness_h", "provenance_h", "env_h"];

describe("/about/why-local — FinalWhyLocal", () => {
  it("the five reasons carry numerals 01–05 above their h2, hidden from assistive tech", async () => {
    const { container } = render(await WhyLocalPage(params));
    const marks = [...container.querySelectorAll('[data-testid="why-local-numeral"]')];
    expect(marks.map((m) => m.textContent.trim())).toEqual(["01", "02", "03", "04", "05"]);
    for (const [i, mark] of marks.entries()) {
      expect(mark.getAttribute("aria-hidden")).toBe("true");
      // The numeral sits directly above its reason's heading.
      expect(mark.nextElementSibling.tagName).toBe("H2");
      expect(mark.nextElementSibling.textContent).toBe(W[REASONS[i]]);
    }
    // «איפה מתחילים» is not a reason and gets no numeral.
    const start = [...container.querySelectorAll("h2")].find((h) => h.textContent === W.start_h);
    expect(start.previousElementSibling?.getAttribute("data-testid")).not.toBe("why-local-numeral");
  });

  it("«מה שמשתנה בדרך»: h2 + the three lines as a gold-dot list inside a card", async () => {
    const { container } = render(await WhyLocalPage(params));
    const card = container.querySelector('[data-testid="why-local-changes"]');
    expect(classes(card)).toEqual(expect.arrayContaining(["rounded-xl", "bg-background-alt", "p-5"]));
    expect(card.querySelector("h2").textContent).toBe(W.changes_h);
    const items = [...card.querySelectorAll("ul > li")];
    expect(items.map((li) => li.textContent)).toEqual([W.changes_1, W.changes_2, W.changes_3]);
    for (const li of items) {
      expect(classes(li.querySelector('[aria-hidden="true"]'))).toEqual(expect.arrayContaining(["bg-accent", "rounded-full"]));
    }
  });

  it("copy row 3: «מבית העסק, ישר אליכם.»", () => {
    expect(W.changes_1).toBe("מבית העסק, ישר אליכם.");
  });

  it("the page ends on a green band with the CTA (same label + href); sources come before it", async () => {
    const { container } = render(await WhyLocalPage(params));
    const bands = container.querySelectorAll("[data-meets-footer]");
    expect(bands).toHaveLength(1);
    const band = bands[0];
    expect(classes(band)).toEqual(expect.arrayContaining(["bg-primary", "text-background"]));
    const cta = band.querySelector('[data-testid="why-local-cta"]');
    expect(cta.textContent).toContain(W.cta);
    expect(cta.getAttribute("href")).toBe("/map");
    expect(classes(cta)).toEqual(expect.arrayContaining(["bg-background", "text-primary"]));
    const sources = container.querySelector('[data-testid="why-local-sources"]');
    expect(sources.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing renders after the band: it runs into the site footer.
    const all = [...container.querySelectorAll("*")];
    expect(all.filter((el) => !band.contains(el) && band.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)).toHaveLength(0);
  });
});
