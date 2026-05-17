import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminOutreachPage from "@/app/[locale]/admin/outreach/page";

// Mock api
const listRef = { current: { data: [] } };
const metricsRef = {
  current: { data: { total: 0, new: 0, contacted: 0, replied: 0, registered: 0, declined: 0 } },
};
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/admin/outreach") return Promise.resolve(listRef.current);
      if (url === "/admin/outreach/metrics/summary") return Promise.resolve(metricsRef.current);
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock("@/lib/toast", () => ({
  showToast: vi.fn(),
}));

// MEH-475 PR-A1: outreach page now reads useTranslations() from next-intl.
// Map only the keys the tests assert on, matching the ProducerCard.test.jsx
// pattern (MEH-471/473). Unmapped keys return the key itself.
vi.mock("next-intl", () => {
  const flat = {
    "admin.outreach.title": "גיוס עסקים",
    "admin.outreach.call_script_btn": "תסריט שיחה",
    "admin.outreach.metrics.total": "סה״כ",
    "admin.outreach.metrics.new": "חדשים",
    "admin.outreach.metrics.contacted": "פניתי",
    "admin.outreach.metrics.replied": "ענו",
    "admin.outreach.metrics.registered": "נרשמו",
    "admin.outreach.add_lead_btn": "+ ליד חדש",
    "admin.outreach.statuses.new": "חדש",
    "admin.outreach.statuses.contacted": "פניתי",
    "admin.outreach.statuses.replied": "ענו",
    "admin.outreach.statuses.registered": "נרשמה",
    "admin.outreach.statuses.declined": "סירבה",
    "admin.outreach.table.prep_profile": "הכן פרופיל",
    "admin.outreach.table.delete_btn": "מחקי",
    "admin.outreach.toasts.delete_confirm": "למחוק את הליד הזה לצמיתות?",
    "admin.outreach.script_modal.title": "תסריט שיחה",
    "admin.outreach.templates.warm.title": "חמותה",
    "admin.outreach.templates.professional.title": "מקצועי",
    "admin.outreach.templates.short.title": "קצר",
    "admin.outreach.table.empty": 'אין לידים להצגה. לחצי על "+ ליד חדש" כדי להתחיל.',
    "admin.outreach.add_modal.title": "ליד חדש",
    "admin.outreach.add_modal.placeholders.name": "שם העסק *",
    "admin.outreach.add_modal.placeholders.city": "עיר",
    "admin.outreach.add_modal.placeholders.category": "קטגוריה",
    "admin.outreach.add_modal.placeholders.phone": "טלפון",
    "admin.outreach.add_modal.placeholders.instagram": "אינסטגרם (שם משתמשת, בלי @)",
    "admin.outreach.add_modal.placeholders.website": "אתר (אופציונלי)",
    "admin.outreach.add_modal.placeholders.notes": "הערות פנימיות",
    "admin.outreach.add_modal.cancel": "ביטול",
    "admin.outreach.add_modal.submit": "הוסיפי",
    "admin.outreach.script_modal.body": '1. פתיחה חמה: "היי, אני מדברת ממהמקור, זה שם טוב?"',
    "admin.outreach.script_modal.close": "סגור",
  };
  return {
    useTranslations: (scope) => (key, values = {}) => {
      const fullKey = scope ? `${scope}.${key}` : key;
      const raw = flat[fullKey] ?? fullKey;
      if (!values || Object.keys(values).length === 0) return raw;
      let s = raw;
      for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
      return s;
    },
  };
});

const sampleLead = {
  id: "lead-1",
  name: "מאפיית אביב",
  phone: "0501234567",
  instagram: "maafiat_aviv",
  website: null,
  city: "תל אביב",
  category: "לחם ומאפה",
  notes: null,
  source: "manual",
  status: "new",
  prefill_token: null,
  prefill_token_expires_at: null,
  created_at: "2026-04-15T08:00:00",
  updated_at: "2026-04-15T08:00:00",
};

