import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * MEH-1901 — ProductSheet.
 *
 * NOTE ON LOCATION: the ticket specced this file at
 * frontend/components/public/__tests__/ProductSheet.test.jsx. vitest.config.js:41
 * sets `include: ["__tests__/**\/*.test.{js,jsx,ts,tsx}"]` — rooted at
 * frontend/ — so a spec under components/ would never be collected and would
 * report a silent green by never running at all (.claude/rules/testing.md,
 * "a green that has two possible causes"). It lives here instead, beside the
 * other 279 specs.
 */

const pingWhatsAppBeacon = vi.fn();
const markWhatsAppClickedLocal = vi.fn();

vi.mock("next-intl", () => ({
  // MEH-2045: the sheet reads the locale to pick the arrow-key mapping and the
  // chevron glyphs. Hebrew here keeps every assertion below in the RTL world
  // these tests were written for.
  useLocale: () => "he",
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    if (full === "whatsapp.question_chips.source_line") return "הגעתי דרך מהמקור";
    if (full === "producer.detail.sections.products.sheet_wa_prefill") {
      return `היי, ראיתי את ״${vars?.name ?? ""}״ בעמוד שלכם במהמקור ואשמח לשמוע פרטים`;
    }
    if (full === "producer.detail.sections.products.diet.gluten_free") return "ללא גלוטן";
    if (full === "producer.detail.sections.products.diet.vegan") return "טבעוני";
    if (full === "producer.detail.sections.products.diet.vegetarian") return "צמחוני";
    if (full === "producer.detail.sections.products.diet.lactose_free") return "ללא לקטוז";
    if (full === "producer.detail.sections.products.sheet_cta") return "שאלי על המוצר בוואטסאפ";
    if (full === "producer.detail.sections.products.sheet_secondary_wa")
      return "או שאלי על המוצר בוואטסאפ";
    if (full === "producer.detail.sections.products.sheet_close_aria") return "סגירת פרטי המוצר";
    if (full === "producer.card.aria.image_missing") return `${vars?.name ?? ""} — תמונה חסרה`;
    return full;
  },
}));

vi.mock("next/image", () => ({
  default: (props) => <img data-testid="sheet-image" src={props.src} alt={props.alt} />,
}));

vi.mock("@phosphor-icons/react", () => ({
  WhatsappLogo: () => <span data-testid="wa-logo" />,
  X: () => <span data-testid="x-icon" />,
  // MEH-1916: the CTA now renders one icon per primary_contact_method.
  Phone: () => <span data-testid="icon-phone" />,
  Globe: () => <span data-testid="icon-globe" />,
  EnvelopeSimple: () => <span data-testid="icon-email" />,
  InstagramLogo: () => <span data-testid="icon-instagram" />,
  FacebookLogo: () => <span data-testid="icon-facebook" />,
  Receipt: () => <span data-testid="icon-receipt" />,
  // MEH-2045: paging chevrons. Never rendered by the specs in this file (they
  // all pass a single product), but the module-level import must resolve.
  CaretLeft: () => <span data-testid="icon-caret-left" />,
  CaretRight: () => <span data-testid="icon-caret-right" />,
}));

vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: (...a) => pingWhatsAppBeacon(...a),
  markWhatsAppClickedLocal: (...a) => markWhatsAppClickedLocal(...a),
}));

import ProductSheet from "@/components/public/ProductSheet";
// Real helpers (unmocked) — used to rebuild the expected WhatsApp href rather
// than restating it as a literal.
import { getWhatsAppHref, normalizePhone } from "@/lib/utils";

const producer = { id: 7, name: "טבע פור", phone: "0501234567" };
const baseProduct = { id: 11, name: "גרנולה ביתית" };

const renderSheet = (product = baseProduct, p = producer, onClose = vi.fn()) => {
  const utils = render(<ProductSheet product={product} producer={p} onClose={onClose} />);
  return { ...utils, onClose };
};

beforeEach(() => {
  pingWhatsAppBeacon.mockClear();
  markWhatsAppClickedLocal.mockClear();
});

