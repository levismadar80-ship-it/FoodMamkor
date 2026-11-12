import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * MEH-2836 — a business page always offers a working contact button when the
 * business has any contact detail; with none, there is no sticky bar at all
 * (not a bar with only a rating). The section tab bar fades on the side that
 * has hidden tabs. One recipe fills its row on a phone.
 */

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
const ping = vi.fn();
const mark = vi.fn();
vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: (...a) => ping(...a),
  markWhatsAppClickedLocal: (...a) => mark(...a),
  // MEH-2999: the sticky bar calls the one primary-CTA handler; WhatsApp still
  // means the WhatsApp beacon + unlock.
  trackPrimaryCtaClick: (id, m) => {
    if (m === "whatsapp") {
      ping(id);
      mark(id);
    }
  },
}));

import {
  getResolvedMethod,
  getPrimaryMethod,
  getPrimaryContactHref,
  isPrimaryExternal,
  isWhatsAppPrimary,
} from "@/lib/contact-method";
import StickyContactBar from "@/app/[locale]/producer/[id]/components/StickyContactBar";

beforeEach(() => {
  ping.mockClear();
  mark.mockClear();
  window.matchMedia = vi.fn().mockImplementation((q) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

// «מעדניית בן שמן» shape: no primary_contact_method (→ whatsapp), no phone,
// but a website.
const BEN_SHEMEN = { id: 7, name: "מעדניית בן שמן", primary_contact_method: null, phone: "", website: "bs-deli.co.il", avg_rating: 4.7, reviews_count: 3 };

describe("getResolvedMethod — the one resolver", () => {
  it("the chosen method when it has its data", () => {
    expect(getResolvedMethod({ primary_contact_method: "email", contact_email: "a@b.co", phone: "0501234567" })).toBe("email");
  });
  it("chosen method missing its data → the first method in CONTACT_METHODS order that has data", () => {
    expect(getResolvedMethod(BEN_SHEMEN)).toBe("website");
    // email chosen, no email; a phone exists → whatsapp comes first in the order.
    expect(getResolvedMethod({ primary_contact_method: "email", phone: "0501234567", instagram: "@x" })).toBe("whatsapp");
    expect(getResolvedMethod({ primary_contact_method: "website", instagram: "@deli" })).toBe("instagram");
  });
  it("no contact detail at all → null", () => {
    expect(getResolvedMethod({ primary_contact_method: "whatsapp" })).toBeNull();
    expect(getResolvedMethod(null)).toBeNull();
  });
  it("every helper reads the resolved method", () => {
    expect(getPrimaryMethod(BEN_SHEMEN)).toBe("website");
    expect(getPrimaryContactHref(BEN_SHEMEN)).toBe("https://bs-deli.co.il");
    expect(isPrimaryExternal(BEN_SHEMEN)).toBe(true);
    expect(isWhatsAppPrimary(BEN_SHEMEN)).toBe(false);
    // Declared WhatsApp WITH a number stays WhatsApp.
    expect(isWhatsAppPrimary({ primary_contact_method: "whatsapp", phone: "0501234567" })).toBe(true);
    // Nothing at all: no href, and the method falls back to the declared one.
    expect(getPrimaryContactHref({ primary_contact_method: "phone" })).toBeNull();
    expect(getPrimaryMethod({ primary_contact_method: "phone" })).toBe("phone");
  });
});

describe("StickyContactBar", () => {
  it("a business with no WhatsApp but a website gets a working contact button (website)", () => {
    render(<StickyContactBar producer={BEN_SHEMEN} isVacation={false} isBarVisible />);
    const cta = screen.getByRole("link");
    expect(cta.getAttribute("href")).toMatch(/^https:\/\/bs-deli\.co\.il/);
    expect(cta.textContent).toContain("contact_cta.website");
    // The beacon + review unlock fire only for a RESOLVED WhatsApp.
    fireEvent.click(cta);
    expect(ping).not.toHaveBeenCalled();
    expect(mark).not.toHaveBeenCalled();
  });

  it("a resolved WhatsApp still fires the beacon", () => {
    render(<StickyContactBar producer={{ ...BEN_SHEMEN, website: "", phone: "0501234567" }} isVacation={false} isBarVisible />);
    fireEvent.click(screen.getByRole("link"));
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("no contact detail at all → the bar does not mount (no bar with only a rating)", () => {
    const { container } = render(
      <StickyContactBar producer={{ ...BEN_SHEMEN, website: "" }} isVacation={false} isBarVisible />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("section tab bar + single recipe (source)", () => {
  const src = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  it("the tab row carries the ChipScrollRow edge-fade mask, fed by the overflow signal", () => {
    const s = src("components/SectionAnchorNav.jsx");
    expect(s).toMatch(/chip-scroll-fade-mask/);
    // The gradient's "start" stop is the physical right edge: RTL maps start→start,
    // LTR (/en) swaps the two depths.
    expect(s).toMatch(/"--chip-fade-start": `\$\{isRtl \? startPx : endPx\}px`/);
    expect(s).toMatch(/"--chip-fade-end": `\$\{isRtl \? endPx : startPx\}px`/);
    expect(s).toMatch(/useScrollAffordance\(\)/);
  });
  it("exactly one recipe → full row on a phone, half from md; 2+ unchanged", () => {
    const s = src("app/[locale]/producer/[id]/components/ProducerSections.jsx");
    expect(s).toContain('recipes.length === 1 ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "grid grid-cols-2 md:grid-cols-3 gap-4"');
  });
});
