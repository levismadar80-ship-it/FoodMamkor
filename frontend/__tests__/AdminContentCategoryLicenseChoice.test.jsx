// MEH-3255 (grill retro D10): a new category answers «דורשת רישיון?» — no
// default. Without an answer nothing is sent; the answer rides the POST.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("next-intl", () => ({ useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k) }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import AdminContentPage from "@/app/[locale]/admin/content/page";

const CATS = [
  { id: 1, name: "דבש", is_system: true, requires_license: true, producer_count: 0 },
  { id: 2, name: "עציצים", is_system: false, requires_license: false, producer_count: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockResolvedValue({ data: CATS });
  apiMock.post.mockResolvedValue({ data: {} });
});

async function typeName() {
  render(<AdminContentPage />);
  await screen.findByDisplayValue("דבש");
  fireEvent.change(screen.getByPlaceholderText("admin.content.categories.name_placeholder"), {
    target: { value: "פטריות" },
  });
}

describe("category create asks «דורשת רישיון?» (MEH-3255)", () => {
  it("sends nothing and says why when no answer was picked", async () => {
    await typeName();
    fireEvent.click(screen.getByText("admin.content.categories.add"));
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("admin.content.categories.license_choose");
  });

  it.each([
    ["license_yes", true],
    ["license_no", false],
  ])("%s → requires_license %s in the POST", async (label, value) => {
    await typeName();
    fireEvent.click(screen.getByLabelText(`admin.content.categories.${label}`));
    fireEvent.click(screen.getByText("admin.content.categories.add"));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/admin/categories", { name: "פטריות", requires_license: value }),
    );
  });

  it("tags only the rows that require a licence", async () => {
    render(<AdminContentPage />);
    await screen.findByDisplayValue("דבש");
    expect(screen.getByTestId("category-license-badge-1")).toBeTruthy();
    expect(screen.queryByTestId("category-license-badge-2")).toBeNull();
  });
});
