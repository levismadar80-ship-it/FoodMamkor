// MEH-2233: the inline guest redirect on /favorites must land where the
// client redirect (loginHrefBackHere) does, and must leave a stored session alone.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GUEST_TO_LOGIN_SCRIPT } from "@/lib/guest-to-login-inline";
import { loginHrefBackHere } from "@/lib/safe-redirect";

function runScript({ token, pathname, search }) {
  const replace = vi.fn();
  const storage = { getItem: (k) => (k === "token" ? token : null) };
  const loc = { pathname, search, replace };
  // eslint-disable-next-line no-new-func
  new Function("localStorage", "location", GUEST_TO_LOGIN_SCRIPT)(storage, loc);
  return replace;
}

afterEach(() => window.history.replaceState(null, "", "/"));

describe("guest-to-login inline script (MEH-2233)", () => {
  const cases = [
    { pathname: "/favorites", search: "" },
    { pathname: "/en/favorites", search: "" },
    { pathname: "/favorites", search: "?tab=events&x=%D7%90" },
  ];
  for (const c of cases) {
    it(`a guest on ${c.pathname}${c.search} goes where loginHrefBackHere sends her`, () => {
      window.history.replaceState(null, "", c.pathname + c.search);
      const replace = runScript({ token: null, ...c });
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace.mock.calls[0][0]).toBe(loginHrefBackHere());
    });
  }

  it("a stored token stays on the page", () => {
    const replace = runScript({ token: "abc", pathname: "/favorites", search: "" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("blocked storage stays on the page (the client check decides)", () => {
    const replace = vi.fn();
    const storage = { getItem: () => { throw new Error("SecurityError"); } };
    // eslint-disable-next-line no-new-func
    new Function("localStorage", "location", GUEST_TO_LOGIN_SCRIPT)(storage, { pathname: "/favorites", search: "", replace });
    expect(replace).not.toHaveBeenCalled();
  });

  it("the /favorites page renders the script", () => {
    const src = readFileSync(join(__dirname, "..", "app", "[locale]", "favorites", "page.js"), "utf8");
    expect(src).toMatch(/__html:\s*GUEST_TO_LOGIN_SCRIPT/);
  });
});
