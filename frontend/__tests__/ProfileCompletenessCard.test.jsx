import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

// MEH-3659: the card has two modes. Draft = the submit-gate checklist (only
// what blocks «שליחה לבדיקה»). Anything else = «לשפר את העמוד» (the full
// step list, recommended items included). Both: «N מתוך M», one open row.

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars = {}) => {
    const flat = {
      green_headline: "העמוד מלא",
      improve_headline: "לשפר את העמוד",
      draft_ready: "הכול מוכן",
      draft_headline: "עוד {count} צעדים לשליחה לבדיקה",
      counter: "{done} מתוך {total}",
      open_cta: "להשלמה",
      license_note: "בלי מספר רישיון לא נוכל לאשר את העמוד",
      checklist_aria: "התקדמות השלמת העמוד",
      checklist_done: "הושלם",
      checklist_todo: "עדיין חסר",
      "steps.image": "תמונות",
      "steps.location": "קטגוריות ומיקום",
      "steps.products": "מוצר ראשון בקטלוג",
      "steps.contact": "פרטי קשר",
      "steps.phone_verified": "אימות וואטסאפ",
      "steps.hours": "שעות פתיחה",
      "steps.owner_photo": "תמונה שלך",
      "draft_steps.details": "פרטי העסק",
      "draft_steps.image": "תמונה של העסק או המוצרים",
      "draft_steps.product": "מוצר ראשון",
      "draft_steps.phone_verified": "אימות מספר הוואטסאפ",
    };
    const raw = flat[key] ?? key;
    return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  },
}));

vi.mock("@/components/PhoneVerifyCard", () => ({
  default: ({ onVerified }) => (
    <button type="button" data-testid="phone-verify-card" onClick={onVerified}>
      otp
    </button>
  ),
}));

import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";

const base = {
  city: "תל אביב",
  lat: 32.07,
  lng: 34.78,
  locations: [{ kind: "branch", is_primary: true, lat: 32.07, lng: 34.78, precision: "exact" }],
  phone: "0500000000",
  categories: ["dairy"],
  images: ["img1"],
  has_physical_location: true,
  short_description: "גבינות עיזים מהחווה",
  opening_hours: "א׳-ה׳ 9:00-17:00",
  phone_verified: true,
  owner_photo_url: "https://res.cloudinary.com/x/owner.jpg",
  products: [{ id: "p1" }],
  status: "approved",
};
const draft = { ...base, status: "draft" };

const EDIT = "/producer/dashboard/edit";
const list = () => screen.getByRole("list", { name: "התקדמות השלמת העמוד" });
const counter = () => screen.getByTestId("completeness-counter").textContent;
const openRows = () => screen.queryAllByTestId(/^completeness-open-(?!cta)/);

