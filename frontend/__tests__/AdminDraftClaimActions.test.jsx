/**
 * MEH-2495 — the drafts list's per-row claim surface.
 *
 * The chip (owner claimed / still waiting) and the one-click "copy message
 * with link" action, rendered inside the real AdminProducersTable with the
 * real he.json copy. 5-state rule: 0 drafts / 1 / many × both chip states,
 * plus a row whose backend sent no `has_owner` at all.
 *
 * The copy action has three outcomes, each its own case: copied (toast),
 * clipboard refused (the message shown in a selectable box), and the mint
 * refused (the server's detail as an error toast — no box, no success).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import AdminProducersTable from "@/app/[locale]/admin/producers/AdminProducersTable";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const D = he.admin.producers.table.draft_claim;
const URL_ = "https://www.mehamakor.co.il/claim/tok.en.sig";
const LINK = { url: URL_, expires_at: "2026-11-11T10:00:00+00:00" };
const MESSAGE = D.message.replace("{url}", URL_);
// The mint is bounded (AdminDraftClaimActions MINT_TIMEOUT_MS).
const MINT_OPTS = { timeout: 20000 };

let seq = 0;
function row(status, has_owner) {
  seq += 1;
  const r = {
    id: `p-${seq}`,
    name: `עסק ${seq}`,
    status,
    created_at: "2026-10-20T10:00:00+00:00",
    _completeness: { missing: [], priority: "green" },
  };
  if (has_owner !== undefined) r.has_owner = has_owner;
  return r;
}

function renderTable(rows, { onRetryLoad } = {}) {
  const noop = vi.fn();
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminProducersTable
        rows={rows}
        incompleteOnly={false}
        storyCardOpenId={null}
        onSetStoryCardOpenId={noop}
        loadError={false}
        onRetryLoad={onRetryLoad || noop}
        onQuickApprove={noop}
        onRequestChanges={noop}
        onReject={noop}
        onToggleStatus={noop}
        onToggleAmbassador={noop}
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
}

const badges = () => screen.queryAllByTestId("draft-owner-badge");
const copyButtons = () => screen.queryAllByTestId("draft-copy-claim-message");

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalClipboardItem = globalThis.ClipboardItem;

function setClipboard(value) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

// Minimal ClipboardItem: keeps the {type: Promise<Blob>} map so the test can
// read what was written once the promise settles.
class FakeClipboardItem {
  constructor(items) {
    this.items = items;
  }
}

async function writtenText(write) {
  const [[items]] = write.mock.calls;
  const blob = await items[0].items["text/plain"];
  return blob.text();
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
});

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete navigator.clipboard;
  globalThis.ClipboardItem = originalClipboardItem;
});

describe("draft owner chip — 0 / 1 / many × waiting / claimed", () => {
  it("0 drafts: the empty row, no chip, no copy action", () => {
    renderTable([]);
    expect(screen.getByText(he.admin.producers.table.empty)).toBeInTheDocument();
    expect(badges()).toHaveLength(0);
    expect(copyButtons()).toHaveLength(0);
  });

  it("1 draft, no owner: «מחכה לבעלים» and the copy action", () => {
    renderTable([row("draft", false)]);
    expect(badges()).toHaveLength(1);
    expect(badges()[0]).toHaveTextContent(D.owner_waiting);
    expect(copyButtons()).toHaveLength(1);
    expect(copyButtons()[0]).toHaveTextContent(D.copy_message);
  });

  it("1 draft, claimed: «נקלט, בהשלמה» and NO copy action", () => {
    renderTable([row("draft", true)]);
    expect(badges()).toHaveLength(1);
    expect(badges()[0]).toHaveTextContent(D.owner_claimed);
    expect(copyButtons()).toHaveLength(0);
  });

  it("many drafts mixed: one chip per draft, copy only on the waiting ones", () => {
    renderTable([
      row("draft", false),
      row("draft", true),
      row("draft", false),
      row("draft", true),
      row("draft", false),
    ]);
    const owners = badges().map((b) => b.dataset.owner);
    expect(owners.filter((o) => o === "waiting")).toHaveLength(3);
    expect(owners.filter((o) => o === "claimed")).toHaveLength(2);
    expect(copyButtons()).toHaveLength(3);
  });

  it("many drafts, all claimed: no copy action anywhere", () => {
    renderTable([row("draft", true), row("draft", true)]);
    expect(badges().map((b) => b.textContent)).toEqual([D.owner_claimed, D.owner_claimed]);
    expect(copyButtons()).toHaveLength(0);
  });

  it("a pending row keeps its own status chip and gets neither the owner chip nor the action", () => {
    renderTable([row("pending", true), row("pending", false)]);
    expect(screen.getAllByText("ממתינה לאישור האדמין")).toHaveLength(2);
    expect(badges()).toHaveLength(0);
    expect(copyButtons()).toHaveLength(0);
  });

  it("a draft whose payload has no has_owner shows neither (never guesses ownerless)", () => {
    renderTable([row("draft")]);
    expect(badges()).toHaveLength(0);
    expect(copyButtons()).toHaveLength(0);
  });
});

describe("«העתקת הודעה עם קישור»", () => {
  it("starts the clipboard write inside the click, then writes the approved message with the fresh link", async () => {
    let resolvePost;
    api.post.mockReturnValue(new Promise((r) => (resolvePost = r)));
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    setClipboard({ write, writeText });
    globalThis.ClipboardItem = FakeClipboardItem;

    renderTable([row("draft", false)]);
    fireEvent.click(copyButtons()[0]);

    // Synchronous with the click — before the mint has answered (Safari).
    expect(api.post).toHaveBeenCalledWith("/admin/producers/p-1/claim-link", undefined, MINT_OPTS);
    expect(write).toHaveBeenCalledTimes(1);

    resolvePost({ data: LINK });
    expect(await writtenText(write)).toBe(MESSAGE);
    await waitFor(() => expect(showToast.success).toHaveBeenCalledWith(D.copied));
    expect(showToast.error).not.toHaveBeenCalled();
    expect(screen.queryByTestId("draft-claim-message-manual")).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("the composed message is the card's copy verbatim (both lines, 14 days)", () => {
    expect(MESSAGE).toBe(
      `הכנתי לך את העמוד 🙂 זה הקישור: ${URL_}\n` +
        "נכנסים עם גוגל (הכי מהיר) או עם מייל, בודקים ומאשרים, והעמוד עולה לאתר אחרי בדיקה קצרה. הקישור בתוקף 14 יום.",
    );
  });

  it("without ClipboardItem it falls back to writeText with the same message", async () => {
    api.post.mockResolvedValue({ data: LINK });
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    globalThis.ClipboardItem = undefined;

    renderTable([row("draft", false)]);
    fireEvent.click(copyButtons()[0]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MESSAGE));
    await waitFor(() => expect(showToast.success).toHaveBeenCalledWith(D.copied));
  });

  it("clipboard refused: the message appears in a selectable box, no success toast", async () => {
    api.post.mockResolvedValue({ data: LINK });
    setClipboard({ write: vi.fn().mockRejectedValue(new Error("NotAllowedError")) });
    globalThis.ClipboardItem = FakeClipboardItem;

    renderTable([row("draft", false)]);
    fireEvent.click(copyButtons()[0]);

    const box = await screen.findByTestId("draft-claim-message-manual");
    expect(box).toHaveValue(MESSAGE);
    expect(box).toHaveAttribute("readonly");
    // Announced, labelled by that announcement, and focused + selected.
    const note = screen.getByTestId("draft-claim-copy-failed");
    expect(note).toHaveAttribute("role", "alert");
    expect(note).toHaveTextContent(he.admin.producers.claim.copy_failed);
    expect(box).toHaveAttribute("aria-labelledby", note.id);
    expect(box).toHaveFocus();
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, MESSAGE.length]);
    expect(showToast.success).not.toHaveBeenCalled();
    expect(showToast.error).not.toHaveBeenCalled();
  });

  it("no clipboard API at all: same selectable box", async () => {
    api.post.mockResolvedValue({ data: LINK });
    setClipboard(undefined);
    globalThis.ClipboardItem = undefined;

    renderTable([row("draft", false)]);
    fireEvent.click(copyButtons()[0]);

    expect(await screen.findByTestId("draft-claim-message-manual")).toHaveValue(MESSAGE);
  });

  it("409: the server's Hebrew detail as an error toast — no box, no success", async () => {
    const detail = "העמוד הזה כבר שויך לחשבון.";
    api.post.mockRejectedValue({ response: { status: 409, data: { detail } } });
    setClipboard({ write: vi.fn((items) => items[0].items["text/plain"]) });
    globalThis.ClipboardItem = FakeClipboardItem;

    const onRetryLoad = vi.fn();
    renderTable([row("draft", false)], { onRetryLoad });
    fireEvent.click(copyButtons()[0]);

    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith(detail));
    // The row is stale (claimed or submitted since the list loaded): reload.
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
    expect(showToast.success).not.toHaveBeenCalled();
    expect(screen.queryByTestId("draft-claim-message-manual")).not.toBeInTheDocument();
  });

  it("a malformed link payload is an error, never pasted", async () => {
    api.post.mockResolvedValue({ data: { url: "not a url", expires_at: "x" } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    globalThis.ClipboardItem = undefined;

    renderTable([row("draft", false)]);
    fireEvent.click(copyButtons()[0]);

    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith(he.admin.producers.claim.error));
    expect(writeText).not.toHaveBeenCalled();
    expect(showToast.success).not.toHaveBeenCalled();
  });

  it("disables its own button while the mint is in flight", async () => {
    let resolvePost;
    api.post.mockReturnValue(new Promise((r) => (resolvePost = r)));
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    globalThis.ClipboardItem = undefined;

    renderTable([row("draft", false)]);
    const btn = copyButtons()[0];
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(api.post).toHaveBeenCalledTimes(1);

    resolvePost({ data: LINK });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("each waiting row mints for its own id", async () => {
    api.post.mockResolvedValue({ data: LINK });
    setClipboard({ writeText: vi.fn() });
    globalThis.ClipboardItem = undefined;

    renderTable([row("draft", false), row("draft", true), row("draft", false)]);
    const rows = screen.getAllByRole("row").slice(1);
    fireEvent.click(within(rows[2]).getByTestId("draft-copy-claim-message"));
    expect(api.post).toHaveBeenCalledWith("/admin/producers/p-3/claim-link", undefined, MINT_OPTS);
    await waitFor(() => expect(showToast.success).toHaveBeenCalled());
  });

  it("clipboard refuses before reading the item, then the mint 409s: no unhandled rejection", async () => {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      let rejectPost;
      api.post.mockReturnValue(new Promise((_, rej) => (rejectPost = rej)));
      // A browser that refuses up front (focus / permission) never touches
      // the item's promise.
      setClipboard({ write: vi.fn().mockRejectedValue(new Error("NotAllowedError")) });
      globalThis.ClipboardItem = FakeClipboardItem;

      renderTable([row("draft", false)]);
      fireEvent.click(copyButtons()[0]);
      rejectPost({ response: { status: 409, data: { detail: "העמוד הזה כבר שויך לחשבון." } } });

      await waitFor(() => expect(showToast.error).toHaveBeenCalled());
      // Let the microtask queue drain so Node can report anything unhandled.
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("404 (deleted by another admin meanwhile) also reloads the stale list", async () => {
    api.post.mockRejectedValue({ response: { status: 404, data: { detail: "בית העסק לא נמצא" } } });
    setClipboard({ writeText: vi.fn() });
    globalThis.ClipboardItem = undefined;
    const onRetryLoad = vi.fn();

    renderTable([row("draft", false)], { onRetryLoad });
    fireEvent.click(copyButtons()[0]);

    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith("בית העסק לא נמצא"));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
  });

  it("a ClipboardItem constructor that throws synchronously cannot strand the lock", async () => {
    api.post.mockResolvedValue({ data: LINK });
    setClipboard({ write: vi.fn() });
    globalThis.ClipboardItem = class {
      constructor() {
        throw new TypeError("promise values not supported");
      }
    };

    renderTable([row("draft", false), row("draft", false)]);
    fireEvent.click(copyButtons()[0]);

    // Treated as a refused clipboard: the box opens once the mint answers…
    expect(await screen.findByTestId("draft-claim-message-manual")).toHaveValue(MESSAGE);
    // …and the lock is released, so the next row still works.
    const b = copyButtons()[1];
    expect(b).not.toBeDisabled();
    fireEvent.click(b);
    expect(api.post).toHaveBeenLastCalledWith("/admin/producers/p-2/claim-link", undefined, MINT_OPTS);
    await waitFor(() => expect(screen.getAllByTestId("draft-claim-message-manual")).toHaveLength(2));
  });

  it("does not steal focus from a text field the admin moved into while the mint ran", async () => {
    let resolvePost;
    api.post.mockReturnValue(new Promise((r) => (resolvePost = r)));
    setClipboard({ write: vi.fn().mockRejectedValue(new Error("NotAllowedError")) });
    globalThis.ClipboardItem = FakeClipboardItem;

    renderTable([row("draft", false)]);
    fireEvent.click(copyButtons()[0]);
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    try {
      resolvePost({ data: LINK });
      await screen.findByTestId("draft-claim-message-manual");
      expect(field).toHaveFocus();
    } finally {
      field.remove();
    }
  });

  it("a non-409 failure toasts but does not reload", async () => {
    api.post.mockRejectedValue({ response: { status: 500, data: {} } });
    setClipboard({ writeText: vi.fn() });
    globalThis.ClipboardItem = undefined;
    const onRetryLoad = vi.fn();

    renderTable([row("draft", false)], { onRetryLoad });
    fireEvent.click(copyButtons()[0]);

    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith(he.admin.producers.claim.error));
    expect(onRetryLoad).not.toHaveBeenCalled();
  });

  it("one mint at a time across rows: every other row's button is disabled while row A's is in flight", async () => {
    let resolveA;
    api.post.mockReturnValueOnce(new Promise((r) => (resolveA = r)));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    globalThis.ClipboardItem = undefined;

    renderTable([row("draft", false), row("draft", false)]);
    const [a, b] = copyButtons();
    fireEvent.click(a);
    // Visible, not silent: B is disabled for as long as A's mint runs.
    expect(b).toBeDisabled();
    fireEvent.click(b);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/admin/producers/p-1/claim-link", undefined, MINT_OPTS);

    resolveA({ data: LINK });
    await waitFor(() => expect(showToast.success).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(b).not.toBeDisabled();

    // Once A has settled, B works.
    api.post.mockResolvedValueOnce({ data: { ...LINK, url: `${URL_}-b` } });
    fireEvent.click(b);
    expect(api.post).toHaveBeenLastCalledWith("/admin/producers/p-2/claim-link", undefined, MINT_OPTS);
    await waitFor(() => expect(showToast.success).toHaveBeenCalledTimes(2));
  });
});

describe("manual-copy box — rows × open / closed", () => {
  beforeEach(() => {
    setClipboard({ write: vi.fn().mockRejectedValue(new Error("NotAllowedError")) });
    globalThis.ClipboardItem = FakeClipboardItem;
  });

  it("1 row, closed: no box before any click", () => {
    renderTable([row("draft", false)]);
    expect(screen.queryByTestId("draft-claim-message-manual")).not.toBeInTheDocument();
  });

  it("many rows, one open: only the clicked row shows a box, with its own link", async () => {
    api.post.mockResolvedValue({ data: LINK });
    renderTable([row("draft", false), row("draft", true), row("draft", false)]);
    const rows = screen.getAllByRole("row").slice(1);
    fireEvent.click(within(rows[2]).getByTestId("draft-copy-claim-message"));
    await within(rows[2]).findByTestId("draft-claim-message-manual");
    expect(screen.getAllByTestId("draft-claim-message-manual")).toHaveLength(1);
    expect(within(rows[0]).queryByTestId("draft-claim-message-manual")).not.toBeInTheDocument();
  });

  it("many rows, two open: each box holds its own row's link", async () => {
    api.post
      .mockResolvedValueOnce({ data: { ...LINK, url: `${URL_}-a` } })
      .mockResolvedValueOnce({ data: { ...LINK, url: `${URL_}-b` } });
    renderTable([row("draft", false), row("draft", false)]);
    const [a, b] = copyButtons();
    fireEvent.click(a);
    await waitFor(() => expect(screen.getAllByTestId("draft-claim-message-manual")).toHaveLength(1));
    fireEvent.click(b);
    await waitFor(() => expect(screen.getAllByTestId("draft-claim-message-manual")).toHaveLength(2));
    const values = screen.getAllByTestId("draft-claim-message-manual").map((x) => x.value);
    expect(values).toEqual([MESSAGE.replace(URL_, `${URL_}-a`), MESSAGE.replace(URL_, `${URL_}-b`)]);
  });

  it("open → clicked again and the copy now succeeds → the box closes", async () => {
    api.post.mockResolvedValue({ data: LINK });
    const write = vi.fn().mockRejectedValueOnce(new Error("NotAllowedError")).mockResolvedValue(undefined);
    setClipboard({ write });
    renderTable([row("draft", false)]);
    fireEvent.click(copyButtons()[0]);
    await screen.findByTestId("draft-claim-message-manual");
    fireEvent.click(copyButtons()[0]);
    await waitFor(() => expect(showToast.success).toHaveBeenCalledWith(D.copied));
    expect(screen.queryByTestId("draft-claim-message-manual")).not.toBeInTheDocument();
  });
});

describe("copy keys", () => {
  // onError is silenced in renderTable, so a dropped key would render its
  // path and the assertions would compare against `undefined`. Pin the keys.
  it.each(["owner_waiting", "owner_claimed", "copy_message", "message", "copied"])(
    "draft_claim.%s is a non-empty string in he and en",
    async (key) => {
      const en = (await import("../messages/en.json")).default;
      for (const m of [he, en]) {
        expect(typeof m.admin.producers.table.draft_claim[key]).toBe("string");
        expect(m.admin.producers.table.draft_claim[key].length).toBeGreaterThan(0);
      }
    },
  );
});
