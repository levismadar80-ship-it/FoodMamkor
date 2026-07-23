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
  const state = { dismissed: false };
  return {
    state,
    get: vi.fn((url) => {
      if (url === "/admin/reports") {
        return Promise.resolve({ data: state.dismissed ? [] : [ONE_REPORT_GROUP] });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn((url) => {
      if (url.includes("/dismiss")) state.dismissed = true;
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
});
