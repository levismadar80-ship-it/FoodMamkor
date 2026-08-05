import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1138: imageless product cards render the canonical no-photo state
// (cream surface + leaf glyph), never an empty gray box or a generic package
// icon. MEH-1168 P1: the "מהמקור" wordmark was removed from the product
// placeholder (platform logo inside a business's own products was confusing).

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "producer.card.aria.image_missing") return `${vars?.name ?? ""} — תמונה חסרה`;
    return key;
  },
  useFormatter: () => ({ dateTime: () => "" }),
  useLocale: () => "he",
}));

vi.mock("next/image", () => ({
  default: (props) => <img data-testid="product-image" src={props.src} alt={props.alt} />,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => new Promise(() => {})) },
}));

vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()), // keep real IMAGE_RATIOS
  optimizeCloudinary: (url) => `optimized:${url}`,
}));

vi.mock("@phosphor-icons/react", () => ({
  Leaf: (props) => <span data-testid="leaf-icon" data-weight={props.weight} className={props.className} />,
  // MEH-1901: the grid row + signature card gained a forward chevron (CaretLeft,
  // LEFT in RTL) and the sheet's own icons load through this same mock.
  CaretLeft: (props) => <span data-testid="row-chevron" className={props.className} />,
  MapPin: () => <span data-testid="map-pin" />,
  WhatsappLogo: () => <span data-testid="wa-logo" />,
  X: () => <span data-testid="x-icon" />,
}));

// MEH-1901: the sheet's beacon helpers — asserted in ProductSheet.test.jsx;
// stubbed here so the module's localStorage/fetch reach never runs under these
// grid-rendering assertions.
vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
}));

