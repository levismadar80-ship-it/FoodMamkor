/**
 * MEH-3258 — /admin/reviews says why a review is not shown publicly when its
 * author owns the business (conflict "owner") or a competitor ("competitor").
 * Cells: 0 / 1 / many conflict rows, each kind, and null never tags.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminReviewsPage from "@/app/[locale]/admin/reviews/page";

vi.mock("@phosphor-icons/react", () => ({
  Star: (props) => <span {...props} />,
  Trash: (props) => <span {...props} />,
  Eye: (props) => <span {...props} />,
  EyeSlash: (props) => <span {...props} />,
}));

vi.mock("next-intl", () => {
  const flat = {
    "admin.reviews.count": "{filtered} מתוך {total}",
    "admin.reviews.conflict_owner": "לא מוצגת: הכותבת היא בעלת העסק",
    "admin.reviews.conflict_competitor": "לא מוצגת: הכותבת היא בעלת עסק אחר באתר",
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
  default: { get: vi.fn(() => Promise.resolve(mockResponse.current)) },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const row = (id, conflict) => ({
  id,
  producer_id: "p1",
  producer_name: `עסק ${id}`,
  user_id: `u-${id}`,
  user_name: `משתמשת ${id}`,
  stars: 5,
  body: `ביקורת ${id}`,
  is_hidden: false,
  created_at: "2026-11-14T10:00:00",
  source: "click",
  ai_moderation_status: null,
  conflict,
});

async function renderWith(rows) {
  mockResponse.current = { data: rows };
  render(<AdminReviewsPage />);
  await screen.findByText(`${rows.length} מתוך ${rows.length}`);
}
const tags = () => screen.queryAllByTestId("review-conflict-tag").map((n) => n.textContent);

describe("MEH-3258 conflict tag", () => {
  it("0 conflicts: no tag", async () => {
    await renderWith([row("a", null), row("b", undefined)]);
    expect(tags()).toEqual([]);
  });

  it("1 owner conflict: the owner sentence", async () => {
    await renderWith([row("a", "owner"), row("b", null)]);
    expect(tags()).toEqual(["לא מוצגת: הכותבת היא בעלת העסק"]);
  });

  it("many: each row gets its own kind", async () => {
    await renderWith([row("a", "competitor"), row("b", "owner"), row("c", null)]);
    expect(tags()).toEqual([
      "לא מוצגת: הכותבת היא בעלת עסק אחר באתר",
      "לא מוצגת: הכותבת היא בעלת העסק",
    ]);
  });
});
