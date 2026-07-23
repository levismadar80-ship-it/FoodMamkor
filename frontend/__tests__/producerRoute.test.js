import { describe, it, expect } from "vitest";
import { isProducerDetail } from "@/lib/producer-route";

// MEH-1202: shared route helper — the /producer/[id] public leaf, excluding
// the /producer/dashboard owner subtree. Gates the chat FAB (ChatWidgetLazy)
// and BottomNav. Callers pass a locale-stripped pathname.
describe("isProducerDetail", () => {
  it("matches the public producer detail leaf", () => {
    expect(isProducerDetail("/producer/123")).toBe(true);
    expect(isProducerDetail("/producer/ruach-hasadeh")).toBe(true);
  });

  it("excludes the dashboard owner subtree", () => {
    expect(isProducerDetail("/producer/dashboard")).toBe(false);
    expect(isProducerDetail("/producer/dashboard/edit")).toBe(false);
  });

  it("excludes nested public sub-routes (leaf-only $ anchor)", () => {
    expect(isProducerDetail("/producer/123/reviews")).toBe(false);
  });

  it("excludes other routes and empty/nullish input", () => {
    expect(isProducerDetail("/")).toBe(false);
    expect(isProducerDetail("/map")).toBe(false);
    expect(isProducerDetail("/producers")).toBe(false);
    expect(isProducerDetail("")).toBe(false);
    expect(isProducerDetail(null)).toBe(false);
    expect(isProducerDetail(undefined)).toBe(false);
  });
});
