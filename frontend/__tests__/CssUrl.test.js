/**
 * lib/css-url.js — an owner-supplied picture URL stays inside one quoted
 * CSS url(): quotes, parentheses, backslashes and spaces are escaped, and
 * control characters are dropped (reviews #3811, #3815).
 */
import { describe, it, expect } from "vitest";
import { cssUrl } from "@/lib/css-url";

describe("cssUrl", () => {
  it("a plain URL is quoted as-is", () => {
    expect(cssUrl("https://res.cloudinary.com/x/a.jpg")).toBe('url("https://res.cloudinary.com/x/a.jpg")');
  });

  it.each([
    ['a")b', 'url("a\\")b")'],
    ["a\\b", 'url("a\\\\b")'],
    ["a b", 'url("a b")'],
  ])("%s stays inside one string", (src, want) => {
    expect(cssUrl(src)).toBe(want);
  });

  it("control characters are dropped, not written as JSON escapes CSS can't read", () => {
    expect(cssUrl("a\nb\tc\u007fd")).toBe('url("abcd")');
  });
});
