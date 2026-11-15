import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminOutreachPage from "@/app/[locale]/admin/outreach/page";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

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

// MEH-685: methods-only object.
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
    "admin.outreach.actions.whatsapp": "וואטסאפ", // MEH-2837 PR 2
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
    "admin.outreach.modal_wa.title": "הודעת וואטסאפ אל {name}",
    "admin.outreach.modal_wa.preparing": "מכינה לינק פרופיל...",
    "admin.outreach.modal_wa.copy": "העתק",
    "admin.outreach.modal_wa.open": "פתח בוואטסאפ",
    "admin.outreach.modal_wa.close": "סגור",
    "admin.outreach.call_script": '1. פתיחה חמה: "היי, אני מדברת ממהמקור, זה שם טוב?"',
    "admin.common.cancel": "ביטול",
    // MEH-2633
    "admin.outreach.badge_community": "המלצת קהילה",
    "admin.outreach.thank_suggester": "שליחת תודה",
    // MEH-2633 Sapir 04/11 — the four disabled reasons.
    "admin.outreach.thank_disabled.no_email": "לא השאירו אימייל",
    "admin.outreach.thank_disabled.no_update_request": "לא ביקשו עדכון",
    "admin.outreach.thank_disabled.already_sent": "התודה נשלחה ב-{date}",
    "admin.outreach.thank_disabled.not_registered":
      "אפשר לשלוח תודה אחרי שבית העסק נרשם",
  };
  const resolve = (fullKey, values) => {
    const raw = flat[fullKey] ?? fullKey;
    if (!values || Object.keys(values).length === 0) return raw;
    let s = raw;
    for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
  return {
    // MEH-2633: the page now formats the thanked date with the active locale.
    useLocale: () => "he",
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

// MEH-2633: a community suggestion carries five fields a manual lead never
// does. `status: "registered"` + wants_update + no thanked_at is the ONE
// combination where "שליחת תודה" is enabled, so it is the default here and the
// disabled cases override a single field each.
const communityLead = {
  ...sampleLead,
  id: "lead-2",
  name: "מעדניית הזיתים",
  source: "community",
  status: "registered",
  suggested_by_name: "דנה",
  suggested_by_email: "dana@example-suggester.co.il",
  suggester_wants_update: true,
  suggestion_reason: "הזיתים הכי טובים שאכלתי",
  suggester_thanked_at: null,
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
    await waitFor(() => screen.getByText("וואטסאפ"));
    fireEvent.click(screen.getByText("וואטסאפ"));
    // All three templates appear in the modal
    await waitFor(() => {
      expect(screen.getByText("חמותה")).toBeInTheDocument();
      expect(screen.getByText("מקצועי")).toBeInTheDocument();
      expect(screen.getByText("קצר")).toBeInTheDocument();
    });
  });

  // MEH-3103: «הכן פרופיל» used to toast «הקישור הועתק» even when the copy
  // had failed (the rejection was swallowed). The toast now follows the copy.
  describe("«הכן פרופיל» copy feedback", () => {
    const setClipboard = (value) =>
      Object.defineProperty(navigator, "clipboard", { value, configurable: true });
    const mint = async () => {
      const api = (await import("@/lib/api")).default;
      api.post.mockResolvedValueOnce({ data: { ...sampleLead, prefill_token: "tok-1" } });
      render(<AdminOutreachPage />);
      await waitFor(() => screen.getByText("הכן פרופיל"));
      fireEvent.click(screen.getByText("הכן פרופיל"));
    };
    beforeEach(() => {
      showToast.success.mockClear();
      showToast.error.mockClear();
    });

    it("copy succeeds → «הועתק» toast with the prefill link on the clipboard", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      await mint();
      await waitFor(() => expect(showToast.success).toHaveBeenCalledWith("admin.outreach.toasts.link_copied"));
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/register/producer?prefill="));
      expect(showToast.error).not.toHaveBeenCalled();
    });

    it("copy fails → copy_failed error, never «הועתק»", async () => {
      setClipboard(undefined);
      await mint();
      await waitFor(() => expect(showToast.error).toHaveBeenCalledWith("admin.outreach.toasts.copy_failed"));
      expect(showToast.success).not.toHaveBeenCalledWith("admin.outreach.toasts.link_copied");
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

describe("MEH-2566 · counters are the status filter; the list pages by 25", () => {
  const many = (n) =>
    Array.from({ length: n }, (_, i) => ({ ...sampleLead, id: `lead-${i + 1}`, name: `ליד ${i + 1}` }));

  beforeEach(() => {
    metricsRef.current = {
      data: { total: 30, new: 20, contacted: 5, replied: 3, registered: 1, declined: 1 },
    };
  });

  it("one chip per status plus «סה״כ», each with its count; «סה״כ» starts pressed", async () => {
    listRef.current = { data: [sampleLead] };
    render(<AdminOutreachPage />);
    const total = await screen.findByTestId("outreach-chip-all");
    await waitFor(() => expect(total).toHaveTextContent("30"));
    expect(total).toHaveAttribute("aria-pressed", "true");
    for (const [id, n] of [["new", 20], ["contacted", 5], ["replied", 3], ["registered", 1], ["declined", 1]]) {
      const chip = screen.getByTestId(`outreach-chip-${id}`);
      expect(chip).toHaveTextContent(String(n));
      expect(chip).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("clicking a chip filters by that status through the API", async () => {
    const api = (await import("@/lib/api")).default;
    listRef.current = { data: [sampleLead] };
    render(<AdminOutreachPage />);
    await screen.findByText("מאפיית אביב");
    api.get.mockClear();
    fireEvent.click(screen.getByTestId("outreach-chip-replied"));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/admin/outreach", { params: { status: "replied" } }),
    );
    expect(screen.getByTestId("outreach-chip-replied")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("outreach-chip-all")).toHaveAttribute("aria-pressed", "false");
  });

  it("30 leads → 25 on page 1, the other 5 on page 2", async () => {
    listRef.current = { data: many(30) };
    render(<AdminOutreachPage />);
    await screen.findByText("ליד 1");
    expect(screen.getByText("ליד 25")).toBeInTheDocument();
    expect(screen.queryByText("ליד 26")).toBeNull();
    window.scrollTo = vi.fn();
    const pager = screen.getByTestId("pagination");
    fireEvent.click([...pager.querySelectorAll("button")].find((b) => b.textContent.trim() === "2"));
    await screen.findByText("ליד 26");
    expect(screen.getByText("ליד 30")).toBeInTheDocument();
    expect(screen.queryByText("ליד 1")).toBeNull();
  });

  it("25 leads or fewer → no pager", async () => {
    listRef.current = { data: many(25) };
    render(<AdminOutreachPage />);
    await screen.findByText("ליד 25");
    expect(screen.queryByTestId("pagination")).toBeNull();
  });

  // ---------- MEH-2633: community suggestions ----------

  describe("community suggestions", () => {
    it("badge, reason and suggester render for a community lead", async () => {
      listRef.current = { data: [communityLead] };
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");
      expect(screen.getByTestId("community-badge-lead-2")).toHaveTextContent("המלצת קהילה");
      expect(screen.getByText("הזיתים הכי טובים שאכלתי")).toBeInTheDocument();
      expect(screen.getByText("דנה")).toBeInTheDocument();
      expect(screen.getByText("dana@example-suggester.co.il")).toBeInTheDocument();
    });

    it("a manual lead gets no badge and no suggester block", async () => {
      // Discriminates: without this, a badge rendered unconditionally would
      // pass every other test in this describe.
      listRef.current = { data: [sampleLead] };
      render(<AdminOutreachPage />);
      await screen.findByText("מאפיית אביב");
      expect(screen.queryByTestId("community-badge-lead-1")).toBeNull();
      expect(screen.queryByTestId("thank-suggester-lead-1")).toBeNull();
    });

    it("the source chip sends ?source=community, and toggles back off", async () => {
      listRef.current = { data: [communityLead] };
      metricsRef.current = {
        data: { total: 1, new: 0, contacted: 0, replied: 0, registered: 1, declined: 0, community: 1 },
      };
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");

      // Only the leads calls, in order. `toHaveBeenLastCalledWith` is wrong
      // here: Promise.all fires the metrics request after the leads one, so
      // the last call on this mock is always /metrics/summary.
      const leadParams = () =>
        api.get.mock.calls.filter((c) => c[0] === "/admin/outreach").map((c) => c[1]);

      const chip = screen.getByTestId("outreach-source-chips").querySelector("button");
      fireEvent.click(chip);
      await waitFor(() =>
        expect(leadParams()).toContainEqual({ params: { source: "community" } })
      );
      const afterOn = leadParams().length;

      // Off again — the param must DISAPPEAR, not become "manual" or "".
      // Asserting a NEW call is what makes this discriminate: the mount's own
      // `{params: {}}` call is already in the list, so a bare "contains empty
      // params" check would pass even if the second click did nothing.
      fireEvent.click(chip);
      await waitFor(() => expect(leadParams().length).toBeGreaterThan(afterOn));
      expect(leadParams().at(-1)).toEqual({ params: {} });
    });

    it("thank button posts, then the row shows the thanked date", async () => {
      listRef.current = { data: [communityLead] };
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");

      const btn = screen.getByTestId("thank-suggester-lead-2");
      expect(btn).toBeEnabled();

      // The refreshed row comes back thanked — the date IS the feedback, which
      // is why this flow needs no success toast.
      listRef.current = {
        data: [{ ...communityLead, suggester_thanked_at: "2026-11-03T10:00:00" }],
      };
      fireEvent.click(btn);
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith("/admin/outreach/lead-2/thank-suggester")
      );
      await screen.findByTestId("thanked-at-lead-2");
      // Sapir 04/11 changed this: the button stays on screen, disabled, with
      // the date in its reason — it used to be removed entirely. A second
      // send is still impossible because it is disabled.
      expect(screen.getByTestId("thank-suggester-lead-2")).toBeDisabled();
    });

    it("thank button is DISABLED when the suggester asked for no update", async () => {
      listRef.current = { data: [{ ...communityLead, suggester_wants_update: false }] };
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");
      expect(screen.getByTestId("thank-suggester-lead-2")).toBeDisabled();
    });

    it("thank button is DISABLED until the business is registered", async () => {
      listRef.current = { data: [{ ...communityLead, status: "contacted" }] };
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");
      expect(screen.getByTestId("thank-suggester-lead-2")).toBeDisabled();
    });

    // ---- the four disabled reasons (Sapir 04/11) ----
    // Each case below fails exactly ONE rule, so the tooltip it asserts can
    // only come from that rule. That does NOT pin the ORDER — a reordered
    // thankBlockedReason returns the same answer for every single-failure
    // lead — so the ORDER gets its own case further down, with a lead that
    // fails two rules at once. (An earlier version of this comment claimed
    // these four covered the order. They did not.)
    const REASONS = [
      ["no suggester email", { suggested_by_email: null }, "לא השאירו אימייל"],
      ["no opt-in", { suggester_wants_update: false }, "לא ביקשו עדכון"],
      ["not registered yet", { status: "contacted" }, "אפשר לשלוח תודה אחרי שבית העסק נרשם"],
    ];

    for (const [label, override, tip] of REASONS) {
      it(`disabled with its own reason — ${label}`, async () => {
        listRef.current = { data: [{ ...communityLead, ...override }] };
        render(<AdminOutreachPage />);
        await screen.findByText("מעדניית הזיתים");
        expect(screen.getByTestId("thank-suggester-lead-2")).toBeDisabled();
        expect(screen.getByTestId("thank-reason-lead-2")).toHaveTextContent(tip);
      });
    }

    it("already thanked → the reason carries the date", async () => {
      listRef.current = {
        data: [{ ...communityLead, suggester_thanked_at: "2026-11-03T10:00:00" }],
      };
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");
      expect(screen.getByTestId("thank-suggester-lead-2")).toBeDisabled();
      // The date is interpolated, not a bare "{date}" left on screen.
      const reason = screen.getByTestId("thank-reason-lead-2");
      expect(reason).toHaveTextContent("התודה נשלחה ב-");
      expect(reason.textContent).not.toContain("{date}");
    });

    it("a lead failing TWO rules names the one the server would name first", async () => {
      // No email AND no opt-in. admin_outreach.thank_suggester checks the
      // email first, so "לא השאירו אימייל" is the only correct answer; a
      // reordered thankBlockedReason reds exactly here and nowhere else.
      listRef.current = {
        data: [{ ...communityLead, suggested_by_email: null, suggester_wants_update: false }],
      };
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");
      const reason = screen.getByTestId("thank-reason-lead-2");
      expect(reason).toHaveTextContent("לא השאירו אימייל");
      expect(reason).not.toHaveTextContent("לא ביקשו עדכון");
    });

    it("the reason is reachable by AT, not just on hover", async () => {
      // A bare title= attribute reaches neither keyboard nor screen-reader
      // users, which is why the button points at an sr-only span.
      listRef.current = { data: [{ ...communityLead, suggester_wants_update: false }] };
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");
      const btn = screen.getByTestId("thank-suggester-lead-2");
      const describedBy = btn.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy)).toHaveTextContent("לא ביקשו עדכון");
    });

    it("a lead with no suggester at all gets no thank control", async () => {
      // Keeps the disabled-button change from putting a dead control on every
      // manual lead in the queue.
      listRef.current = { data: [sampleLead] };
      render(<AdminOutreachPage />);
      await screen.findByText("מאפיית אביב");
      expect(screen.queryByTestId("thank-suggester-lead-1")).toBeNull();
    });

    it("a 409 surfaces the backend's own Hebrew detail", async () => {
      listRef.current = { data: [communityLead] };
      api.post.mockRejectedValueOnce({
        response: { status: 409, data: { detail: "תודה כבר נשלחה" } },
      });
      render(<AdminOutreachPage />);
      await screen.findByText("מעדניית הזיתים");
      fireEvent.click(screen.getByTestId("thank-suggester-lead-2"));
      await waitFor(() => expect(showToast.error).toHaveBeenCalledWith("תודה כבר נשלחה"));
    });
  });
});
