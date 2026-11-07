import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * MEH-2564 — the /join step numbers stay (ordered process) but read as a small
 * green timeline badge in the Hebrew body font, not 5xl gold Latin "01–04".
 */

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async () => (key) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/BusinessCtaLink", () => ({ default: ({ children }) => <a>{children}</a> }));
// MEH-2799: the page mounts two client islands; their own suites cover them
// (JoinFeatures.test.jsx, JoinStickyBar.test.jsx). Stubbed here so this file
// stays a test of the server page's structure.
vi.mock("@/components/join/JoinFeatures", () => ({ default: () => <section data-testid="join-features" /> }));
vi.mock("@/components/join/JoinStickyBar", () => ({ default: () => <div data-testid="join-sticky-bar" /> }));

import JoinPage from "@/app/[locale]/join/page";

describe("MEH-2564 · /join step numerals", () => {
  it("renders 1–4 as small brand-green badges in the body font", async () => {
    render(await JoinPage({ params: Promise.resolve({ locale: "he" }) }));
    const nums = screen.getAllByTestId("join-step-numeral");
    expect(nums.map((n) => n.textContent)).toEqual(["1", "2", "3", "4"]);
    for (const n of nums) {
      const cls = n.className.split(/\s+/);
      expect(cls).toContain("text-primary");
      expect(cls).not.toContain("font-english");
      expect(cls).not.toContain("text-accent");
      expect(cls.some((c) => /^text-(3xl|4xl|5xl|6xl)$/.test(c))).toBe(false);
    }
  });
});

/**
 * MEH-2799 — the v2 page structure. Moved here from e2e/flows/manual/join.spec.ts
 * item 8 (the testimonial slot) and extended: the order is SPEC §1, the removed
 * sections stay removed, and the closing band is the one that meets the footer.
 */
describe("MEH-2799 · /join v2 structure", () => {
  const ORDER = [
    "join-hero",
    "join-photo",
    "join-draft",
    "join-video",
    "join-features",
    "join-how",
    "join-prepare",
    "join-faq",
    "join-closing",
    "join-sticky-bar",
  ];

  it("renders the sections in SPEC order", async () => {
    const { container } = render(await JoinPage({ params: Promise.resolve({ locale: "he" }) }));
    const ids = [...container.querySelectorAll("[data-testid]")]
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => ORDER.includes(id));
    expect(ids).toEqual(ORDER);
  });

  it("the testimonial slot and the duplicate introduction card are gone", async () => {
    render(await JoinPage({ params: Promise.resolve({ locale: "he" }) }));
    expect(screen.getByTestId("join-faq")).toBeTruthy(); // control: the page rendered
    expect(screen.queryByTestId("join-testimonial")).toBeNull();
    expect(screen.queryByTestId("join-card")).toBeNull();
  });

  it("only the closing band meets the footer, and it is the sticky bar's stop marker", async () => {
    const { container } = render(await JoinPage({ params: Promise.resolve({ locale: "he" }) }));
    const meets = container.querySelectorAll("[data-meets-footer]");
    expect(meets).toHaveLength(1);
    expect(meets[0].getAttribute("data-testid")).toBe("join-closing");
    expect(meets[0].hasAttribute("data-join-closing")).toBe(true);
    expect(container.querySelectorAll("[data-join-hero-cta]")).toHaveLength(1);
  });

  it("the FAQ has four questions, the first one the locked cost answer", async () => {
    render(await JoinPage({ params: Promise.resolve({ locale: "he" }) }));
    const items = screen.getAllByTestId("join-faq-item");
    expect(items).toHaveLength(4);
    // getTranslations is mocked to echo the key, so this pins WHICH key renders.
    expect(items[0].textContent).toContain("faq.a_cost");
  });

  it("both videos are click-to-play: native controls, preload none, never autoplay", async () => {
    const { container } = render(await JoinPage({ params: Promise.resolve({ locale: "he" }) }));
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video.hasAttribute("controls")).toBe(true);
      expect(video.getAttribute("preload")).toBe("none");
      expect(video.hasAttribute("autoplay")).toBe(false);
      expect(video.getAttribute("src")).toMatch(/^\/images\/join\/video-(page|signup)\.mp4$/);
    }
    expect(screen.getAllByTestId("join-sample-label")).toHaveLength(2);
  });
});
