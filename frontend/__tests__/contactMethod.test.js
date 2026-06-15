import { describe, it, expect, vi } from "vitest";

// Mock the utils normalizePhone used by contact-method.
// MEH-729: keep the real getWhatsAppHref (contact-method imports it too) via
// importOriginal — the prior mock dropped it, breaking the whatsapp href test.
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  normalizePhone: (p) => (p ? p.replace(/^0/, "972").replace(/\D/g, "") : ""),
}));

import {
  CONTACT_METHODS,
  getPrimaryMethod,
  getPrimaryContactHref,
  getPrimaryContactLabel,
  isPrimaryExternal,
} from "@/lib/contact-method";

const base = {
  name: "חוות השקמה",
  phone: "0501234567",
  website: "havat-hashikma.co.il",
  contact_email: "hello@havat-hashikma.co.il",
};

describe("CONTACT_METHODS", () => {
  it("exposes the seven supported methods", () => {
    // MEH-296: instagram/facebook/external_order added to the original four.
    expect(CONTACT_METHODS.map((m) => m.key).sort()).toEqual([
      "email",
      "external_order",
      "facebook",
      "instagram",
      "phone",
      "website",
      "whatsapp",
    ]);
  });
});

describe("getPrimaryMethod", () => {
  it("defaults to whatsapp when missing or unknown", () => {
    expect(getPrimaryMethod({})).toBe("whatsapp");
    expect(getPrimaryMethod({ primary_contact_method: "" })).toBe("whatsapp");
    expect(getPrimaryMethod({ primary_contact_method: "bogus" })).toBe("whatsapp");
  });

  it("returns the selected method", () => {
    expect(getPrimaryMethod({ primary_contact_method: "phone" })).toBe("phone");
    expect(getPrimaryMethod({ primary_contact_method: "website" })).toBe("website");
    expect(getPrimaryMethod({ primary_contact_method: "email" })).toBe("email");
  });
});

describe("getPrimaryContactHref", () => {
  it("returns null for null/undefined producer", () => {
    expect(getPrimaryContactHref(null)).toBe(null);
    expect(getPrimaryContactHref(undefined)).toBe(null);
  });

  it("whatsapp: builds wa.me with prefilled message", () => {
    const href = getPrimaryContactHref({
      ...base,
      primary_contact_method: "whatsapp",
    });
    expect(href).toContain("https://wa.me/972501234567");
    expect(href).toContain("text=");
  });

  it("whatsapp: null when no phone", () => {
    expect(
      getPrimaryContactHref({ ...base, phone: null, primary_contact_method: "whatsapp" }),
    ).toBe(null);
  });

  it("phone: builds tel:", () => {
    expect(
      getPrimaryContactHref({ ...base, primary_contact_method: "phone" }),
    ).toBe("tel:0501234567");
  });

  it("phone: null when no phone", () => {
    expect(
      getPrimaryContactHref({ ...base, phone: "", primary_contact_method: "phone" }),
    ).toBe(null);
  });

  it("website: returns URL as-is when it has a protocol", () => {
    expect(
      getPrimaryContactHref({
        ...base,
        website: "https://example.com",
        primary_contact_method: "website",
      }),
    ).toBe("https://example.com");
  });

  it("website: prepends https:// when missing", () => {
    expect(
      getPrimaryContactHref({ ...base, primary_contact_method: "website" }),
    ).toBe("https://havat-hashikma.co.il");
  });

  it("website: null when no website", () => {
    expect(
      getPrimaryContactHref({ ...base, website: "", primary_contact_method: "website" }),
    ).toBe(null);
  });

  it("email: builds mailto:", () => {
    expect(
      getPrimaryContactHref({ ...base, primary_contact_method: "email" }),
    ).toBe("mailto:hello@havat-hashikma.co.il");
  });

  it("email: null when no contact_email", () => {
    expect(
      getPrimaryContactHref({ ...base, contact_email: null, primary_contact_method: "email" }),
    ).toBe(null);
  });
});

describe("getPrimaryContactLabel", () => {
  it("returns the Hebrew label for each method", () => {
    expect(getPrimaryContactLabel({ primary_contact_method: "whatsapp" })).toBe(
      "שלחי הודעה",
    );
    expect(getPrimaryContactLabel({ primary_contact_method: "phone" })).toBe(
      "התקשרי",
    );
    expect(getPrimaryContactLabel({ primary_contact_method: "website" })).toBe(
      "להזמנה באתר",
    );
    expect(getPrimaryContactLabel({ primary_contact_method: "email" })).toBe(
      "שלחי מייל",
    );
  });

  it("falls back for unknown method", () => {
    expect(getPrimaryContactLabel({})).toBe("שלחי הודעה"); // default → whatsapp
  });
});

describe("isPrimaryExternal", () => {
  it("only website opens in a new tab", () => {
    expect(isPrimaryExternal({ primary_contact_method: "website" })).toBe(true);
    expect(isPrimaryExternal({ primary_contact_method: "whatsapp" })).toBe(false);
    expect(isPrimaryExternal({ primary_contact_method: "phone" })).toBe(false);
    expect(isPrimaryExternal({ primary_contact_method: "email" })).toBe(false);
  });
});
