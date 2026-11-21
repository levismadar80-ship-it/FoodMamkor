import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import ProducersPageWrapper from "@/app/[locale]/admin/producers/page";
import { useReviewChecklist } from "@/app/[locale]/admin/producers/use-review-checklist";

// MEH-3026 (replaces MEH-2299's «אשרי בלי רישיון»). Sapir, 21/11: a missing
// licence number never blocks approval; the business just goes live without
// «מאומת». So the separate menu item and its `allow_without_license` param
// are gone, and the plain «אשרי» is the one approve for every row.
//
// What these cases must tell apart:
//   * the old item is absent on the very row it used to appear on (pending ×
//     license_pending), with a control proving the menu is open;
//   * the plain approve sends no param on that row either;
//   * the 422 paths the plain approve can still hit (photo, phone) keep their
//     handling.

const BASE_ROW = {
  id: 7,
  name: "מחלבת הגבעה",
  city: "עמיקם",
  status: "pending",
  slug: null,
  ambassador: false,
  categories: [],
};
const LICENSE_PENDING_ROW = { ...BASE_ROW, license_pending: true };

const LABEL = "אשרי בלי רישיון";
const MENU = "פעולות נוספות";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  put: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
// REUSES: frontend/__tests__/ProducerDecisionModal.test.jsx — the explicit
// icon list. A missing icon is a hard throw, not a missing glyph.
vi.mock("@phosphor-icons/react", () => ({
  CaretDown: (p) => <span {...p} />,
  CaretRight: (p) => <span {...p} />,
  Check: (p) => <span {...p} />,
  Circle: (p) => <span {...p} />,
  ClipboardText: (p) => <span {...p} />,
  Cow: (p) => <span {...p} />,
  DotsThreeVertical: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  Star: (p) => <span {...p} />,
  Package: (p) => <span {...p} />,
  Seal: (p) => <span {...p} />,
  StarOfDavid: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  Warning: (p) => <span {...p} />,
}));
vi.mock("@/components/StoryCardCanvas", () => ({ default: () => null }));

vi.mock("next-intl", () => {
  const flat = {
    "admin.producers.table.actions.menu_aria": "פעולות נוספות",
    "admin.producers.table.actions.approve_short": "אשרי",
    "admin.producers.table.actions.approve_without_license": "אשרי בלי רישיון",
    "admin.producers.table.actions.reject": "דחייה",
  };
  return {
    useTranslations: (scope) => (key) => flat[scope ? `${scope}.${key}` : key] ?? key,
  };
});

function mockApi(rows) {
  apiMock.get.mockImplementation((url) => {
    if (url === "/admin/producers") return Promise.resolve({ data: rows });
    // Empty ACTIVE checklist => attemptApprove calls approve directly.
    if (url === "/admin/checklist-items") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

async function openMenu(rows) {
  mockApi(rows);
  render(<ProducersPageWrapper />);
  await screen.findByText(BASE_ROW.name);
  fireEvent.click(screen.getAllByRole("button", { name: MENU })[0]);
}

const approveCalls = () =>
  apiMock.post.mock.calls.filter(([url]) => url === "/admin/producers/7/approve");

describe("MEH-3026 — no separate «approve without licence» item", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is not offered on a pending row whose license is pending", async () => {
    await openMenu([LICENSE_PENDING_ROW]);
    // control: the menu IS open — otherwise "absent" proves nothing
    expect(screen.getByRole("menuitem", { name: "דחייה" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: LABEL })).not.toBeInTheDocument();
  });

  it("the plain approve on that row sends NO override", async () => {
    mockApi([LICENSE_PENDING_ROW]);
    render(<ProducersPageWrapper />);
    await screen.findByText(BASE_ROW.name);
    fireEvent.click(screen.getByRole("button", { name: "אשרי" }));
    await waitFor(() => expect(approveCalls()).toHaveLength(1));
    expect(approveCalls()[0]).toEqual(["/admin/producers/7/approve"]);
  });
});

describe("MEH-3026 — the gates the plain approve can still hit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a photo-gate 422 takes the existing blocked path, not a silent no-op", async () => {
    apiMock.post.mockImplementation((url) =>
      url.endsWith("/approve")
        ? Promise.reject({ response: { status: 422, data: { detail: "לא ניתן לאשר בית עסק ללא תמונה." } } })
        : Promise.resolve({ data: {} }),
    );
    mockApi([LICENSE_PENDING_ROW]);
    render(<ProducersPageWrapper />);
    await screen.findByText(BASE_ROW.name);
    fireEvent.click(screen.getByRole("button", { name: "אשרי" }));
    await waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith("producers.request_changes.approve_blocked_info"),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("a phone-gate 422 shows the backend instruction and opens no request-changes modal", async () => {
    const PHONE = "לא ניתן לאשר בית עסק ללא אימות מספר הוואטסאפ. בקשי מבעלת העסק לאמת את המספר, או אשרי עם דריסה מפורשת.";
    apiMock.post.mockImplementation((url) =>
      url.endsWith("/approve")
        ? Promise.reject({ response: { status: 422, data: { detail: PHONE } } })
        : Promise.resolve({ data: {} }),
    );
    mockApi([LICENSE_PENDING_ROW]);
    render(<ProducersPageWrapper />);
    await screen.findByText(BASE_ROW.name);
    fireEvent.click(screen.getByRole("button", { name: "אשרי" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(PHONE));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toastMock.info).not.toHaveBeenCalled();
  });
});

describe("the soft checklist confirm keeps a plain approve a one-argument call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockImplementation((url) =>
      url === "/admin/checklist-items"
        ? Promise.resolve({ data: [{ id: 1, label: "בדיקה" }] })
        : Promise.resolve({ data: [] }),
    );
  });

  it("a plain approve stays a one-argument call", async () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.attemptApprove(LICENSE_PENDING_ROW));
    act(() => result.current.confirmApprove());
    expect(approve.mock.calls[0]).toHaveLength(1);
  });
});
