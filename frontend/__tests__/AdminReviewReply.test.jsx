/**
 * MEH-3259 — /admin/reviews shows the business owner's reply, its AI flag,
 * and «הסירי תגובה» with a confirm dialog.
 *
 * Cells: replies 0 / 1 / many × dialog closed / open; the flagged filter
 * catches a row whose only flag is on the reply; a failed removal keeps the
 * dialog and the reply.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminReviewsPage from "@/app/[locale]/admin/reviews/page";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

vi.mock("@phosphor-icons/react", () => ({
  Star: (props) => <span data-testid="star-icon" {...props} />,
  Trash: (props) => <span data-testid="trash-icon" {...props} />,
  Eye: (props) => <span data-testid="eye-icon" {...props} />,
  EyeSlash: (props) => <span data-testid="eye-slash-icon" {...props} />,
  X: (props) => <span {...props} />,
}));

vi.mock("next-intl", () => {
  const flat = {
    "admin.reviews.count": "{filtered} מתוך {total}",
    "admin.reviews.ai_flagged": "סומן ע״י AI",
    "admin.reviews.reply_label": "תגובת בית העסק",
    "admin.reviews.remove_reply": "הסירי תגובה",
    "admin.reviews.remove_reply_aria": "הסירי את התגובה של בית העסק לביקורת של {user}",
    "admin.reviews.confirm_remove_reply":
      "להסיר את התגובה של {producer}? היא תיעלם מהאתר, ובית העסק יוכל לכתוב תגובה חדשה.",
    "admin.reviews.reply_removed_toast": "התגובה הוסרה",
  };
  return {
    useLocale: () => "he",
    useTranslations: (scope) => (key, values = {}) => {
      let s = flat[scope ? `${scope}.${key}` : key] ?? key;
      for (const [k, v] of Object.entries(values || {})) s = s.replaceAll(`{${k}}`, v);
      return s;
    },
  };
});

const mockResponse = { current: { data: [] } };
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve(mockResponse.current)),
    put: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const row = (id, { reply = null, replyFlag = null, bodyFlag = null } = {}) => ({
  id,
  producer_id: "p1",
  producer_name: `עסק ${id}`,
  user_id: `u-${id}`,
  user_name: `משתמשת ${id}`,
  stars: 4,
  body: `ביקורת ${id}`,
  is_hidden: false,
  created_at: "2026-11-14T10:00:00",
  source: "click",
  ai_moderation_status: bodyFlag,
  reply,
  reply_at: reply ? "2026-11-14T11:00:00" : null,
  reply_ai_moderation_status: replyFlag,
});

async function renderWith(rows) {
  mockResponse.current = { data: rows };
  render(<AdminReviewsPage />);
  await screen.findByText(`${rows.length} מתוך ${rows.length}`);
}

const replies = () => screen.queryAllByTestId("review-reply");

describe("MEH-3259 owner reply on /admin/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResponse.current = { data: [] };
  });

  it("0 replies: no reply block, no remove button", async () => {
    await renderWith([row("a"), row("b")]);
    expect(replies()).toHaveLength(0);
    expect(screen.queryAllByTestId("review-remove-reply")).toHaveLength(0);
  });

  it("1 reply, dialog closed: label, text and remove button; no dialog", async () => {
    await renderWith([row("a", { reply: "תודה רבה!" }), row("b")]);
    expect(replies()).toHaveLength(1);
    const block = replies()[0];
    expect(within(block).getByText("תגובת בית העסק")).toBeTruthy();
    expect(within(block).getByText("תודה רבה!")).toBeTruthy();
    expect(
      within(block).getByRole("button", {
        name: "הסירי את התגובה של בית העסק לביקורת של משתמשת a",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryAllByTestId("review-reply-ai-flag")).toHaveLength(0);
  });

  it("many replies: one block each, a flag only on the flagged one", async () => {
    await renderWith([
      row("a", { reply: "תשובה א" }),
      row("b", { reply: "תשובה ב", replyFlag: "FLAGGED" }),
      row("c", { reply: "תשובה ג", replyFlag: "APPROVED" }),
    ]);
    expect(replies()).toHaveLength(3);
    const flags = screen.getAllByTestId("review-reply-ai-flag");
    expect(flags).toHaveLength(1);
    expect(replies()[1].contains(flags[0])).toBe(true);
  });

  it("flagged filter keeps a row whose only flag is on the reply", async () => {
    await renderWith([
      row("a", { reply: "תשובה א", replyFlag: "FLAGGED" }),
      row("b", { bodyFlag: "FLAGGED" }),
      row("c", { reply: "תשובה ג" }),
    ]);
    fireEvent.click(screen.getByTestId("review-ai-flag-filter"));
    const bodies = screen.queryAllByTestId("review-body").map((n) => n.textContent);
    expect(bodies).toEqual(["ביקורת a", "ביקורת b"]);
  });

  it("dialog open → confirm removes the reply and toasts", async () => {
    await renderWith([row("a", { reply: "תשובה א" }), row("b", { reply: "תשובה ב" })]);
    fireEvent.click(screen.getAllByTestId("review-remove-reply")[0]);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "להסיר את התגובה של עסק a? היא תיעלם מהאתר, ובית העסק יוכל לכתוב תגובה חדשה.",
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "הסירי תגובה" }));
    await waitFor(() => expect(replies()).toHaveLength(1));
    expect(api.put).toHaveBeenCalledWith("/admin/reviews/a/clear-reply");
    expect(showToast.success).toHaveBeenCalledWith("התגובה הוסרה");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("תשובה ב")).toBeTruthy();
  });

  it("dialog open → cancel closes it and keeps the reply", async () => {
    await renderWith([row("a", { reply: "תשובה א" })]);
    fireEvent.click(screen.getByTestId("review-remove-reply"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.put).not.toHaveBeenCalled();
    expect(replies()).toHaveLength(1);
  });

  it("failed removal keeps the dialog and the reply", async () => {
    api.put.mockRejectedValueOnce(new Error("500"));
    await renderWith([row("a", { reply: "תשובה א" })]);
    fireEvent.click(screen.getByTestId("review-remove-reply"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "הסירי תגובה" }));
    await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(replies()).toHaveLength(1);
  });
});