vi.mock("@/components/DeliveryBlock", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children }) => <div>{children}</div>,
  REVEAL_PRESET: {},
}));
vi.mock("@/components/DirectoryDisclaimer", () => ({ default: () => null }));
vi.mock("@/components/OpeningHours", () => ({ default: () => null }));
// MEH-1306: the owner pencil is self-gating chrome irrelevant to these
// assertions — mock it out so its @/i18n/navigation import never loads.
vi.mock("@/components/OwnerSectionEditLink", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/ReportButton", () => ({ default: () => null }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => null }));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";

const baseProps = {
  events: [],
  similarProducers: [],
  sectionRefs: { current: {} },
  reviewsContainerRef: { current: null },
  reviewsVisible: false,
};

const producerWith = (products) => ({
  id: 1,
  name: "טבע פור",
  products,
});

describe("ProducerSections products — imageless canonical placeholder (MEH-1138)", () => {
  it("MEH-1305 E: imageless GRID card renders a typographic no-photo cell (initial on tint, no leaf)", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([{ id: 11, name: "גרנולה ביתית", image_url: null }])}
      />,
    );
    // No leaf glyph in the grid anymore — the product initial carries the
    // no-photo state on a bg-primary/[0.06] tint (MEH-1126 "no icon" intent).
    expect(screen.queryByTestId("leaf-icon")).not.toBeInTheDocument();
    const initial = screen.getByText("ג"); // first letter of "גרנולה"
    expect(initial).toBeInTheDocument();
    const placeholder = initial.closest("div");
    expect(placeholder.className).toMatch(/bg-primary\/\[0\.06\]/);
    expect(placeholder.getAttribute("aria-label")).toContain("גרנולה ביתית");
    // MEH-1168 P1: the brand wordmark stays gone from the product placeholder.
    expect(screen.queryByText("מהמקור")).not.toBeInTheDocument();
  });

  it("imageless card still shows the product name in the card body", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([{ id: 11, name: "גרנולה ביתית", image_url: "" }])}
      />,
    );
    expect(screen.getByText("גרנולה ביתית")).toBeInTheDocument();
  });

  it("card WITH image renders the photo, no placeholder, name in body", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([
          { id: 12, name: "דבש פרחי בר", image_url: "https://res.cloudinary.com/x/a.jpg" },
        ])}
      />,
    );
    expect(screen.getByTestId("product-image")).toBeInTheDocument();
    expect(screen.queryByTestId("leaf-icon")).not.toBeInTheDocument();
    expect(screen.queryByText("מהמקור")).not.toBeInTheDocument();
    expect(screen.getByText("דבש פרחי בר")).toBeInTheDocument();
  });

  // MEH-1233 B4: the signature product renders as a highlight CARD (photo when
  // a matching grid product has one, else the leaf placeholder) and the matching
  // grid entry is deduped so it never appears twice.
  it("signature with a matching grid product: featured with its photo, deduped from the grid", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={{
          id: 1,
          name: "רוח השדה",
          top_product_name: "לחם מחמצת כפרי",
          starting_price_label: "החל מ-25₪",
          products: [
            { id: 21, name: "לחם מחמצת כפרי", image_url: "https://res.cloudinary.com/x/bread.jpg" },
            { id: 22, name: "חלה", image_url: null },
          ],
        }}
      />,
    );
    // name appears once (highlight only — NOT also a grid card)
    expect(screen.getAllByText("לחם מחמצת כפרי")).toHaveLength(1);
    expect(screen.getByText("החל מ-25₪")).toBeInTheDocument();
    // highlight photo = the matching product's optimized image
    const imgs = screen.getAllByTestId("product-image");
    expect(imgs.some((i) => (i.getAttribute("src") || "").includes("bread.jpg"))).toBe(true);
    // the other product still shows in the grid
    expect(screen.getByText("חלה")).toBeInTheDocument();
  });

  it("free-text signature with no matching product: name + leaf placeholder, grid intact", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={{
          id: 1,
          name: "רוח השדה",
          top_product_name: "מארז טעימות",
          products: [
            { id: 31, name: "לחם מחמצת כפרי", image_url: "https://res.cloudinary.com/x/b.jpg" },
          ],
        }}
      />,
    );
    expect(screen.getByText("מארז טעימות")).toBeInTheDocument();
    // no match → leaf placeholder in the highlight
    expect(screen.getAllByTestId("leaf-icon").length).toBeGreaterThanOrEqual(1);
    // the grid product remains
    expect(screen.getByText("לחם מחמצת כפרי")).toBeInTheDocument();
  });

  it("MEH-1305 F: numeric price is bidi-isolated (formatPrice); free-text price_range renders naturally", () => {
    const { container } = render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([
          { id: 40, name: "דבש", image_url: "https://res.cloudinary.com/x/h.jpg", price_min: 35 },
          { id: 41, name: "ריבה", image_url: "https://res.cloudinary.com/x/j.jpg", price_range: "מ-30₪ לחבילה" },
        ])}
      />,
    );
    // numeric → canonical "35₪" wrapped in dir="ltr" (bidi isolation).
    const ltr = container.querySelector('span[dir="ltr"]');
    expect(ltr).toHaveTextContent("35₪");
    // free-text price_range → rendered as-is, NOT force-wrapped in dir="ltr"
    // (which would corrupt the Hebrew "לחבילה").
    const freeText = screen.getByText("מ-30₪ לחבילה");
    expect(freeText).toBeInTheDocument();
    expect(freeText.closest('span[dir="ltr"]')).toBeNull();
  });

  // MEH-1463: the signature highlight now carries an accent eyebrow label and,
  // when its matched grid product was deduped out and starting_price_label is
  // empty, falls back to that product's own description + price.
  it("MEH-1463: eyebrow signature_label renders in the highlight card", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={{
          id: 1,
          name: "רוח השדה",
          top_product_name: "לחם מחמצת כפרי",
          starting_price_label: "החל מ-25₪",
          products: [{ id: 21, name: "לחם מחמצת כפרי", image_url: null }],
        }}
      />,
    );
    // mock returns the i18n key verbatim
    expect(screen.getByText("producer.detail.sections.products.signature_label")).toBeInTheDocument();
  });

  it("MEH-1463: empty starting_price_label → highlight shows the matched product's description + numeric price", () => {
    const { container } = render(
      <ProducerSections
        {...baseProps}
        producer={{
          id: 1,
          name: "רוח השדה",
          top_product_name: "לחם מחמצת כפרי",
          // no starting_price_label → fallback path
          products: [
            {
              id: 21,
              name: "לחם מחמצת כפרי",
              image_url: null,
              description: "מחמצת בהתססה איטית, קמח מלא אורגני",
              price_min: 25,
            },
          ],
        }}
      />,
    );
    // description surfaced (was deduped out of the grid, would have vanished)
    expect(screen.getByText("מחמצת בהתססה איטית, קמח מלא אורגני")).toBeInTheDocument();
    // numeric price surfaced, bidi-isolated
    const ltr = container.querySelector('span[dir="ltr"]');
    expect(ltr).toHaveTextContent("25₪");
  });

  it("MEH-1463: empty starting_price_label with free-text price_range → rendered naturally, not dir=ltr", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={{
          id: 1,
          name: "רוח השדה",
          top_product_name: "מארז לחמים",
          products: [
            { id: 21, name: "מארז לחמים", image_url: null, price_range: "מ-40₪ למארז" },
          ],
        }}
      />,
    );
    const freeText = screen.getByText("מ-40₪ למארז");
    expect(freeText).toBeInTheDocument();
    expect(freeText.closest('span[dir="ltr"]')).toBeNull();
  });

  it("MEH-1463: starting_price_label present keeps priority — product price NOT used as fallback", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={{
          id: 1,
          name: "רוח השדה",
          top_product_name: "לחם מחמצת כפרי",
          starting_price_label: "החל מ-25₪",
          products: [
            { id: 21, name: "לחם מחמצת כפרי", image_url: null, price_min: 99 },
          ],
        }}
      />,
    );
    expect(screen.getByText("החל מ-25₪")).toBeInTheDocument();
    // the product's own numeric price must not appear (label wins)
    expect(screen.queryByText("99₪")).not.toBeInTheDocument();
  });

  it("no stray indicator/dot renders on an imageless card", () => {
    const { container } = render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([{ id: 11, name: "גרנולה ביתית", image_url: null }])}
      />,
    );
    // The old pre-MEH-1126 gray Package glyph / green box must not come back.
    expect(container.querySelector(".bg-green-50")).toBeNull();
  });
});

