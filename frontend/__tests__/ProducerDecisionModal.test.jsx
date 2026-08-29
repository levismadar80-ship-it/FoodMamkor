import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProducersPageWrapper from "@/app/[locale]/admin/producers/page";

// MEH-2209 — the admin decision modal: ONE composer whose chosen REASON picks
// the endpoint. A fixable reason sends POST /request-changes (the business
// stays pending); the terminal one sends POST /reject.
//
// Supersedes __tests__/AdminProducerReject.test.jsx (MEH-226), whose component
// this ticket deleted. Every assertion that file carried is reproduced below —
// backend-owned labels, the presets-error state, "nothing is sent until the
// admin confirms", the 400 toast, Escape, and the pending-only kebab gate —
// alongside the seven cases MEH-2209 adds.
//
// The load-bearing assertion is still that the reason labels come from the
// BACKEND. The mocked endpoint therefore returns labels that appear nowhere in
// he.json ("«מסמכים מהשרת»" etc.). A refactor that hardcodes the Hebrew list in
// the component would still render radios and still submit — and would fail
// here, which is the entire point: the persisted reason and the owner's email
// are composed from the backend dict, so a divergent frontend copy is a silent
// wrong-email bug.
//
// `future_reason` is deliberately a key the frontend has never heard of. It
// must land in the TERMINAL group: before this ticket every reason rejected,
// so an unrecognised key keeps today's behavior rather than silently promising
// a business owner a second chance nobody intended.

