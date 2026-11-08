import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import he from "../messages/he.json";

/**
 * MEH-2824 (Sapir's decisions 08/11, 2–3) — the two server-side pages that end
 * on the shared closing band, rendered with the REAL Hebrew catalog so a copy
 * key pointing at the wrong namespace fails here, not on the phone.
 */

const lookup = (ns) => (key) => `${ns ? `${ns}.` : ""}${key}`.split(".").reduce((o, k) => o?.[k], he);
vi.mock("next-intl/server", () => {
  const make = (ns) => {
    const t = (key) => lookup(ns)(key) ?? key;
    t.rich = t;
    t.raw = (key) => lookup(ns)(key) ?? [];
    return t;
  };
  return {
    setRequestLocale: () => {},
    getTranslations: async (arg) => make(typeof arg === "string" ? arg : arg?.namespace),
  };
});
vi.mock("next-intl", () => ({ useTranslations: (ns) => (key) => lookup(ns)(key) ?? key }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill, priority, unoptimized, ...props }) => <img {...props} />,
}));

import ForBusinessesPage from "@/app/[locale]/about/for-businesses/page";

const params = { params: Promise.resolve({ locale: "he" }) };

describe("/about/for-businesses ends on the shared band (decision 3)", () => {
  it("the band is the page's last block, titled with the home heading key, no body", async () => {
    const { container } = render(await ForBusinessesPage(params));
    const bands = container.querySelectorAll("[data-meets-footer]");
    expect(bands).toHaveLength(1);
    const band = bands[0];
    expect(band.querySelector("h2").textContent).toBe(he.home.cta.heading);
    expect(band.querySelectorAll("p")).toHaveLength(0);
    // Nothing renders after the band: it runs straight into the site footer.
    const all = [...container.querySelectorAll("*")];
    expect(all.filter((el) => !band.contains(el) && band.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)).toHaveLength(0);
  });

  it("one join button at the end: the band's «מצטרפים»; the old green «הוסיפו את העסק שלכם» is gone", async () => {
    const { container } = render(await ForBusinessesPage(params));
    const band = container.querySelector("[data-meets-footer]");
    const bandLinks = band.querySelectorAll("a");
    expect(bandLinks).toHaveLength(1);
    expect(bandLinks[0].textContent).toBe(he.join.cta);
    const joinLinks = [...container.querySelectorAll('a[href="/register/producer"]')];
    // Header CTA (above the FAQ, MEH-923) + the band. Not three.
    expect(joinLinks).toHaveLength(2);
  });

  it("the «still have questions» line stays, above the band", async () => {
    const { container } = render(await ForBusinessesPage(params));
    const band = container.querySelector("[data-meets-footer]");
    const q = screen.getByText(he.about_business.footer_questions_prefix, { exact: false });
    expect(q.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("/about/process heading in neutral plural (decision 2)", () => {
  it("process.cta.h2", () => {
    expect(he.process.cta.h2).toBe("יש לכם בית עסק שמגיע לו בית?");
  });
});
