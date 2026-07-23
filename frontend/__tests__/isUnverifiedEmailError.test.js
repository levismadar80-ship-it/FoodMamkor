import { describe, it, expect } from "vitest";
import { isUnverifiedEmailError, EMAIL_UNVERIFIED_CODE } from "@/lib/errors";

// MEH-1164 sub-chunk B — the 403 detector that gates the resend CTA. Prefers
// the structured `detail.code`, falls back to the legacy bare-string detail,
// and returns false for anything else (so callers keep their existing path).

const err = (status, detail) => ({ response: { status, data: { detail } } });

describe("isUnverifiedEmailError (MEH-1164 B)", () => {
  it("matches the structured {code, message} 403 detail", () => {
    expect(
      isUnverifiedEmailError(
        err(403, { code: EMAIL_UNVERIFIED_CODE, message: "יש לאמת את כתובת האימייל תחילה" })
      )
    ).toBe(true);
  });

  it("matches on code even if the message copy changes", () => {
    expect(isUnverifiedEmailError(err(403, { code: EMAIL_UNVERIFIED_CODE, message: "anything" }))).toBe(true);
  });

  it("falls back to the legacy bare Hebrew string detail", () => {
    expect(isUnverifiedEmailError(err(403, "יש לאמת את כתובת האימייל תחילה"))).toBe(true);
  });

  it("is false for a different 403 (role error)", () => {
    expect(isUnverifiedEmailError(err(403, "Producer access required"))).toBe(false);
  });

  it("is false for a 403 with a different code", () => {
    expect(isUnverifiedEmailError(err(403, { code: "something_else", message: "x" }))).toBe(false);
  });

  it("is false for the same detail on a non-403 status", () => {
    expect(isUnverifiedEmailError(err(400, { code: EMAIL_UNVERIFIED_CODE }))).toBe(false);
  });

  it("is false for a 422 array detail", () => {
    expect(isUnverifiedEmailError(err(422, [{ msg: "bad" }]))).toBe(false);
  });

  it("is false for a missing / malformed error", () => {
    expect(isUnverifiedEmailError(undefined)).toBe(false);
    expect(isUnverifiedEmailError({})).toBe(false);
    expect(isUnverifiedEmailError(err(403, undefined))).toBe(false);
  });
});
