// MEH-1943 — errorMessage renders `error.api.<code>` for a coded backend
// detail by default, so a caller needs no mapper of its own. The fallback is
// the backend's `message`, which is the same sentence (backend-error-copy
// guard E2). These go red if `errorMessage` stops defaulting the resolver.
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";
import { errorMessage, defaultCodeResolver } from "@/lib/errors";

function makeT(messages) {
  const lookup = (key) => key.split(".").reduce((o, k) => o?.[k], messages);
  const t = (key, params = {}) => {
    const s = lookup(key);
    if (typeof s !== "string") throw new Error(`missing ${key}`);
    return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
  };
  t.has = (key) => typeof lookup(key) === "string";
  return t;
}

const err = (detail, status = 422) => ({ response: { status, data: { detail } } });

describe("errorMessage — error.api.<code> by default (MEH-1943)", () => {
  it("renders the translated copy, not the backend message", () => {
    const t = makeT({ api: { badge_request_pending: "COPY FROM JSON" }, mapper: {} });
    const out = errorMessage(
      err({ code: "badge_request_pending", message: "backend sentence", params: {} }, 409),
      t,
    );
    expect(out).toBe("COPY FROM JSON");
  });

  it("fills params into the copy", () => {
    const t = makeT({ api: { left: "נשארו {left}" } });
    expect(errorMessage(err({ code: "left", message: "x", params: { left: 2 } }), t)).toBe("נשארו 2");
  });

  it("falls back to message for a code with no key", () => {
    const t = makeT({ api: {} });
    expect(errorMessage(err({ code: "nope", message: "backend sentence" }), t)).toBe("backend sentence");
  });

  it("a translator without has() keeps the old path (message)", () => {
    const t = (k) => k;
    expect(defaultCodeResolver(t)).toBeUndefined();
    expect(errorMessage(err({ code: "x", message: "backend sentence" }), t)).toBe("backend sentence");
  });

  it("a caller's own resolver still wins", () => {
    const t = makeT({ api: { c: "json" } });
    expect(errorMessage(err({ code: "c", message: "m" }), t, () => "mine")).toBe("mine");
  });

  it("every error.api key in he.json is a non-empty string", () => {
    const keys = Object.keys(he.error.api);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(he.error.api[k]).toMatch(/[֐-׿]/);
  });
});
