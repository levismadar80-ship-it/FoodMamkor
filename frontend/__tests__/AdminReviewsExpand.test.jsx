import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * MEH-1902 — the admin review body is `line-clamp-3`, and Phase 0 confirmed the
 * rest of the text was reachable from nowhere on the page. It now expands.
 *
 * The affordance is gated on a MEASUREMENT (`scrollHeight > clientHeight`), and
 * jsdom reports both as 0 — so without stubbing, the toggle would never render
 * and every assertion here would pass by rendering nothing. That is exactly the
 * silent-green shape .claude/rules/testing.md warns about, so the two metrics
 * are stubbed explicitly and the NON-overflowing case is asserted too: if the
 * gate stopped working, the "short body gets no toggle" test goes red.
 */

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    if (full === "admin.reviews.expand") return "עוד";
    if (full === "admin.reviews.collapse") return "פחות";
    if (full === "admin.reviews.stars_aria") return `${vars?.stars ?? ""} כוכבים`;
    if (full === "admin.reviews.delete_aria") return "מחיקה";
    return full;
  },
  useLocale: () => "he",
}));

vi.mock("@phosphor-icons/react", () => ({
  Star: () => <span />,
  Trash: () => <span />,
  Info: () => <span />,
}));

vi.mock("@/components/InfoTooltip", () => ({ default: () => null }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn() } }));

const REVIEWS = [
  {
    id: 1,
    stars: 5,
    title: "ביקורת ארוכה",
    body: "שורה\n".repeat(40),
    producer_name: "טבע פור",
    user_name: "דנה",
    created_at: "2026-08-01T10:00:00Z",
  },
  {
    id: 2,
    stars: 4,
    title: "ביקורת קצרה",
    body: "קצר",
    producer_name: "רוח השדה",
    user_name: "נועה",
    created_at: "2026-08-01T10:00:00Z",
  },
];

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: REVIEWS })), delete: vi.fn() },
}));

import AdminReviewsPage from "@/app/[locale]/admin/reviews/page";

/**
 * Give row 1 a body that overflows its clamp and row 2 one that does not.
 * jsdom has no layout, so these are the only numbers the component can read —
 * defining them per-element is what makes the overflow gate observable at all.
 */
function stubMetrics() {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      if (this.dataset?.testid !== "review-body") return 0;
      return this.textContent.length > 50 ? 500 : 20;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.dataset?.testid === "review-body" ? 20 : 0;
    },
  });
}

beforeEach(() => {
  stubMetrics();
});

describe("MEH-1902 — admin review body expands", () => {
  it("a body that overflows gets a toggle; a short one does NOT", async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getAllByTestId("review-body").length).toBe(2));

    // MEH-1923: wait on the TOGGLE, not on the bodies. The toggle is rendered a
    // state update later than the bodies are — page.jsx:51-55 measures in a
    // useEffect and calls setOverflows — so waiting for `review-body` and then
    // reading the toggle synchronously races that second commit. Measured at
    // 2/30 and 1/36 failures in ISOLATION (no pool contention needed), with the
    // exact CI error: `Unable to find an element by: [data-testid=
    // "review-body-toggle"]`. Asserting the count inside waitFor keeps both
    // halves of the claim — a missing toggle times out, and a second toggle on
    // the short row never settles at 1.
    await waitFor(() =>
      expect(screen.getAllByTestId("review-body-toggle")).toHaveLength(1),
    );

    // Exactly one toggle across two rows — the short review is untouched.
    const toggles = screen.getAllByTestId("review-body-toggle");
    expect(toggles).toHaveLength(1);
    expect(toggles[0]).toHaveTextContent("עוד");
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking expands (clamp removed) and clicking again collapses", async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getAllByTestId("review-body-toggle").length).toBe(1));

    const toggle = screen.getAllByTestId("review-body-toggle")[0];
    const body = screen.getAllByTestId("review-body")[0];

    expect(body.className).toContain("line-clamp-3");

    fireEvent.click(toggle);
    expect(body.className).not.toContain("line-clamp-3");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("פחות");

    fireEvent.click(toggle);
    expect(body.className).toContain("line-clamp-3");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("עוד");
  });

  it("the toggle survives expansion — it does not vanish once the clamp is gone", async () => {
    // Regression guard for the measurement trap: expanded, scrollHeight ===
    // clientHeight, so a naive re-measure would decide there is no overflow and
    // remove the only control that can collapse it again.
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getAllByTestId("review-body-toggle").length).toBe(1));

    fireEvent.click(screen.getAllByTestId("review-body-toggle")[0]);
    expect(screen.getAllByTestId("review-body-toggle")).toHaveLength(1);
  });

  it("the toggle points at the body it controls", async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getAllByTestId("review-body-toggle").length).toBe(1));

    const toggle = screen.getAllByTestId("review-body-toggle")[0];
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls)).toHaveAttribute("data-testid", "review-body");
  });

  it("is a real button, so Enter and Space work without a key handler", async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getAllByTestId("review-body-toggle").length).toBe(1));
    expect(screen.getAllByTestId("review-body-toggle")[0].tagName).toBe("BUTTON");
  });
});
