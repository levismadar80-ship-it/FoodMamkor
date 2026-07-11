import { describe, it, expect } from "vitest";
import { getRenderableImages } from "@/app/[locale]/producer/[id]/lib/producer-format";

// MEH-1122 (MEH-1074 Task D): a producer whose images array holds only
// blank/whitespace entries must be treated as imageless so the MEH-815 Tinted
// Masthead renders (and ProducerHeader omits its own <h1>). getRenderableImages
// is the single filter that drives both hasImages and the ImageGallery prop.
describe("getRenderableImages (MEH-1122)", () => {
  it("drops empty, whitespace, and non-string entries", () => {
    expect(getRenderableImages(["", "  ", null, undefined, 0, false])).toEqual([]);
  });

  it("keeps real URLs and trims nothing else", () => {
    const imgs = ["https://res.cloudinary.com/x/a.jpg", "https://res.cloudinary.com/x/b.jpg"];
    expect(getRenderableImages(imgs)).toEqual(imgs);
  });

  it("filters blanks but preserves order of the real entries", () => {
    expect(getRenderableImages(["", "https://x/a.jpg", "   ", "https://x/b.jpg"])).toEqual([
      "https://x/a.jpg",
      "https://x/b.jpg",
    ]);
  });

  it("returns [] for a non-array (null / undefined)", () => {
    expect(getRenderableImages(null)).toEqual([]);
    expect(getRenderableImages(undefined)).toEqual([]);
  });

  it("a [''] array is imageless — length 0 → masthead fires", () => {
    expect(getRenderableImages([""]).length).toBe(0);
  });
});
