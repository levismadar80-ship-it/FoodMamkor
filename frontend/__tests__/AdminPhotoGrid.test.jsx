/**
 * MEH-3320 — the admin photo grid marks the main (first) photo and lets the
 * admin promote any other photo to main. Origin: a business went live with
 * its text logo as the card photo (15/11/2026) and the admin form had no way
 * to change which photo comes first.
 *
 * Cells covered: 0 photos · 1 photo · many photos (promote keeps the rest in
 * order) · remove still works.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import AdminPhotoGrid, { promoteToMain } from "@/components/admin/AdminPhotoGrid";

const P = he.admin.producers.form.photos;

function renderGrid(images, handlers = {}) {
  const onChange = handlers.onChange ?? vi.fn();
  const onRemove = handlers.onRemove ?? vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <AdminPhotoGrid images={images} onChange={onChange} onRemove={onRemove} />
    </NextIntlClientProvider>,
  );
  return { onChange, onRemove };
}

describe("promoteToMain", () => {
  it("moves the chosen photo first and keeps the others in their order", () => {
    expect(promoteToMain(["a", "b", "c", "d"], "c")).toEqual(["c", "a", "b", "d"]);
  });
  it("returns the same order when the photo is already main or unknown", () => {
    expect(promoteToMain(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(promoteToMain(["a", "b"], "zzz")).toEqual(["a", "b"]);
  });
});

describe("AdminPhotoGrid", () => {
  it("0 photos: renders nothing", () => {
    renderGrid([]);
    expect(screen.queryByText(P.main_label)).toBeNull();
    expect(screen.queryAllByRole("button", { name: P.make_main })).toHaveLength(0);
  });

  it("1 photo: shows the main label and no promote button", () => {
    renderGrid(["https://res.cloudinary.com/x/image/upload/v1/a.jpg"]);
    expect(screen.getByText(P.main_label)).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: P.make_main })).toHaveLength(0);
  });

  it("many photos: one main label, a promote button on every other photo, and promoting reorders", () => {
    const imgs = ["https://x/a.jpg", "https://x/b.jpg", "https://x/c.jpg"];
    const { onChange } = renderGrid(imgs);
    expect(screen.getAllByText(P.main_label)).toHaveLength(1);
    const buttons = screen.getAllByRole("button", { name: P.make_main });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith(["https://x/c.jpg", "https://x/a.jpg", "https://x/b.jpg"]);
  });

  it("remove still calls onRemove with that photo", () => {
    const { onRemove } = renderGrid(["https://x/a.jpg", "https://x/b.jpg"]);
    fireEvent.click(screen.getAllByRole("button", { name: he.admin.common.delete })[1]);
    expect(onRemove).toHaveBeenCalledWith("https://x/b.jpg");
  });
});
