// MEH-810: open-redirect guard for the post-login ?redirect= param.
import { describe, it, expect } from "vitest";
import { safeInternalRedirect } from "@/lib/safe-redirect";

describe("safeInternalRedirect (MEH-810)", () => {
  it("passes through internal same-origin paths", () => {
    expect(safeInternalRedirect("/")).toBe("/");
    expect(safeInternalRedirect("/producer/42")).toBe("/producer/42");
    expect(safeInternalRedirect("/experiences/new")).toBe("/experiences/new");
    expect(safeInternalRedirect("/search?q=bread")).toBe("/search?q=bread");
  });

  it("rejects off-site / hostile targets → fallback", () => {
    for (const hostile of [
      "https://evil.com", // absolute
      "http://evil.com",
      "//evil.com", // protocol-relative
      "/\\evil.com", // backslash fold to //
      "/\t/evil.com".replace("\t", "\\"), // defensive: leading /\
      "javascript:alert(1)", // scheme, no leading slash
      "evil.com", // no leading slash
      "", // empty
    ]) {
      expect(safeInternalRedirect(hostile)).toBe("/");
    }
  });

  it("handles non-string input and honours a custom fallback", () => {
    expect(safeInternalRedirect(null)).toBe("/");
    expect(safeInternalRedirect(undefined)).toBe("/");
    expect(safeInternalRedirect("https://evil.com", "/login")).toBe("/login");
    expect(safeInternalRedirect("/ok", "/login")).toBe("/ok");
  });
});
