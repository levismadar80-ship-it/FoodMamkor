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
