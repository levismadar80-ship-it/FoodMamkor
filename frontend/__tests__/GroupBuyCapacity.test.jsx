// MEH-3592: the join card past the people cap — units left + line total, a
// participant's quantity edit and the last-day rule, the waitlist of a full
// group, the business's stop switch, and the funded banner for a visitor who
// can no longer join. Harness from GroupBuyAfterGoal.test.jsx.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";
import GroupBuyOwnerSettings from "@/components/group-buy/GroupBuyOwnerSettings";
import api from "@/lib/api";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key, p) => (p ? `${key} ${Object.values(p).join(" ")}` : key),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099" }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn() } }));

const FUTURE = "2099-01-01T00:00:00";
const PAST = "2000-01-01T00:00:00";
const BASE = {
  id: "gb-1", title: "קבוצת רכישה לדוגמה", status: "open", deadline: FUTURE,
  min_participants: 2, max_participants: null, max_units: null, units_left: null,
  joins_closed: false, commits_count: 1, unit: "ק\"ג",
  price_per_unit_regular: 18, price_per_unit_group: 13, producer_name: "טחנת אבן",
  user_committed: false, user_commit: null, user_waitlisted: false,
};
const state = vi.hoisted(() => ({ gb: null }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: state.gb })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

beforeEach(() => vi.clearAllMocks());

const show = async (over) => {
  state.gb = { ...BASE, ...over };
  render(<GroupBuyDetailClient id="gb-1" />);
  await screen.findByText("קבוצת רכישה לדוגמה", { selector: "h1" });
};
const text = (id) => screen.queryByTestId(id)?.textContent ?? null;

describe("join form: units left and line total", () => {
  it("no units cap: line total only, no «left» line", async () => {
    await show({});
    expect(text("group-buy-units-left")).toBeNull();
    expect(text("group-buy-line-total")).toBe('line_total 1 ק"ג 13₪ 13₪');
  });

  it("units cap: «left» line, total follows the quantity, input max = left", async () => {
    await show({ max_units: 10, units_left: 4 });
    expect(text("group-buy-units-left")).toBe('units_left 4 ק"ג');
    const input = screen.getByRole("spinbutton");
    expect(input.getAttribute("max")).toBe("4");
    fireEvent.change(input, { target: { value: "3" } });
    expect(text("group-buy-line-total")).toBe('line_total 3 ק"ג 13₪ 39₪');
  });

  it("units run out: no form, the waitlist instead", async () => {
    await show({ max_units: 10, units_left: 0 });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByTestId("group-buy-waitlist-join")).toBeTruthy();
  });
});

