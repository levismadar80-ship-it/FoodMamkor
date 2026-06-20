/**
 * MEH-251 — errorMessage() mapper contract.
 * MEH-848 — copy moved to i18n; errorMessage(err, t) takes an `error`-scoped
 * translator. The stub `t` returns the key path so each test asserts WHICH
 * message key the mapper selects for a given error shape.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { errorMessage, showErrorToast } from "../lib/errors";
import { showToast } from "../lib/toast";

// MEH-685: methods-only toast object.
vi.mock("../lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Stand-in for useTranslations("error") — identity over the key path.
const t = (key) => key;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("errorMessage", () => {
  it("maps offline when navigator.onLine is false", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(errorMessage({ message: "Network Error" }, t)).toBe("mapper.offline");
  });

  it("maps timeout for ECONNABORTED", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(errorMessage({ code: "ECONNABORTED" }, t)).toBe("mapper.timeout");
  });

  it("maps network for a responseless error", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(errorMessage({ message: "boom" }, t)).toBe("mapper.network");
  });

  it("maps rate_limited on 429", () => {
    expect(errorMessage({ response: { status: 429, data: {} } }, t)).toBe("mapper.rate_limited");
  });

  it("maps unauthorized on 401", () => {
    expect(errorMessage({ response: { status: 401, data: {} } }, t)).toBe("mapper.unauthorized");
  });

  it("maps server on 500", () => {
    expect(errorMessage({ response: { status: 500, data: {} } }, t)).toBe("mapper.server");
  });

  it("prefers server-side detail on 400", () => {
    const msg = errorMessage(
      { response: { status: 400, data: { detail: "הסיסמה קצרה מדי" } } },
      t,
    );
    expect(msg).toBe("הסיסמה קצרה מדי");
  });

  it("maps bad_request on 400 without detail", () => {
    expect(errorMessage({ response: { status: 400, data: {} } }, t)).toBe("mapper.bad_request");
  });

  it("falls back to generic for an unmapped status", () => {
    expect(errorMessage({ response: { status: 418, data: {} } }, t)).toBe("generic");
  });

  it("never returns empty or undefined", () => {
    expect(errorMessage({}, t)).toBeTruthy();
    expect(errorMessage(null, t)).toBeTruthy();
    expect(errorMessage(new Error("boom"), t)).toBeTruthy();
  });
});

describe("showErrorToast — semantic dispatch (MEH-685)", () => {
  it("routes a known type to that toast method", () => {
    showErrorToast({ response: { status: 500, data: {} } }, t, "error");
    expect(showToast.error).toHaveBeenCalledWith("mapper.server");
  });

  it("defaults to error when no type is passed", () => {
    showErrorToast({ response: { status: 429, data: {} } }, t);
    expect(showToast.error).toHaveBeenCalledWith("mapper.rate_limited");
  });

  it("falls back to info for an unexpected type (no crash)", () => {
    expect(() =>
      showErrorToast({ response: { status: 500, data: {} } }, t, "warning"),
    ).not.toThrow();
    expect(showToast.info).toHaveBeenCalledWith(expect.any(String));
  });
});