afterEach(() => {
  document.body.style.overflow = "";
});

describe("ProductSheet — open / close contract", () => {
  it("renders a labelled modal dialog and locks body scroll while open", () => {
    const { unmount } = renderSheet();
    const dialog = screen.getByTestId("product-sheet");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "גרנולה ביתית");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    // Restored on close — a sheet that leaves the page unscrollable is worse
    // than one that never opened.
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("Escape closes", () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop click closes, and a click inside the panel does NOT", () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByTestId("product-sheet"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("product-sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the close button closes", () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByTestId("product-sheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focus moves to the close button on open and returns to the trigger on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderSheet();
    expect(document.activeElement).toBe(screen.getByTestId("product-sheet-close"));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe("ProductSheet — diet chips render only true flags", () => {
  it("renders a chip per true flag and none for the false ones", () => {
    renderSheet({
      ...baseProduct,
      is_vegan: true,
      is_gluten_free: true,
      is_vegetarian: false,
      is_lactose_free: false,
    });
    const chips = screen.getByTestId("product-sheet-diet");
    expect(chips.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("טבעוני")).toBeInTheDocument();
    expect(screen.getByText("ללא גלוטן")).toBeInTheDocument();
    expect(screen.queryByText("צמחוני")).not.toBeInTheDocument();
    expect(screen.queryByText("ללא לקטוז")).not.toBeInTheDocument();
  });

  it("all-false → NO chip row at all (not an empty one)", () => {
    renderSheet({
      ...baseProduct,
      is_vegan: false,
      is_gluten_free: false,
      is_vegetarian: false,
      is_lactose_free: false,
    });
    expect(screen.queryByTestId("product-sheet-diet")).not.toBeInTheDocument();
  });

  it("a truthy-but-not-true value does not earn a chip (flags are booleans)", () => {
    renderSheet({ ...baseProduct, is_vegan: "yes" });
    expect(screen.queryByTestId("product-sheet-diet")).not.toBeInTheDocument();
  });
});

describe("ProductSheet — price follows MEH-1305 F verbatim", () => {
  it("numeric price → formatPriceRange inside a dir=ltr span", () => {
    renderSheet({ ...baseProduct, price_min: 35, price_max: 50 });
    const price = screen.getByTestId("product-sheet-price");
    const span = price.querySelector("span[dir='ltr']");
    expect(span).not.toBeNull();
    expect(span.textContent).toContain("35");
    expect(span.textContent).toContain("50");
  });

  it("free-text price_range renders in the natural direction — never dir=ltr", () => {
    renderSheet({ ...baseProduct, price_min: null, price_range: "מ-30₪ לחבילה" });
    const price = screen.getByTestId("product-sheet-price");
    expect(price).toHaveTextContent("מ-30₪ לחבילה");
    expect(price.querySelector("span[dir='ltr']")).toBeNull();
    expect(price.getAttribute("dir")).not.toBe("ltr");
  });

  it("numeric wins over free-text when both are present", () => {
    renderSheet({ ...baseProduct, price_min: 35, price_range: "מ-30₪ לחבילה" });
    const prices = screen.getAllByTestId("product-sheet-price");
    expect(prices).toHaveLength(1);
    expect(prices[0].querySelector("span[dir='ltr']")).not.toBeNull();
  });
});

describe("ProductSheet — WhatsApp CTA", () => {
  it("href carries the encoded product name and fires both tracking calls", () => {
    renderSheet();
    const cta = screen.getByTestId("product-sheet-wa-cta");
    const href = cta.getAttribute("href");
    expect(href).toContain("972501234567");
    // The product name survives into the prefill. encodeURIComponent is
    // per-character, so the encoded name is a substring of the encoded message.
    expect(href).toContain(encodeURIComponent(baseProduct.name));
    // MEH-1524: the source line closes every business-chat prefill.
    expect(href).toContain(encodeURIComponent("הגעתי דרך מהמקור"));

    fireEvent.click(cta);
    expect(pingWhatsAppBeacon).toHaveBeenCalledWith(7);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledWith(7);
  });

  it("producer with no WhatsApp channel → NO CTA node, never a dead link", () => {
    renderSheet(baseProduct, { id: 7, name: "טבע פור", phone: null });
    expect(screen.queryByTestId("product-sheet-wa-cta")).not.toBeInTheDocument();
    expect(document.querySelector("a[href*='wa.me']")).toBeNull();
    expect(document.querySelector("a[href*='whatsapp']")).toBeNull();
  });

  it("an unusable phone is treated as no channel (normalizePhone rejects it)", () => {
    renderSheet(baseProduct, { id: 7, name: "טבע פור", phone: "123" });
    expect(screen.queryByTestId("product-sheet-wa-cta")).not.toBeInTheDocument();
  });
});

describe("ProductSheet — full description is reachable", () => {
  it("renders a 2000-char description in full, unclamped, inside a scroll container", () => {
    const long = Array.from({ length: 40 }, (_, i) => `שורה ${i} ${"א".repeat(45)}`).join("\n");
    expect(long.length).toBeGreaterThan(1800);
    renderSheet({ ...baseProduct, description: long });

    const body = screen.getByTestId("product-sheet-description");
    // The WHOLE string is in the DOM — not a truncated prefix.
    expect(body.textContent).toBe(long);
    // No line-clamp anywhere on the description element.
    expect(body.className).not.toMatch(/line-clamp/);
    // Newlines are preserved rather than collapsed.
    expect(body.className).toContain("whitespace-pre-line");
    // …and it lives inside the scrollable region.
    const scroller = screen.getByTestId("product-sheet-scroll");
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.contains(body)).toBe(true);
  });

  it("no description → no description node (not an empty paragraph)", () => {
    renderSheet({ ...baseProduct, description: null });
    expect(screen.queryByTestId("product-sheet-description")).not.toBeInTheDocument();
  });
});

describe("ProductSheet — CTA follows primary_contact_method (MEH-1916)", () => {
  // The producer chose the web shop. Before MEH-1916 this sheet pushed
  // WhatsApp at her customers regardless.
  const websiteProducer = {
    id: 7,
    name: "טבע פור",
    phone: "0501234567",
    primary_contact_method: "website",
    website: "tevapur.co.il",
  };

  it("website primary → 'להזמנה באתר' + UTM-tagged href in a new tab, rel keeps noopener and DROPS noreferrer", () => {
    renderSheet(baseProduct, websiteProducer);
    const cta = screen.getByTestId("product-sheet-cta");

    expect(cta).toHaveAttribute("data-method", "website");
    expect(cta).toHaveTextContent("להזמנה באתר");
    expect(cta).toHaveAttribute("target", "_blank");
    // MEH-1525: noreferrer would strip the Referer header the owner's
    // analytics needs — website only.
    expect(cta.getAttribute("rel")).toBe("noopener");

    const href = cta.getAttribute("href");
    expect(href).toContain("https://tevapur.co.il");
    expect(href).toContain("utm_source=mehamakor");
    expect(href).toContain("utm_medium=referral");

    // The producer's channel is not WhatsApp, so the WA node is the quiet
    // secondary — never the loud one.
    expect(screen.queryByTestId("product-sheet-wa-cta")).not.toBeInTheDocument();
  });

  it("a non-WhatsApp primary fires NEITHER tracking call", () => {
    renderSheet(baseProduct, websiteProducer);
    fireEvent.click(screen.getByTestId("product-sheet-cta"));
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
    expect(markWhatsAppClickedLocal).not.toHaveBeenCalled();
  });

  it("secondary WA link carries the product prefill and fires both tracking calls", () => {
    renderSheet(baseProduct, websiteProducer);
    const secondary = screen.getByTestId("product-sheet-wa-secondary");
    const href = secondary.getAttribute("href");
    expect(href).toContain("972501234567");
    expect(href).toContain(encodeURIComponent(baseProduct.name));
    expect(href).toContain(encodeURIComponent("הגעתי דרך מהמקור"));

    fireEvent.click(secondary);
    expect(pingWhatsAppBeacon).toHaveBeenCalledWith(7);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledWith(7);
  });

  it("website + NO phone → the primary still renders, and there is no secondary", () => {
    renderSheet(baseProduct, { ...websiteProducer, phone: null });
    expect(screen.getByTestId("product-sheet-cta")).toHaveAttribute("data-method", "website");
    expect(screen.queryByTestId("product-sheet-wa-secondary")).not.toBeInTheDocument();
    expect(document.querySelector("a[href*='wa.me']")).toBeNull();
  });

  it("whatsapp primary → byte-identical href to the pre-MEH-1916 build, and no secondary", () => {
    // Discriminating baseline: the string is rebuilt here from the same public
    // helpers the component uses, so a change to the prefill, the source line,
    // or the phone normalisation reds this test rather than passing silently.
    const expected = getWhatsAppHref(
      normalizePhone(producer.phone),
      `היי, ראיתי את ״${baseProduct.name}״ בעמוד שלכם במהמקור ואשמח לשמוע פרטים\n\nהגעתי דרך מהמקור`,
    );
    renderSheet();
    const cta = screen.getByTestId("product-sheet-wa-cta");
    expect(cta.getAttribute("href")).toBe(expected);
    expect(cta).toHaveAttribute("data-method", "whatsapp");
    expect(cta.className).toContain("btn-whatsapp");
    expect(screen.queryByTestId("product-sheet-wa-secondary")).not.toBeInTheDocument();
  });

  it("phone primary → tel: link, same tab, no WhatsApp tracking", () => {
    renderSheet(baseProduct, {
      id: 7,
      name: "טבע פור",
      phone: "0501234567",
      primary_contact_method: "phone",
    });
    const cta = screen.getByTestId("product-sheet-cta");
    expect(cta.getAttribute("href")).toBe("tel:0501234567");
    expect(cta).toHaveTextContent("התקשרו");
    expect(cta).not.toHaveAttribute("target");
    // Phone is a channel of its own; the WA escape hatch is still offered.
    expect(screen.getByTestId("product-sheet-wa-secondary")).toBeInTheDocument();
  });

  it("chosen channel with an EMPTY field + a phone → WhatsApp is promoted to primary, not duplicated", () => {
    renderSheet(baseProduct, { ...websiteProducer, website: "" });
    const cta = screen.getByTestId("product-sheet-wa-cta");
    expect(cta).toHaveAttribute("data-method", "whatsapp");
    expect(cta.getAttribute("href")).toContain("972501234567");
    // Suppressed — it would be the identical href rendered twice.
    expect(screen.queryByTestId("product-sheet-wa-secondary")).not.toBeInTheDocument();
  });

  it("no channel field AND no phone → no CTA node at all, never a dead link", () => {
    renderSheet(baseProduct, {
      id: 7,
      name: "טבע פור",
      phone: null,
      primary_contact_method: "website",
      website: "",
    });
    expect(screen.queryByTestId("product-sheet-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-sheet-wa-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-sheet-wa-secondary")).not.toBeInTheDocument();
  });
});

describe("ProductSheet — image", () => {
  it("a Cloudinary photo is requested at w_640", () => {
    renderSheet({
      ...baseProduct,
      image_url: "https://res.cloudinary.com/demo/image/upload/granola.jpg",
    });
    const img = screen.getByTestId("sheet-image");
    expect(img.getAttribute("src")).toContain("w_640");
    expect(img.getAttribute("src")).toContain("ar_1:1");
  });

  it("no photo → the typographic no-photo cell (product initial), no next/image", () => {
    renderSheet({ ...baseProduct, image_url: null });
    expect(screen.queryByTestId("sheet-image")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /תמונה חסרה/ })).toBeInTheDocument();
    expect(screen.getByText("ג")).toBeInTheDocument();
  });
});
