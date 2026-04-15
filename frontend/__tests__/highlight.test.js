import { describe, it, expect } from "vitest";
import { highlightMatch } from "@/lib/highlight";

describe("highlightMatch", () => {
  it("returns [text] when query is empty", () => {
    expect(highlightMatch("שלום", "")).toEqual(["שלום"]);
    expect(highlightMatch("שלום", null)).toEqual(["שלום"]);
    expect(highlightMatch("שלום", undefined)).toEqual(["שלום"]);
  });

  it("returns [] when text is empty", () => {
    expect(highlightMatch("", "abc")).toEqual([]);
    expect(highlightMatch(null, "abc")).toEqual([]);
  });

  it("returns [text] when there's no match", () => {
    expect(highlightMatch("שלום", "xyz")).toEqual(["שלום"]);
  });

  it("wraps a single match in {match}", () => {
    expect(highlightMatch("שוק רחובות", "רח")).toEqual([
      "שוק ",
      { match: "רח" },
      "ובות",
    ]);
  });

  it("wraps multiple occurrences", () => {
    expect(highlightMatch("aaa bbb aaa", "aaa")).toEqual([
      { match: "aaa" },
      " bbb ",
      { match: "aaa" },
    ]);
  });

  it("is case-insensitive but preserves original casing in the match", () => {
    expect(highlightMatch("Tel Aviv", "aviv")).toEqual([
      "Tel ",
      { match: "Aviv" },
    ]);
  });

  it("handles a match at the start", () => {
    expect(highlightMatch("שלום עולם", "שלום")).toEqual([
      { match: "שלום" },
      " עולם",
    ]);
  });

  it("handles a match at the end", () => {
    expect(highlightMatch("שלום עולם", "עולם")).toEqual([
      "שלום ",
      { match: "עולם" },
    ]);
  });

  it("trims whitespace in the query", () => {
    expect(highlightMatch("שלום", "  שלום  ")).toEqual([{ match: "שלום" }]);
  });

  it("stringifies non-string input", () => {
    expect(highlightMatch(42, "4")).toEqual([String(42)]);
  });
});
