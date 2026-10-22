import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import ProducersPageWrapper from "@/app/[locale]/admin/producers/page";
import { useReviewChecklist } from "@/app/[locale]/admin/producers/use-review-checklist";

// MEH-2299 — "אשרי בלי רישיון". Sapir, 22/10: a business with no license
// number may be approved case by case; it simply gets no badge. The backend has
// accepted `?allow_without_license=true` since MEH-971 chunk 4 (admin.py) — this
// ticket only gives it a control.
//
// What these cases must be able to tell apart, and why each one exists:
//   * the item appears on exactly ONE cell of status × license_pending
//     (pending × true). On any other cell the plain approve either works or
//     the row is not approvable at all, so an override there is noise.
//   * the override request carries the param, and the PLAIN approve does NOT —
//     a refactor that always sends the param would turn every approve into a
//     silent license bypass, which is the failure worth a red test.
//   * the override goes through the soft checklist confirm and survives it —
//     dropping `opts` in confirmApprove would send a plain approve that 422s,
//     which looks like "the button does nothing".

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
const NO_LICENSE_ISSUE_ROW = { ...BASE_ROW, license_pending: false };
const APPROVED_LICENSE_ROW = { ...BASE_ROW, status: "approved", slug: "dairy", license_pending: true };

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

describe("MEH-2299 — approve without license: which rows offer it", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers it on a pending row whose license is pending — exactly once", async () => {
    await openMenu([LICENSE_PENDING_ROW]);
    expect(screen.getAllByRole("menuitem", { name: LABEL })).toHaveLength(1);
  });

  it("does NOT offer it on a pending row with no license issue", async () => {
    await openMenu([NO_LICENSE_ISSUE_ROW]);
    // control: the menu IS open — otherwise "absent" proves nothing
    expect(screen.getByRole("menuitem", { name: "דחייה" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: LABEL })).not.toBeInTheDocument();
  });

  it("does NOT offer it on an approved row, even if license_pending", async () => {
    await openMenu([APPROVED_LICENSE_ROW]);
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(screen.queryByRole("menuitem", { name: LABEL })).not.toBeInTheDocument();
  });
});

describe("MEH-2299 — the request it sends", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends allow_without_license=true", async () => {
    await openMenu([LICENSE_PENDING_ROW]);
    fireEvent.click(screen.getByRole("menuitem", { name: LABEL }));
    await waitFor(() => expect(approveCalls()).toHaveLength(1));
    expect(approveCalls()[0]).toEqual([
      "/admin/producers/7/approve",
      undefined,
      { params: { allow_without_license: true } },
    ]);
  });

  it("the plain approve still sends NO override", async () => {
    mockApi([LICENSE_PENDING_ROW]);
    render(<ProducersPageWrapper />);
    await screen.findByText(BASE_ROW.name);
    fireEvent.click(screen.getByRole("button", { name: "אשרי" }));
    await waitFor(() => expect(approveCalls()).toHaveLength(1));
    expect(approveCalls()[0]).toEqual(["/admin/producers/7/approve"]);
  });
});

describe("MEH-2299 — the override survives the soft checklist confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // One ACTIVE item, nothing ticked => attemptApprove must open the confirm
    // instead of approving, and the confirm must carry opts through.
    apiMock.get.mockImplementation((url) =>
      url === "/admin/checklist-items"
        ? Promise.resolve({ data: [{ id: 1, label: "בדיקה" }] })
        : Promise.resolve({ data: [] }),
    );
  });

  it("confirmApprove passes { withoutLicense: true } to approve", async () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.attemptApprove(LICENSE_PENDING_ROW, { withoutLicense: true }));
    expect(approve).not.toHaveBeenCalled();
    expect(result.current.approveConfirm).not.toBeNull();

    act(() => result.current.confirmApprove());
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith(LICENSE_PENDING_ROW, { withoutLicense: true });
  });
});
