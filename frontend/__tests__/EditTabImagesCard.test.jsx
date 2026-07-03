/**
 * Edit-tab chunk B — ImagesCard isolation tests.
 *
 * Renders the CARD directly under the real NextIntlClientProvider + he.json
 * (see EditTabCategoriesCard.test.jsx for why isolation, not the full page).
 * Covers upload-append, index-based remove (a duplicate URL must not delete
 * both), and save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { ImagesCard } from "@/app/[locale]/producer/dashboard/edit/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const I = he.dashboard.producer.images;

function renderCard(images) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ImagesCard profile={{ images }} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { url: "https://cdn/new.jpg" } });
});

describe("Edit-tab ImagesCard (isolation)", () => {
  it("appends an uploaded image to the grid", async () => {
    // Thumbnails use alt="" (decorative) → no "img" ARIA role; query the DOM.
    const { container } = renderCard(["https://cdn/a.jpg"]);
    expect(container.querySelectorAll("img")).toHaveLength(1);

    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "b.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(api.post).toHaveBeenCalledWith("/upload/image", expect.anything());
  });

  it("removes by index — a duplicate URL deletes only the clicked thumbnail", async () => {
    const { container } = renderCard(["https://cdn/dup.jpg", "https://cdn/dup.jpg"]);
    expect(container.querySelectorAll("img")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: I.remove_aria })[0]);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("saves the current image list via PUT /producers/me", async () => {
    const { onSave } = renderCard(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    // Make the list dirty (remove one) so Save enables.
    fireEvent.click(screen.getAllByRole("button", { name: I.remove_aria })[1]);
    fireEvent.click(screen.getByRole("button", { name: I.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        images: ["https://cdn/a.jpg"],
      }),
    );
    expect(onSave).toHaveBeenCalledWith({ images: ["https://cdn/a.jpg"] });
  });
});
