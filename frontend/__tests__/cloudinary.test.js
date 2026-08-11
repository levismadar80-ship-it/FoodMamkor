// MEH-788: coverage for the optimizeCloudinary `width` branch (and the
// pre-existing paths it must not disturb). The helper is consumed by 9+
// call sites that mostly mock it in component tests, so the URL-building
// logic itself had zero regression coverage before this file.
//
// MEH-2001: the width is no longer opt-in — a caller that passes none now
// gets c_limit,w_1200. Three expectations below changed as a result, and it
// is worth being precise about why: they asserted the OLD default (deliver
// the full original), which is exactly the behaviour this ticket replaces.
// None of them documented a surface that intentionally wants full-size
// delivery, so updating them is the change landing, not a test bent to fit.
import { describe, expect, it } from "vitest";
import { optimizeCloudinary } from "@/lib/cloudinary";

const BASE = "https://res.cloudinary.com/demo/image/upload/v1/foo.jpg";
const DEFAULT_CAP = "f_auto,q_auto,c_limit,w_1200";

describe("optimizeCloudinary", () => {
  it("caps at c_limit,w_1200 with no options (MEH-2001 default)", () => {
    expect(optimizeCloudinary(BASE)).toBe(
      `https://res.cloudinary.com/demo/image/upload/${DEFAULT_CAP}/v1/foo.jpg`
    );
  });

  it("lets an explicit width win over the default", () => {
    expect(optimizeCloudinary(BASE, { width: 1920 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1920/v1/foo.jpg"
    );
  });

  it("applies the default width alongside aspectRatio, riding c_fill", () => {
    // The interaction case. With a crop present the w_ rides c_fill rather
    // than c_limit — same rule an explicit width has followed since MEH-788,
    // so the default introduces no new shape, only a number.
    expect(optimizeCloudinary(BASE, { aspectRatio: "4:3" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,ar_4:3,w_1200/v1/foo.jpg"
    );
  });

  it("rides w_N on c_fill (no c_limit) when aspectRatio + width combine", () => {
    expect(optimizeCloudinary(BASE, { aspectRatio: "16:9", width: 800 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,ar_16:9,w_800/v1/foo.jpg"
    );
  });

  it("never emits a crop mode that can upscale on the width-only path", () => {
    // c_limit only ever scales DOWN. c_fill/c_fit would upscale a smaller
    // original and cost MORE bandwidth than doing nothing — the exact
    // inversion this ticket exists to avoid.
    const out = optimizeCloudinary(BASE);
    expect(out).toContain("c_limit");
    expect(out).not.toContain("c_fill");
    expect(out).not.toContain("c_fit");
    expect(out).not.toContain("dpr_auto");
  });

  it.each([0, -1, 1.5, "1920", null, undefined])(
    "falls back to the default cap for invalid width %p",
    (width) => {
      // Previously these asserted "no width at all". An invalid width is not
      // a request for the full original — it is a caller mistake, and the
      // safe response is the cap, not 5886px.
      expect(optimizeCloudinary(BASE, { width })).toBe(
        `https://res.cloudinary.com/demo/image/upload/${DEFAULT_CAP}/v1/foo.jpg`
      );
    }
  );

  it("falls back to the default cap for malformed aspectRatio", () => {
    expect(optimizeCloudinary(BASE, { aspectRatio: "wide" })).toBe(
      `https://res.cloudinary.com/demo/image/upload/${DEFAULT_CAP}/v1/foo.jpg`
    );
  });

  it("leaves already-transformed URLs alone (width included)", () => {
    const transformed =
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/foo.jpg";
    expect(optimizeCloudinary(transformed, { width: 800 })).toBe(transformed);
  });

  it("passes non-Cloudinary and falsy inputs through unchanged", () => {
    // The default must never leak onto a URL this helper does not own.
    expect(optimizeCloudinary("https://example.com/a.jpg", { width: 800 })).toBe(
      "https://example.com/a.jpg"
    );
    expect(optimizeCloudinary("https://example.com/a.jpg")).toBe(
      "https://example.com/a.jpg"
    );
    expect(optimizeCloudinary(null)).toBe(null);
    expect(optimizeCloudinary(undefined)).toBe(undefined);
  });
});
