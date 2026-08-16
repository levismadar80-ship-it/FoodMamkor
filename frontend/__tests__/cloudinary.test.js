// MEH-788: coverage for the optimizeCloudinary `width` branch (and the
// pre-existing paths it must not disturb). The helper is consumed by 9+
// call sites that mostly mock it in component tests, so the URL-building
// logic itself had zero regression coverage before this file.
//
// MEH-2001: the width is no longer opt-in. A call with no usable `width`
// now falls back to DEFAULT_MAX_WIDTH on the c_limit path, so an
// un-audited call site can never ship the full original. The assertions
// that previously expected a bare `f_auto,q_auto` for a width-less call
// were updated in place — they encoded the uncapped default that caused
// the suspension, not a behaviour worth preserving.
import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_WIDTH, optimizeCloudinary } from "@/lib/cloudinary";

const BASE = "https://res.cloudinary.com/demo/image/upload/v1/foo.jpg";
const CAPPED =
  "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1200/v1/foo.jpg";

describe("optimizeCloudinary", () => {
  it("injects f_auto,q_auto + the default cap with no options", () => {
    expect(optimizeCloudinary(BASE)).toBe(CAPPED);
  });

  it("adds c_limit,w_N for width-only (MEH-788 hero path)", () => {
    expect(optimizeCloudinary(BASE, { width: 1920 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1920/v1/foo.jpg"
    );
  });

  it("keeps the c_fill smart-crop shape for aspectRatio-only", () => {
    expect(optimizeCloudinary(BASE, { aspectRatio: "4:3" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,ar_4:3/v1/foo.jpg"
    );
  });

  it("rides w_N on c_fill (no c_limit) when aspectRatio + width combine", () => {
    expect(optimizeCloudinary(BASE, { aspectRatio: "16:9", width: 800 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,ar_16:9,w_800/v1/foo.jpg"
    );
  });

  it.each([0, -1, 1.5, "1920", null, undefined])(
    "falls back to the default cap for invalid width %p",
    (width) => {
      expect(optimizeCloudinary(BASE, { width })).toBe(CAPPED);
    }
  );

  // A malformed ratio is dropped, so the call is width-less and lands on the
  // c_limit path — it must still be capped, not delivered raw.
  it("ignores malformed aspectRatio (and falls to the capped width path)", () => {
    expect(optimizeCloudinary(BASE, { aspectRatio: "wide" })).toBe(CAPPED);
  });

  it("leaves already-transformed URLs alone (width included)", () => {
    const transformed =
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/foo.jpg";
    expect(optimizeCloudinary(transformed, { width: 800 })).toBe(transformed);
  });

  it("passes non-Cloudinary and falsy inputs through unchanged", () => {
    expect(optimizeCloudinary("https://example.com/a.jpg", { width: 800 })).toBe(
      "https://example.com/a.jpg"
    );
    expect(optimizeCloudinary(null)).toBe(null);
    expect(optimizeCloudinary(undefined)).toBe(undefined);
  });
});

// MEH-2001 — the default width cap. Root cause of the Cloudinary suspension
// (109.85/25 credits, 99.6% bandwidth): `width` was opt-in since MEH-788, so
// every call site that did not pass one delivered the full original — support
// measured a 5886px / 2.43MB WebP rendered into a 1437px box.
describe("optimizeCloudinary — default width cap (MEH-2001)", () => {
  it("caps a width-less call at c_limit,w_1200", () => {
    const out = optimizeCloudinary(BASE);
    expect(out).toContain("c_limit");
    expect(out).toContain(`w_${DEFAULT_MAX_WIDTH}`);
    expect(DEFAULT_MAX_WIDTH).toBe(1200);
  });

  it("never emits c_fill or c_fit on the default path (no crop, no upscale)", () => {
    const out = optimizeCloudinary(BASE);
    expect(out).not.toContain("c_fill");
    expect(out).not.toContain("c_fit");
  });

  it("does not add dpr_auto (would multiply bandwidth on retina)", () => {
    expect(optimizeCloudinary(BASE)).not.toContain("dpr_");
  });

  it("lets an explicit width win over the default", () => {
    const out = optimizeCloudinary(BASE, { width: 1920 });
    expect(out).toContain("w_1920");
    expect(out).not.toContain(`w_${DEFAULT_MAX_WIDTH}`);
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1920/v1/foo.jpg"
    );
  });

  it("honours an explicit width smaller than the default", () => {
    expect(optimizeCloudinary(BASE, { width: 320 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_320/v1/foo.jpg"
    );
  });

  // The aspectRatio path is deliberately NOT capped by the default. Its crop
  // is c_fill, and c_fill + w_1200 UPSCALES an original narrower than 1200 —
  // the opposite of the goal. Those call sites cap by passing an explicit
  // width (ProducerCard et al. are listed as follow-up debt in the PR).
  it("leaves the aspectRatio path untouched when no width is given", () => {
    expect(optimizeCloudinary(BASE, { aspectRatio: "4:3" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,ar_4:3/v1/foo.jpg"
    );
  });

  it("does not inject c_limit alongside c_fill when aspectRatio + width combine", () => {
    const out = optimizeCloudinary(BASE, { aspectRatio: "16:9", width: 800 });
    expect(out).not.toContain("c_limit");
    expect(out).toContain("w_800");
  });

  it("does not leak the cap into non-Cloudinary or falsy inputs", () => {
    expect(optimizeCloudinary("https://example.com/a.jpg")).toBe(
      "https://example.com/a.jpg"
    );
    expect(optimizeCloudinary("")).toBe("");
    expect(optimizeCloudinary(42)).toBe(42);
  });

  it("does not re-cap an already-transformed URL", () => {
    const already =
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_400/v1/foo.jpg";
    expect(optimizeCloudinary(already)).toBe(already);
  });
});
