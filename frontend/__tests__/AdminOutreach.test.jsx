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

// MEH-475 PR-B: outreach page reads useTranslations("admin") with PR-B's
// nested key shape (outreach.status.*, outreach.actions.*, outreach.modal_add.*,
// outreach.modal_script.*, outreach.modal_wa.*, outreach.wa_templates.*).
// WA template bodies are pulled via t.raw() so {name}/{prefillUrl} survive
// for client-side replaceAll. Map only the keys the tests assert on.
vi.mock("next-intl", () => {
  const flat = {
    "admin.outreach.title": "גיוס עסקים",
    "admin.outreach.call_script_btn": "תסריט שיחה",
    "admin.outreach.metrics.total": "סה״כ",
    "admin.outreach.metrics.new": "חדשים",
    "admin.outreach.metrics.contacted": "פניתי",
    "admin.outreach.metrics.replied": "ענו",
    "admin.outreach.metrics.registered": "נרשמו",
    "admin.outreach.filters.new_lead": "+ ליד חדש",
    "admin.outreach.status.new": "חדש",
    "admin.outreach.status.contacted": "פניתי",
    "admin.outreach.status.replied": "ענו",
    "admin.outreach.status.registered": "נרשמה",
    "admin.outreach.status.declined": "סירבה",
    "admin.outreach.actions.prefill": "הכן פרופיל",
    "admin.outreach.actions.whatsapp": "WhatsApp",
    "admin.outreach.actions.delete": "מחקי",
    "admin.outreach.confirm_delete": "למחוק את הליד הזה לצמיתות?",
    "admin.outreach.modal_script.title": "תסריט שיחה",
    "admin.outreach.modal_script.close": "סגור",
    "admin.outreach.wa_templates.warm_title": "חמותה",
    "admin.outreach.wa_templates.professional_title": "מקצועי",
    "admin.outreach.wa_templates.short_title": "קצר",
    "admin.outreach.wa_templates.warm_body": "היי {name} 🌿\n{prefillUrl}",
    "admin.outreach.wa_templates.professional_body": "שלום {name}\n{prefillUrl}",
    "admin.outreach.wa_templates.short_body": "{name}, {prefillUrl}",
    "admin.outreach.empty": 'אין לידים להצגה. לחצי על "+ ליד חדש" כדי להתחיל.',
    "admin.outreach.modal_add.title": "ליד חדש",
    "admin.outreach.modal_add.name_placeholder": "שם העסק *",
    "admin.outreach.modal_add.city_placeholder": "עיר",
    "admin.outreach.modal_add.category_placeholder": "קטגוריה",
    "admin.outreach.modal_add.phone_placeholder": "טלפון",
    "admin.outreach.modal_add.instagram_placeholder": "אינסטגרם (שם משתמשת, בלי @)",
    "admin.outreach.modal_add.website_placeholder": "אתר (אופציונלי)",
    "admin.outreach.modal_add.notes_placeholder": "הערות פנימיות",
    "admin.outreach.modal_add.submit_saving": "שומרת...",
    "admin.outreach.modal_add.submit": "הוסיפי",
    "admin.outreach.modal_wa.title": "הודעת WhatsApp אל {name}",
    "admin.outreach.modal_wa.preparing": "מכינה לינק פרופיל...",
    "admin.outreach.modal_wa.copy": "העתק",
    "admin.outreach.modal_wa.open": "פתח ב-WhatsApp",
    "admin.outreach.modal_wa.close": "סגור",
    "admin.outreach.call_script": '1. פתיחה חמה: "היי, אני מדברת ממהמקור, זה שם טוב?"',
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
    useTranslations: (scope) => {
      const t = (key, values = {}) => resolve(scope ? `${scope}.${key}` : key, values);
      // PR-B WhatsApp templates use t.raw() to preserve literal placeholders
      t.raw = (key) => flat[scope ? `${scope}.${key}` : key] ?? (scope ? `${scope}.${key}` : key);
      return t;
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
