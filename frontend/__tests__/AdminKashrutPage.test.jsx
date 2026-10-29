import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import AdminKashrutPage from "@/app/[locale]/admin/kashrut/page";

// MEH-2280: unit coverage for the /admin/kashrut verification queue, measured
// at 0/57 statements by the MEH-1980 gap report. Legally sensitive surface:
// kosher is admin-verified under חוק איסור הונאה בכשרות (labels.md), so the
// one invariant this file owns beyond the state machine is that the page
// never shows an «מאומת» state from anything the business declared about
// itself. The verified-only listing rule itself (`producer_listing.py`
// `_kosher_condition`) is backend-owned and is NOT re-tested here.
//
// Rendered under the REAL NextIntlClientProvider + he.json: `load` lists `t`
// in its useCallback deps (kashrut/page.js:56) and the mount effect depends on
// `load`, so a per-render `t` mock would refetch on every render and the
// loading flag would never settle. Same reasoning as
// AdminExperiencesPage.test.jsx / EditTabCategoriesCard.test.jsx.

const REQUEST = {
  id: "k1",
  producer_id: "p1",
  producer_name: "מחלבת הגליל",
  badge_code: "rabanut",
  cert_url: "https://res.cloudinary.com/demo/cert.jpg",
  status: "pending",
  notes: null,
  created_at: "2026-10-01T08:00:00Z",
};

const ROWS = [
  REQUEST,
  { ...REQUEST, id: "k2", producer_name: "מאפיית השכונה", badge_code: "organic-kosher", cert_url: null },
  { ...REQUEST, id: "k3", producer_name: "יקב ההר", badge_code: "not-a-known-code", notes: "נשלח שוב" },
];

const apiMock = vi.hoisted(() => {
  const state = { rows: [], getError: null, postError: null, reminders: null };
  return {
    state,
    get: vi.fn(() =>
      state.getError ? Promise.reject(state.getError) : Promise.resolve({ data: state.rows }),
    ),
    post: vi.fn((url) => {
      if (state.postError) return Promise.reject(state.postError);
      if (url === "/admin/kashrut/expiry-reminders") return Promise.resolve({ data: state.reminders });
      return Promise.resolve({ data: {} });
    }),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@phosphor-icons/react", () => ({
  ArrowSquareOut: (props) => <span {...props} />,
  StarOfDavid: (props) => <span {...props} />,
  X: (props) => <span {...props} />,
}));

const K = he.admin.kashrut;
const COMMON = he.admin.common;
const BADGES = he.kashrut.badges;

const bodyRows = () => document.querySelectorAll("tbody tr");
const statusSelect = () => screen.getByRole("combobox");
// The reject modal carries no role="dialog"; its panel is the h2's parent.
const rejectPanel = () => screen.getByRole("heading", { name: K.reject_modal.title }).parentElement;
const approvePanel = () => screen.getByRole("heading", { name: K.approve_modal.title }).parentElement;
const revokePanel = () => screen.getByRole("heading", { name: K.revoke_modal.title }).parentElement;

async function renderWith(rows) {
  apiMock.state.rows = rows;
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminKashrutPage />
    </NextIntlClientProvider>,
  );
  // Gate on the loading copy clearing, so a 0-row read below cannot be a
  // read taken during the fetch.
  await waitFor(() => expect(screen.queryByText(COMMON.loading_f)).not.toBeInTheDocument());
}

function resetMocks() {
  apiMock.state.rows = [];
  apiMock.state.getError = null;
  apiMock.state.postError = null;
  apiMock.state.reminders = null;
  apiMock.get.mockClear();
  apiMock.post.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
}

