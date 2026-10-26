/**
 * MEH-2360 — hide / unhide buttons + "hidden" tag on /admin/reviews.
 *
 * Before this, the sticky hide from MEH-2348 (`PUT /admin/reviews/{id}/hide`,
 * `/unhide`) was reachable only through the API, and a hidden review looked
 * exactly like a visible one on this page.
 *
 * 5-state rule (CLAUDE.md): review count 0 / 1 / many × hidden / visible,
 * each cell asserted, plus a failed request leaving the row unchanged.
 *
 * MEH-2389: in flight the button is aria-disabled (never `disabled`, which
 * drops keyboard focus), and "deleted elsewhere" is the 404 whose detail
 * carries code "review_not_found" — not any 404 with Hebrew in it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminReviewsPage from "@/app/[locale]/admin/reviews/page";

vi.mock("@phosphor-icons/react", () => ({
  Star: (props) => <span data-testid="star-icon" {...props} />,
  Trash: (props) => <span data-testid="trash-icon" {...props} />,
  EyeSlash: (props) => <span data-testid="eye-slash-icon" {...props} />,
  Eye: (props) => <span data-testid="eye-icon" {...props} />,
}));

vi.mock("next-intl", () => {
  const flat = {
    "admin.reviews.count": "{filtered} מתוך {total}",
    "admin.reviews.empty": "אין ביקורות להצגה",
    "admin.reviews.hidden": "מוסתרת",
    "admin.reviews.hide": "הסתירי",
    "admin.reviews.unhide": "החזירי",
    "admin.reviews.hide_aria": "הסתירי את הביקורת של {user}",
    "admin.reviews.unhide_aria": "החזירי את הביקורת של {user}",
    "admin.reviews.hidden_toast": "הביקורת הוסתרה",
    "admin.reviews.unhidden_toast": "הביקורת חזרה לאתר",
    "error.generic": "משהו השתבש",
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

const apiMock = vi.hoisted(() => ({
  rows: [],
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

const NOT_FOUND = { code: "review_not_found", message: "ביקורת לא נמצאה" };

const row = (id, is_hidden) => ({
  id,
  producer_id: "p1",
  producer_name: `עסק ${id}`,
  user_id: `u-${id}`,
  user_name: `משתמשת ${id}`,
  stars: 4,
  body: `ביקורת ${id}`,
  is_hidden,
  created_at: "2026-10-26T10:00:00",
  source: "click",
  ai_moderation_status: null,
});

async function renderWith(rows) {
  apiMock.get.mockImplementation(() => Promise.resolve({ data: rows }));
  render(<AdminReviewsPage />);
  await screen.findByText(`${rows.length} מתוך ${rows.length}`);
}

const rowOf = (id) => screen.getByText(`ביקורת ${id}`).closest("tr");

describe("MEH-2360 hide / unhide on /admin/reviews", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    apiMock.put.mockImplementation(() => Promise.resolve({ data: {} }));
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("0 reviews: no hide or unhide control renders", async () => {
    await renderWith([]);
    expect(screen.getByText("אין ביקורות להצגה")).toBeTruthy();
    expect(screen.queryAllByTestId("review-hide")).toHaveLength(0);
    expect(screen.queryAllByTestId("review-unhide")).toHaveLength(0);
  });

  it("1 visible: no hidden tag; hide calls PUT /hide and flips the row in place", async () => {
    await renderWith([row("a", false)]);
    const r = rowOf("a");
    expect(within(r).queryByTestId("review-hidden-tag")).toBeNull();
    expect(within(r).queryByTestId("review-unhide")).toBeNull();

    fireEvent.click(within(r).getByTestId("review-hide"));

    await waitFor(() => expect(within(r).getByTestId("review-hidden-tag").textContent).toBe("מוסתרת"));
    expect(apiMock.put).toHaveBeenCalledTimes(1);
    expect(apiMock.put).toHaveBeenCalledWith("/admin/reviews/a/hide");
    expect(within(r).getByTestId("review-unhide")).toBeTruthy();
    expect(within(r).queryByTestId("review-hide")).toBeNull();
    expect(toastMock.success).toHaveBeenCalledWith("הביקורת הוסתרה");
    // No reload: the list was fetched once.
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it("1 hidden: tagged; unhide calls PUT /unhide and removes the tag", async () => {
    await renderWith([row("h", true)]);
    const r = rowOf("h");
    expect(within(r).getByTestId("review-hidden-tag").textContent).toBe("מוסתרת");
    expect(within(r).queryByTestId("review-hide")).toBeNull();

    fireEvent.click(within(r).getByTestId("review-unhide"));

    await waitFor(() => expect(within(r).queryByTestId("review-hidden-tag")).toBeNull());
    expect(apiMock.put).toHaveBeenCalledWith("/admin/reviews/h/unhide");
    expect(within(r).getByTestId("review-hide")).toBeTruthy();
    expect(toastMock.success).toHaveBeenCalledWith("הביקורת חזרה לאתר");
  });

  it("many, mixed: each row gets the control for its own state; acting on one leaves the others", async () => {
    await renderWith([row("v1", false), row("h1", true), row("v2", false)]);
    expect(screen.getAllByTestId("review-hide")).toHaveLength(2);
    expect(screen.getAllByTestId("review-unhide")).toHaveLength(1);
    expect(screen.getAllByTestId("review-hidden-tag")).toHaveLength(1);
    expect(within(rowOf("h1")).getByTestId("review-hidden-tag")).toBeTruthy();

    fireEvent.click(within(rowOf("v2")).getByTestId("review-hide"));

    await waitFor(() => expect(screen.getAllByTestId("review-hidden-tag")).toHaveLength(2));
    expect(within(rowOf("v1")).queryByTestId("review-hidden-tag")).toBeNull();
    expect(within(rowOf("v1")).getByTestId("review-hide")).toBeTruthy();
    expect(apiMock.put).toHaveBeenCalledWith("/admin/reviews/v2/hide");
  });

  it("in flight: the clicked row's button is aria-disabled, so a double-click sends one PUT", async () => {
    let settle;
    apiMock.put.mockImplementation(() => new Promise((res) => { settle = res; }));
    await renderWith([row("a", false)]);
    const btn = within(rowOf("a")).getByTestId("review-hide");
    btn.focus();

    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-disabled")).toBe("true"));
    // Not `disabled`: a disabled button loses focus, and a keyboard-only admin
    // would be sent back to the top of the page after every hide.
    expect(btn.disabled).toBe(false);
    expect(document.activeElement).toBe(btn);
    fireEvent.click(btn);
    expect(apiMock.put).toHaveBeenCalledTimes(1);

    settle({ data: {} });
    await waitFor(() => expect(within(rowOf("a")).getByTestId("review-hidden-tag")).toBeTruthy());
  });

  it("two rows in flight: the first one settling does not re-enable the second", async () => {
    const pending = {};
    apiMock.put.mockImplementation((url) => new Promise((res) => { pending[url] = res; }));
    await renderWith([row("a", false), row("b", false)]);
    const btnA = within(rowOf("a")).getByTestId("review-hide");
    const btnB = within(rowOf("b")).getByTestId("review-hide");

    fireEvent.click(btnA);
    fireEvent.click(btnB);
    await waitFor(() => expect(btnB.getAttribute("aria-disabled")).toBe("true"));

    pending["/admin/reviews/a/hide"]({ data: {} });
    await waitFor(() => expect(within(rowOf("a")).getByTestId("review-hidden-tag")).toBeTruthy());
    expect(within(rowOf("b")).getByTestId("review-hide").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btnB);
    expect(apiMock.put).toHaveBeenCalledTimes(2);

    pending["/admin/reviews/b/hide"]({ data: {} });
    await waitFor(() => expect(within(rowOf("b")).getByTestId("review-hidden-tag")).toBeTruthy());
  });

  it("404 (deleted elsewhere): the row leaves the list and the server's message is shown", async () => {
    apiMock.put.mockImplementation(() =>
      Promise.reject({ response: { status: 404, data: { detail: NOT_FOUND } } }),
    );
    await renderWith([row("gone", false), row("kept", false)]);

    fireEvent.click(within(rowOf("gone")).getByTestId("review-hide"));

    await waitFor(() => expect(screen.queryByText("ביקורת gone")).toBeNull());
    expect(screen.getByText("ביקורת kept")).toBeTruthy();
    expect(toastMock.error).toHaveBeenCalledWith("ביקורת לא נמצאה");
  });

  it("a 404 with a Hebrew detail but no code keeps the row and shows generic copy", async () => {
    apiMock.put.mockImplementation(() =>
      Promise.reject({ response: { status: 404, data: { detail: "ביקורת לא נמצאה" } } }),
    );
    await renderWith([row("a", false)]);

    fireEvent.click(within(rowOf("a")).getByTestId("review-hide"));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("משהו השתבש"));
    expect(screen.getByText("ביקורת a")).toBeTruthy();
  });

  it("deleted elsewhere while its delete dialog is open: the dialog closes with the row", async () => {
    let fail;
    apiMock.put.mockImplementation(() => new Promise((_, rej) => { fail = rej; }));
    await renderWith([row("gone", false), row("kept", false)]);

    fireEvent.click(within(rowOf("gone")).getByTestId("review-hide"));
    fireEvent.click(within(rowOf("gone")).getByLabelText(/reviews.delete_aria/));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fail({ response: { status: 404, data: { detail: NOT_FOUND } } });

    await waitFor(() => expect(screen.queryByText("ביקורת gone")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deleted elsewhere while ANOTHER row's delete dialog is open: that dialog stays", async () => {
    let fail;
    apiMock.put.mockImplementation(() => new Promise((_, rej) => { fail = rej; }));
    await renderWith([row("gone", false), row("kept", false)]);

    fireEvent.click(within(rowOf("gone")).getByTestId("review-hide"));
    fireEvent.click(within(rowOf("kept")).getByLabelText(/reviews.delete_aria/));

    fail({ response: { status: 404, data: { detail: NOT_FOUND } } });

    await waitFor(() => expect(screen.queryByText("ביקורת gone")).toBeNull());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("a review that is hidden AND AI-flagged shows both tags in the same cell", async () => {
    await renderWith([{ ...row("both", true), ai_moderation_status: "FLAGGED" }]);
    const both = rowOf("both");
    expect(within(both).getByTestId("review-hidden-tag").textContent).toBe("מוסתרת");
    expect(within(both).getByTestId("review-ai-flag")).toBeTruthy();
    expect(within(both).getByTestId("review-hidden-tag").closest("td")).toBe(
      within(both).getByTestId("review-ai-flag").closest("td"),
    );
  });

  it("a 404 that isn't the handler's (English 'Not Found') keeps the row and shows generic copy", async () => {
    apiMock.put.mockImplementation(() =>
      Promise.reject({ response: { status: 404, data: { detail: "Not Found" } } }),
    );
    await renderWith([row("a", false)]);

    fireEvent.click(within(rowOf("a")).getByTestId("review-hide"));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("משהו השתבש"));
    expect(screen.getByText("ביקורת a")).toBeTruthy();
  });

  it("a non-404 error with an English detail (429) still shows the generic Hebrew copy", async () => {
    apiMock.put.mockImplementation(() =>
      Promise.reject({ response: { status: 429, data: { detail: "Rate limit exceeded" } } }),
    );
    await renderWith([row("a", false)]);

    fireEvent.click(within(rowOf("a")).getByTestId("review-hide"));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("משהו השתבש"));
    expect(screen.getByText("ביקורת a")).toBeTruthy();
  });

  it("a failed request leaves the row as it was and shows the error toast", async () => {
    apiMock.put.mockImplementation(() => Promise.reject(new Error("500")));
    await renderWith([row("a", false)]);
    const r = rowOf("a");

    fireEvent.click(within(r).getByTestId("review-hide"));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("משהו השתבש"));
    expect(within(r).queryByTestId("review-hidden-tag")).toBeNull();
    expect(within(r).getByTestId("review-hide")).toBeTruthy();
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
