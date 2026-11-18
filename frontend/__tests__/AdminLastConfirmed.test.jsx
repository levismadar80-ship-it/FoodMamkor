/**
 * Page freshness — «נבדק לאחרונה: {date}» on the admin edit page.
 * Shown when the owner has confirmed; absent (not an empty line) when not.
 * REUSES: __tests__/AdminClaimLink.test.jsx edit-page mocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EditProducerPage from "@/app/[locale]/admin/producers/[id]/edit/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "p-9" }),
}));
const adminAuth = { user: { role: "admin" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => adminAuth }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

function renderWith(producer) {
  api.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/admin/producers/p-9" ? producer : [] }),
  );
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EditProducerPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("edit page — last confirmed line", () => {
  it("shows the date when the owner has confirmed", async () => {
    renderWith({ id: "p-9", name: "עסק", status: "approved", last_confirmed_at: "2026-11-02T09:00:00Z" });
    const line = await screen.findByTestId("admin-last-confirmed");
    expect(line.textContent).toMatch(/^נבדק לאחרונה: /);
    expect(line.textContent).toMatch(/2026/);
  });

  it("renders no line when she has not", async () => {
    renderWith({ id: "p-9", name: "עסק", status: "approved", last_confirmed_at: null });
    await screen.findByText(he.admin.producers.form.sections.basic);
    expect(screen.queryByTestId("admin-last-confirmed")).not.toBeInTheDocument();
  });
});