const PRESETS = [
  { key: "missing_docs", label: "«מסמכים מהשרת»" },
  { key: "missing_image", label: "«תמונה מהשרת»" },
  { key: "incomplete_info", label: "«מידע מהשרת»" },
  { key: "not_eligible", label: "«לא כשיר מהשרת»" },
  { key: "future_reason", label: "«סיבה עתידית מהשרת»" },
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
    "admin.producers.table.actions.request_changes": "בקשת השלמה",
    "admin.producers.table.actions.approve_short": "אשרי",
    "admin.producers.decision.modal_title": 'החלטה על הבקשה של "{name}"',
    "admin.producers.decision.changes_legend": "בקשת השלמה",
    "admin.producers.decision.changes_helper": "בית העסק נשאר בתור הבדיקה",
    "admin.producers.decision.reject_legend": "דחייה",
    "admin.producers.decision.reject_helper": "בית העסק לא יופיע באתר",
    "admin.producers.decision.other": "אחר",
    "admin.producers.decision.free_text_label_required": "פירוט לבעלת העסק (חובה)",
    "admin.producers.decision.free_text_label_optional": "פירוט לבעלת העסק (אופציונלי)",
    "admin.producers.decision.free_text_placeholder": "מה בדיוק חסר",
    "admin.producers.decision.submit_changes": "שליחת בקשת השלמה",
    "admin.producers.decision.submit_reject": "דחייה ושליחת מייל",
    "admin.producers.reject.confirm": "פעולה זו תשלח מייל לבית העסק. להמשיך?",
    "admin.producers.reject.presets_error": "לא הצלחנו לטעון את סיבות הדחייה.",
    "admin.producers.reject.invalid_input": "יש לבחור סיבה, ולפרט כשנבחר 'אחר'.",
    "admin.producers.reject.toast_rejected": "הבקשה נדחתה והמייל נשלח.",
    "admin.producers.request_changes.invalid_state": "ניתן לשלוח בקשת השלמה רק לבית עסק בהמתנה.",
    "admin.producers.request_changes.approve_blocked_info": "לא ניתן לאשר עדיין.",
    "admin.producers.request_changes.chips.photo": "חסרה תמונה — יש להעלות לפחות תמונה אחת",
    "admin.producers.request_changes.chips.license": "חסר מספר רישיון יצרן",
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
    // Empty ACTIVE checklist => itemsLoaded true and 0 unchecked, so
    // attemptApprove (MEH-1396) calls approve directly instead of opening its
    // soft confirm. That keeps the approve-422 case below about MEH-2209.
    if (url === "/admin/checklist-items") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

const fieldsets = (dialog) => [...dialog.querySelectorAll("fieldset")];
const radio = (dialog, value) => dialog.querySelector(`input[value="${value}"]`);
const submitBtn = (dialog) => within(dialog).getByTestId("decision-submit");
const textbox = (dialog) => within(dialog).getByRole("textbox");

async function openViaKebab(rowName = "מאפיית הבוקר") {
  render(<ProducersPageWrapper />);
  await screen.findByText(rowName);
  fireEvent.click(screen.getAllByRole("button", { name: "פעולות נוספות" })[0]);
  fireEvent.click(screen.getByRole("menuitem", { name: "דחייה" }));
  const dialog = screen.getByRole("dialog");
  await waitFor(() => expect(radio(dialog, "changes:missing_docs")).toBeTruthy());
  return dialog;
}

describe("Admin producers — decision modal (MEH-2209)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.post.mockImplementation(() => Promise.resolve({ data: {} }));
    mockApi();
  });

  // --- entry points --------------------------------------------------------

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

  it("the row's בקשת השלמה button opens the SAME modal, focused on group 1 with nothing chosen", async () => {
    render(<ProducersPageWrapper />);
    await screen.findByText("מאפיית הבוקר");
    fireEvent.click(screen.getByRole("button", { name: "בקשת השלמה" }));

    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(radio(dialog, "changes:missing_docs")).toBeTruthy());
    expect(dialog).toHaveAttribute("data-testid", "decision-modal");
    // focused, NOT selected — the submit stays disabled until she chooses.
    expect(document.activeElement).toBe(radio(dialog, "changes:missing_docs"));
    expect(radio(dialog, "changes:missing_docs").checked).toBe(false);
    expect(submitBtn(dialog)).toBeDisabled();
  });

  // --- (e) native radios, one name per fieldset ----------------------------

  it("(e) renders two native fieldsets, each with its own radio group name", async () => {
    const dialog = await openViaKebab();
    const [changes, reject] = fieldsets(dialog);

    expect(fieldsets(dialog)).toHaveLength(2);
    expect(within(changes).getByText("בקשת השלמה")).toBeInTheDocument();
    expect(within(reject).getByText("דחייה")).toBeInTheDocument();

    for (const [fs, name] of [[changes, "decision-changes"], [reject, "decision-reject"]]) {
      const inputs = [...fs.querySelectorAll("input")];
      expect(inputs.length).toBeGreaterThan(1);
      for (const input of inputs) {
        expect(input.type).toBe("radio");
        expect(input.name).toBe(name);
        // MEH-2199: native semantics only — no hand-rolled ARIA that would
        // promise a keyboard layer this component does not implement.
        expect(input.getAttribute("role")).toBeNull();
      }
    }
    expect(dialog.querySelector('[role="radiogroup"]')).toBeNull();
  });

  // --- backend-owned labels + partition -----------------------------------

  it("renders the labels served by the backend, split by preset key", async () => {
    const dialog = await openViaKebab();
    const [changes, reject] = fieldsets(dialog);

    expect(within(changes).getByText("«מסמכים מהשרת»")).toBeInTheDocument();
    expect(within(changes).getByText("«תמונה מהשרת»")).toBeInTheDocument();
    expect(within(changes).getByText("«מידע מהשרת»")).toBeInTheDocument();
    expect(within(reject).getByText("«לא כשיר מהשרת»")).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith("/admin/producers/rejection-presets");

    // "אחר" is chrome in BOTH groups, and the backend's own `other` label
    // ("אחר (פירוט חופשי)" — an input affordance, not a reason) is not shown.
    expect(within(changes).getByText("אחר")).toBeInTheDocument();
    expect(within(reject).getByText("אחר")).toBeInTheDocument();
    expect(within(dialog).queryByText("«אחר מהשרת»")).not.toBeInTheDocument();
  });

  it("(f) a preset key the frontend does not know lands in the TERMINAL group", async () => {
    const dialog = await openViaKebab();
    const [changes, reject] = fieldsets(dialog);

    expect(within(reject).getByText("«סיבה עתידית מהשרת»")).toBeInTheDocument();
    expect(within(changes).queryByText("«סיבה עתידית מהשרת»")).not.toBeInTheDocument();

    fireEvent.click(radio(dialog, "reject:future_reason"));
    expect(submitBtn(dialog)).toHaveTextContent("דחייה ושליחת מייל");
  });

  // --- (a) the completion path --------------------------------------------

  it("(a) a group-1 preset POSTs request-changes with the fetched label, and label: text when detailed", async () => {
    let dialog = await openViaKebab();
    fireEvent.click(radio(dialog, "changes:missing_image"));
    expect(submitBtn(dialog)).toHaveTextContent("שליחת בקשת השלמה");
    // No confirm step on the non-terminal path — one click sends.
    fireEvent.click(submitBtn(dialog));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/7/request-changes", {
        feedback: "«תמונה מהשרת»",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    vi.clearAllMocks();
    mockApi();
    dialog = await openViaKebab();
    fireEvent.click(radio(dialog, "changes:missing_image"));
    fireEvent.change(textbox(dialog), { target: { value: "  התמונה מטושטשת  " } });
    fireEvent.click(submitBtn(dialog));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/7/request-changes", {
        feedback: "«תמונה מהשרת»: התמונה מטושטשת",
      }),
    );
  });

  it("(d) group-1 אחר sends the free text ALONE — no label prefix", async () => {
    const dialog = await openViaKebab();
    fireEvent.click(radio(dialog, "changes:other"));
    fireEvent.change(textbox(dialog), { target: { value: "  חסר תיאור העסק  " } });
    fireEvent.click(submitBtn(dialog));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/7/request-changes", {
        feedback: "חסר תיאור העסק",
      }),
    );
  });

  it("a 409 on the completion path surfaces its own toast and leaves the modal open", async () => {
    apiMock.post.mockImplementation(() => Promise.reject({ response: { status: 409 } }));
    const dialog = await openViaKebab();
    fireEvent.click(radio(dialog, "changes:missing_docs"));
    fireEvent.click(submitBtn(dialog));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("ניתן לשלוח בקשת השלמה רק לבית עסק בהמתנה."),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // --- (b) the terminal path ----------------------------------------------

  it("(b) a group-2 preset keeps the confirm step, then POSTs preset_key + trimmed reason", async () => {
    const dialog = await openViaKebab();
    fireEvent.click(radio(dialog, "reject:not_eligible"));
    expect(submitBtn(dialog)).toHaveTextContent("דחייה ושליחת מייל");
    fireEvent.change(textbox(dialog), { target: { value: "  לא עומד בתנאים  " } });

    fireEvent.click(submitBtn(dialog));
    expect(within(dialog).getByTestId("decision-confirm-message")).toHaveTextContent(
      "פעולה זו תשלח מייל לבית העסק. להמשיך?",
    );
    expect(apiMock.post).not.toHaveBeenCalled();

    const getCallsBefore = apiMock.get.mock.calls.length;
    fireEvent.click(within(dialog).getByTestId("decision-confirm-submit"));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/7/reject", {
        preset_key: "not_eligible",
        reason: "לא עומד בתנאים",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
    expect(toastMock.success).toHaveBeenCalledWith("הבקשה נדחתה והמייל נשלח.");
  });

  it("cancelling the confirm step returns to the form and fires no POST", async () => {
    const dialog = await openViaKebab();
    fireEvent.click(radio(dialog, "reject:not_eligible"));
    fireEvent.click(submitBtn(dialog));
    fireEvent.click(within(dialog).getByText("ביטול"));

    expect(within(dialog).getByTestId("decision-submit")).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("a 400 on the terminal path surfaces the invalid-input toast and leaves the modal open", async () => {
    apiMock.post.mockImplementation(() => Promise.reject({ response: { status: 400 } }));
    const dialog = await openViaKebab();
    fireEvent.click(radio(dialog, "reject:not_eligible"));
    fireEvent.click(submitBtn(dialog));
    fireEvent.click(within(dialog).getByTestId("decision-confirm-submit"));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("יש לבחור סיבה, ולפרט כשנבחר 'אחר'."),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // --- (c) the "אחר" lock, in BOTH groups ---------------------------------

  it("(c) אחר keeps submit disabled until free text is typed — in both groups", async () => {
    const dialog = await openViaKebab();

    fireEvent.click(radio(dialog, "changes:other"));
    expect(submitBtn(dialog)).toBeDisabled();
    // whitespace alone is not detail
    fireEvent.change(textbox(dialog), { target: { value: "   " } });
    expect(submitBtn(dialog)).toBeDisabled();
    fireEvent.change(textbox(dialog), { target: { value: "משהו" } });
    expect(submitBtn(dialog)).not.toBeDisabled();

    fireEvent.change(textbox(dialog), { target: { value: "" } });
    fireEvent.click(radio(dialog, "reject:other"));
    expect(submitBtn(dialog)).toBeDisabled();
    fireEvent.change(textbox(dialog), { target: { value: "לא רלוונטי" } });
    expect(submitBtn(dialog)).not.toBeDisabled();

    // a PRESET, by contrast, needs no free text at all
    fireEvent.change(textbox(dialog), { target: { value: "" } });
    fireEvent.click(radio(dialog, "changes:incomplete_info"));
    expect(submitBtn(dialog)).not.toBeDisabled();
  });

  // --- (g) approve-422 ----------------------------------------------------

  it("(g) an approve-422 photo gate opens the modal preselected + chip-prefilled, and one click sends", async () => {
    apiMock.post.mockImplementation((url) =>
      url.endsWith("/approve")
        ? Promise.reject({ response: { status: 422, data: { detail: "חסרה תמונה ראשית" } } })
        : Promise.resolve({ data: {} }),
    );
    render(<ProducersPageWrapper />);
    await screen.findByText("מאפיית הבוקר");
    fireEvent.click(screen.getByRole("button", { name: "אשרי" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(radio(dialog, "changes:missing_image").checked).toBe(true));
    expect(textbox(dialog)).toHaveValue("חסרה תמונה — יש להעלות לפחות תמונה אחת");
    expect(submitBtn(dialog)).toHaveTextContent("שליחת בקשת השלמה");
    expect(submitBtn(dialog)).not.toBeDisabled();
    expect(toastMock.info).toHaveBeenCalledWith("לא ניתן לאשר עדיין.");

    fireEvent.click(submitBtn(dialog));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/7/request-changes", {
        feedback: "«תמונה מהשרת»: חסרה תמונה — יש להעלות לפחות תמונה אחת",
      }),
    );
  });

  it("(g′) the licence gate preselects missing_docs and keeps the more specific chip text", async () => {
    apiMock.post.mockImplementation((url) =>
      url.endsWith("/approve")
        ? Promise.reject({ response: { status: 422, data: { detail: "חסר מספר רישיון" } } })
        : Promise.resolve({ data: {} }),
    );
    render(<ProducersPageWrapper />);
    await screen.findByText("מאפיית הבוקר");
    fireEvent.click(screen.getByRole("button", { name: "אשרי" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(radio(dialog, "changes:missing_docs").checked).toBe(true));
    expect(textbox(dialog)).toHaveValue("חסר מספר רישיון יצרן");
  });

  // --- (#19) the required-field affordance ---------------------------------

  it("(#19) the free-text label states required vs optional, in both groups", async () => {
    const dialog = await openViaKebab();
    const label = () => dialog.querySelector('label[for="decision-free-text"]').textContent;

    // nothing chosen yet — the field is genuinely optional
    expect(label()).toBe("פירוט לבעלת העסק (אופציונלי)");
    expect(textbox(dialog)).toHaveAttribute("aria-required", "false");

    // group 1 "אחר" — required
    fireEvent.click(radio(dialog, "changes:other"));
    expect(label()).toBe("פירוט לבעלת העסק (חובה)");
    expect(textbox(dialog)).toHaveAttribute("aria-required", "true");

    // a group-1 PRESET needs no detail — back to optional
    fireEvent.click(radio(dialog, "changes:missing_docs"));
    expect(label()).toBe("פירוט לבעלת העסק (אופציונלי)");
    expect(textbox(dialog)).toHaveAttribute("aria-required", "false");

    // group 2 "אחר" — required on that side too
    fireEvent.click(radio(dialog, "reject:other"));
    expect(label()).toBe("פירוט לבעלת העסק (חובה)");
    expect(textbox(dialog)).toHaveAttribute("aria-required", "true");

    // and a group-2 preset is optional again
    fireEvent.click(radio(dialog, "reject:not_eligible"));
    expect(label()).toBe("פירוט לבעלת העסק (אופציונלי)");
    expect(textbox(dialog)).toHaveAttribute("aria-required", "false");

    // the label drives the ACCESSIBLE NAME, not just visible ink — a screen
    // reader must hear the requirement, which is the point of the change.
    fireEvent.click(radio(dialog, "changes:other"));
    expect(
      within(dialog).getByRole("textbox", { name: "פירוט לבעלת העסק (חובה)" }),
    ).toBeInTheDocument();
  });

  // --- carried over from the MEH-226 suite --------------------------------

  it("shows an error (and no radios) when the presets fetch fails", async () => {
    mockApi({ presetsFail: true });
    render(<ProducersPageWrapper />);
    await screen.findByText("מאפיית הבוקר");
    fireEvent.click(screen.getAllByRole("button", { name: "פעולות נוספות" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "דחייה" }));

    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByTestId("decision-presets-error")).toBeInTheDocument(),
    );
    expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
    expect(within(dialog).queryByTestId("decision-submit")).not.toBeInTheDocument();
  });

  it("opening the modal fires no POST, and Escape closes it without sending", async () => {
    await openViaKebab();
    expect(apiMock.post).not.toHaveBeenCalled();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("names the business in the title", async () => {
    const dialog = await openViaKebab();
    expect(within(dialog).getByRole("heading")).toHaveTextContent(
      'החלטה על הבקשה של "מאפיית הבוקר"',
    );
  });
});
