import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1247: closing the lightbox must return focus to the element that OPENED
// it (WAI-ARIA dialog "return focus to invoker"). Before the fix, focus was
// always restored to the md:hidden mobile banner button (`imageButtonRef`), so
// on the desktop editorial grid — where a hero/secondary CELL is the invoker —
// focus landed on a display:none element and the E2E focus assertion flaked.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      open_aria: `הגדלו תמונה ${vars?.current ?? ""}`.trim(),
      image_alt: `תמונה ${vars?.current ?? ""}`.trim(),
      view_all: `כל התמונות (${vars?.n ?? ""})`.trim(),
    };
    return flat[key] ?? key;
  },
}));

import ImageGallery from "@/components/ImageGallery";

vi.mock("@/components/FavoriteButton", () => ({
  default: () => <div data-testid="favorite-btn" />,
}));

vi.mock("@/components/ImageWithFallback", () => ({
  default: (props) => <div data-testid="image" data-src={props.src} />,
}));

// Expose the real onClose so the test can trigger a close from the lightbox.
vi.mock("@/components/Lightbox", () => ({
  default: ({ onClose }) => (
    <button type="button" data-testid="lightbox-close" onClick={onClose}>
      close
    </button>
  ),
}));

vi.mock("@phosphor-icons/react", () => ({
  Images: (props) => <span data-testid="images-icon" {...props} />,
}));

const urls = (n) => Array.from({ length: n }, (_, i) => `https://res.cloudinary.com/x/img${i}.jpg`);

describe("ImageGallery — focus returns to the invoker on close (MEH-1247)", () => {
  it("desktop grid: closing returns focus to the hero cell that opened it, not the mobile banner", () => {
    render(<ImageGallery images={urls(3)} />);
    const hero = screen.getByTestId("gallery-grid-hero");

    fireEvent.click(hero);
    // lightbox open
    const close = screen.getByTestId("lightbox-close");
    fireEvent.click(close);

    expect(document.activeElement).toBe(hero);
  });

  it("desktop grid: a secondary cell invoker regains focus on close", () => {
    render(<ImageGallery images={urls(3)} />);
    const cell = screen.getByTestId("gallery-grid-cell");

    fireEvent.click(cell);
    fireEvent.click(screen.getByTestId("lightbox-close"));

    expect(document.activeElement).toBe(cell);
  });

  it("single image: closing returns focus to the full-width banner button", () => {
    render(<ImageGallery images={urls(1)} />);
    // 1 image → no grid; the banner button carries the open_aria label
    const banner = screen.getByLabelText("הגדלו תמונה 1");

    fireEvent.click(banner);
    fireEvent.click(screen.getByTestId("lightbox-close"));

    expect(document.activeElement).toBe(banner);
  });
});
