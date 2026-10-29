import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-2571 — /contact said "3 business days" twice (under the heading and in
 * the email box), and the photography guide teaser used the English word
 * "workflow". The privacy consent line and the collection notice both stay:
 * the notice is the Amendment 13 notice-at-collection (MEH-1981).
 */

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

import ContactClient from "@/app/[locale]/contact/ContactClient";

describe("MEH-2571 · copy said once, in Hebrew", () => {
  it("/contact states the 3-business-day response time exactly once", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he}>
        <ContactClient />
      </NextIntlClientProvider>,
    );
    const hits = document.body.textContent.match(/3 ימי עסקים/g) || [];
    expect(hits).toHaveLength(1);
  });

  it("the duplicate key is gone from both locales", () => {
    expect(he.contact.response_time_inline).toBeUndefined();
    expect(en.contact.response_time_inline).toBeUndefined();
  });

  it("no Latin 'workflow' left in the Hebrew messages", () => {
    const values = [];
    const walk = (o) => Object.values(o).forEach((v) => (typeof v === "string" ? values.push(v) : walk(v)));
    walk(he);
    expect(values.filter((v) => /workflow/i.test(v))).toEqual([]);
    expect(JSON.stringify(he)).toContain("5 עקרונות + שגרת עבודה של 30 דקות");
  });
});
