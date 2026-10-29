import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AdminProducersToolbar from "@/app/[locale]/admin/producers/AdminProducersToolbar";

// next-intl: identity-ish mock — the full dotted key comes back, so the
// assertions are on stable keys, not on translated copy.
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }) => <a href={href}>{children}</a>,
}));

const DRAFTS_KEY = "admin.producers.toolbar.drafts";

function renderToolbar(producerStatus = "all") {
  const setProducerStatus = vi.fn();
  render(
    <AdminProducersToolbar
      producerSearch=""
      setProducerSearch={vi.fn()}
      producerStatus={producerStatus}
      setProducerStatus={setProducerStatus}
      incompleteOnly={false}
      setIncompleteOnly={vi.fn()}
      incompleteCount={0}
      reviewDueOnly={false}
      setReviewDueOnly={vi.fn()}
      onSearch={vi.fn()}
      onExport={vi.fn()}
    />
  );
  return { setProducerStatus };
}

afterEach(cleanup);

// MEH-2466: the backend has accepted `?status=draft` since MEH-2100
// (admin.py — "the new «טיוטות» option"), but the select never offered it, so
// an owner-claim draft (MEH-2322) was reachable only by its edit URL.
describe("AdminProducersToolbar — status select (MEH-2466)", () => {
  it("offers «טיוטות» as a sixth option with value=draft", () => {
    renderToolbar();
    const select = screen.getByRole("combobox");
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["all", "approved", "pending", "inactive", "rejected", "draft"]);
    expect(screen.getByRole("option", { name: DRAFTS_KEY })).toHaveValue("draft");
  });

  it("choosing «טיוטות» reports draft to the parent (which sends ?status=draft)", () => {
    const { setProducerStatus } = renderToolbar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "draft" } });
    expect(setProducerStatus).toHaveBeenCalledWith("draft");
  });

  it("«כל הסטטוסים» is still value=all (the hook drops it → working queue, no drafts)", () => {
    renderToolbar();
    expect(screen.getByRole("option", { name: "admin.producers.toolbar.all_statuses" })).toHaveValue("all");
  });
});

// MEH-2516: the Excel/CSV import is removed — it published businesses with no
// licence, photo or signed declaration.
describe("AdminProducersToolbar — no import (MEH-2516)", () => {
  it("renders no import button and no file input", () => {
    const { container } = render(
      <AdminProducersToolbar
        producerSearch=""
        setProducerSearch={vi.fn()}
        producerStatus="all"
        setProducerStatus={vi.fn()}
        incompleteOnly={false}
        setIncompleteOnly={vi.fn()}
        incompleteCount={0}
        reviewDueOnly={false}
        setReviewDueOnly={vi.fn()}
        onSearch={vi.fn()}
        onExport={vi.fn()}
      />
    );
    expect(screen.queryByText("admin.producers.toolbar.import_excel")).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    // the neighbouring export button is still there — the toolbar rendered
    expect(screen.getByText("admin.producers.toolbar.export")).toBeInTheDocument();
  });
});
