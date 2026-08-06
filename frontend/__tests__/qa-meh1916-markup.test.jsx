import { describe, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * MEH-1916 self-QA markup dump — NOT an assertion suite.
 *
 * The CC sandbox has no backend, so /producer/[id] cannot be SSR-populated and
 * the live sheet renders nothing to photograph. This writes the REAL component's
 * markup for each CTA channel so e2e/qa-meh1916-cta.mjs can shoot it against the
 * app's own built Tailwind CSS. Same harness shape as
 * __tests__/qa-meh1901-markup.test.jsx (MEH-1463 precedent), and skipped unless
 * MEH1916_QA=1 so it costs the normal suite nothing.
 *
 * Usage: MEH1916_QA=1 npx vitest run __tests__/qa-meh1916-markup.test.jsx
 */

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    const map = {
      "whatsapp.question_chips.source_line": "הגעתי דרך מהמקור",
      "producer.detail.sections.products.sheet_wa_prefill": `היי, ראיתי את ״${vars?.name ?? ""}״ בעמוד שלכם במהמקור ואשמח לשמוע פרטים`,
      "producer.detail.sections.products.sheet_cta": "שאלי על המוצר בוואטסאפ",
      "producer.detail.sections.products.sheet_secondary_wa": "או שאלי על המוצר בוואטסאפ",
      "producer.detail.sections.products.sheet_close_aria": "סגירת פרטי המוצר",
      "producer.detail.sections.products.diet.vegan": "טבעוני",
      "producer.detail.sections.products.diet.gluten_free": "ללא גלוטן",
      "producer.detail.sections.products.diet.vegetarian": "צמחוני",
      "producer.detail.sections.products.diet.lactose_free": "ללא לקטוז",
    };
    if (full === "producer.card.aria.image_missing") return `${vars?.name ?? ""} — תמונה חסרה`;
    return map[full] ?? full;
  },
}));

vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: () => {},
  markWhatsAppClickedLocal: () => {},
}));

import ProductSheet from "@/components/public/ProductSheet";

const PRODUCT = {
  id: 11,
  name: "גרנולה ביתית",
  description:
    "גרנולה אפויה לאט עם שקדים, פקאן וסילאן מקומי. בלי סוכר לבן, בלי חומרים משמרים — נאפית בתנור ביתי אחת לשבוע.",
  price_min: 38,
  price_max: 52,
  is_vegan: true,
  is_gluten_free: true,
  image_url: null,
};

// One producer, three channel configurations — the whole point of MEH-1916 is
// that these render differently, so the eye pass has to see all three.
const CASES = {
  // Chose her web shop, and has a phone: loud "להזמנה באתר" + quiet WA link.
  website: {
    id: 7,
    name: "טבע פור",
    phone: "0501234567",
    primary_contact_method: "website",
    website: "tevapur.co.il",
  },
  // Unchanged from before MEH-1916 — the regression baseline.
  whatsapp: { id: 7, name: "טבע פור", phone: "0501234567" },
  // The dead end this ticket closes: no phone at all.
  "website-nophone": {
    id: 7,
    name: "טבע פור",
    phone: null,
    primary_contact_method: "website",
    website: "tevapur.co.il",
  },
};

const OUT = "../qa-artifacts/MEH-1916";

describe.skipIf(process.env.MEH1916_QA !== "1")("MEH-1916 markup dump", () => {
  it("dumps the sheet once per primary_contact_method", () => {
    mkdirSync(OUT, { recursive: true });
    for (const [label, producer] of Object.entries(CASES)) {
      const view = render(
        <ProductSheet product={PRODUCT} producer={producer} onClose={() => {}} />,
      );
      writeFileSync(`${OUT}/sheet-${label}.html`, view.container.innerHTML);
      view.unmount();
    }
  });
});
