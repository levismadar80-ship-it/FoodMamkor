/**
 * MEH-2274 (MEH-1494 chunk B, frontend half) — the annual-review queue.
 *
 * `?recommended_review_due=true` has existed on the server since #3446
 * (`admin.py::_recommended_review_due_clause`, `recommended_at IS NULL OR
 * < now()-12mo`) with nothing in the panel able to ask for it. This wires the
 * toggle.
 *
 * WHY THIS IS A SERVER FILTER, and why that shapes the test. `incompleteOnly`
 * beside it narrows the already-fetched list in the browser. This one cannot:
 * `recommended_at` is admin-only and is not on the list payload at all, so the
 * client has nothing to evaluate. The toggle therefore has to re-FETCH, and
 * what the test asserts is the request — the params on `api.get`, not the rows
 * on screen.
 *
 * DISCRIMINATION. Against the pre-MEH-2274 toolbar the first test fails on the
 * button not existing, and the request tests fail on the parameter never being
 * sent. The OFF-state test is the one that would survive a half-implementation
 * that sends the parameter unconditionally, which is the likely wrong version:
 * a `params.recommended_review_due = reviewDueOnly` would put `false` on every
 * request and read as working.
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

/** Every params object `/admin/producers` was called with, in order. */
function producerCalls() {
  return api.get.mock.calls
    .filter(([url]) => url === "/admin/producers")
    .map(([, cfg]) => cfg?.params ?? {});
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

describe("the review-due toggle (MEH-2274)", () => {
  it("renders, and is OFF to begin with", async () => {
    renderPage();
    const btn = await screen.findByRole("button", {
      name: new RegExp(TOOLBAR.review_due_label),
    });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveAttribute("title", TOOLBAR.review_due_title);
  });

  it("does NOT send the parameter while OFF", async () => {
    renderPage();
    await waitFor(() => expect(producerCalls().length).toBeGreaterThan(0));
    // Not `toBe(false)` — absent. An unconditional `= reviewDueOnly` would
    // send `false` on every request and pass a laxer assertion.
    for (const params of producerCalls()) {
      expect(params).not.toHaveProperty("recommended_review_due");
    }
  });

  it("re-fetches WITH the parameter when switched on", async () => {
    renderPage();
    const btn = await screen.findByRole("button", {
      name: new RegExp(TOOLBAR.review_due_label),
    });
    const before = producerCalls().length;

    fireEvent.click(btn);

    await waitFor(() =>
      expect(producerCalls().length).toBeGreaterThan(before),
    );
    expect(producerCalls().at(-1)).toHaveProperty(
      "recommended_review_due",
      true,
    );
  });

  it("drops the parameter again when switched off", async () => {
    renderPage();
    const btn = await screen.findByRole("button", {
      name: new RegExp(TOOLBAR.review_due_label),
    });

    fireEvent.click(btn);
    await waitFor(() =>
      expect(producerCalls().at(-1)).toHaveProperty("recommended_review_due"),
    );

    // Label flips to "show all" while active, so re-find by the pressed state.
    const active = screen.getByRole("button", {
      name: new RegExp(TOOLBAR.show_all),
    });
    fireEvent.click(active);

    await waitFor(() =>
      expect(producerCalls().at(-1)).not.toHaveProperty(
        "recommended_review_due",
      ),
    );
  });

  it("leaves the status filter alone — the two compose, they do not replace", async () => {
    // Control: proves the assertions above are reading a real request pipeline
    // and not an empty one. A params object that never carries `status` would
    // make every "not.toHaveProperty" above green for the wrong reason.
    renderPage();
    const select = await screen.findByDisplayValue(TOOLBAR.all_statuses);
    fireEvent.change(select, { target: { value: "approved" } });

    await waitFor(() =>
      expect(producerCalls().at(-1)).toHaveProperty("status", "approved"),
    );
  });
});
