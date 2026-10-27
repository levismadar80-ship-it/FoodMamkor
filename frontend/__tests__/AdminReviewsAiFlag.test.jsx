/**
 * MEH-2349 — AI-flag badge + "only flagged" filter on /admin/reviews.
 *
 * 5-state rule (CLAUDE.md): flagged-review count 0 / 1 / many × filter
 * off / on — six cells, each asserted on its own. Plus the values that must
 * NOT badge: APPROVED and null (a review that predates the column).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminReviewsPage from "@/app/[locale]/admin/reviews/page";

vi.mock("@phosphor-icons/react", () => ({
  Star: (props) => <span data-testid="star-icon" {...props} />,
  Trash: (props) => <span data-testid="trash-icon" {...props} />,
  Eye: (props) => <span data-testid="eye-icon" {...props} />,
  EyeSlash: (props) => <span data-testid="eye-slash-icon" {...props} />,
}));

vi.mock("next-intl", () => {
  const flat = {
    "admin.reviews.count": "{filtered} מתוך {total}",
    "admin.reviews.empty": "אין ביקורות להצגה",
    "admin.reviews.ai_flagged": "סומן ע״י AI",
    "admin.reviews.ai_flagged_only": "רק ביקורות שסומנו",
  };
  return {
    useLocale: () => "he",
    useTranslations: (scope) => (key, values = {}) => {
      const raw = flat[scope ? `${scope}.${key}` : key] ?? key;
      let s = raw;
      for (const [k, v] of Object.entries(values || {})) s = s.replaceAll(`{${k}}`, v);
      return s;
    },
  };
});

const mockResponse = { current: { data: [] } };
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve(mockResponse.current)),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const row = (id, ai_moderation_status) => ({
  id,
  producer_id: "p1",
  producer_name: `עסק ${id}`,
  user_id: `u-${id}`,
  user_name: `משתמשת ${id}`,
  stars: 4,
  body: `ביקורת ${id}`,
  is_hidden: false,
  created_at: "2026-10-26T10:00:00",
  source: "click",
  ai_moderation_status,
});

async function renderWith(rows) {
  mockResponse.current = { data: rows };
  render(<AdminReviewsPage />);
  await waitFor(() => expect(screen.queryByText("loading")).toBeNull());
  await screen.findByText(`${rows.length} מתוך ${rows.length}`);
}

const toggle = () => fireEvent.click(screen.getByTestId("review-ai-flag-filter"));
const bodies = () => screen.queryAllByTestId("review-body").map((n) => n.textContent);

describe("MEH-2349 AI-flag badge and filter", () => {
  beforeEach(() => {
    mockResponse.current = { data: [] };
  });

  it("0 flagged × filter off: every row shows, no badge (APPROVED and null don't badge)", async () => {
    await renderWith([row("a", "APPROVED"), row("b", null)]);
    expect(bodies()).toEqual(["ביקורת a", "ביקורת b"]);
    expect(screen.queryAllByTestId("review-ai-flag")).toHaveLength(0);
  });

  it("0 flagged × filter on: empty state, count 0", async () => {
    await renderWith([row("a", "APPROVED"), row("b", null)]);
    toggle();
    expect(screen.getByText("אין ביקורות להצגה")).toBeTruthy();
    expect(screen.getByText("0 מתוך 2")).toBeTruthy();
  });

  it("1 flagged × filter off: one badge, on the flagged row, all rows show", async () => {
    await renderWith([row("a", "APPROVED"), row("f", "FLAGGED")]);
    const badges = screen.getAllByTestId("review-ai-flag");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("סומן ע״י AI");
    expect(badges[0].closest("tr").textContent).toContain("ביקורת f");
    expect(bodies()).toHaveLength(2);
  });

  it("1 flagged × filter on: only that row", async () => {
    await renderWith([row("a", "APPROVED"), row("f", "FLAGGED")]);
    toggle();
    expect(bodies()).toEqual(["ביקורת f"]);
    expect(screen.getByText("1 מתוך 2")).toBeTruthy();
  });

  it("many flagged × filter off: a badge per flagged row only", async () => {
    await renderWith([row("f1", "FLAGGED"), row("a", "APPROVED"), row("f2", "FLAGGED")]);
    expect(screen.getAllByTestId("review-ai-flag")).toHaveLength(2);
    expect(bodies()).toHaveLength(3);
  });

  it("many flagged × filter on: all flagged rows, none else; toggling back restores all", async () => {
    await renderWith([row("f1", "FLAGGED"), row("a", "APPROVED"), row("f2", "FLAGGED")]);
    toggle();
    expect(bodies()).toEqual(["ביקורת f1", "ביקורת f2"]);
    expect(screen.getByText("2 מתוך 3")).toBeTruthy();
    toggle();
    expect(bodies()).toHaveLength(3);
  });
});
