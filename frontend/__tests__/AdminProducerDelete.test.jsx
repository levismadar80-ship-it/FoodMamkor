import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProducersPageWrapper from "@/app/[locale]/admin/producers/page";
import heMessages from "@/messages/he.json";
import enMessages from "@/messages/en.json";

// MEH-1027 Chunk B: lifecycle tests for the producer-delete confirm dialog
// that replaced native confirm() (use-admin-producers.js). Mirrors
// AdminContentCategoryDelete.test.jsx (MEH-1023 Ch.B) — open via the Chunk A
// kebab · cancel = no DELETE · Escape · confirm = DELETE + close + reload ·
// failure = toast + dialog stays open.

// vi.hoisted so the vi.fns exist before the hoisted vi.mock factory runs.
const apiMock = vi.hoisted(() => ({
  get: vi.fn((url) => {
    if (url === "/admin/producers") {
      return Promise.resolve({
        data: [
          {
            id: 9,
            name: "שוק הירקות",
            city: "חיפה",
            status: "approved",
            slug: "veg-market",
            ambassador: false,
            categories: [],
          },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  }),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  put: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

// The page reads ?status= via useSearchParams (use-admin-producers.js:27).
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// MEH-990-class whole-page mock: every icon the page graph mounts.
vi.mock("@phosphor-icons/react", () => ({
  Check: (p) => <span {...p} />,
  Circle: (p) => <span {...p} />,
  Cow: (p) => <span {...p} />,
  DotsThreeVertical: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  Package: (p) => <span {...p} />,
  Seal: (p) => <span {...p} />,
  StarOfDavid: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
}));

// Story-card canvas only mounts when a row's panel is open — irrelevant here
// and heavy (canvas/export deps), so stub it out.
vi.mock("@/components/StoryCardCanvas", () => ({ default: () => null }));

vi.mock("next-intl", () => {
  const flat = {
    "admin.producers.table.actions.menu_aria": "פעולות נוספות",
    "admin.producers.table.confirm_delete": 'למחוק את "{name}"? פעולה זו אינה הפיכה.',
    "admin.producers.table.deleting": "מוחקים…",
    "admin.producers.table.delete_error": "מחיקת בית העסק נכשלה. נסו שוב.",
    "admin.common.delete": "מחקו",
    "admin.common.cancel": "ביטול",
  };
  const resolve = (fullKey, values) => {
    const raw = flat[fullKey] ?? fullKey;
    if (!values || Object.keys(values).length === 0) return raw;
    let s = raw;
    for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
  return {
    useTranslations: (scope) => (key, values = {}) =>
      resolve(scope ? `${scope}.${key}` : key, values),
  };
});

describe("Admin producers — delete confirm dialog (MEH-1027 Chunk B)", () => {
  beforeEach(() => {
    apiMock.get.mockClear();
    apiMock.delete.mockClear();
    apiMock.delete.mockImplementation(() => Promise.resolve({}));
    toastMock.error.mockClear();
  });

  // Delete lives in the Chunk A kebab: open the row menu, then its מחקו item.
  const openDialog = async () => {
    render(<ProducersPageWrapper />);
    await screen.findByText("שוק הירקות");
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "מחקו" }));
    return screen.getByRole("dialog");
  };

  it("menu delete opens the modal with the producer name and fires no DELETE yet", async () => {
    const dialog = await openDialog();
    expect(
      within(dialog).getByText('למחוק את "שוק הירקות"? פעולה זו אינה הפיכה.')
    ).toBeInTheDocument();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("cancel closes the dialog and fires no DELETE", async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByText("ביטול"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("Escape closes the dialog and fires no DELETE", async () => {
    await openDialog();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("confirm fires DELETE with the id, closes, and reloads the list", async () => {
    const dialog = await openDialog();
    const getCallsBefore = apiMock.get.mock.calls.length;
    fireEvent.click(within(dialog).getByText("מחקו"));
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith("/admin/producers/9"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // loadAllProducers() re-fetches after a successful delete.
    expect(apiMock.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
  });

  it("on DELETE failure shows an error toast and keeps the dialog open", async () => {
    apiMock.delete.mockImplementationOnce(() => Promise.reject(new Error("500")));
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByText("מחקו"));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // stays open on failure
  });

  // The next-intl mock above resolves keys from a hardcoded flat map, which
  // would mask a key missing from the REAL message files (MEH-978 class —
  // caught live during this chunk: `deleting` initially landed under
  // .actions while the dialog reads producers.table.deleting). Assert the
  // real files carry every key the dialog consumes, at the exact path.
  it("real he/en message files carry the table-level dialog keys", () => {
    for (const messages of [heMessages, enMessages]) {
      const table = messages.admin.producers.table;
      expect(table.confirm_delete).toBeTruthy();
      expect(table.delete_error).toBeTruthy();
      expect(table.deleting).toBeTruthy();
    }
  });
});
