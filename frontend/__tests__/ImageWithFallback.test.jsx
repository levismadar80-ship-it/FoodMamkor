import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Control optimizeCloudinary's return per-test (it gates the fallback path).
const optimize = vi.fn();
vi.mock("@/lib/cloudinary", () => ({
  optimizeCloudinary: (src) => optimize(src),
}));

// next/image → plain <img> so onError/load behaviour is observable in jsdom.
vi.mock("next/image", () => ({
  default: ({ src, alt, onError, fill, priority, ...rest }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={onError} {...rest} />
  ),
}));

import ImageWithFallback from "@/components/ImageWithFallback";

describe("ImageWithFallback", () => {
  it("renders the branded fallback when the source is missing", () => {
    optimize.mockReturnValue(undefined);
    render(<ImageWithFallback src={null} alt="חלה" />);
    const fallback = screen.getByRole("img", { name: "חלה" });
    expect(fallback).toBeInTheDocument();
    // Fallback is a div, not a real <img> element.
    expect(fallback.tagName).toBe("DIV");
    // MEH-2833: sand + one seed, no leaf, no raw green-50 hex
    expect(fallback.className).toMatch(/\bbg-background-alt\b/);
    expect(fallback.getAttribute("style") || "").not.toMatch(/background/i);
    expect(fallback.querySelectorAll("svg[data-seed-color]")).toHaveLength(1);
  });

  it("the seed's colour follows seedKey, else the URL — not a shared alt text (MEH-2833)", async () => {
    const { seedColorFor } = await import("@/lib/brand-seeds");
    optimize.mockReturnValue(undefined);
    const colour = () => document.querySelector("svg[data-seed-color]").getAttribute("data-seed-color");
    const { unmount } = render(<ImageWithFallback src={null} alt="תמונה 1" seedKey={42} />);
    expect(colour()).toBe(seedColorFor(42).fill);
    unmount();
    // two images with the same (translated) alt but different URLs need not match
    render(<ImageWithFallback src="https://res.cloudinary.com/x/a.jpg" alt="תמונה 1" />);
    expect(colour()).toBe(seedColorFor("https://res.cloudinary.com/x/a.jpg").fill);
  });

  it("renders a real image when the source optimizes to a usable URL", () => {
    optimize.mockReturnValue("https://res.cloudinary.com/x/upload/f_auto/a.jpg");
    render(<ImageWithFallback src="a.jpg" alt="עוגה" />);
    const img = screen.getByRole("img", { name: "עוגה" });
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/x/upload/f_auto/a.jpg",
    );
  });

  it("swaps to the fallback when the image errors at runtime", () => {
    optimize.mockReturnValue("https://res.cloudinary.com/x/upload/f_auto/a.jpg");
    render(<ImageWithFallback src="a.jpg" alt="קינוח" />);
    const img = screen.getByRole("img", { name: "קינוח" });
    fireEvent.error(img);
    // After onError the component re-renders the fallback div.
    expect(screen.getByRole("img", { name: "קינוח" }).tagName).toBe("DIV");
  });

  it("sizes the fallback to fill when fill is set", () => {
    optimize.mockReturnValue("");
    render(<ImageWithFallback src="" alt="" fill />);
    const fallback = screen.getByRole("img");
    expect(fallback.style.position).toBe("absolute");
    expect(fallback.style.width).toBe("100%");
  });
});
