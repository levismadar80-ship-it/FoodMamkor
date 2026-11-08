import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";

/**
 * MEH-2827 PR 3 — /recommend and /contact use the standard page title
 * (FinalRecommend / FinalContact), the guides hub drops pure white and its
 * empty ending (FinalGuides), and copy rows 5 + 7 go neutral plural.
 */

vi.mock("@/lib/api", () => ({ default: { post: vi.fn(), get: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/CitySearch", () => ({ default: () => <input aria-label="city" /> }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next-intl/server", () => {
  const make = (ns) => {
    const look = (key) => `${ns}.${key}`.split(".").reduce((o, k) => o?.[k], he);
    const t = (key, vars) => {
      let v = look(key) ?? key;
      for (const [k, val] of Object.entries(vars ?? {})) v = String(v).replace(`{${k}}`, val);
      return v;
    };
    t.rich = t;
    t.raw = look;
    return t;
  };
  return {
    setRequestLocale: () => {},
    getTranslations: async (arg) => make(typeof arg === "string" ? arg : arg?.namespace),
  };
});

import RecommendClient from "@/app/[locale]/recommend/RecommendClient";
import ContactClient from "@/app/[locale]/contact/ContactClient";
import GuidesIndex from "@/app/[locale]/about/for-businesses/guides/page";

const classes = (el) => (el?.getAttribute("class") || "").split(/\s+/);
const STANDARD_H1 = ["font-headline-lg", "text-primary-dark", "text-[clamp(28px,6vw,44px)]", "leading-[1.15]", "font-black", "text-start"];

function inIntl(node) {
  return render(<NextIntlClientProvider locale="he" messages={he}>{node}</NextIntlClientProvider>);
}

describe("standard page title (FinalRecommend / FinalContact)", () => {
  for (const [name, Comp] of [["/recommend", RecommendClient], ["/contact", ContactClient]]) {
    it(`${name}: h1 uses the standard title classes, start-aligned, and so does its subtitle`, () => {
      const { container } = inIntl(<Comp />);
      const h1 = container.querySelector("h1");
      expect(classes(h1)).toEqual(expect.arrayContaining(STANDARD_H1));
      expect(classes(h1)).not.toContain("text-5xl");
      expect(classes(h1)).not.toContain("text-center");
      const sub = h1.nextElementSibling?.tagName === "P" ? h1.nextElementSibling : h1.parentElement.querySelector("p");
      expect(classes(sub)).toContain("text-start");
    });
  }
});

describe("/about/for-businesses/guides (FinalGuides)", () => {
  it("cards on bg-surface-card (no pure white), the Instagram line in a card, no full-screen min height", async () => {
    const { container } = render(await GuidesIndex({ params: Promise.resolve({ locale: "he" }) }));
    const cards = container.querySelectorAll("ul a");
    expect(cards.length).toBeGreaterThan(0);
    for (const a of cards) {
      expect(classes(a)).toContain("bg-surface-card");
      expect(classes(a)).not.toContain("bg-surface");
    }
    const end = container.querySelector("footer");
    expect(classes(end)).toEqual(expect.arrayContaining(["rounded-xl", "bg-background-alt", "p-5"]));
    expect(classes(container.querySelector("section"))).not.toContain("min-h-screen");
  });
});

describe("copy rows 5 + 7 (neutral plural, Sapir verbatim 08/11)", () => {
  it("nav.footer.cta_pitch", () => expect(he.nav.footer.cta_pitch).toBe("יש לכם עסק מזון מקומי?"));
  it("account.sheet.biz_cta", () => expect(he.account.sheet.biz_cta).toBe("יש לכם בית עסק?"));
});