describe("AdminOutreachPage", () => {
  beforeEach(() => {
    listRef.current = { data: [sampleLead] };
    metricsRef.current = {
      data: { total: 1, new: 1, contacted: 0, replied: 0, registered: 0, declined: 0 },
    };
  });

  it("renders the aggregate counters", async () => {
    render(<AdminOutreachPage />);
    await waitFor(() => screen.getByText(/סה״כ/));
    // "פניתי" + "ענו" appear in both the metric cards AND the status
    // dropdown options — getAllByText asserts presence without caring
    // which surface each match is on.
    expect(screen.getAllByText("פניתי").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ענו").length).toBeGreaterThan(0);
    expect(screen.getByText("נרשמו")).toBeInTheDocument(); // metric card only — dropdown says "נרשמה"
    expect(screen.getByText("חדשים")).toBeInTheDocument();
  });

  it("renders a lead row with name + status dropdown", async () => {
    render(<AdminOutreachPage />);
    await waitFor(() => screen.getByText("מאפיית אביב"));
    expect(screen.getByText("תל אביב")).toBeInTheDocument();
    expect(screen.getByTestId("status-select-lead-1")).toBeInTheDocument();
  });

  it("status dropdown PATCH-es the backend", async () => {
    const api = (await import("@/lib/api")).default;
    render(<AdminOutreachPage />);
    await waitFor(() => screen.getByTestId("status-select-lead-1"));
    fireEvent.change(screen.getByTestId("status-select-lead-1"), {
      target: { value: "contacted" },
    });
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/admin/outreach/lead-1", {
        status: "contacted",
      });
    });
  });

  it("empty state when no leads", async () => {
    listRef.current = { data: [] };
    render(<AdminOutreachPage />);
    await waitFor(() =>
      expect(screen.getByText(/אין לידים להצגה/)).toBeInTheDocument(),
    );
  });

  it('"+ ליד חדש" opens the add-lead modal', async () => {
    render(<AdminOutreachPage />);
    await waitFor(() => screen.getByText("+ ליד חדש"));
    fireEvent.click(screen.getByText("+ ליד חדש"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/שם העסק/)).toBeInTheDocument();
  });

  it('"תסריט שיחה" opens the script modal', async () => {
    render(<AdminOutreachPage />);
    // Phone icon replaces the 📞 emoji — probe on the text label only.
    // "תסריט שיחה" appears twice (trigger button + modal heading) once
    // open, so target the trigger explicitly.
    await waitFor(() => screen.getAllByText("תסריט שיחה"));
    fireEvent.click(screen.getAllByText("תסריט שיחה")[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Script contains "תסריט שיחה" in the heading — use a different probe.
    expect(screen.getByText(/פתיחה חמה/)).toBeInTheDocument();
  });

  it("WhatsApp button mints token + opens templates modal", async () => {
    const api = (await import("@/lib/api")).default;
    api.post.mockResolvedValueOnce({
      data: { ...sampleLead, prefill_token: "tok-abc", prefill_token_expires_at: "2026-05-15" },
    });
    render(<AdminOutreachPage />);
    await waitFor(() => screen.getByText("WhatsApp"));
    fireEvent.click(screen.getByText("WhatsApp"));
    // All three templates appear in the modal
    await waitFor(() => {
      expect(screen.getByText("חמותה")).toBeInTheDocument();
      expect(screen.getByText("מקצועי")).toBeInTheDocument();
      expect(screen.getByText("קצר")).toBeInTheDocument();
    });
  });

  it("delete row is confirm-gated", async () => {
    const api = (await import("@/lib/api")).default;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    api.delete.mockClear();
    render(<AdminOutreachPage />);
    await waitFor(() => screen.getByText("מחקי"));
    fireEvent.click(screen.getByText("מחקי"));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/admin/outreach/lead-1"),
    );
    confirmSpy.mockRestore();
  });

  it("delete is a no-op when confirm is cancelled", async () => {
    const api = (await import("@/lib/api")).default;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    api.delete.mockClear();
    render(<AdminOutreachPage />);
    await waitFor(() => screen.getByText("מחקי"));
    fireEvent.click(screen.getByText("מחקי"));
    expect(api.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
