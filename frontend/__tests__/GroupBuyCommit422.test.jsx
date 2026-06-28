/**
 * MEH-975: Regression test — committing to a group buy must NOT crash the
 * tree (React #31 "Objects are not valid as a React child") when the commit
 * POST returns a 422 whose `detail` is an ARRAY of Pydantic error objects.
 *
 * Before the fix, GroupBuyDetailClient set `err.response.data.detail` (the
 * array) straight into `error` state and rendered it as a React child
 * (GroupBuyDetailClient.jsx:312). detailToMessage() (lib/errors.js, MEH-957)
 * now collapses the array to a single string so the alert renders plain text
 * and never crashes.
 *
 * Component test (not E2E): the commit flow is auth-gated; mirrors the
 * DashboardLoadError (MEH-956) isolation pattern.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Signed-in user so the commit form posts instead of redirecting to /login.
vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, name: "דנה", role: "user", phone: "0500000000" };
  return { useAuth: () => ({ user, loading: false }) };
});

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/format-date", () => ({
  formatEventDate: () => "1 בינואר 2099",
}));

// An open, joinable group buy with a far-future deadline.
const OPEN_GB = {
  id: "gb-1",
  title: "קבוצת רכש לדוגמה",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 2,
  max_participants: 10,
  commits_count: 0,
  price_per_unit_regular: 100,
  price_per_unit_group: 80,
  user_committed: false,
  user_commit: null,
};

// A realistic FastAPI 422 RequestValidationError body — `detail` is an ARRAY.
const VALIDATION_422 = {
  response: {
    status: 422,
    data: {
      detail: [
        {
          type: "greater_than_equal",
          loc: ["body", "quantity"],
          msg: "Input should be greater than or equal to 1",
          input: 0,
        },
      ],
    },
  },
};

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: OPEN_GB })),
    post: vi.fn(() => Promise.reject(VALIDATION_422)),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

describe("GroupBuyDetailClient — commit 422 array detail (MEH-975)", () => {
  it("renders the 422 detail as a plain string alert, never crashing the tree", async () => {
    render(<GroupBuyDetailClient id="gb-1" />);

    // Wait for the open group buy to load and the commit form to appear.
    const submit = await screen.findByRole("button", { name: "submit_join" });

    // Submitting triggers the 422 rejection. If the array were rendered as a
    // React child this render would throw (React #31).
    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    // The collapsed message is a single readable string, not "[object Object]".
    expect(alert.textContent).toBe("Input should be greater than or equal to 1");
    expect(alert.textContent).not.toContain("[object Object]");
  });
});
