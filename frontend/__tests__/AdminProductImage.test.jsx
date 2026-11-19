/**
 * MEH-3456 — the admin adds / replaces a product photo from the edit page.
 *
 * Contract (count × photo):
 *   - live page, 0 products → no panel at all.
 *   - 1 product without a photo → «העלאת תמונה», no thumbnail.
 *   - many products, with and without a photo → «החלפת תמונה» + thumbnail on
 *     the one that has it, «העלאת תמונה» on the other.
 *   - an upload posts the file to /upload/product-image/{id} and shows the new
 *     photo on THAT row only; a server 400 is shown verbatim.
 *   - a draft page carries the same button inside DraftProductsPanel, and the
 *     live-page panel does not render there.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminProductImagesPanel from "@/components/admin/AdminProductImagesPanel";
import EditProducerPage from "@/app/[locale]/admin/producers/[id]/edit/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "p-9" }),
}));

const adminAuth = { user: { role: "admin" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => adminAuth }));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const O = he.dashboard.producer.owner_story;
const IMG = "https://res.cloudinary.com/demo/image/upload/mehamakor/u/k/a.jpg";
const NEW_IMG = "https://res.cloudinary.com/demo/image/upload/mehamakor/u/k/b.jpg";

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

const plum = { id: "a1", name: "שזיף", image_url: null };
const peach = { id: "a2", name: "אפרסק", image_url: IMG };

beforeEach(() => vi.clearAllMocks());

describe("AdminProductImagesPanel", () => {
  it("0 products: renders nothing", () => {
    const { container } = wrap(<AdminProductImagesPanel initialProducts={[]} />);
    expect(container.querySelector("[data-testid=admin-product-images-panel]")).toBeNull();
  });

  it("1 product without a photo: upload label, no thumbnail", () => {
    wrap(<AdminProductImagesPanel initialProducts={[plum]} />);
    const rows = screen.getAllByTestId("admin-product-images-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(O.photo_cta)).toBeTruthy();
    expect(within(rows[0]).queryByTestId("admin-product-image-thumb")).toBeNull();
  });

  it("many, mixed: replace + thumbnail only where a photo exists", () => {
    wrap(<AdminProductImagesPanel initialProducts={[plum, peach]} />);
    const [r1, r2] = screen.getAllByTestId("admin-product-images-row");
    expect(within(r1).getByText(O.photo_cta)).toBeTruthy();
    expect(within(r1).queryByTestId("admin-product-image-thumb")).toBeNull();
    expect(within(r2).getByText(O.photo_replace_cta)).toBeTruthy();
    const thumb = within(r2).getByTestId("admin-product-image-thumb");
    expect(thumb.getAttribute("alt")).toBe(peach.name);
    expect(thumb.getAttribute("src")).toContain("mehamakor/u/k/a.jpg");
  });

  it("upload posts the file to that product and updates that row only", async () => {
    api.post.mockResolvedValueOnce({ data: { url: NEW_IMG } });
    wrap(<AdminProductImagesPanel initialProducts={[plum, peach]} />);
    const [r1, r2] = screen.getAllByTestId("admin-product-images-row");
    const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(within(r1).getByTestId("admin-product-image-input"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(within(r1).getByText(O.photo_replace_cta)).toBeTruthy());
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/upload/product-image/a1");
    expect(body.get("file")).toBe(file);
    expect(within(r1).getByTestId("admin-product-image-thumb").getAttribute("src")).toContain("b.jpg");
    expect(within(r2).getByTestId("admin-product-image-thumb").getAttribute("src")).toContain("a.jpg");
  });

  it("a server 400 is shown verbatim and the row keeps no photo", async () => {
    const detail = "רק תמונות JPG/PNG/WebP/GIF/HEIC מותרות";
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { detail } } });
    wrap(<AdminProductImagesPanel initialProducts={[plum]} />);
    fireEvent.change(screen.getByTestId("admin-product-image-input"), {
      target: { files: [new File(["x"], "a.svg", { type: "image/svg+xml" })] },
    });
    expect((await screen.findByTestId("admin-product-image-error")).textContent).toBe(detail);
    expect(screen.queryByTestId("admin-product-image-thumb")).toBeNull();
  });

  it("a response without a url is not applied (rule 19)", async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    wrap(<AdminProductImagesPanel initialProducts={[plum]} />);
    fireEvent.change(screen.getByTestId("admin-product-image-input"), {
      target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] },
    });
    expect((await screen.findByTestId("admin-product-image-error")).textContent).toBe(O.upload_error);
    expect(screen.queryByTestId("admin-product-image-thumb")).toBeNull();
  });
});

/** Other reads on the page (categories, drafts…) answer an empty list. */
function stubPage(producer) {
  api.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/admin/producers/p-9" ? producer : [] }),
  );
}

describe("edit page", () => {
  it("live page: the photo panel renders, the draft panel does not", async () => {
    stubPage({ id: "p-9", name: "סנדרה", status: "approved", products: [peach] });
    wrap(<EditProducerPage />);
    expect(await screen.findByTestId("admin-product-images-panel")).toBeTruthy();
    expect(screen.queryByTestId("draft-products-panel")).toBeNull();
  });

  it("draft page: the button sits in the draft panel, the live panel is absent", async () => {
    stubPage({ id: "p-9", name: "טיוטה", status: "draft", has_owner: false, products: [plum] });
    wrap(<EditProducerPage />);
    const panel = await screen.findByTestId("draft-products-panel");
    expect(within(panel).getByTestId("admin-product-image")).toBeTruthy();
    expect(screen.queryByTestId("admin-product-images-panel")).toBeNull();
  });

  it("draft page, product with a photo: replace label + thumbnail in the draft row", async () => {
    stubPage({ id: "p-9", name: "טיוטה", status: "draft", has_owner: false, products: [plum, peach] });
    wrap(<EditProducerPage />);
    await screen.findByTestId("draft-products-panel");
    const [r1, r2] = screen.getAllByTestId("draft-product-row");
    expect(within(r1).getByText(O.photo_cta)).toBeTruthy();
    expect(within(r2).getByText(O.photo_replace_cta)).toBeTruthy();
    expect(within(r2).getByTestId("admin-product-image-thumb")).toBeTruthy();
  });
});