describe("AdminKashrutPage — queue rendering (MEH-2280)", () => {
  beforeEach(resetMocks);

  it("loads the pending filter on mount — GET /admin/kashrut?status=pending, once", async () => {
    await renderWith([]);
    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(apiMock.get).toHaveBeenCalledWith("/admin/kashrut", { params: { status: "pending" } });
  });

  it("0 rows → the no-requests copy and no table", async () => {
    await renderWith([]);
    expect(screen.getByText(K.no_requests)).toBeInTheDocument();
    expect(document.querySelector("table")).toBeNull();
  });

  it("1 row → one body row: business name, the CANONICAL badge label, the certificate link, the notes dash", async () => {
    await renderWith([REQUEST]);
    expect(screen.queryByText(K.no_requests)).not.toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
    const row = bodyRows()[0];
    expect(within(row).getByText("מחלבת הגליל")).toBeInTheDocument();
    // MEH-1852 chunk B: the pill reads kashrut.badges.* (consumer namespace).
    expect(within(row).getByText(BADGES.rabanut.label)).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: K.cert_view })).toHaveAttribute(
      "href",
      "https://res.cloudinary.com/demo/cert.jpg",
    );
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("many rows → one body row per request; a missing cert shows the no-cert copy, a hyphenated code maps through CODE_TO_KEY, an unknown code falls back to the raw code", async () => {
    await renderWith(ROWS);
    expect(bodyRows()).toHaveLength(3);
    const [, second, third] = bodyRows();
    expect(within(second).getByText(K.no_cert)).toBeInTheDocument();
    expect(within(second).queryByRole("link", { name: K.cert_view })).toBeNull();
    expect(within(second).getByText(BADGES.organic_kosher.label)).toBeInTheDocument();
    expect(within(third).getByText("not-a-known-code")).toBeInTheDocument();
    expect(within(third).getByText("נשלח שוב")).toBeInTheDocument();
  });

  it("pending rows carry approve + reject; approved carries revoke only; rejected drops the actions column", async () => {
    await renderWith([REQUEST]);
    expect(screen.getByRole("columnheader", { name: K.columns.actions })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: K.actions.approve })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: K.actions.reject })).toBeInTheDocument();

    fireEvent.change(statusSelect(), { target: { value: "approved" } });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    expect(apiMock.get).toHaveBeenLastCalledWith("/admin/kashrut", { params: { status: "approved" } });
    // The table unmounts while `loading` flips, so read the settled end state:
    // a row count of 1 proves the refetch rendered, and only then is "no
    // actions column" a statement about the approved view rather than about
    // an empty loading frame.
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    // MEH-2518: the approved view keeps an actions column, holding revoke only.
    expect(screen.getByRole("button", { name: K.actions.revoke })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: K.actions.approve })).toBeNull();
    expect(screen.queryByRole("button", { name: K.actions.reject })).toBeNull();

    fireEvent.change(statusSelect(), { target: { value: "rejected" } });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(screen.queryByRole("columnheader", { name: K.columns.actions })).toBeNull();
    expect(screen.queryByRole("button", { name: K.actions.revoke })).toBeNull();
  });

  it("a load failure toasts the load error and leaves the queue empty", async () => {
    apiMock.state.getError = new Error("network");
    await renderWith([]);
    expect(toastMock.error).toHaveBeenCalledWith(K.load_error);
    expect(screen.getByText(K.no_requests)).toBeInTheDocument();
  });
});