describe("ProfileCompletenessCard — improve mode (after submission)", () => {
  it("renders nothing when producer is null", () => {
    const { container } = render(<ProfileCompletenessCard producer={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("all steps done → collapses to «העמוד מלא», no list, no counter", () => {
    render(<ProfileCompletenessCard producer={base} />);
    expect(screen.getByText("העמוד מלא")).toBeInTheDocument();
    expect(screen.queryByTestId("completeness-list")).toBeNull();
    expect(screen.queryByTestId("completeness-counter")).toBeNull();
  });

  it("one missing (photo) → «לשפר את העמוד», 6 מתוך 7, the photo row is the open one", () => {
    render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);
    expect(screen.getByText("לשפר את העמוד")).toBeInTheDocument();
    expect(counter()).toBe("6 מתוך 7");
    expect(openRows().map((r) => r.dataset.testid)).toEqual(["completeness-open-image"]);
    expect(screen.getByTestId("completeness-open-cta-image").getAttribute("href")).toBe(
      `${EDIT}#profile-images`,
    );
  });

  it("many missing → exactly ONE open row (the first), the rest are plain rows", () => {
    render(
      <ProfileCompletenessCard
        producer={{ ...base, images: [], opening_hours: "", owner_photo_url: null }}
      />,
    );
    expect(counter()).toBe("4 מתוך 7");
    expect(openRows()).toHaveLength(1);
    expect(screen.getByTestId("completeness-open-image")).toBeInTheDocument();
    expect(screen.getByTestId("completeness-row-hours").dataset.done).toBe("false");
    expect(screen.getByTestId("completeness-row-owner_photo").dataset.done).toBe("false");
  });

  it("step order is stable: image, location, products, contact, WhatsApp, hours, owner photo", () => {
    render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);
    const keys = within(list())
      .getAllByRole("listitem")
      .map((li) => li.dataset.testid.replace(/^completeness-(open|row)-/, ""));
    expect(keys).toEqual(["image", "location", "products", "contact", "phone_verified", "hours", "owner_photo"]);
  });

  it("no chips and no «השלב הבא» box any more", () => {
    render(<ProfileCompletenessCard producer={{ ...base, images: [] }} />);
    expect(screen.queryByTestId(/^completeness-chip-/)).toBeNull();
    expect(screen.queryByTestId("completeness-next-step")).toBeNull();
  });

  it("products signal: array length first, products_count scalar as fallback", () => {
    const { rerender } = render(<ProfileCompletenessCard producer={{ ...base, products: [] }} />);
    expect(screen.getByTestId("completeness-open-products")).toBeInTheDocument();
    const { products: _p, ...noArray } = base;
    rerender(<ProfileCompletenessCard producer={{ ...noArray, products_count: 2 }} />);
    expect(screen.getByText("העמוד מלא")).toBeInTheDocument();
  });

  it("delivery-only: areas set → location done; no areas → location open", () => {
    const deliveryOnly = {
      ...base, has_physical_location: false, offers_delivery: true,
      lat: null, lng: null, locations: [],
    };
    const { rerender } = render(
      <ProfileCompletenessCard producer={{ ...deliveryOnly, delivery_areas: [{ city: "חיפה" }] }} />,
    );
    expect(screen.getByText("העמוד מלא")).toBeInTheDocument();
    rerender(<ProfileCompletenessCard producer={{ ...deliveryOnly, delivery_areas: [] }} />);
    expect(screen.getByTestId("completeness-open-location")).toBeInTheDocument();
  });

  it("whitespace-only hours count as missing (same trim as the heuristic)", () => {
    render(<ProfileCompletenessCard producer={{ ...base, opening_hours: "   " }} />);
    expect(screen.getByTestId("completeness-open-hours")).toBeInTheDocument();
  });

  it.each([["null", null], ["empty", ""], ["whitespace", "   "]])(
    "owner_photo_url %s → owner-photo row open, links to the owner-story card",
    (_l, value) => {
      render(<ProfileCompletenessCard producer={{ ...base, owner_photo_url: value }} />);
      expect(screen.getByTestId("completeness-open-cta-owner_photo").getAttribute("href")).toBe(
        `${EDIT}#owner-story`,
      );
    },
  );

  it("contact ✓ and WhatsApp ✗ can hold at the same time (the MEH-2100 split)", () => {
    render(<ProfileCompletenessCard producer={{ ...base, phone_verified: false }} />);
    expect(screen.getByTestId("completeness-row-contact").dataset.done).toBe("true");
    expect(screen.getByTestId("completeness-open-cta-phone_verified").getAttribute("href")).toBe("#phone-verify");
  });
});

describe("ProfileCompletenessCard — draft mode (MEH-3659: only what blocks submission)", () => {
  it("nothing missing → «הכול מוכן», 4 מתוך 4, footer (the submit button) shown, no open row", () => {
    render(<ProfileCompletenessCard producer={draft} footer={<button type="button">send</button>} />);
    expect(screen.getByText("הכול מוכן")).toBeInTheDocument();
    expect(counter()).toBe("4 מתוך 4");
    expect(openRows()).toHaveLength(0);
    expect(screen.getByTestId("completeness-footer")).toBeInTheDocument();
  });

  it("recommended items never appear in draft — hours / owner photo / contact are not rows", () => {
    render(
      <ProfileCompletenessCard
        producer={{ ...draft, opening_hours: "", owner_photo_url: null, phone: null, short_description: "" }}
      />,
    );
    expect(screen.getByText("הכול מוכן")).toBeInTheDocument();
    const keys = within(list()).getAllByRole("listitem").map((li) => li.dataset.testid);
    expect(keys).toEqual([
      "completeness-row-details",
      "completeness-row-image",
      "completeness-row-product",
      "completeness-row-phone_verified",
    ]);
  });

  it("one missing (product) → headline counts 1, the product row is open, footer hidden", () => {
    render(
      <ProfileCompletenessCard producer={{ ...draft, products: [] }} footer={<button type="button">send</button>} />,
    );
    expect(screen.getByText("עוד 1 צעדים לשליחה לבדיקה")).toBeInTheDocument();
    expect(counter()).toBe("3 מתוך 4");
    expect(screen.getByTestId("completeness-open-cta-product").getAttribute("href")).toBe(`${EDIT}#profile-products`);
    expect(screen.queryByTestId("completeness-footer")).toBeNull();
  });

  it("many missing (fresh signup: no photo, no product, phone not verified) → one open row, the photo", () => {
    render(<ProfileCompletenessCard producer={{ ...draft, images: [], products: [], phone_verified: false }} />);
    expect(counter()).toBe("1 מתוך 4");
    expect(openRows().map((r) => r.dataset.testid)).toEqual(["completeness-open-image"]);
    expect(screen.getByTestId("completeness-row-details").dataset.done).toBe("true");
    // WhatsApp is not open yet, so the OTP card is not mounted
    expect(screen.queryByTestId("phone-verify-card")).toBeNull();
  });

  it("WhatsApp is the open row → the OTP card opens inside it, under #phone-verify; verifying calls back", () => {
    const onPhoneVerified = vi.fn();
    render(
      <ProfileCompletenessCard producer={{ ...draft, phone_verified: false }} onPhoneVerified={onPhoneVerified} />,
    );
    const row = screen.getByTestId("completeness-open-phone_verified");
    expect(row.id).toBe("phone-verify");
    fireEvent.click(within(row).getByTestId("phone-verify-card"));
    expect(onPhoneVerified).toHaveBeenCalledTimes(1);
  });

  it("category missing → «פרטי העסק» opens on the categories card; location missing → on locations", () => {
    const { rerender } = render(<ProfileCompletenessCard producer={{ ...draft, categories: [] }} />);
    expect(screen.getByTestId("completeness-open-cta-details").getAttribute("href")).toBe(`${EDIT}#profile-categories`);
    rerender(<ProfileCompletenessCard producer={{ ...draft, locations: [], lat: null, lng: null }} />);
    expect(screen.getByTestId("completeness-open-cta-details").getAttribute("href")).toBe(`${EDIT}#locations`);
  });

  it("licence-required category without a number → a licence note linking to #license; with a number → none", () => {
    const cats = [{ id: 7, name: "מאפים", requires_license: true }];
    const { rerender } = render(<ProfileCompletenessCard producer={{ ...draft, categories: cats }} />);
    expect(screen.getByTestId("completeness-license-note").getAttribute("href")).toBe(`${EDIT}#license`);
    rerender(
      <ProfileCompletenessCard producer={{ ...draft, categories: cats, producer_license_number: "12345" }} />,
    );
    expect(screen.queryByTestId("completeness-license-note")).toBeNull();
  });
});
