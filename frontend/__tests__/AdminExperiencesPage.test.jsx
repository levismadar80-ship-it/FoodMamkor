import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import AdminExperiencesPage from "@/app/[locale]/admin/experiences/page";

// MEH-2280: unit coverage for the /admin/experiences moderation queue, which
// the MEH-1980 gap report measured at 0/67 statements. The page is treated as
// a state machine: the list in its 0 / 1 / many states, the per-row reveal
// (closed / open), and the three decisions — approve, request-changes, reject
// — asserted by WHICH endpoint `api.post` hits and WITH WHAT payload.
// `lib/api` is mocked at the module boundary; nothing here touches product
// code.
//
// Rendered under the REAL NextIntlClientProvider + he.json rather than the
// flat-map next-intl mock most admin tests use. Not taste: the page's `load`
// lists `t` in its useCallback deps (experiences/page.js:47) and the mount
// effect depends on `load`. A mock that hands back a fresh `t` every render
// would re-run the fetch on every render and the loading flag would never
// settle. The real translator is referentially stable per namespace, so the
// effect fires once — the same reason EditTabCategoriesCard.test.jsx chose it.

const PENDING = {
  id: "e1",
  title: "סדנת לחם מחמצת",
  status: "pending",
  host: { name: "נועה" },
  event_date: "2026-11-02T18:00:00Z",
  city: "חיפה",
  moderation_status: "FLAGGED",
  description: "סדנה של שלוש שעות עם מחמצת ביתית.",
  address: "רחוב הנמל 12",
  price_per_person: 0,
  requirements: "סינר",
  moderation_reason: "מחיר חסר",
  moderation_suggestion: "להוסיף מחיר",
};

const ROWS = [
  PENDING,
  { ...PENDING, id: "e2", title: "סיור בשוק", city: "ירושלים", moderation_status: "APPROVED", price_per_person: 80 },
  { ...PENDING, id: "e3", title: "ערב יין", city: "זכרון", moderation_status: null },
];