describe("waitlist (full group)", () => {
  it("people cap full: join the waitlist posts and reloads", async () => {
    await show({ max_participants: 3, commits_count: 3, status: "funded" });
    expect(text("group-buy-full")).toBe("full");
    fireEvent.click(screen.getByTestId("group-buy-waitlist-join"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/group-buys/gb-1/waitlist", { quantity: 1 }));
    expect(api.get.mock.calls.filter(([u]) => u === "/group-buys/gb-1").length).toBeGreaterThan(1);
  });

  it("already waitlisted: says so and offers leaving", async () => {
    await show({ max_participants: 3, commits_count: 3, user_waitlisted: true });
    expect(text("group-buy-waitlisted")).toBe("waitlisted");
    expect(screen.queryByTestId("group-buy-waitlist-join")).toBeNull();
    fireEvent.click(screen.getByText("waitlist_leave"));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/group-buys/gb-1/waitlist"));
  });
});

describe("business stopped joins", () => {
  it("visitor: the stop message, no form, no waitlist", async () => {
    await show({ joins_closed: true });
    expect(text("group-buy-joins-closed")).toBe("joins_closed");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByTestId("group-buy-waitlist")).toBeNull();
  });

  it("funded + stopped: the banner does not send a visitor to the business", async () => {
    await show({ joins_closed: true, status: "funded", commits_count: 2 });
    expect(text("group-buy-funded")).toContain("funded_subtitle_closed");
  });
});

describe("participant", () => {
  const member = { user_committed: true, user_commit: { quantity: 2 }, commits_count: 2 };

  it("changes her quantity: PATCH with the new number", async () => {
    await show({ ...member, max_units: 10, units_left: 3 });
    const input = screen.getByRole("spinbutton");
    expect(input.getAttribute("max")).toBe("5"); // her 2 + 3 left
    const save = screen.getByTestId("group-buy-qty-save");
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.click(save);
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/group-buys/gb-1/commit", { quantity: 4 }));
  });

  it("funded: the «ביטול» section names the last-day rule", async () => {
    await show({ ...member, status: "funded" });
    expect(text("group-buy-cancel")).toContain("cancel_body_funded");
  });

  it("open group: the «ביטול» section says leave any time", async () => {
    await show({ ...member });
    expect(text("group-buy-cancel")).toContain("cancel_body_open");
  });

  it("in a full group: «full, your place is kept», no waitlist", async () => {
    await show({ ...member, max_participants: 2, status: "funded" });
    expect(text("group-buy-full-member")).toBe("full_member");
    expect(screen.queryByTestId("group-buy-waitlist")).toBeNull();
  });

  it("after the deadline: no quantity field", async () => {
    await show({ ...member, status: "funded", deadline: PAST });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(text("group-buy-funded")).toContain("funded_subtitle");
  });
});

describe("owner settings", () => {
  const gb = { ...BASE, max_participants: 8, max_units: null };

  it("collapsed by default; open shows caps; save sends both, empty = null", async () => {
    const onSaved = vi.fn();
    render(<GroupBuyOwnerSettings gb={gb} onSaved={onSaved} />);
    expect(screen.queryByTestId("group-buy-settings-save")).toBeNull();
    const toggle = screen.getByTestId("group-buy-settings-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByTestId("group-buy-settings-save"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/group-buys/gb-1/settings", { max_participants: 8, max_units: null }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("stop, then (when stopped) reopen", async () => {
    const { unmount } = render(<GroupBuyOwnerSettings gb={gb} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("group-buy-settings-toggle"));
    fireEvent.click(screen.getByTestId("group-buy-joins-switch"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/group-buys/gb-1/settings", { joins_open: false }));
    unmount();
    render(<GroupBuyOwnerSettings gb={{ ...gb, joins_closed: true }} onSaved={vi.fn()} />);
    expect(text("group-buy-joins-closed-owner")).toBe("closed_note");
    fireEvent.click(screen.getByTestId("group-buy-settings-toggle"));
    expect(screen.getByTestId("group-buy-joins-switch").textContent).toBe("reopen");
  });

  // MEH-3597 (Sapir 21/11): the pickup time changes here too.
  it("a saved window is prefilled in Israel time and sent back with the caps", async () => {
    render(<GroupBuyOwnerSettings gb={{ ...gb, pickup_starts_at: "2099-12-04T07:00:00", pickup_ends_at: "2099-12-04T11:00:00" }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("group-buy-settings-toggle"));
    const box = screen.getByTestId("gb-pickup-window");
    const [start, end] = box.querySelectorAll("input");
    expect(start.value).toBe("2099-12-04T09:00");
    expect(end.value).toBe("13:00");
    fireEvent.change(end, { target: { value: "14:00" } });
    fireEvent.click(screen.getByTestId("group-buy-settings-save"));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/group-buys/gb-1/settings",
        expect.objectContaining({ pickup_starts_at: "2099-12-04T07:00:00.000Z", pickup_ends_at: "2099-12-04T12:00:00.000Z" }),
      ),
    );
  });

  it("a cap save leaves an untouched window out of the request", async () => {
    render(<GroupBuyOwnerSettings gb={{ ...gb, pickup_starts_at: "2099-12-04T07:00:00", pickup_ends_at: "2099-12-05T11:00:00" }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("group-buy-settings-toggle"));
    fireEvent.click(screen.getByTestId("group-buy-settings-save"));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(api.patch.mock.calls[0][1]).not.toHaveProperty("pickup_starts_at");
  });

  it("delivery only: no pickup time fields", () => {
    render(<GroupBuyOwnerSettings gb={{ ...gb, delivery_note: "משלוח לחדרה", pickup_note: null, fulfillment_note: null }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("group-buy-settings-toggle"));
    expect(screen.queryByTestId("gb-pickup-window")).toBeNull();
  });

  it("clearing both fields sends nulls", async () => {
    render(<GroupBuyOwnerSettings gb={{ ...gb, pickup_starts_at: "2099-12-04T07:00:00", pickup_ends_at: "2099-12-04T11:00:00" }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("group-buy-settings-toggle"));
    const [start, end] = screen.getByTestId("gb-pickup-window").querySelectorAll("input");
    fireEvent.change(start, { target: { value: "" } });
    fireEvent.change(end, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("group-buy-settings-save"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/group-buys/gb-1/settings", expect.objectContaining({ pickup_starts_at: null, pickup_ends_at: null })));
  });

  it("half a window: the form says so and nothing is sent", async () => {
    render(<GroupBuyOwnerSettings gb={gb} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("group-buy-settings-toggle"));
    fireEvent.change(screen.getByTestId("gb-pickup-window").querySelectorAll("input")[0], { target: { value: "2099-12-04T09:00" } });
    fireEvent.click(screen.getByTestId("group-buy-settings-save"));
    expect(screen.getByTestId("gb-pickup-window-error").textContent).toBe("pickup_window_both");
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("a refused save shows the server's Hebrew reason", async () => {
    api.patch.mockRejectedValueOnce({ response: { data: { detail: "כבר הוזמנו 9 יחידות, אי אפשר להגביל לפחות מזה" } } });
    render(<GroupBuyOwnerSettings gb={gb} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("group-buy-settings-toggle"));
    fireEvent.click(screen.getByTestId("group-buy-settings-save"));
    expect(await screen.findByText("כבר הוזמנו 9 יחידות, אי אפשר להגביל לפחות מזה")).toBeTruthy();
  });
});
