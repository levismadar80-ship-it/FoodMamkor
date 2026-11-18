/**
 * Page freshness — the admin «לא נבדק יותר מ-60 יום» toggle, and the
 * «נבדק לאחרונה» line on the edit page.
 *
 * REUSES: __tests__/AdminReviewDueFilter.test.jsx — a SERVER filter
 * (`last_confirmed_at` is admin-only and the clause needs the clock), so what
 * is asserted is the request params, absent while OFF.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducersPage from "@/app/[locale]/admin/producers/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/he/admin/producers",
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const TOOLBAR = he.admin.producers.toolbar;

function renderPage() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducersPage />
    </NextIntlClientProvider>,
  );
}

function producerCalls() {
  return api.get.mock.calls
    .filter(([url]) => url === "/admin/producers")
    .map(([, cfg]) => cfg?.params ?? {});
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

describe("the freshness-stale toggle", () => {
  it("is OFF to begin with and does not send the parameter", async () => {
    renderPage();
    const btn = await screen.findByTestId("admin-freshness-stale-toggle");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveTextContent(TOOLBAR.freshness_stale_label);
    await waitFor(() => expect(producerCalls().length).toBeGreaterThan(0));
    for (const params of producerCalls()) {
      expect(params).not.toHaveProperty("freshness_stale");
    }
  });

  it("re-fetches with freshness_stale=true when switched on, and drops it when off", async () => {
    renderPage();
    const btn = await screen.findByTestId("admin-freshness-stale-toggle");
    await waitFor(() => expect(producerCalls().length).toBeGreaterThan(0));
    const before = producerCalls().length;
    fireEvent.click(btn);
    await waitFor(() => expect(producerCalls().length).toBeGreaterThan(before));
    expect(producerCalls().at(-1)).toMatchObject({ freshness_stale: true });
    expect(btn).toHaveAttribute("aria-pressed", "true");

    const mid = producerCalls().length;
    fireEvent.click(btn);
    await waitFor(() => expect(producerCalls().length).toBeGreaterThan(mid));
    expect(producerCalls().at(-1)).not.toHaveProperty("freshness_stale");
  });
});