const apiMock = vi.hoisted(() => {
  const state = { rows: [], getError: null, postError: null };
  return {
    state,
    get: vi.fn(() =>
      state.getError ? Promise.reject(state.getError) : Promise.resolve({ data: state.rows }),
    ),
    post: vi.fn(() =>
      state.postError ? Promise.reject(state.postError) : Promise.resolve({ data: {} }),
    ),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }) => (
    <a href={typeof href === "string" ? href : "#"} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("@phosphor-icons/react", () => ({
  MapPin: (props) => <span {...props} />,
  Leaf: (props) => <span {...props} />,
  CurrencyCircleDollar: (props) => <span {...props} />,
  Lightbulb: (props) => <span {...props} />,
}));

const X = he.admin.experiences;
const COMMON = he.admin.common;

const bodyRows = () => document.querySelectorAll("tbody tr");

async function renderWith(rows) {
  apiMock.state.rows = rows;
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminExperiencesPage />
    </NextIntlClientProvider>,
  );
  // The loading copy is the gate that proves the fetch resolved before any
  // count below is read — a 0-row assertion taken during loading would pass
  // for the wrong reason.
  await waitFor(() => expect(screen.queryByText(COMMON.loading_f)).not.toBeInTheDocument());
}

function resetMocks() {
  apiMock.state.rows = [];
  apiMock.state.getError = null;
  apiMock.state.postError = null;
  apiMock.get.mockClear();
  apiMock.post.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
}

describe("AdminExperiencesPage — queue rendering (MEH-2280)", () => {
  beforeEach(resetMocks);

  it("loads the pending tab on mount — GET /admin/experiences?status=pending, once", async () => {
    await renderWith([]);
    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(apiMock.get).toHaveBeenCalledWith("/admin/experiences", {
      params: { status: "pending" },
    });
  });

  it("0 rows → the empty copy, and no table at all", async () => {
    await renderWith([]);
    expect(screen.getByText(X.empty)).toBeInTheDocument();
    expect(document.querySelector("table")).toBeNull();
  });

  it("1 row → exactly one body row carrying title, host, city and the Claude status", async () => {
    await renderWith([PENDING]);
    expect(screen.queryByText(X.empty)).not.toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
    const row = bodyRows()[0];
    expect(within(row).getByRole("button", { name: "סדנת לחם מחמצת" })).toBeInTheDocument();
    expect(within(row).getByText("נועה")).toBeInTheDocument();
    expect(within(row).getByText("חיפה")).toBeInTheDocument();
    // MEH-2426: the AI verdict renders as its Hebrew label, never the raw enum.
    expect(within(row).getByText(X.moderation_labels.FLAGGED)).toBeInTheDocument();
    expect(within(row).queryByText("FLAGGED")).not.toBeInTheDocument();
    expect(within(row).getByRole("link", { name: X.actions.view })).toHaveAttribute(
      "href",
      "/experiences/e1",
    );
  });

  it("many rows → one body row per experience; a null moderation_status renders as the dash", async () => {
    await renderWith(ROWS);
    expect(bodyRows()).toHaveLength(3);
    expect(within(bodyRows()[2]).getByText("—")).toBeInTheDocument();
  });

  it("a pending row offers all three decisions; an approved row hides approve, a rejected row hides reject", async () => {
    await renderWith([
      PENDING,
      { ...PENDING, id: "e2", title: "מאושרת", status: "approved" },
      { ...PENDING, id: "e3", title: "נדחתה", status: "rejected" },
    ]);
    const [pending, approved, rejected] = bodyRows();
    expect(within(pending).getByRole("button", { name: X.actions.approve })).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: X.actions.changes })).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: X.actions.reject })).toBeInTheDocument();
    expect(within(approved).queryByRole("button", { name: X.actions.approve })).toBeNull();
    expect(within(approved).getByRole("button", { name: X.actions.reject })).toBeInTheDocument();
    expect(within(rejected).queryByRole("button", { name: X.actions.reject })).toBeNull();
    expect(within(rejected).getByRole("button", { name: X.actions.approve })).toBeInTheDocument();
  });

  it("switching tab refetches with that status", async () => {
    await renderWith([]);
    fireEvent.click(screen.getByRole("button", { name: X.tabs.approved }));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    expect(apiMock.get).toHaveBeenLastCalledWith("/admin/experiences", {
      params: { status: "approved" },
    });
  });

  it("a load failure surfaces the backend detail and still shows the empty state", async () => {
    apiMock.state.getError = { response: { data: { detail: "אין הרשאה" } } };
    await renderWith([]);
    expect(screen.getByText("אין הרשאה")).toBeInTheDocument();
    expect(screen.getByText(X.empty)).toBeInTheDocument();
  });
});

describe("AdminExperiencesPage — row reveal (closed / open × 1 / many)", () => {
  beforeEach(resetMocks);

  it("1 row: closed hides the description; open shows it, the free-price copy and the Claude reason; closing removes it", async () => {
    await renderWith([PENDING]);
    expect(screen.queryByText(PENDING.description)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "סדנת לחם מחמצת" }));
    expect(screen.getByText(PENDING.description)).toBeInTheDocument();
    expect(screen.getByText(X.free)).toBeInTheDocument();
    expect(screen.getByText("רחוב הנמל 12")).toBeInTheDocument();
    expect(screen.getByText("מחיר חסר")).toBeInTheDocument();
    expect(screen.getByText("להוסיף מחיר")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "סדנת לחם מחמצת" }));
    expect(screen.queryByText(PENDING.description)).not.toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
  });

  it("many rows: opening one row adds exactly one detail row and prices a paid row per person", async () => {
    await renderWith(ROWS);
    fireEvent.click(screen.getByRole("button", { name: "סיור בשוק" }));
    expect(bodyRows()).toHaveLength(4);
    expect(screen.getByText("₪80 / אדם")).toBeInTheDocument();
    expect(screen.queryByText(X.free)).not.toBeInTheDocument();
  });
});

