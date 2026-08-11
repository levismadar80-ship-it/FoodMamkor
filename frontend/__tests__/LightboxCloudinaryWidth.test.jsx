// MEH-2001: the lightbox rendered `src={images[index]}` raw — it never
// imported optimizeCloudinary, so it shipped the untransformed original (no
// f_auto, no q_auto, no width) straight to the browser. The helper default
// that landed in #2769 could not reach it, because a bypass builds no URL for
// the helper to cap.
//
// This spec pins the delivered `src`, not the fact that a helper is imported:
// an assertion on the import would pass against a call whose result was
// discarded. It renders the REAL Lightbox against the REAL helper — mocking
// optimizeCloudinary here would test the mock.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      image_alt: `תמונה ${vars?.current ?? ""} מתוך ${vars?.total ?? ""}`.trim(),
      image_error: "התמונה לא נטענה",
      close: "סגירה",
      prev: "הקודמת",
      next: "הבאה",
    };
    return flat[key] ?? key;
  },
}));

import Lightbox from "@/components/Lightbox";
import { DEFAULT_MAX_WIDTH } from "@/lib/cloudinary";

const CLOUDINARY =
  "https://res.cloudinary.com/demo/image/upload/v1/meshek-harel-bakar.jpg";

function renderLightbox(images, startIndex = 0) {
  render(
    <Lightbox images={images} startIndex={startIndex} onClose={() => {}} />
  );
  return screen.getByRole("img", { name: /תמונה/ });
}

describe("Lightbox — Cloudinary delivery cap (MEH-2001)", () => {
  it("never renders the raw original URL", () => {
    const img = renderLightbox([CLOUDINARY]);
    // The exact shape of the bypass: src identical to the input, untransformed.
    expect(img.getAttribute("src")).not.toBe(CLOUDINARY);
    expect(img.getAttribute("src")).toContain("f_auto");
    expect(img.getAttribute("src")).toContain("q_auto");
  });

  it("caps at w_1920 with c_limit — enlarge headroom, downscale only", () => {
    const src = renderLightbox([CLOUDINARY]).getAttribute("src");
    expect(src).toContain("c_limit");
    expect(src).toContain("w_1920");
  });

  it("does not fall back to the 1200 grid default", () => {
    const src = renderLightbox([CLOUDINARY]).getAttribute("src");
    expect(src).not.toContain(`w_${DEFAULT_MAX_WIDTH}`);
  });

  it("never emits a crop mode that can upscale a smaller original", () => {
    const src = renderLightbox([CLOUDINARY]).getAttribute("src");
    expect(src).not.toContain("c_fill");
    expect(src).not.toContain("c_fit");
    expect(src).not.toContain("dpr_");
  });

  it("caps the image actually shown when startIndex is not 0", () => {
    const second =
      "https://res.cloudinary.com/demo/image/upload/v1/second-photo.jpg";
    const src = renderLightbox([CLOUDINARY, second], 1).getAttribute("src");
    expect(src).toContain("second-photo");
    expect(src).toContain("w_1920");
  });

  it("passes a non-Cloudinary URL through untouched", () => {
    const external = "https://images.unsplash.com/photo-123.jpg";
    expect(renderLightbox([external]).getAttribute("src")).toBe(external);
  });
});
