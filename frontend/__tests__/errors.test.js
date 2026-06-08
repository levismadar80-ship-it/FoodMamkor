/**
 * MEH-251 — errorMessage() mapper contract.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { errorMessage, showErrorToast } from "../lib/errors";
import { showToast } from "../lib/toast";

// MEH-685: methods-only toast object.
vi.mock("../lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("errorMessage", () => {
  it("returns offline copy when navigator.onLine is false", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const msg = errorMessage({ message: "Network Error" });
    expect(msg).toContain("אין חיבור");
  });

  it("returns timeout copy for ECONNABORTED", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const msg = errorMessage({ code: "ECONNABORTED" });
    expect(msg).toContain("זמן");
  });

  it("returns 429-specific copy", () => {
    const msg = errorMessage({ response: { status: 429, data: {} } });
    expect(msg).toContain("יותר מדי");
  });

  it("returns session-expired copy on 401", () => {
    const msg = errorMessage({ response: { status: 401, data: {} } });
    expect(msg).toContain("הסשן שלך פג");
  });

  it("returns server-unavailable copy on 500", () => {
    const msg = errorMessage({ response: { status: 500, data: {} } });
    expect(msg).toContain("לא זמין");
  });

  it("prefers server-side Hebrew detail on 400", () => {
    const msg = errorMessage({
      response: { status: 400, data: { detail: "הסיסמה קצרה מדי" } },
    });
    expect(msg).toBe("הסיסמה קצרה מדי");
  });

  it("falls back to generic copy on 400 without detail", () => {
    const msg = errorMessage({ response: { status: 400, data: {} } });
    expect(msg).toContain("לא תקינים");
  });

  it("never returns empty or undefined", () => {
    expect(errorMessage({})).toBeTruthy();
    expect(errorMessage(null)).toBeTruthy();
    expect(errorMessage(new Error("boom"))).toBeTruthy();
  });
});

describe("showErrorToast — semantic dispatch (MEH-685)", () => {
  it("routes a known type to that toast method", () => {
    showErrorToast({ response: { status: 500, data: {} } }, "error");
    expect(showToast.error).toHaveBeenCalledWith(expect.stringContaining("לא זמין"));
  });

  it("defaults to error when no type is passed", () => {
    showErrorToast({ response: { status: 429, data: {} } });
    expect(showToast.error).toHaveBeenCalledWith(expect.stringContaining("יותר מדי"));
  });

  it("falls back to info for an unexpected type (no crash)", () => {
    expect(() =>
      showErrorToast({ response: { status: 500, data: {} } }, "warning"),
    ).not.toThrow();
    expect(showToast.info).toHaveBeenCalledWith(expect.any(String));
  });
});
