/**
 * Edit-tab chunk B — ImagesCard component tests.
 *
 * Renders the whole ProducerDashboardEditPage (cards are internal). Covers
 * upload-append, index-based remove (a duplicate URL must not delete both),
 * and save. has_physical_location:false keeps LocationCard/AddressSearch out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProducerDashboardEditPage from "@/app/[locale]/producer/dashboard/edit/page";
import api from "@/lib/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, role: "producer" }, loading: false }),
}));
vi.mock("next-intl", () => {
  // Stable translator identity per namespace — mirrors next-intl (see
  // EditTabCategoriesCard.test.jsx for the hang this prevents).
  const cache = new Map();
  return {
    useLocale: () => "he",
    useTranslations: (ns) => {
      if (!cache.has(ns)) cache.set(ns, (key) => `${ns}.${key}`);
      return cache.get(ns);
    },
  };
});

const BASE_PROFILE = {
  id: 1,
  has_physical_location: false,
  categories: [],
  custom_questions: [],
  instagram: "",
  phone: "",
  website: "",
  contact_email: "",
  facebook: "",
  external_order_form: "",
  primary_contact_method: "whatsapp",
  lat: null,
  lng: null,
  city: "",
};

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const IMG_SAVE = "dashboard.producer.images.save_cta";
const REMOVE = "dashboard.producer.images.remove_aria";

function mountWith(images) {
  api.get.mockImplementation((url) =>
    url === "/categories"
      ? Promise.resolve({ data: [] })
      : Promise.resolve({ data: { ...BASE_PROFILE, images } }),
  );
  return render(<ProducerDashboardEditPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { url: "https://cdn/new.jpg" } });
});

describe("Edit-tab ImagesCard", () => {
  it("appends an uploaded image to the grid", async () => {
    const { container } = mountWith(["https://cdn/a.jpg"]);
    await screen.findByRole("button", { name: IMG_SAVE });
    expect(screen.getAllByRole("img")).toHaveLength(1);

    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "b.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(api.post).toHaveBeenCalledWith("/upload/image", expect.anything());
  });

  it("removes by index — a duplicate URL deletes only the clicked thumbnail", async () => {
    // Two identical URLs: value-based removal would drop both; index-based drops one.
    mountWith(["https://cdn/dup.jpg", "https://cdn/dup.jpg"]);
    await screen.findByRole("button", { name: IMG_SAVE });
    expect(screen.getAllByRole("img")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: REMOVE })[0]);
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("saves the current image list via PUT /producers/me", async () => {
    mountWith(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    await screen.findByRole("button", { name: IMG_SAVE });
    // Make the list dirty (remove one) so Save enables.
    fireEvent.click(screen.getAllByRole("button", { name: REMOVE })[1]);
    fireEvent.click(screen.getByRole("button", { name: IMG_SAVE }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        images: ["https://cdn/a.jpg"],
      }),
    );
  });
});
