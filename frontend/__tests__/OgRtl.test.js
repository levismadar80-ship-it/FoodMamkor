/**
 * MEH-3329 — Hebrew for Satori, which has no bidi. Spike 16/11: plain Hebrew
 * renders reversed («מאפייה» → «הייפאמ»), so each word is handed over in
 * visual order and the words are placed by a row-reverse flex line.
 */
import { describe, it, expect } from "vitest";
import { visualWord, visualWords, rtlLine } from "@/lib/og-rtl";
import { metaLine } from "@/lib/og-producer-card";

describe("MEH-3329 og-rtl", () => {
  it("a Hebrew word is reversed into drawing order", () => {
    expect(visualWord("מאפייה")).toBe("הייפאמ");
  });
  it("a Latin / digit run inside keeps its own order", () => {
    expect(visualWord("1948")).toBe("1948");
    expect(visualWord("Bio")).toBe("Bio");
    expect(visualWord("ב-1948")).toBe("1948-ב");
  });
  it("words stay in reading order — the flex line, not the string, reverses them", () => {
    expect(visualWords("רוח  השדה ")).toEqual(["חור", "הדשה"]);
  });
  it("rtlLine is a row-reverse wrapping line with one span per word", () => {
    const el = rtlLine("מאפיית רוח השדה");
    expect(el.props.style.flexDirection).toBe("row-reverse");
    expect(el.props.style.flexWrap).toBe("wrap");
    expect(el.props.children.map((c) => c.props.children)).toEqual(["תייפאמ", "חור", "הדשה"]);
  });
  it("type · city, either may be missing", () => {
    expect(metaLine({ type: "מאפייה", city: "חיפה" })).toBe("מאפייה · חיפה");
    expect(metaLine({ type: "", city: "חיפה" })).toBe("חיפה");
    expect(metaLine({})).toBe("");
  });
});