describe("AdminKashrutPage — «מאומת» is never derived from a self-declared payload (labels.md)", () => {
  beforeEach(resetMocks);

  // A request row that CLAIMS verification in every shape a business-side
  // payload could carry it. None of these fields is admin-established: the
  // only admin-verified facts on this surface are the request `status` the
  // moderator sets and `kashrut_verified_at`, which is null here.
  const SELF_DECLARED = {
    ...REQUEST,
    id: "k9",
    producer_name: "עסק שמצהיר על עצמו",
    status: "pending",
    kashrut_verified_at: null,
    verified: true,
    is_verified: true,
    kosher: true,
    kashrut_verified: true,
    self_declared_kosher: true,
    verification_tier: "verified",
    badge_label: "מאומת",
  };

  it("renders the row (the control) and no «מאומת» text anywhere on the page", async () => {
    await renderWith([SELF_DECLARED]);
    // Control first: if the row did not render, a missing «מאומת» would be a
    // null that is also the reassuring answer.
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("עסק שמצהיר על עצמו")).toBeInTheDocument();
    expect(screen.getByText(BADGES.rabanut.label)).toBeInTheDocument();

    expect(screen.queryByText(/מאומת/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/מאומת/);
  });

  it("the same payload under the approved filter still shows no «מאומת» — the admin fact is the filter label, not a per-row badge", async () => {
    await renderWith([SELF_DECLARED]);
    fireEvent.change(statusSelect(), { target: { value: "approved" } });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    expect(apiMock.get).toHaveBeenLastCalledWith("/admin/kashrut", { params: { status: "approved" } });
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(screen.getByText("עסק שמצהיר על עצמו")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: K.status.approved }).selected).toBe(true);
    expect(document.body.textContent).not.toMatch(/מאומת/);
  });
});

