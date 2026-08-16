import { describe, it, expect } from "vitest";
import { selectFeaturedProducer } from "@/lib/featured-producer";

// MEH-542: §10 "Meet a Producer" data source. Guards the recommended →
// editorial-object mapping and the no-recommended → null self-hide path.

const recommended = {
  id: "uuid-1",
  name: "Shikma Farm",
  city: "Kfar Vradim",
  slug: "havat-hashikma",
  is_recommended: true,
  short_description: "  Goat cheese from our farm  ",
  description: "  The farm story.  ",
  images: ["photo-1.jpg", "photo-2.jpg"],
  categories: [{ id: 3, name: "Cheese" }],
};

describe("selectFeaturedProducer", () => {
  it("maps the first eligible recommended producer to the editorial shape", () => {
    const result = selectFeaturedProducer([recommended]);
    expect(result).toEqual({
      name: "Shikma Farm",
      city: "Kfar Vradim",
      category: "Cheese",
      photo: "photo-1.jpg",
      quote: "Goat cheese from our farm", // trimmed
      story: "The farm story.", // trimmed
      href: "/havat-hashikma",
    });
  });

  it("never emits an attribution field (lives in the component meta line)", () => {
    const result = selectFeaturedProducer([recommended]);
    expect(result).not.toHaveProperty("attribution");
  });

  it("returns null when no producer is recommended", () => {
    const plain = { ...recommended, is_recommended: false };
    expect(selectFeaturedProducer([plain])).toBeNull();
  });

  it("returns null when the recommended producer has no usable short_description", () => {
    const blank = { ...recommended, short_description: "   " };
    const missing = { ...recommended, short_description: null };
    expect(selectFeaturedProducer([blank])).toBeNull();
    expect(selectFeaturedProducer([missing])).toBeNull();
  });

  it("skips recommended-but-unusable rows and picks the eligible one", () => {
    const skip = { ...recommended, id: "uuid-skip", short_description: "" };
    const pick = { ...recommended, id: "uuid-pick", slug: "second", short_description: "Valid tagline" };
    const result = selectFeaturedProducer([skip, pick]);
    expect(result.href).toBe("/second");
    expect(result.quote).toBe("Valid tagline");
  });

  // MEH-1484: among several eligible recommended producers, feature the newest
  // (smallest days_since_created), so curating a new pick rotates the module.
  it("picks the newest recommended producer by days_since_created", () => {
    const older = { ...recommended, id: "old", slug: "old", days_since_created: 40, short_description: "Older pick" };
    const newer = { ...recommended, id: "new", slug: "new", days_since_created: 3, short_description: "Newer pick" };
    const mid = { ...recommended, id: "mid", slug: "mid", days_since_created: 20, short_description: "Mid pick" };
    const result = selectFeaturedProducer([older, newer, mid]);
    expect(result.href).toBe("/new");
    expect(result.quote).toBe("Newer pick");
  });

  it("falls back to stable load order on same-day ties", () => {
    const a = { ...recommended, id: "a", slug: "a", days_since_created: 10, short_description: "A" };
    const b = { ...recommended, id: "b", slug: "b", days_since_created: 10, short_description: "B" };
    expect(selectFeaturedProducer([a, b]).href).toBe("/a"); // first loaded wins the tie
  });

  it("sinks rows missing days_since_created below dated ones", () => {
    const noDay = { ...recommended, id: "n", slug: "n", short_description: "N" }; // undefined key
    const withDay = { ...recommended, id: "w", slug: "w", days_since_created: 99, short_description: "W" };
    // even though noDay loads first, the dated row is treated as newer-known and wins
    expect(selectFeaturedProducer([noDay, withDay]).href).toBe("/w");
  });

  it("falls back to the UUID route when the producer has no slug", () => {
    const noSlug = { ...recommended, slug: null };
    expect(selectFeaturedProducer([noSlug]).href).toBe("/producer/uuid-1");
  });

  it("leaves photo/category/story undefined-safe when absent", () => {
    const sparse = {
      id: "uuid-2",
      name: "Morning Bakery",
      slug: "boker",
      is_recommended: true,
      short_description: "Sourdough bread",
    };
    const result = selectFeaturedProducer([sparse]);
    expect(result.photo).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.story).toBe("");
    expect(result.quote).toBe("Sourdough bread");
  });

  it("is null-safe on empty / nullish input", () => {
    expect(selectFeaturedProducer([])).toBeNull();
    expect(selectFeaturedProducer(null)).toBeNull();
  });
});
