// @ts-check
/**
 * MEH-3981 — /join/orders, «איך מקבלים הזמנות דרך מהמקור».
 *
 * The page is rendered with the real messages in both locales. What it must
 * hold: the numbers it states come from the backend's constants, every
 * placeholder is filled, the links go where the copy says, every screenshot
 * exists, the questions start closed, and the button names are the
 * dashboard's own.
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { ORDERS_GUIDE_NUMBERS, ORDERS_GUIDE_PATH } from "@/lib/orders-guide";
import { BUSINESS_FEATURES } from "@/lib/business-features";
import { pricingCopyValues } from "@/lib/pricing";

/** @type {Record<string, any>} */
const MESSAGES = { he, en };

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async (/** @type {any} */ { locale, namespace }) =>
    createTranslator({ locale, namespace, messages: MESSAGES[locale] }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (/** @type {any} */ { children, href, ...rest }) => <a href={href} data-testid={rest["data-testid"]}>{children}</a>,
}));
vi.mock("next/image", () => ({
  default: (/** @type {any} */ { src, alt }) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/ui/BackLink", () => ({ default: () => null }));
vi.mock("@/components/brand/SeedMark", () => ({ default: () => null }));

import OrdersGuidePage from "@/app/[locale]/join/orders/page";

const ROOT = join(__dirname, "..", "..");

/** @param {string} locale */
async function page(locale) {
  const html = renderToStaticMarkup(await OrdersGuidePage({ params: Promise.resolve({ locale }) }));
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { html, doc, text: doc.body.textContent ?? "" };
}

describe("the numbers on the page are the backend's", () => {
  // Source text on purpose: nothing runs the Python and this page together,
  // so reading the constants is the only way to hold them equal.
  it.each([
    ["remindHours", "backend/app/services/product_order_outbox.py", /^REMIND_BUSINESS_AFTER_HOURS = (\d+)$/m],
    ["answerHours", "backend/app/services/product_order_outbox.py", /^ANSWER_HOURS = (\d+)$/m],
    ["maxStaff", "backend/app/limits.py", /^MAX_STAFF = (\d+)$/m],
  ])("%s", (key, file, re) => {
    const match = readFileSync(join(ROOT, file), "utf8").match(re);
    expect(match, `${re} in ${file}`).not.toBeNull();
    expect(ORDERS_GUIDE_NUMBERS[/** @type {keyof typeof ORDERS_GUIDE_NUMBERS} */ (key)]).toBe(Number(match?.[1]));
  });
});

describe.each(["he", "en"])("/join/orders in %s", (locale) => {
  it("states each number where the copy says, and leaves no placeholder", async () => {
    const { text } = await page(locale);
    const { remindHours, answerHours, maxStaff } = ORDERS_GUIDE_NUMBERS;
    const g = MESSAGES[locale].orders_guide;
    expect(text).toContain(g.late_body.replace("{remindHours}", remindHours).replace("{answerHours}", answerHours));
    expect(text).toContain(g.faq_staff_a.replace("{maxStaff}", maxStaff));
    expect(text).toContain(String(pricingCopyValues().noticeDays));
    expect(text).not.toMatch(/[{}]/);
  });

  it("links to the price list, signup, the orders tab and contact", async () => {
    const { doc } = await page(locale);
    /** @param {string} id */
    const href = (id) => doc.querySelector(`[data-testid="${id}"]`)?.getAttribute("href");
    expect(href("orders-guide-pricing")).toBe("/join/pricing");
    expect(href("orders-guide-register")).toBe("/register/producer");
    expect(href("orders-guide-cta")).toBe("/producer/dashboard/orders");
    expect(href("orders-guide-cta-bottom")).toBe("/producer/dashboard/orders");
    expect(href("orders-guide-contact")).toBe("/contact");
    expect(href("orders-guide-contact-inline")).toBe("/contact");
  });

  it("shows every screenshot from a file that exists, each with alt text", async () => {
    const { doc } = await page(locale);
    const imgs = [...doc.querySelectorAll("img")];
    expect(imgs).toHaveLength(10);
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      expect(existsSync(join(ROOT, "frontend", "public", src)), src).toBe(true);
      expect((img.getAttribute("alt") ?? "").length, src).toBeGreaterThan(5);
    }
  });

  it("starts with every question closed", async () => {
    const { doc } = await page(locale);
    const items = [...doc.querySelectorAll('[data-testid="orders-guide-faq-item"]')];
    expect(items).toHaveLength(7);
    expect(items.filter((d) => d.hasAttribute("open"))).toHaveLength(0);
  });

  it("names the three buttons as the dashboard does", async () => {
    const { text } = await page(locale);
    const actions = MESSAGES[locale].dashboard.producer.orders.actions;
    for (const key of ["confirm", "propose", "decline"]) expect(text).toContain(actions[key]);
  });
});

describe("the /join entry point", () => {
  it("only product_orders carries the guide, and it is this page", () => {
    const withGuide = BUSINESS_FEATURES.filter((/** @type {any} */ f) => f.guide);
    expect(withGuide.map((/** @type {any} */ f) => [f.id, f.guide])).toEqual([["product_orders", ORDERS_GUIDE_PATH]]);
  });
});
