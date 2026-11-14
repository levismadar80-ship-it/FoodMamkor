/**
 * MEH-3138 — the recipe form tells an unverified business BEFORE it fills the
 * form, like the four tools in MEH-2918. The server gates the create route
 * (producer_recipes.py:129, require_verified_producer). Cells: unverified →
 * one notice above the first field, not an alert · verified / unknown → none
 * · edit mode → none (PATCH is not gated) · a create 403 → still one mention,
 * re-mounted as an alert.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

const GATE = he.auth.verify.publish_gate;

const authState = { user: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
  useOptionalAuth: () => ({ user: authState.user, loading: false }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}));
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { default: RecipeForm } = await import("@/components/RecipeForm");
const { default: RecipesPage } = await import("@/app/[locale]/producer/dashboard/recipes/page");

const EMAIL_403 = Object.assign(new Error("403"), {
  response: { status: 403, data: { detail: { code: "email_unverified", message: "יש לאמת את כתובת האימייל תחילה" } } },
});
const gateMentions = () =>
  [...document.querySelectorAll("body *")].filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes("יש לאמת את כתובת האימייל תחילה")),
  );
const notices = () => screen.queryAllByText(GATE);
const wrap = (node) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {node}
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: [] });
  post.mockReset();
  post.mockImplementation(() => new Promise(() => {}));
  authState.user = null;
});

describe("RecipeForm — verified-email notice before the form (MEH-3138)", () => {
  it("unverified: one notice, above the first field, not an alert", () => {
    wrap(<RecipeForm mode="create" emailUnverified />);
    expect(notices()).toHaveLength(1);
    const notice = screen.getByTestId("unverified-email-notice");
    expect(notice.getAttribute("role")).toBeNull();
    const firstField = document.querySelector("form input, form textarea");
    expect(notice.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("verified: no notice", () => {
    wrap(<RecipeForm mode="create" emailUnverified={false} />);
    expect(notices()).toHaveLength(0);
  });
  it("edit mode, even if a caller passes the flag: no notice (PATCH is not gated)", () => {
    wrap(<RecipeForm mode="edit" emailUnverified initial={{ id: "r1", title: "מתכון" }} />);
    expect(notices()).toHaveLength(0);
  });
  it("unverified, create 403s: still one mention, now an alert", async () => {
    post.mockImplementation(() => Promise.reject(EMAIL_403));
    wrap(<RecipeForm mode="create" emailUnverified initial={{ title: "עוגת תפוזים", instructions: "לערבב ולאפות בתנור" }} />);
    const before = screen.getByTestId("unverified-email-notice");
    fireEvent.submit(document.querySelector("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("unverified-email-notice").getAttribute("role")).toBe("alert"),
    );
    const first = screen.getByTestId("unverified-email-notice");
    // Re-mounted (a new node, so screen readers announce it) and focused.
    expect(first).not.toBe(before);
    expect(document.activeElement).toBe(first);
    expect(gateMentions()).toHaveLength(1);
    // A second 403 answers again with a fresh node.
    fireEvent.submit(document.querySelector("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("unverified-email-notice")).not.toBe(first));
    expect(document.activeElement).toBe(screen.getByTestId("unverified-email-notice"));
    expect(gateMentions()).toHaveLength(1);
  });
});

describe("recipes page passes the user's state to the form (MEH-3138)", () => {
  const openForm = async () => {
    fireEvent.click(await screen.findByText(he.recipes.dashboard.empty_cta));
  };
  it("unverified producer: the notice shows as soon as the form opens", async () => {
    authState.user = { id: "u1", role: "producer", email_verified: false };
    wrap(<RecipesPage />);
    await openForm();
    await waitFor(() => expect(notices()).toHaveLength(1));
  });
  it("verified producer: no notice", async () => {
    authState.user = { id: "u1", role: "producer", email_verified: true };
    wrap(<RecipesPage />);
    await openForm();
    await new Promise((r) => setTimeout(r, 0));
    expect(notices()).toHaveLength(0);
  });
  it("user without the field (unknown): no notice", async () => {
    authState.user = { id: "u1", role: "producer" };
    wrap(<RecipesPage />);
    await openForm();
    await new Promise((r) => setTimeout(r, 0));
    expect(notices()).toHaveLength(0);
  });
});
