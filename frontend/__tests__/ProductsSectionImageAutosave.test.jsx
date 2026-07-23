/**
 * MEH-1261 F3 — the edit-form product image auto-persists after upload.
 *
 * Same upload≠save trap MEH-1236 fixed in ImagesCard, on a different surface:
 * a product image uploaded in the EDIT form used to land only in local form
 * state — persisted only on the explicit Save, so closing via X orphaned the
 * upload and the change looked lost.
 *
 * Locked behavior under test:
 *   - edit-form upload → POST /upload/image then an immediate partial
 *     PUT /producers/me/products/{id} with ONLY {image_url} (name/price edits
 *     stay behind the explicit Save)
 *   - PUT failure → visible image_autosave_failed error (never silent); the
 *     form keeps the image so the explicit Save can retry
 *   - ADD-form upload does NOT auto-persist (no product exists yet)
 *
 * REUSES: __tests__/EditTabProductsSection.test.jsx harness (real
 * NextIntlClientProvider + he.json, api mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;
const PRODUCT = {
  id: 7,
  name: "לחם מחמצת",
  price_min: 18,
  price_max: 24,
  image_url: null,
};

function renderSection() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

function uploadFile(input) {
  const file = new File(["png-bytes"], "product.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
}

async function openEditForm() {
  api.get.mockResolvedValue({ data: [PRODUCT] });
  renderSection();
  fireEvent.click(
    await screen.findByRole("button", {
      name: P.card.edit_aria_template.replace("{name}", "לחם מחמצת"),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductsSection edit-form image auto-persist (MEH-1261 F3)", () => {
  it("upload in the edit form auto-persists ONLY the image via partial PUT", async () => {
    await openEditForm();
    api.post.mockResolvedValueOnce({ data: { url: "https://cdn.example/new.png" } });
    api.put.mockResolvedValueOnce({
      data: { ...PRODUCT, image_url: "https://cdn.example/new.png" },
    });

    uploadFile(document.querySelector('input[type="file"]'));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me/products/7", {
        image_url: "https://cdn.example/new.png",
      }),
    );
    // No stray error shown on the happy path.
    expect(screen.queryByText(P.errors.image_autosave_failed)).not.toBeInTheDocument();
  });

  it("upload OK but PUT fails → visible autosave error, image kept in the form", async () => {
    await openEditForm();
    api.post.mockResolvedValueOnce({ data: { url: "https://cdn.example/new.png" } });
    api.put.mockRejectedValueOnce(new Error("boom"));

    uploadFile(document.querySelector('input[type="file"]'));

    expect(
      await screen.findByText(P.errors.image_autosave_failed),
    ).toBeInTheDocument();
    // The uploaded image is still in the form (remove button renders for it),
    // so the explicit Save can retry the persist.
    expect(
      screen.getByRole("button", { name: P.form.image_remove }),
    ).toBeInTheDocument();
  });

  it("ADD-form upload does not auto-persist (no product exists yet)", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderSection();
    await screen.findByText(P.empty.title);
    fireEvent.click(screen.getByText(P.empty.cta));

    api.post.mockResolvedValueOnce({ data: { url: "https://cdn.example/new.png" } });
    uploadFile(document.querySelector('input[type="file"]'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/upload/image",
        expect.anything(),
        expect.anything(),
      ),
    );
    expect(api.put).not.toHaveBeenCalled();
  });
});
