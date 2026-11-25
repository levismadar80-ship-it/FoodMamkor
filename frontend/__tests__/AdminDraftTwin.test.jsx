/**
 * MEH-3865 — the draft-twin notice on the admin producers list.
 *
 * Rendered inside the real AdminProducersTable with the real he.json copy.
 * 5-state rule: 0 twins / 1 pair (both rows tagged) / many, and the confirm
 * step closed / open. The merge has three outcomes: done (success toast,
 * reload), refused (the server's detail, reload) and an unexpected body
 * (error toast, reload).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import AdminProducersTable from "@/app/[locale]/admin/producers/AdminProducersTable";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const T = he.admin.producers.table.draft_twin;
const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const OWNED_ID = "22222222-2222-4222-8222-222222222222";
const TWIN = {
  draft_id: DRAFT_ID,
  target_id: OWNED_ID,
  draft_name: "מאפיית ארז",
  target_name: "ארז אופה בבית",
  reasons: ["phone", "name_contains_city", "unknown_code"],
};

function row(id, name, status, draft_twin) {
  return {
    id,
    name,
    status,
    created_at: "2026-11-20T10:00:00+00:00",
    _completeness: { missing: [], priority: "green" },
    draft_twin,
  };
}

function renderTable(rows, onRetryLoad = vi.fn()) {
  const noop = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminProducersTable
        rows={rows}
        incompleteOnly={false}
        storyCardOpenId={null}
        onSetStoryCardOpenId={noop}
        loadError={false}
        onRetryLoad={onRetryLoad}
        onQuickApprove={noop}
        onRequestChanges={noop}
        onReject={noop}
        onToggleStatus={noop}
        onDeleteProducer={noop}
        onUploadStoryCard={noop}
        isBusy={() => false}
        page={1}
        totalPages={1}
        perPage={25}
        onPageChange={noop}
        onPerPageChange={noop}
        visibleCount={rows.length}
      />
    </NextIntlClientProvider>,
  );
  return onRetryLoad;
}

const pair = () => [
  row(DRAFT_ID, "מאפיית ארז", "draft", TWIN),
  row(OWNED_ID, "ארז אופה בבית", "pending", TWIN),
];
const notices = () => screen.queryAllByTestId("draft-twin");

async function openAndConfirm(notice) {
  fireEvent.click(within(notice).getByRole("button", { name: T.merge }));
  const group = within(notice).getByRole("group", { name: T.merge });
  fireEvent.click(within(group).getByRole("button", { name: T.confirm_yes }));
}

beforeEach(() => {
  vi.mocked(api.post).mockReset();
  vi.mocked(showToast.error).mockReset();
  vi.mocked(showToast.success).mockReset();
});

describe("DraftTwinNotice", () => {
  it("shows nothing when no row has a twin", () => {
    renderTable([row(DRAFT_ID, "א", "draft", null), row(OWNED_ID, "ב", "pending", undefined)]);
    expect(notices()).toHaveLength(0);
  });

  it("tags both rows of a pair, each naming the other business and the reasons", () => {
    renderTable(pair());
    const [onDraft, onOwned] = notices();
    expect(onDraft).toHaveTextContent(T.tag_on_draft);
    expect(within(onDraft).getByTestId("draft-twin-detail")).toHaveTextContent(
      `ארז אופה בבית · ${T.reasons.phone} · ${T.reasons.name_contains_city}`,
    );
    expect(onOwned).toHaveTextContent(T.tag_on_owner);
    expect(within(onOwned).getByTestId("draft-twin-detail")).toHaveTextContent("מאפיית ארז");
    expect(onDraft).not.toHaveTextContent("unknown_code");
  });

  it("tags every row of many pairs", () => {
    const other = { ...TWIN, draft_id: "d3", target_id: "o4" };
    renderTable([...pair(), row("d3", "ג", "draft", other), row("o4", "ד", "draft", other)]);
    expect(notices()).toHaveLength(4);
  });

  it("asks before merging, and cancel closes the question without a request", () => {
    renderTable(pair());
    const notice = notices()[0];
    expect(within(notice).queryByRole("group")).toBeNull();
    fireEvent.click(within(notice).getByRole("button", { name: T.merge }));
    const group = within(notice).getByRole("group", { name: T.merge });
    expect(group).toHaveTextContent("מאפיית ארז");
    expect(group).toHaveTextContent("ארז אופה בבית");
    fireEvent.click(within(group).getByRole("button", { name: T.cancel }));
    expect(within(notice).queryByRole("group")).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("merges the draft into the owner's page, toasts and reloads", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { producer_id: DRAFT_ID, status: "pending", products_moved: 2 },
    });
    const reload = renderTable(pair());
    await openAndConfirm(notices()[1]);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(
      `/admin/producers/${DRAFT_ID}/merge-owner`,
      { target_producer_id: OWNED_ID },
      { timeout: 30000 },
    );
    expect(showToast.success).toHaveBeenCalledWith(T.done);
    expect(showToast.error).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the merge is refused, and reloads", async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { detail: "אפשר להעביר טיוטה רק לעסק שעוד לא אושר" } },
    });
    const reload = renderTable(pair());
    await openAndConfirm(notices()[0]);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(showToast.error).toHaveBeenCalledWith("אפשר להעביר טיוטה רק לעסק שעוד לא אושר");
    expect(showToast.success).not.toHaveBeenCalled();
  });

  it("reports an unexpected answer instead of claiming success", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { ok: true } });
    const reload = renderTable(pair());
    await openAndConfirm(notices()[0]);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(showToast.error).toHaveBeenCalledWith(T.error);
    expect(showToast.success).not.toHaveBeenCalled();
  });
});
