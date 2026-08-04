import { describe, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";

/**
 * MEH-1901 self-QA markup dump — NOT an assertion suite.
 *
 * The CC sandbox has no backend, so `/producer/[id]` cannot be SSR-populated
 * and the real route renders an empty page. This dumps the REAL components
 * (ProducerSections rows + ProductSheet) rendered against a fixture producer
 * to static HTML, which e2e/qa-meh1901-sheet.mjs then loads beside the built
 * Tailwind CSS and screenshots at 375 / 1440. Component-markup harness per
 * the MEH-1463 precedent.
 *
 * Run: npx vitest run __tests__/qa-meh1901-markup.test.jsx
 * Skipped unless MEH1901_QA=1 so it never runs in CI.
 */

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    const HE = {
      "producer.detail.sections.products.heading": "מוצרים",
      "producer.detail.sections.products.signature_label": "המוצר המוביל",
      "producer.detail.sections.products.diet.gluten_free": "ללא גלוטן",
      "producer.detail.sections.products.diet.vegan": "טבעוני",
      "producer.detail.sections.products.diet.vegetarian": "צמחוני",
      "producer.detail.sections.products.diet.lactose_free": "ללא לקטוז",
      "producer.detail.sections.products.sheet_cta": "שאלי על המוצר בוואטסאפ",
      "producer.detail.sections.products.sheet_close_aria": "סגירת פרטי המוצר",
      "whatsapp.question_chips.source_line": "הגעתי דרך מהמקור",
    };
    if (full === "producer.detail.sections.products.sheet_open_aria") return `פרטים על ${vars?.name ?? ""}`;
    if (full === "producer.detail.sections.products.sheet_wa_prefill") return `היי, ראיתי את ״${vars?.name ?? ""}״`;
    if (full === "producer.card.aria.image_missing") return `${vars?.name ?? ""} — תמונה חסרה`;
    return HE[full] ?? full;
  },
  useFormatter: () => ({ dateTime: () => "" }),
  useLocale: () => "he",
}));

vi.mock("next/image", () => ({
  default: (props) => (
    <img src={props.src} alt={props.alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
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
vi.mock("@/components/OwnerSectionEditLink", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/ReportButton", () => ({ default: () => null }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => null }));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";
import ProductSheet from "@/components/public/ProductSheet";

// A real 2000-char description, so the sheet's scroll behaviour is exercised
// with the value the DB column actually permits.
const LONG = (() => {
  const s = Array.from(
    { length: 26 },
    (_, i) =>
      `${i + 1}. גרנולה בהכנה ידנית בתנור אבן, שיבולת שועל מלאה, שקדים, אגוזי מלך וסילאן טהור.`,
  ).join("\n");
  return s.slice(0, 2000);
})();

const PRODUCT = {
  id: 11,
  name: "גרנולה ביתית",
  description: LONG,
  image_url: null,
  price_min: 35,
  price_max: 50,
  is_vegan: true,
  is_gluten_free: true,
  is_vegetarian: false,
  is_lactose_free: false,
};

const PRODUCER = {
  id: 7,
  name: "טבע פור",
  phone: "0501234567",
  top_product_name: "מארז טעימות",
  products: [
    PRODUCT,
    { id: 12, name: "דבש פרחי בר", description: "דבש גולמי מכוורת משפחתית בגליל, ללא חימום וללא סינון.", image_url: null, price_range: "מ-30₪ לצנצנת" },
    { id: 13, name: "מארז טעימות", description: "שישה מוצרים נבחרים לטעימה.", image_url: null, price_min: 120 },
  ],
};

// A 2×2 olive-green PNG, upscaled by object-cover — stands in for a real
// product photo so the with-photo layout can be photographed offline.
const PHOTO_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAHElEQVQI12NkYGD4z8DAwMgABXAGNgGwGhwaAFHmAQlCVlS4AAAAAElFTkSuQmCC";

const baseProps = {
  events: [],
  similarProducers: [],
  sectionRefs: { current: {} },
  reviewsContainerRef: { current: null },
  reviewsVisible: false,
};

const OUT = "../qa-artifacts/MEH-1901";

describe.skipIf(process.env.MEH1901_QA !== "1")("MEH-1901 markup dump", () => {
  it("dumps the product rows and the open sheet", () => {
    mkdirSync(OUT, { recursive: true });

    const rows = render(<ProducerSections {...baseProps} producer={PRODUCER} />);
    writeFileSync(`${OUT}/rows.html`, rows.container.innerHTML);
    rows.unmount();

    const sheet = render(
      <ProductSheet product={PRODUCT} producer={PRODUCER} onClose={() => {}} />,
    );
    writeFileSync(`${OUT}/sheet.html`, sheet.container.innerHTML);
    sheet.unmount();

    // The with-photo variant, so the eye pass covers BOTH image states rather
    // than only the placeholder. A data: URI passes through optimizeCloudinary
    // untouched (it bails on any non-res.cloudinary.com string) and needs no
    // network, which the sandbox does not have for Cloudinary anyway.
    const withPhoto = render(
      <ProductSheet
        product={{ ...PRODUCT, image_url: PHOTO_DATA_URI }}
        producer={PRODUCER}
        onClose={() => {}}
      />,
    );
    writeFileSync(`${OUT}/sheet-photo.html`, withPhoto.container.innerHTML);
    withPhoto.unmount();
  });
});
