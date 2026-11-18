/**
 * MEH-3260 — «דיווח על ביקורת»: the ⋮ on a review card and its dialog.
 *
 * Cells: menu closed / open; dialog closed / open; no reason (submit off),
 * a reason (submit on), "other" without / with details; success closes and
 * toasts; failure keeps the dialog; the author sees no menu; a guest does;
 * the card list with 0 / 1 / many reviews renders one ⋮ per review.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ReviewReportMenu from "@/components/ReviewReportMenu";

const he = {
  "reviews.report.menu_aria": "אפשרויות לביקורת של {user}",
  "reviews.report.report_link": "דיווח על הביקורת",
  "reviews.report.dialog_title": "דיווח על ביקורת",
  "reviews.report.dialog_intro": "מה הבעיה בביקורת? נבדוק ונחליט אם להסיר אותה.",
  "reviews.report.reason_fake": "נראית מזויפת או לא מבוססת על ניסיון אמיתי",
  "reviews.report.reason_abusive": "פוגענית או בוטה",
  "reviews.report.reason_personal": "חושפת פרטים אישיים",
  "reviews.report.reason_irrelevant": "לא קשורה לבית העסק הזה, או ספאם",
  "reviews.report.reason_other": "סיבה אחרת",
  "reviews.report.details_label": "פרטים נוספים (לא חובה)",
  "reviews.report.details_required": "ספרו לנו בכמה מילים מה הבעיה",
  "reviews.report.success_toast": "תודה, הדיווח הגיע אלינו. נבדוק אותו בהקדם.",
  "modals.report_info.email_label": "מייל לעדכון חוזר (לא חובה)",
  "modals.report_info.submit": "שליחה",
  "modals.report_info.submit_loading": "בשליחה...",
  "modals.report_info.close": "סגרו",
  "modals.report_info.toasts.error": "שגיאה בשליחה — נסו שוב",
};
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, values = {}) => {
    let s = he[`${scope}.${key}`] ?? key;
    for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
    return s;
  },
  useLocale: () => "he",
}));

const { apiMock, authState, toast } = vi.hoisted(() => ({
  apiMock: { post: vi.fn(() => Promise.resolve({})), get: vi.fn(() => Promise.resolve({ data: {} })) },
  authState: { user: null },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState, useOptionalAuth: () => authState }));
vi.mock("@/lib/toast", () => ({ showToast: toast }));
vi.mock("@phosphor-icons/react", () => ({
  DotsThreeVertical: (props) => <span {...props} />,
  X: (props) => <span {...props} />,
}));

const review = (id, user_id = `u-${id}`) => ({ id, user_id });

function renderMenu(r = review("r1")) {
  return render(<ReviewReportMenu review={r} producerId="p1" authorName="דנה" />);
}
const kebab = () => screen.getByRole("button", { name: "אפשרויות לביקורת של דנה" });
const openDialog = async () => {
  fireEvent.click(kebab());
  fireEvent.click(await screen.findByRole("menuitem", { name: "דיווח על הביקורת" }));
  return screen.findByRole("dialog");
};
const submit = (d) => within(d).getByRole("button", { name: "שליחה" });

describe("MEH-3260 review report menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
    authState.loading = false;
  });

  it("session still loading: no ⋮ yet (the author must not see it on her own review)", () => {
    authState.loading = true;
    renderMenu();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("menu closed: a guest sees the ⋮ with aria-haspopup=menu, no menu, no dialog", () => {
    renderMenu();
    expect(kebab().getAttribute("aria-haspopup")).toBe("menu");
    expect(kebab().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("menu open: one item, «דיווח על הביקורת»; Escape closes it", async () => {
    renderMenu();
    fireEvent.click(kebab());
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((n) => n.textContent)).toEqual([
      "דיווח על הביקורת",
    ]);
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("the author does not see the menu on her own review", () => {
    authState.user = { id: "u-r1" };
    const { container } = renderMenu();
    expect(container.innerHTML).toBe("");
  });

  it("another signed-in visitor does", () => {
    authState.user = { id: "someone-else" };
    renderMenu();
    expect(kebab()).toBeTruthy();
  });

  it("dialog open: title, intro, five reasons; submit off until a reason", async () => {
    renderMenu();
    const d = await openDialog();
    expect(within(d).getByRole("heading", { name: "דיווח על ביקורת" })).toBeTruthy();
    expect(within(d).getByText("מה הבעיה בביקורת? נבדוק ונחליט אם להסיר אותה.")).toBeTruthy();
    expect(within(d).getAllByRole("radio")).toHaveLength(5);
    expect(submit(d).disabled).toBe(true);
    fireEvent.click(within(d).getByLabelText("פוגענית או בוטה"));
    expect(submit(d).disabled).toBe(false);
  });

  it("“other” needs details: the label switches and submit waits for text", async () => {
    renderMenu();
    const d = await openDialog();
    expect(within(d).getByLabelText("פרטים נוספים (לא חובה)")).toBeTruthy();
    fireEvent.click(within(d).getByLabelText("סיבה אחרת"));
    const details = within(d).getByLabelText(/ספרו לנו בכמה מילים מה הבעיה/);
    expect(submit(d).disabled).toBe(true);
    fireEvent.change(details, { target: { value: "   " } });
    expect(submit(d).disabled).toBe(true);
    fireEvent.change(details, { target: { value: "זו לא לקוחה" } });
    expect(submit(d).disabled).toBe(false);
  });

  it("success posts the report, toasts and closes the dialog", async () => {
    renderMenu();
    const d = await openDialog();
    fireEvent.click(within(d).getByLabelText("נראית מזויפת או לא מבוססת על ניסיון אמיתי"));
    fireEvent.click(submit(d));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(apiMock.post).toHaveBeenCalledWith("/reports/review", {
      producer_slug: "p1",
      review_id: "r1",
      reason: "fake",
      details: null,
      reporter_email: null,
    });
    expect(toast.success).toHaveBeenCalledWith(
      "תודה, הדיווח הגיע אלינו. נבדוק אותו בהקדם.",
      { duration: 4000 },
    );
  });

  it("failure toasts the error and keeps the dialog", async () => {
    apiMock.post.mockRejectedValueOnce(new Error("500"));
    renderMenu();
    const d = await openDialog();
    fireEvent.click(within(d).getByLabelText("חושפת פרטים אישיים"));
    fireEvent.click(submit(d));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("שגיאה בשליחה — נסו שוב"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("close button closes the dialog without sending", async () => {
    renderMenu();
    const d = await openDialog();
    fireEvent.click(within(d).getByRole("button", { name: "סגרו" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it.each([0, 1, 3])("%i reviews → one ⋮ each", (n) => {
    render(
      <div>
        {Array.from({ length: n }, (_, i) => (
          <ReviewReportMenu key={i} review={review(`r${i}`)} producerId="p1" authorName={`כותבת ${i}`} />
        ))}
      </div>,
    );
    expect(screen.queryAllByRole("button", { name: /אפשרויות לביקורת של/ })).toHaveLength(n);
  });
});
