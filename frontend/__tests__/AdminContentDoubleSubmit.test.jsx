import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminContentPage from "@/app/[locale]/admin/content/page";

// MEH-1176 F4 — /admin/content was the only audited admin page NOT wired to
// useAdminAction (MEH-228 UIS Pattern A): create/update/page-save had no
// in-flight lock at all and swallowed errors; delete had only ad-hoc state.
// These tests use the REAL hook (that's the wiring under test) with a
// deferred api mock so a second click lands while the first is in flight.

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

// Key-path passthrough — assertions key off i18n KEYS, not copy.
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));

const CATS = [{ id: 1, name: "גבינות", producer_count: 2 }];

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockImplementation((url) =>
    url === "/admin/categories"
      ? Promise.resolve({ data: CATS })
      : Promise.resolve({ data: { title: "אודות", body: "טקסט" } }),
  );
});

describe("AdminContentPage — double-submit protection (MEH-228 via MEH-1176 F4)", () => {
  it("category delete confirm: rapid double-click fires DELETE exactly once", async () => {
    const d = deferred();
    apiMock.delete.mockReturnValue(d.promise);
    render(<AdminContentPage />);

    // Row rendered → open the confirm dialog.
    fireEvent.click(await screen.findByText("admin.content.categories.delete"));
    const confirmBtn = await screen.findByText(
      "admin.content.categories.delete",
      { selector: "div[role=dialog] button" },
    );

    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn); // second click while in flight
    expect(apiMock.delete).toHaveBeenCalledTimes(1);

    d.resolve({});
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("category create: double submit fires POST exactly once", async () => {
    const d = deferred();
    apiMock.post.mockReturnValue(d.promise);
    render(<AdminContentPage />);
    await screen.findByText("admin.content.categories.producer_count");

    fireEvent.change(
      screen.getByPlaceholderText("admin.content.categories.name_placeholder"),
      { target: { value: "יין" } },
    );
    const addBtn = screen.getByText("admin.content.categories.add");
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(addBtn).toBeDisabled();

    d.resolve({});
    await waitFor(() => expect(addBtn).not.toBeDisabled());
  });

  it("delete failure keeps the dialog open and shows the specific error toast", async () => {
    apiMock.delete.mockRejectedValue(new Error("boom"));
    render(<AdminContentPage />);

    fireEvent.click(await screen.findByText("admin.content.categories.delete"));
    const confirmBtn = await screen.findByText(
      "admin.content.categories.delete",
      { selector: "div[role=dialog] button" },
    );
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("admin.content.categories.delete_error"),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // stays open for retry
  });

  it("page-editor save failure now surfaces an error toast (was silent) and re-enables", async () => {
    apiMock.put.mockRejectedValue({ response: { status: 500 } });
    render(<AdminContentPage />);

    fireEvent.click(screen.getByText("admin.content.tabs.about"));
    const saveBtn = await screen.findByText("admin.content.page_editor.save");
    fireEvent.click(saveBtn);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(saveBtn).not.toBeDisabled();
    // Failure must not flip the "saved" indicator.
    expect(screen.queryByText("admin.content.page_editor.saved")).not.toBeInTheDocument();
  });
});
