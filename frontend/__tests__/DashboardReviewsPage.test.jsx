/**
 * MEH-3107: the dashboard's own reviews page — reviews with no reply first,
 * a reply saved in place, and the 0 / 1 / many × reply-form closed / open
 * states. The «ביקורות» tile in «כלים» links here (not the public page).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import fs from "node:fs";
import ReviewsPage from "@/app/[locale]/producer/dashboard/reviews/page";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, role: "producer" };
  return { useAuth: () => ({ user, loading: false }) };
});
vi.mock("next-intl", () => {
  const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
  t.rich = t;
  return { useLocale: () => "he", useTranslations: () => t };
});

const { reviewsRef, failRef, putMock } = vi.hoisted(() => ({
  reviewsRef: { current: [] },
  failRef: { current: false },
  putMock: { fn: null },
}));
vi.mock("@/lib/api", () => {
  const put = vi.fn((url, body) =>
    Promise.resolve({ data: { ...reviewsRef.current.find((r) => url.includes(r.id)), reply: body.reply } }),
  );
  putMock.fn = put;
  return {
    default: {
      get: vi.fn((url) => {
        if (failRef.current) return Promise.reject(new Error("boom"));
        if (url === "/producers/me") return Promise.resolve({ data: { id: "p1" } });
        if (url === "/reviews") return Promise.resolve({ data: reviewsRef.current });
        return Promise.resolve({ data: null });
      }),
      put,
    },
  };
});

const review = (id, reply = null) => ({
  id, user_id: id, user_name: `לקוחה ${id}`, stars: 5, body: `גוף ${id}`,
  created_at: "2026-11-10T10:00:00Z", reply, reply_at: reply ? "2026-11-11T10:00:00Z" : null,
});

describe("dashboard reviews page (MEH-3107)", () => {
  beforeEach(() => {
    failRef.current = false;
  });

  it("0 reviews: the owner empty state, no list, no summary", async () => {
    reviewsRef.current = [];
    render(<ReviewsPage />);
    expect(await screen.findByText("owner_empty_title")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-review")).toBeNull();
    expect(screen.queryByTestId("owner-reviews-summary")).toBeNull();
  });

  it("1 review, form closed → open: «הוספת תגובה» opens the reply box", async () => {
    reviewsRef.current = [review("a")];
    render(<ReviewsPage />);
    const rows = await screen.findAllByTestId("owner-review");
    expect(rows).toHaveLength(1);
    expect(screen.getByTestId("owner-reviews-summary").textContent).toContain('"unanswered":1,"total":1');
    expect(within(rows[0]).queryByRole("textbox")).toBeNull();
    fireEvent.click(within(rows[0]).getByText("reply_add"));
    expect(within(rows[0]).getByRole("textbox")).toBeInTheDocument();
  });

  it("many: unanswered first, newest first inside each group", async () => {
    // API order = newest first: c (answered), b (open), a (answered), d (open)
    reviewsRef.current = [review("c", "תודה"), review("b"), review("a", "תודה"), review("d")];
    render(<ReviewsPage />);
    const rows = await screen.findAllByTestId("owner-review");
    expect(rows.map((r) => r.textContent.match(/גוף (\w)/)[1])).toEqual(["b", "d", "c", "a"]);
    expect(rows.map((r) => r.dataset.answered)).toEqual(["false", "false", "true", "true"]);
    expect(screen.getByTestId("owner-reviews-summary").textContent).toContain('"unanswered":2,"total":4');
  });

  it("many, form open: saving a reply PUTs it and the row stays in place, counted as answered", async () => {
    reviewsRef.current = [review("b"), review("c", "תודה")];
    render(<ReviewsPage />);
    const rows = await screen.findAllByTestId("owner-review");
    fireEvent.click(within(rows[0]).getByText("reply_add"));
    fireEvent.change(within(rows[0]).getByRole("textbox"), { target: { value: "תודה רבה!" } });
    fireEvent.click(within(rows[0]).getByText("reply_save"));
    // The shown reply block, not the textarea (which also holds the text
    // until the save lands and is then removed).
    expect(await within(rows[0]).findByTestId("review-reply")).toHaveTextContent("תודה רבה!");
    expect(putMock.fn).toHaveBeenCalledWith("/reviews/b/reply", { reply: "תודה רבה!" });
    const after = screen.getAllByTestId("owner-review");
    expect(after[0].textContent).toContain("גוף b");
    expect(screen.getByTestId("owner-reviews-summary").textContent).toContain('"unanswered":0,"total":2');
  });

  it("a failed load shows the retry row, not an empty state", async () => {
    failRef.current = true;
    render(<ReviewsPage />);
    expect(await screen.findByTestId("owner-reviews-error")).toBeInTheDocument();
    expect(screen.queryByText("owner_empty_title")).toBeNull();
  });

  it("the «ביקורות» tile in «כלים» links here, not to the public page", () => {
    const src = fs.readFileSync("app/[locale]/producer/dashboard/tools/page.js", "utf8");
    expect(src).toContain('href="/producer/dashboard/reviews"');
    expect(src).not.toContain("#reviews`}");
  });
});
