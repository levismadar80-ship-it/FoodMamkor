import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AdminProducersToolbar from "@/app/[locale]/admin/producers/AdminProducersToolbar";

// MEH-2432 follow-up: the list's default ("כל הסטטוסים") leaves drafts out on
// purpose (MEH-2100), so without a "drafts" option an admin cannot reach a
// draft's row at all, and so cannot delete it. The server already accepts
// ?status=draft; this pins the option that sends it.

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

function renderToolbar(setProducerStatus = vi.fn()) {
  render(
    <AdminProducersToolbar
      producerSearch=""
      setProducerSearch={vi.fn()}
      producerStatus="all"
      setProducerStatus={setProducerStatus}
      incompleteOnly={false}
      setIncompleteOnly={vi.fn()}
      incompleteCount={0}
      reviewDueOnly={false}
      setReviewDueOnly={vi.fn()}
      importing={false}
      onSearch={vi.fn()}
      onExport={vi.fn()}
      onImportFile={vi.fn()}
    />
  );
  return setProducerStatus;
}

describe("AdminProducersToolbar — drafts filter", () => {
  it("offers a drafts option whose value is the server's `draft` status", () => {
    renderToolbar();
    const option = screen.getByRole("option", { name: "admin.producers.toolbar.drafts" });
    expect(option).toHaveValue("draft");
  });

  it("selecting it asks the list for drafts", () => {
    const setProducerStatus = renderToolbar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "draft" } });
    expect(setProducerStatus).toHaveBeenCalledWith("draft");
  });
});