// MEH-1901: the grid row and the signature card are the two triggers for the
// product detail sheet. These assert the WIRING (row → sheet); the sheet's own
// contract — a11y, diet chips, price paths, WhatsApp CTA — is asserted in
// ProductSheet.test.jsx.
describe("MEH-1901 — product rows open the detail sheet", () => {
  const longDescription = "שורה ראשונה\n" + "א".repeat(1990);

  it("the grid row is a button, not a div, and opens the sheet on click", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([
          { id: 11, name: "גרנולה ביתית", image_url: null, description: longDescription },
        ])}
      />,
    );
    expect(screen.queryByTestId("product-sheet")).not.toBeInTheDocument();

    const row = screen.getByTestId("product-row");
    expect(row.tagName).toBe("BUTTON");
    fireEvent.click(row);

    const sheet = screen.getByTestId("product-sheet");
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toHaveAttribute("aria-label", "גרנולה ביתית");
    // The whole 2000-char description is reachable from the sheet — the thing
    // this ticket exists to fix.
    expect(screen.getByTestId("product-sheet-description").textContent).toBe(longDescription);
  });

  it("the row description clamps to TWO lines (was line-clamp-1)", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([
          { id: 11, name: "גרנולה ביתית", image_url: null, description: longDescription },
        ])}
      />,
    );
    const rowDesc = screen.getByTestId("product-row").querySelector("p.line-clamp-2");
    expect(rowDesc).not.toBeNull();
    expect(screen.getByTestId("product-row").querySelector("p.line-clamp-1")).toBeNull();
  });

  it("Escape closes the sheet the row opened", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={producerWith([{ id: 11, name: "גרנולה ביתית", image_url: null }])}
      />,
    );
    fireEvent.click(screen.getByTestId("product-row"));
    expect(screen.getByTestId("product-sheet")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("product-sheet")).not.toBeInTheDocument();
  });

  it("the signature card opens the SAME sheet when it matched a real product", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={{
          id: 1,
          name: "רוח השדה",
          top_product_name: "מארז לחמים",
          products: [
            { id: 21, name: "מארז לחמים", image_url: null, description: longDescription },
          ],
        }}
      />,
    );
    const trigger = screen.getByTestId("signature-product-trigger");
    expect(trigger.tagName).toBe("BUTTON");
    fireEvent.click(trigger);
    expect(screen.getByTestId("product-sheet")).toHaveAttribute("aria-label", "מארז לחמים");
  });

  it("a free-text signature label with NO matching product stays inert — no empty sheet", () => {
    render(
      <ProducerSections
        {...baseProps}
        producer={{
          id: 1,
          name: "רוח השדה",
          top_product_name: "משהו שאין לו שורה",
          products: [],
        }}
      />,
    );
    expect(screen.queryByTestId("signature-product-trigger")).not.toBeInTheDocument();
    expect(screen.getByText("משהו שאין לו שורה")).toBeInTheDocument();
  });
});
