import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * MEH-2597 — /join, /about/for-businesses and /about/why-local each carry one
 * decorative photo (the 29/10 survey found no image on any of them at any
 * width). The photo is decorative (alt=""), lazy (not priority — it sits under
 * the CTA or mid-article, never the LCP), and goes through optimizeCloudinary
 * at 16:9 with a capped width.
 */

vi.mock("next-intl/server", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  t.raw = () => [];
  return { setRequestLocale: () => {}, getTranslations: async () => t };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/BusinessCtaLink", () => ({ default: ({ children }) => <a>{children}</a> }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill, priority, ...props }) => <img data-priority={String(!!priority)} {...props} />,
}));

import JoinPage from "@/app/[locale]/join/page";
import ForBusinessesPage from "@/app/[locale]/about/for-businesses/page";
import WhyLocalPage from "@/app/[locale]/about/why-local/page";

const params = { params: Promise.resolve({ locale: "he" }) };

describe.each([
  ["/join", JoinPage, "join-photo", "login/hero-produce-crate.jpg"],
  ["/about/for-businesses", ForBusinessesPage, "for-businesses-photo", "register/hero-box-produce.jpg"],
  ["/about/why-local", WhyLocalPage, "why-local-photo", "events/hero-market.jpg"],
])("MEH-2597 · %s photo", (_, Page, testId, asset) => {
  it("renders exactly one decorative, lazy, 16:9 photo", async () => {
    render(await Page(params));
    const boxes = screen.getAllByTestId(testId);
    expect(boxes).toHaveLength(1);
    const img = boxes[0].querySelector("img");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.dataset.priority).toBe("false");
    expect(img.getAttribute("src")).toContain(asset);
    expect(img.getAttribute("src")).toContain("ar_16:9");
    expect(img.getAttribute("src")).toContain("w_1200");
  });
});

describe("MEH-2597 · placement", () => {
  it("/join: the photo comes after the hero CTA, so the CTA stays first", async () => {
    render(await JoinPage(params));
    const hero = screen.getByTestId("join-hero");
    const photo = screen.getByTestId("join-photo");
    expect(hero.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hero.contains(photo)).toBe(false);
  });

  it("/about/for-businesses: the photo sits between the header CTA and the questions", async () => {
    const { container } = render(await ForBusinessesPage(params));
    const header = container.querySelector("header");
    const photo = screen.getByTestId("for-businesses-photo");
    const firstQuestion = container.querySelector("h2");
    expect(header.contains(photo)).toBe(false);
    expect(header.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(photo.compareDocumentPosition(firstQuestion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("/about/why-local: the photo sits inside the second reason, mid-article", async () => {
    render(await WhyLocalPage(params));
    const sections = screen.getByTestId("why-local-article").querySelectorAll("section");
    // Mid-article: there must be reasons after the one carrying the photo.
    expect(sections.length).toBeGreaterThan(2);
    expect(sections[1].querySelector('[data-testid="why-local-photo"]')).not.toBeNull();
  });
});
