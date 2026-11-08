/**
 * MEH-2833 PR 3 (seed layer, board 2) — in the business guides, a section
 * break between two parts is a small centred bloom (the dinkus), not a
 * hairline. Phase 0: the guides' `hr` blocks are the only true prose section
 * breaks on the long-form pages (/about's and /why-local's hairlines belong to
 * chapter and numeral labels, not breaks).
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns) => createTranslator({ locale: "he", messages: he, namespace: ns }),
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import GuideArticle from "@/components/GuideArticle";
import { SEED_FILLS } from "@/lib/brand-seeds";

const BLOCKS = [
  { type: "p", text: "פסקה ראשונה" },
  { type: "hr" },
  { type: "h3", text: "חלק שני" },
  { type: "p", text: "פסקה שנייה" },
  { type: "hr" },
  { type: "h3", text: "חלק שלישי" },
];

describe("guide section break = seed dinkus", () => {
  it("each hr block renders a centred 28px bloom, aria-hidden, py-7; no <hr> rule", async () => {
    const { container } = render(await GuideArticle({ title: "T", subtitle: null, readMinutes: 3, blocks: BLOCKS }));
    const marks = container.querySelectorAll('[data-testid="seed-dinkus"]');
    expect(marks).toHaveLength(2);
    for (const m of marks) {
      expect(m.getAttribute("aria-hidden")).toBe("true");
      expect(m.className).toMatch(/\bflex justify-center py-7\b/);
      // the next block's top margin is evened out, so the mark sits midway
      expect(m.className).toContain("[&+*]:mt-4");
      const svg = m.querySelector("svg[data-seed-mark]");
      expect(svg.getAttribute("width")).toBe("28");
      expect([...svg.querySelectorAll("[data-seed]")].map((p) => p.getAttribute("fill"))).toEqual(SEED_FILLS);
      // the next titled part follows the mark
      expect(m.nextElementSibling.tagName).toBe("H3");
    }
    expect(container.querySelector("article hr, section hr")).toBeNull();
  });
});
