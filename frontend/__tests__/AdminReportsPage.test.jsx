import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminReportsPage from "@/app/[locale]/admin/reports/page";

// MEH-1266: report lifecycle UI. A single-report producer is visible (no 3+
// gate), and "התעלם" now opens a confirm dialog that dismisses every open
// report for the producer and reloads so it survives refresh.

const ONE_REPORT_GROUP = {
  producer_id: "p1",
  producer_name: "מאפיית השכונה",
  report_count: 1,
  auto_flagged: false,
  reports: [{ id: "rep1", reason: "לא כשר כמו שהוצהר", created_at: "2026-07-17T09:00:00Z" }],
};

const apiMock = vi.hoisted(() => {
  const state = { dismissed: false, toggledTo: "inactive", status: "approved", resolveFails: false };
  return {
    state,
    get: vi.fn((url) => {
      if (url === "/admin/reports") {
        return Promise.resolve({ data: state.dismissed ? [] : [{ ...ONE_REPORT_GROUP, producer_status: state.status }] });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn((url) => {
      if (url.includes("/resolve") && state.resolveFails) return Promise.reject({ response: { status: 409, data: { detail: "הדיווח כבר טופל" } } });
      if (url.includes("/dismiss") || url.includes("/resolve")) state.dismissed = true;
      if (url.includes("/toggle-status")) return Promise.resolve({ data: { status: state.toggledTo } });
      return Promise.resolve({ data: {} });
    }),
  };
});
// ONE_REPORT_GROUP is referenced by the hoisted factory; declare via hoist too.
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("next-intl", () => {
  const flat = {
    "admin.reports.title": "דיווחים ובעיות",
    "admin.reports.tabs.reports": "דיווחי משתמשים",
    "admin.reports.tabs.flagged": "מוצרים בבדיקה",
    "admin.reports.tabs.hidden": "מוסתרים",
    "admin.reports.section_open": "בתי עסק עם דיווחים פתוחים",
    "admin.reports.auto_flag_badge": "3+ דיווחים",
    "admin.reports.no_reports": "אין דיווחים פתוחים",
    "admin.reports.report_count": "{count} דיווחים",
    "admin.reports.actions.suspend": "השהה עסק",
    "admin.reports.page_hidden": "הדף כבר מוסתר",
    "admin.reports.actions.ignore": "התעלם",
    "admin.reports.actions.dismiss_confirm": "להתעלם מכל הדיווחים על {name}?",
    "admin.reports.actions.dismissing": "מתעלמת…",
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
    useLocale: () => "he",
  };
});

describe("AdminReportsPage — report lifecycle (MEH-1266)", () => {
  beforeEach(() => {
    apiMock.state.dismissed = false;
    apiMock.state.toggledTo = "inactive";
    apiMock.state.status = "approved";
    apiMock.state.resolveFails = false;
    apiMock.get.mockClear();
    apiMock.post.mockClear();
    toastMock.error.mockClear();
  });

  it("renders a single-report producer with no 3+ auto-flag badge", async () => {
    render(<AdminReportsPage />);
    expect(await screen.findByText("מאפיית השכונה")).toBeInTheDocument();
    expect(screen.getByText("1 דיווחים")).toBeInTheDocument();
    // auto_flagged false → the "3+ דיווחים" badge is absent.
    expect(screen.queryByText("3+ דיווחים")).not.toBeInTheDocument();
  });

  it("dismiss opens a confirm dialog, POSTs dismiss, and removes the producer", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("מאפיית השכונה");

    fireEvent.click(screen.getByText("התעלם")); // row ignore button
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("להתעלם מכל הדיווחים על מאפיית השכונה?")).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByText("התעלם")); // confirm button inside dialog
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/admin/reports/rep1/dismiss"));
    // reload returns [] → producer disappears, dialog closes.
    await waitFor(() => expect(screen.queryByText("מאפיית השכונה")).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape closes the dismiss dialog without POSTing", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("מאפיית השכונה");
    fireEvent.click(screen.getByText("התעלם"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  // MEH-3524: hiding the page is the action taken, so its reports close as
  // «resolved» and the business leaves the queue.
  it("suspend hides the page, resolves its reports and removes the business", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("מאפיית השכונה");
    fireEvent.click(screen.getByText("השהה עסק"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/admin/reports/rep1/resolve"));
    expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/p1/toggle-status");
    await waitFor(() => expect(screen.queryByText("מאפיית השכונה")).not.toBeInTheDocument());
  });

  it("a toggle that put the page back live resolves nothing", async () => {
    apiMock.state.toggledTo = "approved";
    render(<AdminReportsPage />);
    await screen.findByText("מאפיית השכונה");
    fireEvent.click(screen.getByText("השהה עסק"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/admin/producers/p1/toggle-status"));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    expect(apiMock.post).not.toHaveBeenCalledWith("/admin/reports/rep1/resolve");
    expect(screen.getByText("מאפיית השכונה")).toBeInTheDocument();
  });

  it("a hidden page offers no «השהה עסק», so a click cannot put it back live", async () => {
    apiMock.state.status = "inactive";
    render(<AdminReportsPage />);
    await screen.findByText("מאפיית השכונה");
    expect(screen.queryByText("השהה עסק")).not.toBeInTheDocument();
    expect(screen.getByTestId("report-page-hidden")).toHaveTextContent("הדף כבר מוסתר");
  });

  it("a failed resolve still reloads the queue", async () => {
    apiMock.state.resolveFails = true;
    render(<AdminReportsPage />);
    await screen.findByText("מאפיית השכונה");
    apiMock.state.status = "inactive"; // what the reload will report after the toggle
    fireEvent.click(screen.getByText("השהה עסק"));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("report-page-hidden")).toBeInTheDocument());
  });
});
