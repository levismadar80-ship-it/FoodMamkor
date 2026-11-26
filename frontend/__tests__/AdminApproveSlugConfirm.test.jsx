// MEH-3914: a business with no English address answers approve with 422
// `slug_required` and a suggestion. The admin sees it in a dialog, may edit
// it, and the approve is sent again with `?slug=`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProducersPageWrapper from "@/app/[locale]/admin/producers/page";

const ROW = { id: 7, name: "סנדרה פרו", city: "עמיקם", status: "pending", slug: null, ambassador: false, categories: [] };

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
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
// REUSES: __tests__/AdminApproveWithoutLicense.test.jsx — the explicit icon list.
vi.mock("@phosphor-icons/react", () => {
  const I = (p) => <span {...p} />;
  return {
    CaretDown: I, CaretRight: I, Check: I, Circle: I, ClipboardText: I, Cow: I,
    DotsThreeVertical: I, Leaf: I, Star: I, Package: I, Seal: I, StarOfDavid: I, Truck: I, Warning: I,
  };
});
vi.mock("@/components/StoryCardCanvas", () => ({ default: () => null }));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) =>
    ({ "admin.producers.table.actions.approve_short": "אשרי" })[scope ? `${scope}.${key}` : key] ??
    (scope ? `${scope}.${key}` : key),
}));

const URL = "/admin/producers/7/approve";
const approveCalls = () => apiMock.post.mock.calls.filter(([u]) => u === URL);
const SLUG_REQUIRED = {
  response: { status: 422, data: { detail: { code: "slug_required", message: "x", suggested: "sndra-pro" } } },
};

async function clickApprove() {
  apiMock.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/admin/producers" ? [ROW] : [] }),
  );
  render(<ProducersPageWrapper />);
  await screen.findByText(ROW.name);
  fireEvent.click(screen.getByRole("button", { name: "אשרי" }));
}

describe("approve asks for the English address (MEH-3914)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.post.mockImplementation((url, _body, config) =>
      url === URL && !config?.params?.slug ? Promise.reject(SLUG_REQUIRED) : Promise.resolve({ data: {} }),
    );
  });

  it("shows the suggestion and sends nothing more until the admin confirms", async () => {
    await clickApprove();
    const input = await screen.findByTestId("slug-confirm-input");
    expect(input.value).toBe("sndra-pro");
    expect(approveCalls()).toHaveLength(1);
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("sends the edited address, normalised, and closes on success", async () => {
    await clickApprove();
    const input = await screen.findByTestId("slug-confirm-input");
    fireEvent.change(input, { target: { value: "Sandra Perot" } });
    fireEvent.click(screen.getByText("admin.producers.slug_confirm.confirm"));
    await waitFor(() => expect(approveCalls()).toHaveLength(2));
    expect(approveCalls()[1]).toEqual([URL, undefined, { params: { slug: "sandra-perot" } }]);
    await waitFor(() => expect(screen.queryByTestId("slug-confirm-dialog")).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("refuses a Hebrew address in the dialog without sending it", async () => {
    await clickApprove();
    const input = await screen.findByTestId("slug-confirm-input");
    fireEvent.change(input, { target: { value: "סנדרה" } });
    fireEvent.click(screen.getByText("admin.producers.slug_confirm.confirm"));
    expect(await screen.findByText("admin.producers.slug_confirm.invalid")).toBeInTheDocument();
    expect(approveCalls()).toHaveLength(1);
  });

  it("cancel closes the dialog and approves nothing", async () => {
    await clickApprove();
    await screen.findByTestId("slug-confirm-input");
    fireEvent.click(screen.getByText("admin.producers.slug_confirm.cancel"));
    await waitFor(() => expect(screen.queryByTestId("slug-confirm-dialog")).not.toBeInTheDocument());
    expect(approveCalls()).toHaveLength(1);
  });
});
