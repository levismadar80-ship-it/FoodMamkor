// MEH-2562: the lightbox put "next" on the visual RIGHT with a left-pointing
// arrow (its comments called inline-end "visual right in RTL" — it is the
// left), while the product sheet puts "next" on the LEFT. Two galleries, two
// directions. This pins the lightbox to the product sheet's construction:
// previous at inline-start, next at inline-end, and a swipe that pulls "next"
// in from its own side (finger right in RTL, finger left in LTR).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) =>
    key === "image_alt" ? `תמונה ${vars?.current} מתוך ${vars?.total}` : key,
}));

import Lightbox from "@/components/Lightbox";

const IMAGES = ["/a.jpg", "/b.jpg", "/c.jpg"];
const current = () => screen.getByRole("img", { name: /תמונה/ }).getAttribute("alt");

function swipe(dx) {
  const dialog = screen.getByRole("dialog");
  fireEvent.touchStart(dialog, { touches: [{ clientX: 200 }] });
  fireEvent.touchMove(dialog, { touches: [{ clientX: 200 + dx }] });
  fireEvent.touchEnd(dialog);
}

afterEach(() => {
  document.documentElement.removeAttribute("dir");
});

describe("Lightbox direction (MEH-2562)", () => {
  it("previous sits at inline-start, next at inline-end (next = visual left in RTL)", () => {
    render(<Lightbox images={IMAGES} startIndex={1} onClose={() => {}} />);
    expect(screen.getByTestId("lightbox-prev").className).toContain("start-4");
    expect(screen.getByTestId("lightbox-next").className).toContain("end-4");
    expect(screen.getByTestId("lightbox-next").className).not.toContain("start-4");
  });

  it("RTL: a finger moving right shows the next image", () => {
    document.documentElement.setAttribute("dir", "rtl");
    render(<Lightbox images={IMAGES} startIndex={0} onClose={() => {}} />);
    expect(current()).toBe("תמונה 1 מתוך 3");
    swipe(80);
    expect(current()).toBe("תמונה 2 מתוך 3");
    swipe(-80);
    expect(current()).toBe("תמונה 1 מתוך 3");
  });

  it("LTR (/en): the gesture and the arrow keys mirror", () => {
    document.documentElement.setAttribute("dir", "ltr");
    render(<Lightbox images={IMAGES} startIndex={0} onClose={() => {}} />);
    swipe(-80);
    expect(current()).toBe("תמונה 2 מתוך 3");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(current()).toBe("תמונה 3 מתוך 3");
  });
});
