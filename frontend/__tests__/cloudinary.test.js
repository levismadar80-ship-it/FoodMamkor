// MEH-788: coverage for the optimizeCloudinary `width` branch (and the
// pre-existing paths it must not disturb). The helper is consumed by 9+
// call sites that mostly mock it in component tests, so the URL-building
// logic itself had zero regression coverage before this file.
import { describe, expect, it } from "vitest";
import { optimizeCloudinary } from "@/lib/cloudinary";

const BASE = "https://res.cloudinary.com/demo/image/upload/v1/foo.jpg";

describe("optimizeCloudinary", () => {
  it("injects f_auto,q_auto with no options", () => {
    expect(optimizeCloudinary(BASE)).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/foo.jpg"
    );
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
    "ignores invalid width %p",
    (width) => {
      expect(optimizeCloudinary(BASE, { width })).toBe(
        "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/foo.jpg"
      );
    }
  );

  it("ignores malformed aspectRatio", () => {
    expect(optimizeCloudinary(BASE, { aspectRatio: "wide" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/foo.jpg"
    );
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
