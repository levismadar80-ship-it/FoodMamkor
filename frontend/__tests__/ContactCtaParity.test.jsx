import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import PrimaryContactButton from "@/components/PrimaryContactButton";
import StickyContactBar from "@/app/[locale]/producer/[id]/components/StickyContactBar";

// MEH-2813: the inline CTA (contact card) and the sticky bar CTA are the same
// button on the same page. They drifted once — instagram / facebook /
// external_order were filled green inline and white-outlined in the sticky bar.
// This pins, per method, that both surfaces get the same colour classes, and
// that the brand channels carry their own coloured logo on a white button.

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
}));

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

const base = {
  id: 7,
  name: "חוות השקמה",
  phone: "0501234567",
  website: "https://havat.example",
  contact_email: "hello@havat.example",
  instagram: "havat",
  facebook: "https://facebook.com/havat",
  external_order_form: "https://order.example",
  reviews_count: 0,
};

// Colour-bearing classes only; layout classes differ on purpose (rounded-xl vs
// rounded-md, padding) and are not part of the contract.
const COLOUR = /^(bg-|text-|border|hover:|btn-|focus-visible:)/;
const colourClasses = (el) =>
  el.className.split(/\s+/).filter((c) => COLOUR.test(c) && !/^text-(xs|sm|base|lg|xl)$/.test(c) && c !== "focus-visible:ring-2").sort();

function renderBoth(method) {
  const producer = { ...base, primary_contact_method: method };
  const inline = render(<PrimaryContactButton producer={producer} />);
  const inlineBtn = within(inline.container).getByTestId("primary-contact-button");
  const sticky = render(<StickyContactBar producer={producer} isVacation={false} isBarVisible />);
  const stickyBtn = within(sticky.container).getByTestId("sticky-primary-cta");
  return { inlineBtn, stickyBtn };
}

const METHODS = ["whatsapp", "phone", "website", "email", "instagram", "facebook", "external_order"];

describe("primary contact CTA — inline and sticky share one colour (MEH-2813)", () => {
  it.each(METHODS)("%s: same colour classes on both surfaces", (method) => {
    const { inlineBtn, stickyBtn } = renderBoth(method);
    expect(colourClasses(stickyBtn)).toEqual(colourClasses(inlineBtn));
  });

  it.each(["website", "instagram", "facebook", "external_order"])(
    "%s: white outlined button on both surfaces, not a green fill",
    (method) => {
      const { inlineBtn, stickyBtn } = renderBoth(method);
      for (const btn of [inlineBtn, stickyBtn]) {
        expect(btn.className).toContain("bg-surface");
        expect(btn.className).toContain("border-primary");
        expect(btn.className.split(/\s+/)).not.toContain("bg-primary");
      }
    },
  );

  it("instagram: multicolour glyph in both, each with its own gradient id", () => {
    const { inlineBtn, stickyBtn } = renderBoth("instagram");
    const a = within(inlineBtn).getByTestId("glyph-instagram");
    const b = within(stickyBtn).getByTestId("glyph-instagram");
    const idA = a.querySelector("linearGradient").id;
    const idB = b.querySelector("linearGradient").id;
    expect(idA).not.toBe("");
    expect(idA).not.toBe(idB);
    expect(idA).toMatch(/^ig-[a-zA-Z0-9]+$/);
    expect(a.querySelector("g").getAttribute("stroke")).toBe(`url(#${idA})`);
  });

  it("facebook: logo in Facebook blue in both", () => {
    const { inlineBtn, stickyBtn } = renderBoth("facebook");
    for (const btn of [inlineBtn, stickyBtn]) {
      const svg = within(btn).getByTestId("glyph-facebook");
      expect(svg.getAttribute("fill") || svg.getAttribute("color")).toMatch(/#0866FF/i);
    }
  });

  it("whatsapp keeps its own green fill (MEH-1389), unchanged", () => {
    const { inlineBtn, stickyBtn } = renderBoth("whatsapp");
    expect(inlineBtn.className).toContain("btn-whatsapp");
    expect(stickyBtn.className).toContain("btn-whatsapp");
  });
});
