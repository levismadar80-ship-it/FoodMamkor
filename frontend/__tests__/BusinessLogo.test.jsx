/** MEH-3611 — BusinessLogo: nothing without a logo; a contained, uncropped image with one. */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import BusinessLogo from "@/components/BusinessLogo";

describe("BusinessLogo", () => {
  it("no logo → renders nothing", () => {
    const { container } = render(<BusinessLogo url={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("a logo → the image, contained (a wide logo is not cropped)", () => {
    const { getByTestId } = render(
      <BusinessLogo url="https://res.cloudinary.com/x/image/upload/v1/logo.png" size={56} />,
    );
    const img = getByTestId("business-logo").querySelector("img");
    expect(img.getAttribute("src")).toContain("f_auto");
    expect(img.className).toContain("object-contain");
  });
});
