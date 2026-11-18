/**
 * MEH-3306 (screen) — /admin/audit-log reads GET /admin/audit-log.
 *
 * Cells covered (5-state rule, count × "earlier rows" reveal):
 *   0 rows            → empty line, no "show earlier" button
 *   1 row, last page  → the row, no button
 *   a full page (50)  → button shown; pressing it asks for rows `before` the
 *                       last one and appends them; a short page hides it
 * Plus: an actor whose account is gone reads «חשבון שנמחק», never "null";
 * and the method reads as a Hebrew verb. Real he.json, so a missing key shows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import Page from "@/app/[locale]/admin/audit-log/page";

const apiMock = vi.hoisted(() => ({ pages: [], get: vi.fn() }));
vi.mock("@/lib/api", () => ({
  default: {
    get: (...a) => {
      apiMock.get(...a);
      return Promise.resolve({ data: { items: apiMock.pages.shift() || [] } });
    },
  },
}));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

let n = 0;
const row = (over = {}) => {
  n += 1;
  return {
    id: `id-${n}`,
    actor_id: "a1",
    actor_email: "admin@example.com",
    action: "PUT /admin/users/{user_id}/role",
    target_type: "user",
    target_id: `u-${n}`,
    details: { before: { role: "consumer" }, after: { role: "admin" } },
    created_at: `2026-11-18T1${n % 10}:00:00+00:00`,
    ...over,
  };
};

const renderPage = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <Page />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  apiMock.get.mockClear();
  apiMock.pages = [];
});

describe("admin audit log screen", () => {
  it("0 rows: the empty line, and no button for earlier rows", async () => {
    apiMock.pages = [[]];
    renderPage();
    expect(await screen.findByText(he.admin.audit_log.empty)).toBeTruthy();
    expect(screen.queryByTestId("audit-log-more")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("1 row: who, a Hebrew verb, the route, on what, and the change", async () => {
    apiMock.pages = [[row()]];
    renderPage();
    expect(await screen.findByText("admin@example.com")).toBeTruthy();
    expect(screen.getByText(he.admin.audit_log.method.PUT)).toBeTruthy();
    expect(screen.getByText("/admin/users/{user_id}/role")).toBeTruthy();
    expect(screen.getByText(/role: consumer → admin/)).toBeTruthy();
    expect(screen.queryByTestId("audit-log-more")).toBeNull();
    expect(screen.getByRole("table").className).toContain("table-stack");
  });

  it("an actor whose account is gone reads as deleted, not as null", async () => {
    apiMock.pages = [[row({ actor_email: null })]];
    renderPage();
    expect(await screen.findByText(he.admin.audit_log.deleted_actor)).toBeTruthy();
    expect(screen.queryByText("null")).toBeNull();
  });

  it("a full page shows the button; it pages back by the last row and appends", async () => {
    const first = Array.from({ length: 50 }, () => row());
    const older = row({ actor_email: "older@example.com" });
    apiMock.pages = [first, [older]];
    renderPage();
    const more = await screen.findByTestId("audit-log-more");
    expect(screen.getAllByRole("row")).toHaveLength(51); // header + 50
    fireEvent.click(more);
    expect(await screen.findByText("older@example.com")).toBeTruthy();
    expect(apiMock.get).toHaveBeenLastCalledWith("/admin/audit-log", {
      params: { limit: 50, before: first[49].created_at },
    });
    expect(screen.getAllByRole("row")).toHaveLength(52);
    await waitFor(() => expect(screen.queryByTestId("audit-log-more")).toBeNull());
  });
});
