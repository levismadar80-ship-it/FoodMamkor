import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProducersPageWrapper from "@/app/[locale]/admin/producers/page";

// MEH-226 — admin reject flow: kebab item -> modal (preset radios + free
// text) -> confirm step -> POST /admin/producers/{id}/reject.
//
// Mirrors AdminProducerDelete.test.jsx (MEH-1027 Ch.B) — same whole-page
// mount, same kebab entry point, same api/toast/icon mocks.
//
// The load-bearing assertion in this file is that the preset labels come from
// the BACKEND. The mocked endpoint therefore returns labels that appear
// nowhere in he.json ("«סיבה ראשונה מהשרת»" etc.). A future refactor that
// hardcodes the Hebrew list in the component would still render five radios
// and still submit — and would fail here, which is the entire point: the
// persisted reason and the owner's email are composed from the backend dict,
// so a divergent frontend copy is a silent wrong-email bug.

const PRESETS = [
  { key: "missing_docs", label: "«סיבה ראשונה מהשרת»" },
  { key: "missing_image", label: "«סיבה שנייה מהשרת»" },
  { key: "other", label: "«אחר מהשרת»" },
];

const PENDING_ROW = {
  id: 7,
  name: "מאפיית הבוקר",
  city: "רעננה",
  status: "pending",
  slug: null,
  ambassador: false,
  categories: [],
};
const APPROVED_ROW = { ...PENDING_ROW, id: 8, name: "חוות הזית", status: "approved", slug: "olive" };

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
// MEH-990-class whole-page mock. Wider than AdminProducerDelete's list on
// purpose: these rows are `pending`, which mounts AdminReviewChecklist
// (CaretDown / CaretRight / ClipboardText) — a component an approved-only
// fixture never reaches.
vi.mock("@phosphor-icons/react", () => ({
  CaretDown: (p) => <span {...p} />,
  CaretRight: (p) => <span {...p} />,
  Check: (p) => <span {...p} />,
  Circle: (p) => <span {...p} />,
  ClipboardText: (p) => <span {...p} />,
  Cow: (p) => <span {...p} />,
  DotsThreeVertical: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
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
    "admin.producers.table.actions.reject": "דחייה",
    "admin.producers.reject.modal_title": "דחיית בקשת בית עסק",
    "admin.producers.reject.preset_legend": "סיבת הדחייה",
    "admin.producers.reject.free_text_label_required": "פירוט (חובה)",
    "admin.producers.reject.free_text_label_optional": "פירוט נוסף (רשות)",
    "admin.producers.reject.free_text_placeholder": "אפשר להוסיף פרטים…",
    "admin.producers.reject.submit": "דחה ושלח מייל",
    "admin.producers.reject.confirm": "פעולה זו תשלח מייל לבית העסק. להמשיך?",
    "admin.producers.reject.presets_error": "לא הצלחנו לטעון את סיבות הדחייה.",
    "admin.producers.reject.invalid_input": "יש לבחור סיבה, ולפרט כשנבחר 'אחר'.",
    "admin.producers.reject.toast_rejected": "הבקשה נדחתה והמייל נשלח.",
    "admin.common.cancel": "ביטול",
    "admin.common.sending": "שולחים…",
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

function mockApi({ rows = [PENDING_ROW], presetsFail = false } = {}) {
  apiMock.get.mockImplementation((url) => {
    if (url === "/admin/producers") return Promise.resolve({ data: rows });
    if (url === "/admin/producers/rejection-presets") {
      return presetsFail
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: PRESETS });
    }
    return Promise.resolve({ data: [] });
  });
}

async function openModal(rowName = "מאפיית הבוקר") {
  render(<ProducersPageWrapper />);
  await screen.findByText(rowName);
  fireEvent.click(screen.getAllByRole("button", { name: "פעולות נוספות" })[0]);
  fireEvent.click(screen.getByRole("menuitem", { name: "דחייה" }));
  return screen.getByRole("dialog");
}

describe("Admin producers — reject flow (MEH-226)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.post.mockImplementation(() => Promise.resolve({ data: {} }));
    mockApi();
  });

  // --- kebab gating: the guard most likely to regress ----------------------

  it("offers דחייה on a pending row", async () => {
    render(<ProducersPageWrapper />);
    await screen.findByText("מאפיית הבוקר");
    fireEvent.click(screen.getAllByRole("button", { name: "פעולות נוספות" })[0]);
    expect(screen.getByRole("menuitem", { name: "דחייה" })).toBeInTheDocument();
  });

  it("does NOT offer דחייה on an approved row", async () => {
    mockApi({ rows: [APPROVED_ROW] });
    render(<ProducersPageWrapper />);
    await screen.findByText("חוות הזית");
    fireEvent.click(screen.getAllByRole("button", { name: "פעולות נוספות" })[0]);
    expect(screen.queryByRole("menuitem", { name: "דחייה" })).not.toBeInTheDocument();
  });

  // --- the modal renders BACKEND labels, not its own -----------------------

  it("renders the preset labels served by the backend", async () => {
    const dialog = await openModal();
    await waitFor(() =>
      expect(within(dialog).getByText("«סיבה ראשונה מהשרת»")).toBeInTheDocument(),
    );
    for (const p of PRESETS) {
      expect(within(dialog).getByText(p.label)).toBeInTheDocument();
    }
    expect(apiMock.get).toHaveBeenCalledWith("/admin/producers/rejection-presets");
  });

  it("shows an error (and no radios) when the presets fetch fails", async () => {
    mockApi({ presetsFail: true });
    const dialog = await openModal();
    await waitFor(() =>
      expect(within(dialog).getByTestId("reject-presets-error")).toBeInTheDocument(),
    );
    expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
  });

  // --- nothing is sent until the admin confirms ----------------------------

  it("opening the modal fires no POST", async () => {
    await openModal();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("submit is disabled until a preset is chosen", async () => {
    const dialog = await openModal();
    await waitFor(() => within(dialog).getByText("«סיבה ראשונה מהשרת»"));
    expect(within(dialog).getByTestId("reject-open-confirm")).toBeDisabled();

    fireEvent.click(within(dialog).getAllByRole("radio")[0]);
    expect(within(dialog).getByTestId("reject-open-confirm")).not.toBeDisabled();
  });

  it("'other' keeps submit disabled until free text is typed", async () => {
    const dialog = await openModal();
    await waitFor(() => within(dialog).getByText("«אחר מהשרת»"));

    fireEvent.click(within(dialog).getByRole("radio", { name: "«אחר מהשרת»" }));
    expect(within(dialog).getByTestId("reject-open-confirm")).toBeDisabled();

    // whitespace alone is not detail
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "   " } });
    expect(within(dialog).getByTestId("reject-open-confirm")).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "חסר היתר" } });
    expect(within(dialog).getByTestId("reject-open-confirm")).not.toBeDisabled();
  });

  it("shows the confirm step before sending, and still fires no POST", async () => {
    const dialog = await openModal();
    await waitFor(() => within(dialog).getByText("«סיבה ראשונה מהשרת»"));
    fireEvent.click(within(dialog).getAllByRole("radio")[0]);
    fireEvent.click(within(dialog).getByTestId("reject-open-confirm"));

    expect(within(dialog).getByTestId("reject-confirm-message")).toHaveTextContent(
      "פעולה זו תשלח מייל לבית העסק. להמשיך?",
    );
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("cancelling the confirm step returns to the form and fires no POST", async () => {
    const dialog = await openModal();
    await waitFor(() => within(dialog).getByText("«סיבה ראשונה מהשרת»"));
    fireEvent.click(within(dialog).getAllByRole("radio")[0]);
    fireEvent.click(within(dialog).getByTestId("reject-open-confirm"));
    fireEvent.click(within(dialog).getByText("ביטול"));

    expect(within(dialog).getByTestId("reject-open-confirm")).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  // --- the send itself -----------------------------------------------------

  it("confirming POSTs preset_key + trimmed reason, closes, reloads and toasts", async () => {
    const dialog = await openModal();
    await waitFor(() => within(dialog).getByText("«סיבה ראשונה מהשרת»"));
    fireEvent.click(within(dialog).getAllByRole("radio")[0]);
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "  הרישיון פג  " },
    });
    const getCallsBefore = apiMock.get.mock.calls.length;
    fireEvent.click(within(dialog).getByTestId("reject-open-confirm"));
    fireEvent.click(within(dialog).getByTestId("reject-confirm-submit"));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/7/reject", {
        preset_key: "missing_docs",
        reason: "הרישיון פג",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
    expect(toastMock.success).toHaveBeenCalledWith("הבקשה נדחתה והמייל נשלח.");
  });

  it("a 400 surfaces the invalid-input toast and leaves the modal open", async () => {
    apiMock.post.mockImplementation(() =>
      Promise.reject({ response: { status: 400, data: { detail: "סיבת דחייה לא מוכרת" } } }),
    );
    const dialog = await openModal();
    await waitFor(() => within(dialog).getByText("«סיבה ראשונה מהשרת»"));
    fireEvent.click(within(dialog).getAllByRole("radio")[0]);
    fireEvent.click(within(dialog).getByTestId("reject-open-confirm"));
    fireEvent.click(within(dialog).getByTestId("reject-confirm-submit"));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("יש לבחור סיבה, ולפרט כשנבחר 'אחר'."),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Escape closes the modal without sending", async () => {
    await openModal();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