describe("AdminExperiencesPage — decision wiring", () => {
  beforeEach(resetMocks);

  it("approve → POST /admin/experiences/{id}/approve with no body, success toast, reload", async () => {
    await renderWith([PENDING]);
    fireEvent.click(screen.getByRole("button", { name: X.actions.approve }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/experiences/e1/approve");
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1));
    expect(toastMock.success.mock.calls[0][0]).toBe(X.approve_toast);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
  });

  it("approve failure → error toast with the backend detail, no reload", async () => {
    apiMock.state.postError = { response: { data: { detail: "החוויה כבר אושרה" } } };
    await renderWith([PENDING]);
    fireEvent.click(screen.getByRole("button", { name: X.actions.approve }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("החוויה כבר אושרה"));
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it("request-changes: opens the modal, refuses an empty note, then POSTs the TRIMMED feedback to /request-changes and closes", async () => {
    await renderWith([PENDING]);
    expect(screen.queryByRole("heading", { name: X.modal.changes_title })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: X.actions.changes }));
    expect(screen.getByRole("heading", { name: X.modal.changes_title })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: X.modal.submit }));
    expect(toastMock.error).toHaveBeenCalledWith(X.validate_feedback);
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: X.modal.changes_title })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  חסרה כתובת מדויקת  " } });
    fireEvent.click(screen.getByRole("button", { name: X.modal.submit }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/experiences/e1/request-changes", {
      feedback: "חסרה כתובת מדויקת",
    });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: X.modal.changes_title })).not.toBeInTheDocument(),
    );
    expect(toastMock.success).toHaveBeenCalledWith(X.changes_toast);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
  });

  it("reject: cancel closes without a call; submit POSTs the feedback to /reject", async () => {
    await renderWith([PENDING]);
    fireEvent.click(screen.getByRole("button", { name: X.actions.reject }));
    expect(screen.getByRole("heading", { name: X.modal.reject_title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: COMMON.cancel }));
    expect(screen.queryByRole("heading", { name: X.modal.reject_title })).not.toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: X.actions.reject }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "תוכן לא רלוונטי" } });
    fireEvent.click(screen.getByRole("button", { name: X.modal.submit }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/experiences/e1/reject", {
      feedback: "תוכן לא רלוונטי",
    });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: X.modal.reject_title })).not.toBeInTheDocument(),
    );
    expect(toastMock.success).toHaveBeenCalledWith(X.reject_toast);
  });

  it("a modal submit failure keeps the modal open and toasts the backend detail", async () => {
    apiMock.state.postError = { response: { data: { detail: "שגיאת שרת" } } };
    await renderWith([PENDING]);
    fireEvent.click(screen.getByRole("button", { name: X.actions.reject }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "סיבה" } });
    fireEvent.click(screen.getByRole("button", { name: X.modal.submit }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("שגיאת שרת"));
    expect(screen.getByRole("heading", { name: X.modal.reject_title })).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });
});

describe("AdminExperiencesPage — phone layout + AI label (MEH-2426)", () => {
  beforeEach(resetMocks);

  it("every known AI verdict renders its Hebrew label; an unknown one renders as-is", async () => {
    await renderWith([
      { ...PENDING, id: "a", moderation_status: "PENDING" },
      { ...PENDING, id: "b", moderation_status: "APPROVED" },
      { ...PENDING, id: "c", moderation_status: "REJECTED" },
      { ...PENDING, id: "d", moderation_status: "SOMETHING_NEW" },
    ]);
    const rows = bodyRows();
    expect(within(rows[0]).getByText(X.moderation_labels.PENDING)).toBeInTheDocument();
    expect(within(rows[1]).getByText(X.moderation_labels.APPROVED)).toBeInTheDocument();
    expect(within(rows[2]).getByText(X.moderation_labels.REJECTED)).toBeInTheDocument();
    expect(within(rows[3]).getByText("SOMETHING_NEW")).toBeInTheDocument();
  });

  it("the table stacks below md, and each value cell is labelled with its column header", async () => {
    await renderWith([PENDING]);
    const table = document.querySelector("table");
    expect(table).toHaveClass("table-stack");
    // overflow-hidden on the wrapper is what clipped the actions column at 375.
    expect(table.parentElement).not.toHaveClass("overflow-hidden");
    const labels = [...bodyRows()[0].querySelectorAll("td[data-label]")].map((td) =>
      td.getAttribute("data-label"),
    );
    expect(labels).toEqual([X.columns.host, X.columns.date, X.columns.city, X.columns.claude]);
    expect(bodyRows()[0].querySelectorAll('td[data-cell="actions"]')).toHaveLength(1);
  });
});
