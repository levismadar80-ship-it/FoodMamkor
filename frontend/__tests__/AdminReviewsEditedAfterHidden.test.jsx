/**
 * MEH-2381 — "edited after hidden" tag on /admin/reviews.
 *
 * 5-state rule (CLAUDE.md): review count 0 / 1 / many × edited / not edited,
 * plus the "keep hidden" button (PUT /hide on a hidden row), which clears the
 * tag without publishing the review.
 * The tag needs BOTH a hidden row and `edited_after_hidden_at`; a visible
 * row never shows it (the server only sets it on hidden rows, and clears it
 * on unhide — the page mirrors that so a stale value cannot linger).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
    "admin.reviews.hidden": "מוסתרת",
    "admin.reviews.edited_after_hidden": "נערכה אחרי שהוסתרה",
    "admin.reviews.keep_hidden": "להשאיר מוסתרת",
    "admin.reviews.ai_flagged": "סומן ע״י AI",
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

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

const EDITED = "2026-10-27T08:00:00";

const row = (id, { hidden = true, edited = null, flagged = false } = {}) => ({
  id,
  producer_id: "p1",
  producer_name: `עסק ${id}`,
  user_id: `u-${id}`,
  user_name: `משתמשת ${id}`,
  stars: 4,
  body: `ביקורת ${id}`,
  is_hidden: hidden,
  created_at: "2026-10-26T10:00:00",
  source: "click",
  ai_moderation_status: flagged ? "FLAGGED" : null,
  edited_after_hidden_at: edited,
});

async function renderWith(rows) {
  apiMock.get.mockImplementation(() => Promise.resolve({ data: rows }));
  render(<AdminReviewsPage />);
  await screen.findByText(`${rows.length} מתוך ${rows.length}`);
}

const tags = () => screen.queryAllByTestId("review-edited-after-hidden-tag");
const keepButtons = () => screen.queryAllByTestId("review-keep-hidden");
const rowOf = (id) => screen.getByText(`ביקורת ${id}`).closest("tr");

describe("MEH-2381 edited-after-hidden tag", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    apiMock.put.mockImplementation(() => Promise.resolve({ data: {} }));
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("0 reviews: no tag", async () => {
    await renderWith([]);
    expect(tags()).toHaveLength(0);
  });

  it("1 hidden, not edited: hidden tag only", async () => {
    await renderWith([row("a")]);
    expect(within(rowOf("a")).getByTestId("review-hidden-tag")).toBeTruthy();
    expect(tags()).toHaveLength(0);
  });

  it("1 hidden, edited: both tags, edited copy", async () => {
    await renderWith([row("a", { edited: EDITED })]);
    expect(within(rowOf("a")).getByTestId("review-hidden-tag")).toBeTruthy();
    expect(within(rowOf("a")).getByTestId("review-edited-after-hidden-tag").textContent).toBe(
      "נערכה אחרי שהוסתרה",
    );
  });

  it("many, mixed: only the hidden+edited rows are tagged", async () => {
    await renderWith([
      row("e1", { edited: EDITED }),
      row("h1"),
      row("e2", { edited: EDITED }),
      row("v1", { hidden: false }),
    ]);
    expect(tags()).toHaveLength(2);
    expect(within(rowOf("e1")).getByTestId("review-edited-after-hidden-tag")).toBeTruthy();
    expect(within(rowOf("e2")).getByTestId("review-edited-after-hidden-tag")).toBeTruthy();
    expect(within(rowOf("h1")).queryByTestId("review-edited-after-hidden-tag")).toBeNull();
  });

  it("many, none edited: no tag on any row", async () => {
    await renderWith([row("h1"), row("h2"), row("v1", { hidden: false })]);
    expect(tags()).toHaveLength(0);
  });

  it("a visible row with a stale timestamp is not tagged", async () => {
    await renderWith([row("v", { hidden: false, edited: EDITED })]);
    expect(tags()).toHaveLength(0);
  });

  it("unhide clears the tag and the keep-hidden button", async () => {
    await renderWith([row("a", { edited: EDITED })]);
    fireEvent.click(within(rowOf("a")).getByTestId("review-unhide"));
    await waitFor(() => expect(within(rowOf("a")).getByTestId("review-hide")).toBeTruthy());
    expect(apiMock.put).toHaveBeenCalledWith("/admin/reviews/a/unhide");
    expect(tags()).toHaveLength(0);
    expect(keepButtons()).toHaveLength(0);
  });

  it("keep-hidden shows only on hidden + edited rows", async () => {
    await renderWith([
      row("e1", { edited: EDITED }),
      row("h1"),
      row("v1", { hidden: false, edited: EDITED }),
    ]);
    expect(keepButtons()).toHaveLength(1);
    expect(within(rowOf("e1")).getByTestId("review-keep-hidden").textContent).toContain(
      "להשאיר מוסתרת",
    );
  });

  it("keep-hidden: PUT /hide, the tag goes, the row stays hidden", async () => {
    await renderWith([row("a", { edited: EDITED }), row("b", { edited: EDITED })]);
    fireEvent.click(within(rowOf("a")).getByTestId("review-keep-hidden"));
    await waitFor(() =>
      expect(within(rowOf("a")).queryByTestId("review-edited-after-hidden-tag")).toBeNull(),
    );
    expect(apiMock.put).toHaveBeenCalledTimes(1);
    expect(apiMock.put).toHaveBeenCalledWith("/admin/reviews/a/hide");
    expect(within(rowOf("a")).getByTestId("review-hidden-tag")).toBeTruthy();
    expect(within(rowOf("a")).getByTestId("review-unhide")).toBeTruthy();
    expect(within(rowOf("a")).queryByTestId("review-keep-hidden")).toBeNull();
    // the other edited row is untouched
    expect(within(rowOf("b")).getByTestId("review-edited-after-hidden-tag")).toBeTruthy();
  });

  it("keep-hidden failure keeps the tag", async () => {
    apiMock.put.mockImplementation(() => Promise.reject({ response: { status: 500 } }));
    await renderWith([row("a", { edited: EDITED })]);
    fireEvent.click(within(rowOf("a")).getByTestId("review-keep-hidden"));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(within(rowOf("a")).getByTestId("review-edited-after-hidden-tag")).toBeTruthy();
    expect(within(rowOf("a")).getByTestId("review-keep-hidden")).toBeTruthy();
  });

  it("keep-hidden on a review deleted elsewhere drops the row", async () => {
    apiMock.put.mockImplementation(() =>
      Promise.reject({
        response: {
          status: 404,
          data: { detail: { code: "review_not_found", message: "ביקורת לא נמצאה" } },
        },
      }),
    );
    await renderWith([row("a", { edited: EDITED }), row("b")]);
    fireEvent.click(within(rowOf("a")).getByTestId("review-keep-hidden"));
    await waitFor(() => expect(screen.queryByText("ביקורת a")).toBeNull());
    expect(toastMock.error).toHaveBeenCalledWith("ביקורת לא נמצאה");
    expect(screen.getByText("ביקורת b")).toBeTruthy();
  });

  it("hidden + edited + AI-flagged: all three tags in one cell", async () => {
    await renderWith([row("a", { edited: EDITED, flagged: true })]);
    const cell = within(rowOf("a"));
    expect(cell.getByTestId("review-hidden-tag")).toBeTruthy();
    expect(cell.getByTestId("review-edited-after-hidden-tag")).toBeTruthy();
    expect(cell.getByTestId("review-ai-flag")).toBeTruthy();
  });
});
