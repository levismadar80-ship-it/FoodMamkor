import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminOutreachPage from "@/app/admin/outreach/page";

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
    await waitFor(() => screen.getByText("📞 תסריט שיחה"));
    fireEvent.click(screen.getByText("📞 תסריט שיחה"));
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
