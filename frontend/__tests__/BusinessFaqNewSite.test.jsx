import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-3869 — the business FAQs answer «the site is new, will it bring me
 * customers?». Approved word for word by Sapir (25/11, revised the same evening to name the tools). On /about/for-businesses
 * it follows «visibility»; on /join it is third, after the two money questions.
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
vi.mock("@/components/BusinessCtaLink", () => ({ default: ({ children }) => <a>{children}</a> }));
vi.mock("@/components/join/JoinFeatures", () => ({ default: () => <section data-testid="join-features" /> }));
vi.mock("@/components/join/JoinStickyBar", () => ({ default: () => <div data-testid="join-sticky-bar" /> }));

import ForBusinessesPage from "@/app/[locale]/about/for-businesses/page";
import JoinPage from "@/app/[locale]/join/page";

const params = { params: Promise.resolve({ locale: "he" }) };
const Q = "האתר עוד חדש. זה באמת יביא לי לקוחות?";
const A1 =
  "העמוד מתחיל לעבוד בשבילכם מהיום הראשון, גם לפני שהאתר גדול. יש בו את הסיפור, התמונות, המוצרים עם המחירים ואזורי המשלוח, וכפתור שפותח שיחה בוואטסאפ. עוזרת AI עונה ללקוחות על שאלות לפי מה שכתוב בעמוד, וכל לקוח בודק לבד אם יש משלוח ליישוב שלו. במקום לענות על אותן שאלות שוב ושוב, שולחים לינק אחד.";
const A2 =
  "יש גם כלים שמביאים מכירות: קבוצות רכישה, אירועים וסדנאות, ומבצעים. לקוחות ששומרים את העסק מקבלים עדכון כשעולה משהו חדש, ויש QR להדפסה וכרטיסים מוכנים לשיתוף ברשתות.";
const A3 =
  "ובזמן שאתם מוכרים, אנחנו עובדות להביא אליכם תנועה. אנחנו בונות איתכם את העמוד, מספרות על כל בית עסק חדש ברשתות שלנו, והעמוד פתוח לחיפוש בגוגל ובצ'אטים כמו ChatGPT. מי שמצטרף עכשיו הוא מהראשונים בתחום שלו. ובלוח הבקרה תראו כמה נכנסו לעמוד וכמה פנו אליכם, אז לא צריך להאמין לנו: רואים.";
const A = `${A1}

${A2}

${A3}`;

describe("business FAQ: «will it bring me customers?» (MEH-3869)", () => {
  it("carries the approved Hebrew copy once, with an English mirror", () => {
    expect(he.about_business.faq.new_site).toEqual({ q: Q, a: A });
    // /join reads it from about_business.faq (one owner), so join.faq has no copy.
    expect(he.join.faq.q_new_site).toBeUndefined();
    expect(en.about_business.faq.new_site.q).toBeTruthy();
    expect(en.about_business.faq.new_site.a).toBeTruthy();
  });

  it("/about/for-businesses: right after «visibility», three paragraphs, and in the FAQPage JSON-LD", async () => {
    const { container } = render(await ForBusinessesPage(params));
    const qs = [...container.querySelectorAll("details summary span")].map((s) => s.textContent);
    const i = qs.indexOf(Q);
    expect(i).toBeGreaterThan(0);
    expect(qs[i - 1]).toBe(he.about_business.faq.visibility.q);
    const paras = [...container.querySelectorAll("details")[i].querySelectorAll("p")].map((p) => p.textContent);
    expect(paras).toEqual([A1, A2, A3]);
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]').textContent);
    expect(ld.mainEntity.find((e) => e.name === Q)?.acceptedAnswer.text).toBe(A);
  });

  it("/join: third question, after cost and price, closed on load", async () => {
    render(await JoinPage(params));
    const items = screen.getAllByTestId("join-faq-item");
    const titles = items.map((d) => d.querySelector("summary h3").textContent);
    expect(titles.slice(0, 3)).toEqual([he.join.faq.q_cost, he.join.faq.q_price, Q]);
    expect(items[2].open).toBe(false);
    expect(items[2].querySelector("p").textContent).toBe(A);
  });
});