describe("AdminKashrutPage — decision wiring", () => {
  beforeEach(resetMocks);

  it("approve opens the date modal; no call until a date is chosen; submit → POST { expires_on }, toast, reload (MEH-2518)", async () => {
    await renderWith([REQUEST]);
    fireEvent.click(screen.getByRole("button", { name: K.actions.approve }));
    expect(apiMock.post).not.toHaveBeenCalled();
    const submit = within(approvePanel()).getByRole("button", { name: K.approve_modal.submit });
    expect(submit).toBeDisabled();
    fireEvent.change(within(approvePanel()).getByLabelText(K.approve_modal.date_label), {
      target: { value: "2027-03-31" },
    });
    fireEvent.click(within(approvePanel()).getByRole("button", { name: K.approve_modal.submit }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/kashrut/k1/approve", { expires_on: "2027-03-31" });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(K.approved_toast));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("heading", { name: K.approve_modal.title })).not.toBeInTheDocument();
  });

  it("approve modal cancel closes it with no call", async () => {
    await renderWith([REQUEST]);
    fireEvent.click(screen.getByRole("button", { name: K.actions.approve }));
    fireEvent.click(within(approvePanel()).getByRole("button", { name: COMMON.cancel }));
    expect(screen.queryByRole("heading", { name: K.approve_modal.title })).not.toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("approve failure → error toast with the backend detail, no reload", async () => {
    apiMock.state.postError = { response: { data: { detail: "התעודה פגה" } } };
    await renderWith([REQUEST]);
    fireEvent.click(screen.getByRole("button", { name: K.actions.approve }));
    fireEvent.change(within(approvePanel()).getByLabelText(K.approve_modal.date_label), {
      target: { value: "2027-03-31" },
    });
    fireEvent.click(within(approvePanel()).getByRole("button", { name: K.approve_modal.submit }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("התעודה פגה"));
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it("approved filter: revoke opens the modal → POST /revoke with { notes }, toast, reload (MEH-2518)", async () => {
    await renderWith([{ ...REQUEST, status: "approved" }]);
    fireEvent.change(statusSelect(), { target: { value: "approved" } });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: K.actions.revoke }));
    fireEvent.change(within(revokePanel()).getByRole("textbox"), { target: { value: "התעודה בוטלה" } });
    fireEvent.click(within(revokePanel()).getByRole("button", { name: K.revoke_modal.submit }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/kashrut/k1/revoke", { notes: "התעודה בוטלה" });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(K.revoked_toast));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(3));
  });

  it("pending filter shows no revoke button", async () => {
    await renderWith([REQUEST]);
    expect(screen.queryByRole("button", { name: K.actions.revoke })).not.toBeInTheDocument();
  });

  it("reject: opens the modal, cancel closes it with no call, re-open + notes → POST /reject with { notes }, modal closes, reload", async () => {
    await renderWith([REQUEST]);
    expect(screen.queryByRole("heading", { name: K.reject_modal.title })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: K.actions.reject }));
    expect(screen.getByRole("heading", { name: K.reject_modal.title })).toBeInTheDocument();

    fireEvent.click(within(rejectPanel()).getByRole("button", { name: COMMON.cancel }));
    expect(screen.queryByRole("heading", { name: K.reject_modal.title })).not.toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: K.actions.reject }));
    fireEvent.change(within(rejectPanel()).getByRole("textbox"), { target: { value: "התעודה לא קריאה" } });
    fireEvent.click(within(rejectPanel()).getByRole("button", { name: K.reject_modal.submit }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/kashrut/k1/reject", { notes: "התעודה לא קריאה" });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: K.reject_modal.title })).not.toBeInTheDocument(),
    );
    expect(toastMock.success).toHaveBeenCalledWith(K.rejected_toast);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
  });

  it("reject with no notes is allowed (notes are optional) and sends an empty string", async () => {
    await renderWith([REQUEST]);
    fireEvent.click(screen.getByRole("button", { name: K.actions.reject }));
    fireEvent.click(within(rejectPanel()).getByRole("button", { name: K.reject_modal.submit }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/kashrut/k1/reject", { notes: "" });
  });

  it("a reject failure keeps the modal open and toasts the backend detail", async () => {
    apiMock.state.postError = { response: { data: { detail: "שגיאת שרת" } } };
    await renderWith([REQUEST]);
    fireEvent.click(screen.getByRole("button", { name: K.actions.reject }));
    fireEvent.click(within(rejectPanel()).getByRole("button", { name: K.reject_modal.submit }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("שגיאת שרת"));
    expect(screen.getByRole("heading", { name: K.reject_modal.title })).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });
});

describe("AdminKashrutPage — expiry reminders (dry-run first)", () => {
  beforeEach(resetMocks);

  it("preview with nobody in the window → dry_run POST, the none copy, and no send button", async () => {
    apiMock.state.reminders = { dry_run: true, total: 0, sent_count: 0, failed_count: 0, rows: [] };
    await renderWith([]);
    expect(screen.queryByTestId("expiry-reminders-result")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: K.reminders.preview }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/kashrut/expiry-reminders", null, {
      params: { dry_run: true },
    });
    expect(await screen.findByText(K.reminders.none)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: K.reminders.send_now })).toBeNull();
  });

  it("preview with rows → summary + send button; send → dry_run false, sent toast, send button gone", async () => {
    const row = { producer_id: "p1", name: "מחלבת הגליל", phone_masked: "05*-***1234", expires_at: "2026-11-10T00:00:00Z" };
    apiMock.state.reminders = { dry_run: true, total: 2, sent_count: 0, failed_count: 0, rows: [row, { ...row, producer_id: "p2", name: "יקב ההר" }] };
    await renderWith([]);
    fireEvent.click(screen.getByRole("button", { name: K.reminders.preview }));
    const result = await screen.findByTestId("expiry-reminders-result");
    expect(within(result).getByText("2 בתי עסק יקבלו תזכורת. עדיין לא נשלח דבר.")).toBeInTheDocument();
    expect(within(result).getAllByRole("listitem")).toHaveLength(2);

    apiMock.state.reminders = {
      dry_run: false,
      total: 2,
      sent_count: 2,
      failed_count: 0,
      rows: [{ ...row, sent: true }, { ...row, producer_id: "p2", name: "יקב ההר", sent: true }],
    };
    fireEvent.click(within(result).getByRole("button", { name: K.reminders.send_now }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2));
    expect(apiMock.post).toHaveBeenLastCalledWith("/admin/kashrut/expiry-reminders", null, {
      params: { dry_run: false },
    });
    expect(await screen.findByText("נשלחו 2 · נכשלו 0")).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith("נשלחו 2 תזכורות");
    expect(screen.queryByRole("button", { name: K.reminders.send_now })).toBeNull();
    expect(screen.getAllByText(K.reminders.row_sent)).toHaveLength(2);
  });
});
