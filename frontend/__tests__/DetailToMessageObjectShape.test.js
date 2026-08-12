/**
 * MEH-1943 chunk A — `detailToMessage` must accept the `{code, message, params}`
 * detail shape, not just strings and Pydantic arrays.
 *
 * Before: every object detail hit the trailing `return null`, so a caller fell
 * through to its own generic copy and the backend's perfectly good `message`
 * was discarded. That made the object contract expensive to adopt — converting
 * a router made its errors LESS specific until every consumer was updated,
 * which is the opposite of what Expand-Contract is supposed to feel like.
 *
 * These assert the FUNCTION'S BEHAVIOUR for each detail shape (ADR-032 §3.6),
 * not that a particular branch was written.
 *
 * DISCRIMINATION, stated precisely because "the suite went red" is not by
 * itself evidence: against the pre-chunk-A implementation **9 of these 23
 * fail** — every case in the two "object detail" describe blocks that asserts
 * a non-null result, plus the three `errorMessage` ones. The remaining 14 pass
 * on BOTH versions and are therefore controls, not evidence:
 *   - the string/array/nullish block — unchanged behaviour, guarding against
 *     this change breaking what already worked;
 *   - the "what must NOT be shown to a user" block — the old code returned
 *     `null` for every object, so it satisfied these vacuously. They exist to
 *     stop the NEW code regressing into leaking `code`, which is a real risk
 *     only now that the object branch renders anything at all.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/toast", () => ({
  showToast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import {
  detailToMessage,
  errorMessage,
  EMAIL_UNVERIFIED_CODE,
  LOCATION_SAME_CITY_CODE,
} from "@/lib/errors";

describe("MEH-1943 — the shapes that already worked keep working", () => {
  it("string detail is returned as-is", () => {
    expect(detailToMessage("יש לאמת את כתובת האימייל תחילה")).toBe(
      "יש לאמת את כתובת האימייל תחילה"
    );
  });

  it("empty string -> null (caller uses its own copy)", () => {
    expect(detailToMessage("")).toBeNull();
  });

  it("Pydantic 422 array is joined and the prefix stripped", () => {
    expect(
      detailToMessage([
        { msg: "Value error, שם חייב לכלול שלוש אותיות" },
        { msg: "Value error, מחיר חייב להיות חיובי" },
      ])
    ).toBe("שם חייב לכלול שלוש אותיות · מחיר חייב להיות חיובי");
  });

  it("a passed resolver does NOT hijack the string or array shapes", () => {
    const resolve = vi.fn(() => "SHOULD NOT BE USED");
    expect(detailToMessage("טקסט מהשרת", resolve)).toBe("טקסט מהשרת");
    expect(detailToMessage([{ msg: "שגיאה" }], resolve)).toBe("שגיאה");
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 42, true])("%s -> null", (input) => {
    expect(detailToMessage(input)).toBeNull();
  });
});

describe("MEH-1943 — object detail: known code prefers the params-driven mapping", () => {
  // OLD BEHAVIOUR: null. This is the case the ticket's contract is built for —
  // the copy lives in messages/*.json and `params` names the facts.
  it("known code + resolver -> the resolver's string wins over `message`", () => {
    const detail = {
      code: LOCATION_SAME_CITY_CODE,
      message: "יש לך כבר מיקום ביישוב הזה",
      params: { city: "חיפה", existing_label: "הדוכן בשוק", existing_count: 1 },
    };
    const resolve = (code, params) =>
      code === LOCATION_SAME_CITY_CODE
        ? `יש לך כבר '${params.existing_label}' ב${params.city}.`
        : null;

    expect(detailToMessage(detail, resolve)).toBe("יש לך כבר 'הדוכן בשוק' בחיפה.");
  });

  it("the resolver receives the code and the params verbatim", () => {
    const resolve = vi.fn(() => "ok");
    const params = { city: "חיפה", existing_count: 2 };
    detailToMessage({ code: LOCATION_SAME_CITY_CODE, message: "m", params }, resolve);
    expect(resolve).toHaveBeenCalledWith(LOCATION_SAME_CITY_CODE, params);
  });

  it("a code with no params hands the resolver {} rather than undefined", () => {
    const resolve = vi.fn(() => "ok");
    detailToMessage({ code: EMAIL_UNVERIFIED_CODE, message: "m" }, resolve);
    expect(resolve).toHaveBeenCalledWith(EMAIL_UNVERIFIED_CODE, {});
  });
});

describe("MEH-1943 — object detail: unknown code falls back, never to null", () => {
  // OLD BEHAVIOUR: null for all three.
  it("unknown code + resolver that declines -> the backend `message`", () => {
    const detail = { code: "some_future_code", message: "הודעה מהשרת" };
    const resolve = (code) => (code === LOCATION_SAME_CITY_CODE ? "nope" : null);
    expect(detailToMessage(detail, resolve)).toBe("הודעה מהשרת");
  });

  it("no resolver at all -> the backend `message` (the core regression fixed here)", () => {
    expect(
      detailToMessage({ code: EMAIL_UNVERIFIED_CODE, message: "יש לאמת את המייל" })
    ).toBe("יש לאמת את המייל");
  });

  it("a throwing resolver falls through to `message` instead of crashing", () => {
    // A caller's next-intl t() throws on a missing key. This helper runs INSIDE
    // catch blocks and errorMessage() promises never to return undefined, so a
    // throwing resolver must degrade, not propagate: one absent i18n key would
    // otherwise turn a handled API error into an unhandled crash in the error
    // handler itself. (CI reviewer finding on PR #2833 — an earlier version of
    // this function let it propagate, and this test asserted that it did.)
    const detail = { code: "x", message: "הודעה מהשרת" };
    const resolve = () => {
      throw new Error("missing i18n key");
    };
    expect(detailToMessage(detail, resolve)).toBe("הודעה מהשרת");
  });

  it("a throwing resolver with no message yields null, still not a crash", () => {
    const resolve = () => {
      throw new Error("missing i18n key");
    };
    expect(detailToMessage({ code: "x" }, resolve)).toBeNull();
  });

  it("errorMessage stays total when the resolver throws — the invariant that matters", () => {
    // errorMessage's contract is "never returns undefined / empty string".
    // A resolver blowing up must not break it.
    const t = (key) => `t:${key}`;
    const resolve = () => {
      throw new Error("missing i18n key");
    };
    const out = errorMessage(
      { response: { status: 403, data: { detail: { code: "x", message: "הודעה מהשרת" } } } },
      t,
      resolve
    );
    expect(out).toBe("הודעה מהשרת");

    const outNoMessage = errorMessage(
      { response: { status: 403, data: { detail: { code: "x" } } } },
      t,
      resolve
    );
    expect(outNoMessage).toBe("t:mapper.forbidden");
  });
});

describe("MEH-1943 — object detail: what must NOT be shown to a user", () => {
  it("a code with no message and no resolver hit -> null, NOT the raw code", () => {
    // Returning `code` would print `location_same_city_needs_label` on screen —
    // defect #3 in the ticket (internal enum values leaking to the owner).
    const out = detailToMessage({ code: LOCATION_SAME_CITY_CODE, params: { city: "חיפה" } });
    expect(out).toBeNull();
    expect(out).not.toBe(LOCATION_SAME_CITY_CODE);
  });

  it("an empty message is treated as no message", () => {
    expect(detailToMessage({ code: "x", message: "" })).toBeNull();
  });

  it("a non-string message is never returned as-is", () => {
    expect(detailToMessage({ code: "x", message: { nested: "oops" } })).toBeNull();
  });
});

describe("MEH-1943 — errorMessage inherits the expand", () => {
  const t = (key) => `t:${key}`;
  const err = (status, detail) => ({ response: { status, data: { detail } } });

  // OLD BEHAVIOUR: "t:mapper.forbidden" — the object collapsed to generic copy.
  it("403 with an object detail now surfaces the backend message", () => {
    expect(
      errorMessage(err(403, { code: EMAIL_UNVERIFIED_CODE, message: "יש לאמת את המייל" }), t)
    ).toBe("יש לאמת את המייל");
  });

  it("422 with an object detail + resolver surfaces the params-driven copy", () => {
    const resolve = (code, params) =>
      code === LOCATION_SAME_CITY_CODE ? `כבר יש לך מיקום ב${params.city}` : null;
    expect(
      errorMessage(
        err(422, {
          code: LOCATION_SAME_CITY_CODE,
          message: "גיבוי",
          params: { city: "חיפה" },
        }),
        t,
        resolve
      )
    ).toBe("כבר יש לך מיקום בחיפה");
  });

  it("a textless object detail still yields the mapped generic copy", () => {
    expect(errorMessage(err(400, { code: "x" }), t)).toBe("t:mapper.bad_request");
  });

  it("unchanged: 401/429/5xx never consult the detail", () => {
    expect(errorMessage(err(401, { message: "ignored" }), t)).toBe("t:mapper.unauthorized");
    expect(errorMessage(err(429, { message: "ignored" }), t)).toBe("t:mapper.rate_limited");
    expect(errorMessage(err(503, { message: "ignored" }), t)).toBe("t:mapper.server");
  });
});
