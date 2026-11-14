/**
 * MEH-3200 part 2: the dot on the «כלים» tab while a tool from a release of
 * the last 14 days is new. Cells: 0 new tools → no dot; ≥ 1 → dot on «כלים»
 * only, with its screen-reader text; organizer (no «כלים» tab) → no dot.
 * Mocks follow DashboardOrganizerTabs.test.jsx (same layout).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const authState = { user: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, logout: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: (scope) => (key) => `${scope}.${key}`, useLocale: () => "he" }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/producer/dashboard",
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
const toolsMock = vi.hoisted(() => ({ list: [] }));
vi.mock("@/lib/whats-new", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, newToolHrefs: (now) => real.newToolHrefs(now, toolsMock.list) };
});

import DashboardLayout from "@/app/[locale]/producer/dashboard/DashboardLayoutClient";

const today = new Date().toISOString().slice(0, 10);
const rel = (tools) => [{ version: "9.9.9", key: "x", date: today, items: 1, tools }];

beforeEach(() => {
  authState.user = { role: "producer", producer_id: "p-1", producer_kind: "producer" };
  toolsMock.list = [];
});

describe("«כלים» tab dot (MEH-3200 part 2)", () => {
  it("0 new tools: no dot", () => {
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.queryByTestId("new-tool-dot")).toBeNull();
  });

  it("a new tool: one dot, on «כלים», with its screen-reader text", () => {
    toolsMock.list = rel(["/producer/dashboard/rescue", "/producer/dashboard/recipes"]);
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.getAllByTestId("new-tool-dot")).toHaveLength(1);
    const dot = within(screen.getByTestId("dashboard-tab-tools")).getByTestId("new-tool-dot");
    expect(dot).toHaveTextContent("dashboard.producer.new_tool.dot");
  });

  it("organizer: no «כלים» tab, so no dot", () => {
    authState.user = { role: "producer", producer_id: "p-2", producer_kind: "organizer" };
    toolsMock.list = rel(["/producer/dashboard/rescue"]);
    render(<DashboardLayout><div /></DashboardLayout>);
    expect(screen.queryByTestId("new-tool-dot")).toBeNull();
  });
});
