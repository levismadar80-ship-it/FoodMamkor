/**
 * MEH-2772 — the guide shell's eyebrow, byline and back link come from
 * messages/{he,en}.json (guides.article), and the eyebrow addresses business
 * owners gender-neutrally (ADR-037): «לבעלי עסקים», not «לבעלות עסק».
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({ messages: null, locale: "he" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns) => createTranslator({ locale: h.locale, messages: h.messages, namespace: ns }),
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import GuideArticle from "@/components/GuideArticle";

async function renderGuide(locale, messages) {
  h.locale = locale;
  h.messages = messages;
  const ui = await GuideArticle({ title: "T", subtitle: null, readMinutes: 4, blocks: [] });
  return render(ui);
}

describe("GuideArticle shell copy", () => {
  it("he: neutral eyebrow with the minutes, byline and back link from messages", async () => {
    await renderGuide("he", he);
    expect(screen.getByText("מדריך לבעלי עסקים · קריאה כ-4 דקות")).toBeTruthy();
    expect(screen.queryByText(/לבעלות עסק/)).toBeNull();
    expect(screen.getByText(he.guides.article.back)).toBeTruthy();
    expect(screen.getByText(he.guides.article.founder_name)).toBeTruthy();
  });

  it("en: the shell is English, not Hebrew", async () => {
    await renderGuide("en", en);
    expect(screen.getByText(en.guides.article.eyebrow.replace("{minutes}", "4"))).toBeTruthy();
    expect(screen.getByText(en.guides.article.back)).toBeTruthy();
    expect(screen.queryByText("חזרה למדריכים")).toBeNull();
  });
});
