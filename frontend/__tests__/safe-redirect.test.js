// MEH-810: open-redirect guard for the post-login ?redirect= param.
import { describe, it, expect } from "vitest";
import { safeInternalRedirect, loginHrefBackHere, loginLinkFor } from "@/lib/safe-redirect";

describe("safeInternalRedirect (MEH-810)", () => {
  it("passes through internal same-origin paths", () => {
    expect(safeInternalRedirect("/")).toBe("/");
    expect(safeInternalRedirect("/producer/42")).toBe("/producer/42");
    expect(safeInternalRedirect("/experiences/new")).toBe("/experiences/new");
    expect(safeInternalRedirect("/producers?q=bread")).toBe("/producers?q=bread");
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

describe("loginHrefBackHere (MEH-2982)", () => {
  it("carries the current path AND query, encoded", () => {
    window.history.pushState({}, "", "/en/events/5?from=map");
    expect(loginHrefBackHere()).toBe("/en/login?redirect=%2Fen%2Fevents%2F5%3Ffrom%3Dmap");
    window.history.pushState({}, "", "/");
  });

  it("a Hebrew page (no prefix) gets the Hebrew login, and /english is not /en", () => {
    window.history.pushState({}, "", "/favorites");
    expect(loginHrefBackHere()).toBe("/login?redirect=%2Ffavorites");
    window.history.pushState({}, "", "/english-breakfast");
    expect(loginHrefBackHere()).toBe("/login?redirect=%2Fenglish-breakfast");
    window.history.pushState({}, "", "/en");
    expect(loginHrefBackHere()).toBe("/en/login?redirect=%2Fen");
    window.history.pushState({}, "", "/");
  });

  it("round-trips through the clamp the login page applies", () => {
    window.history.pushState({}, "", "/he/favorites");
    const raw = new URL(loginHrefBackHere(), "https://x.test").searchParams.get("redirect");
    expect(safeInternalRedirect(raw)).toBe("/he/favorites");
    window.history.pushState({}, "", "/");
  });
});

// MEH-3026 (F2): the «כניסה» link in the account sheet and the header was a
// bare /login, so a guest who signed in from a business page landed on the
// home page and lost her place.
describe("loginLinkFor — the login LINK that returns a guest to her page", () => {
  it("carries the page she is on", () => {
    expect(loginLinkFor("/ruach-hasadeh")).toBe("/login?redirect=%2Fruach-hasadeh");
    expect(loginLinkFor("/map?city=x")).toBe("/login?redirect=%2Fmap%3Fcity%3Dx");
  });

  it("stays a bare /login where there is nowhere to return to", () => {
    for (const path of ["/", "", null, undefined, "/login", "/login?redirect=%2Fa", "/register", "/register/producer", "/verify-email", "/reset-password"]) {
      expect(loginLinkFor(path)).toBe("/login");
    }
  });

  it("round-trips through the clamp the login page applies", () => {
    const raw = new URL(loginLinkFor("/producers?q=1"), "https://x.test").searchParams.get("redirect");
    expect(safeInternalRedirect(raw)).toBe("/producers?q=1");
  });
});
