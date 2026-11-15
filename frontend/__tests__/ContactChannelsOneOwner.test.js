// MEH-2991: one table of contact hrefs (lib/contact-method.js contactHref)
// for every entity that carries the business contact fields, and every tap on
// a contact channel is counted (lib/contact-tracking.js trackChannelClick).
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contactHref, httpUrl, CONTACT_METHODS } from "@/lib/contact-method";
import * as tracking from "@/lib/contact-tracking";

const FULL = {
  phone: " 052-123-4567 ",
  contact_email: " a@b.co ",
  instagram: "@meshek",
  website: "meshek.co.il",
  facebook: "https://facebook.com/meshek",
  external_order_form: "forms.gle/x",
  whatsapp_group: "https://chat.whatsapp.com/abc",
};

describe("contactHref", () => {
  it("builds each channel from the same fields, trimmed and scheme-safe", () => {
    expect(contactHref("whatsapp", FULL, "היי")).toBe(`https://wa.me/972521234567?text=${encodeURIComponent("היי")}`);
    expect(contactHref("phone", FULL)).toBe("tel:052-123-4567");
    expect(contactHref("email", FULL)).toBe("mailto:a@b.co");
    expect(contactHref("instagram", FULL)).toBe("https://instagram.com/meshek");
    expect(contactHref("website", FULL)).toBe("https://meshek.co.il");
    expect(contactHref("facebook", FULL)).toBe("https://facebook.com/meshek");
    expect(contactHref("external_order", FULL)).toBe("https://forms.gle/x");
    expect(contactHref("whatsapp_group", FULL)).toBe("https://chat.whatsapp.com/abc");
  });
  it("is null for every channel of an entity with no contact fields, and for an unknown channel", () => {
    const keys = [...CONTACT_METHODS.map((c) => c.key), "whatsapp_group"];
    expect(keys.map((k) => contactHref(k, {}))).toEqual(keys.map(() => null));
    expect(contactHref("fax", FULL)).toBeNull();
  });
  it("a landline has a call link and no WhatsApp link", () => {
    expect(contactHref("whatsapp", { phone: "04-6123456" })).toBeNull();
    expect(contactHref("phone", { phone: "04-6123456" })).toBe("tel:04-6123456");
  });
  it("httpUrl: blank → null, scheme kept, bare host → https", () => {
    expect([httpUrl("  "), httpUrl(null), httpUrl("http://x.il"), httpUrl("x.il")]).toEqual([
      null,
      null,
      "http://x.il",
      "https://x.il",
    ]);
  });
});

describe("trackChannelClick", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(navigator, "sendBeacon", { value: vi.fn().mockReturnValue(true), configurable: true });
    localStorage.clear();
  });
  const urls = () => [
    ...global.fetch.mock.calls.map((c) => c[0]),
    ...navigator.sendBeacon.mock.calls.map((c) => c[0]),
  ];
  it("WhatsApp → the whatsapp-click beacon for that producer", () => {
    tracking.trackChannelClick("p1", "whatsapp");
    expect(urls()).toEqual([expect.stringContaining("/producers/p1/whatsapp-click")]);
  });
  it("any other channel → contact-click with the channel as the method", () => {
    tracking.trackChannelClick("p1", "instagram");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain("/producers/p1/contact-click");
    expect(JSON.parse(init.body)).toEqual({ method: "instagram" });
  });
  it("no producer id → nothing is sent", () => {
    tracking.trackChannelClick(null, "whatsapp");
    tracking.trackChannelClick(undefined, "phone");
    expect(urls()).toEqual([]);
  });
});

describe("one owner (guard)", () => {
  const ROOT = path.resolve(__dirname, "..");
  // Entity pages that show a business's / organizer's contact details.
  const PAGES = [
    "app/[locale]/producer/[id]",
    "app/[locale]/organizers/[slug]",
    "app/[locale]/experiences/[id]",
    "app/[locale]/events/[id]",
    "app/[locale]/group-buys/[id]",
  ];
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : /\.(js|jsx)$/.test(e.name) ? [p] : [];
    });
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  // An href built by hand: a template/string starting tel: / mailto:, a wa.me
  // URL, or a call to the low-level WhatsApp builder.
  const HAND_BUILT = /[`"']tel:|[`"']mailto:|wa\.me\/|getWhatsAppHref\(/;
  const files = PAGES.flatMap((d) => walk(path.join(ROOT, d)));

  it("control: the pattern fires on the owner, and the scan reads real page files", () => {
    expect(HAND_BUILT.test(strip(fs.readFileSync(path.join(ROOT, "lib", "contact-method.js"), "utf8")))).toBe(true);
    expect(files.map((f) => path.relative(ROOT, f))).toContain(
      path.join("app", "[locale]", "organizers", "[slug]", "page.js"),
    );
  });
  it("no entity page builds a tel: / mailto: / WhatsApp href itself", () => {
    const offenders = files
      .filter((f) => HAND_BUILT.test(strip(fs.readFileSync(f, "utf8"))))
      .map((f) => path.relative(ROOT, f));
    expect(offenders, "use contactHref from lib/contact-method.js").toEqual([]);
  });
});
