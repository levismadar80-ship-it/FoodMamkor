// MEH-3608: the bold-match helper's unit test. It used to cover a dead copy
// (lib/highlight.js, deleted); this one runs the helper the site imports
// (components/ProducerCard.jsx, components/HeroSearch.jsx).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { highlightMatch } from "@/lib/highlight-match";

const html = (node) => render(<span>{node}</span>).container.innerHTML;

describe("highlightMatch", () => {
  it("returns the text untouched when the query is empty", () => {
    expect(highlightMatch("שלום", "")).toBe("שלום");
    expect(highlightMatch("שלום", null)).toBe("שלום");
  });

  it("returns the text untouched when there is no match", () => {
    expect(html(highlightMatch("שלום", "xyz"))).toBe("<span>שלום</span>");
  });

  it("wraps every match in <mark>, case-insensitively", () => {
    const out = html(highlightMatch("Honey and HONEY", "honey"));
    expect(out.match(/<mark[^>]*>/g)).toHaveLength(2);
    expect(out).toContain(">Honey</mark>");
    expect(out).toContain(">HONEY</mark>");
  });

  it("treats regex characters in the query as text", () => {
    expect(html(highlightMatch("a.b axb", "a.b")).match(/<mark/g)).toHaveLength(1);
  });

  it("inverted: the typed part is regular, the rest bold", () => {
    const out = html(highlightMatch("גבינות", "גבינ", { inverted: true }));
    expect(out).toContain('<span class="font-normal">גבינ</span>');
    expect(out).toContain('<span class="font-bold">ות</span>');
  });
});
