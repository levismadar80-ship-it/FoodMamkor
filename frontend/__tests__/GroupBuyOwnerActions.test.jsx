import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";

// MEH-2435 (chunk 3) — the owner's action buttons on /producer/dashboard/group-buys.
//
// Each card shows only the moves its state allows (mirrors OWNER_TRANSITIONS
// in backend/app/routers/group_buys.py):
//   open, before deadline → cancel
//   open, past deadline   → close
//   funded                → deliver + cancel
//   cancelled / fulfilled → nothing
// Every move goes through a confirm dialog; only its confirm button sends the
// PATCH. Matrix covered: 0 / 1 / many cards × dialog closed / open.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key, vals) => (vals ? `${ns}.${key}:${JSON.stringify(vals)}` : `${ns}.${key}`);
    t.rich = (key) => `${ns}.${key}`;
    t.raw = (key) => `${ns}.${key}`;
    return t;
  },
  useLocale: () => "he",
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));

const stableUser = { id: "u1", role: "producer" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));

const toastSuccess = vi.fn();
vi.mock("@/lib/toast", () => ({
  showToast: { success: (...a) => toastSuccess(...a), error: vi.fn(), info: vi.fn() },
}));

const FUTURE = "2099-01-01T09:00:00Z";
const PAST = "2020-01-01T09:00:00Z";

const groupBuy = (over = {}) => ({
  id: "gb1",
  producer_id: "p1",
  title: "ארגז ירקות שבועי",
  product_name: "ארגז ירקות",
  status: "open",
  price_per_unit_group: "80.00",
  price_per_unit_regular: "100.00",
  commits_count: 2,
  min_participants: 5,
  deadline: FUTURE,
  created_at: "2026-07-01T09:00:00Z",
  ...over,
});

const fixture = { groupBuys: [] };
const patch = vi.fn();
const get = vi.fn((url) => {
  if (url === "/producers/me/dashboard") {
    return Promise.resolve({ data: { producer: { id: "p1", city: "חדרה", status: "approved" } } });
  }
  if (url === "/producers/me/group-buys") return Promise.resolve({ data: fixture.groupBuys });
  return Promise.resolve({ data: [] });
});

vi.mock("@/lib/api", () => ({
  default: {
    get: (...a) => get(...a),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: (...a) => patch(...a),
  },
}));

import ProducerGroupBuysPage from "@/app/[locale]/producer/dashboard/group-buys/page";

const A = "group_buys.dashboard.actions";

async function renderWith(items) {
  fixture.groupBuys = items;
  render(<ProducerGroupBuysPage />);
  if (items.length) await screen.findAllByTestId("manage-group-buy-card");
  else await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/me/group-buys"));
}

const actionIds = (card) =>
  within(card)
    .queryAllByRole("button")
    .map((b) => b.getAttribute("data-testid"))
    .filter(Boolean);

beforeEach(() => {
  get.mockClear();
  patch.mockReset();
  toastSuccess.mockReset();
});

describe("which buttons each card shows", () => {
  it("open before the deadline: cancel only", async () => {
    await renderWith([groupBuy()]);
    const [card] = screen.getAllByTestId("manage-group-buy-card");
    expect(actionIds(card)).toEqual(["group-buy-action-cancel"]);
  });

  it("open past the deadline: close only", async () => {
    await renderWith([groupBuy({ deadline: PAST })]);
    const [card] = screen.getAllByTestId("manage-group-buy-card");
    expect(actionIds(card)).toEqual(["group-buy-action-close"]);
  });

  it("funded: deliver and cancel", async () => {
    await renderWith([groupBuy({ status: "funded", commits_count: 6 })]);
    const [card] = screen.getAllByTestId("manage-group-buy-card");
    expect(actionIds(card)).toEqual(["group-buy-action-deliver", "group-buy-action-cancel"]);
  });

  it.each(["cancelled", "fulfilled"])("%s: no action row at all", async (status) => {
    await renderWith([groupBuy({ status })]);
    const [card] = screen.getAllByTestId("manage-group-buy-card");
    expect(within(card).queryByTestId("group-buy-actions")).toBeNull();
  });

  it("no group buys: no action row and no dialog", async () => {
    await renderWith([]);
    expect(screen.queryByTestId("group-buy-actions")).toBeNull();
    expect(screen.queryByTestId("group-buy-action-dialog")).toBeNull();
  });

  it("many cards: each gets the buttons of its own state", async () => {
    await renderWith([
      groupBuy({ id: "a" }),
      groupBuy({ id: "b", status: "funded", commits_count: 6 }),
      groupBuy({ id: "c", status: "fulfilled" }),
      groupBuy({ id: "d", deadline: PAST }),
    ]);
    const cards = screen.getAllByTestId("manage-group-buy-card");
    expect(cards.map(actionIds)).toEqual([
      ["group-buy-action-cancel"],
      ["group-buy-action-deliver", "group-buy-action-cancel"],
      [],
      ["group-buy-action-close"],
    ]);
  });
});

describe("the confirm dialog", () => {
  it("is closed until a button is pressed", async () => {
    await renderWith([groupBuy()]);
    expect(screen.queryByTestId("group-buy-action-dialog")).toBeNull();
  });

  it("cancel on an open group: title + body, no funded line", async () => {
    await renderWith([groupBuy()]);
    fireEvent.click(screen.getByTestId("group-buy-action-cancel"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(`${A}.cancel_title`);
    expect(dialog).toHaveTextContent(`${A}.cancel_body`);
    expect(within(dialog).getByTestId("group-buy-action-confirm")).toHaveTextContent(`${A}.cancel_confirm`);
    expect(screen.queryByTestId("group-buy-cancel-funded-note")).toBeNull();
  });

  it("cancel on a funded group adds how many joined", async () => {
    await renderWith([groupBuy({ status: "funded", commits_count: 6 })]);
    fireEvent.click(screen.getByTestId("group-buy-action-cancel"));
    expect(screen.getByTestId("group-buy-cancel-funded-note")).toHaveTextContent(
      `${A}.cancel_funded_note:{"count":6}`,
    );
  });

  it("close and deliver show their own wording", async () => {
    await renderWith([groupBuy({ id: "a", deadline: PAST }), groupBuy({ id: "b", status: "funded", commits_count: 6 })]);
    fireEvent.click(screen.getByTestId("group-buy-action-close"));
    expect(screen.getByRole("dialog")).toHaveTextContent(`${A}.close_body`);
    fireEvent.click(screen.getByText(`${A}.back`));
    fireEvent.click(screen.getByTestId("group-buy-action-deliver"));
    expect(screen.getByRole("dialog")).toHaveTextContent(`${A}.deliver_body`);
  });

  it("«חזרה» closes it and sends nothing", async () => {
    await renderWith([groupBuy()]);
    fireEvent.click(screen.getByTestId("group-buy-action-cancel"));
    fireEvent.click(screen.getByText(`${A}.back`));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(patch).not.toHaveBeenCalled();
  });

  it("focus starts on «חזרה», the safe choice", async () => {
    await renderWith([groupBuy()]);
    fireEvent.click(screen.getByTestId("group-buy-action-cancel"));
    expect(document.activeElement).toBe(screen.getByText(`${A}.back`));
  });

  it("reopening after a 409 starts unlocked", async () => {
    patch.mockRejectedValueOnce({ response: { status: 409, data: { detail: "x" } } });
    await renderWith([groupBuy()]);
    fireEvent.click(screen.getByTestId("group-buy-action-cancel"));
    fireEvent.click(screen.getByTestId("group-buy-action-confirm"));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText(`${A}.back`));
    fireEvent.click(await screen.findByTestId("group-buy-action-cancel"));
    expect(screen.getByTestId("group-buy-action-confirm")).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Escape closes it and sends nothing", async () => {
    await renderWith([groupBuy()]);
    fireEvent.click(screen.getByTestId("group-buy-action-cancel"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("confirming", () => {
  it.each([
    ["cancel", "cancelled", groupBuy(), "toast_cancelled"],
    ["close", "cancelled", groupBuy({ deadline: PAST }), "toast_cancelled"],
    ["deliver", "fulfilled", groupBuy({ status: "funded", commits_count: 6 }), "toast_fulfilled"],
  ])("%s sends PATCH status=%s and updates the card", async (action, target, gb, toast) => {
    patch.mockResolvedValue({ data: { detail: "סטטוס עודכן", status: target } });
    await renderWith([gb]);
    fireEvent.click(screen.getByTestId(`group-buy-action-${action}`));
    fireEvent.click(screen.getByTestId("group-buy-action-confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(patch).toHaveBeenCalledTimes(1);
    // MEH-2489: the status the card showed rides along as expected_status.
    expect(patch).toHaveBeenCalledWith(`/group-buys/${gb.id}/status`, {
      status: target,
      expected_status: gb.status,
    });
    expect(toastSuccess).toHaveBeenCalledWith(`${A}.${toast}`);
    const [card] = screen.getAllByTestId("manage-group-buy-card");
    expect(card).toHaveTextContent(`group_buys.dashboard.status.${target}`);
    // Both final states: the action row is gone.
    expect(within(card).queryByTestId("group-buy-actions")).toBeNull();
  });

  it("acts on the card it was opened from, not its neighbour", async () => {
    patch.mockResolvedValue({ data: { detail: "ok", status: "cancelled" } });
    await renderWith([groupBuy({ id: "a" }), groupBuy({ id: "b" })]);
    const second = screen.getAllByTestId("manage-group-buy-card")[1];
    fireEvent.click(within(second).getByTestId("group-buy-action-cancel"));
    fireEvent.click(screen.getByTestId("group-buy-action-confirm"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/group-buys/b/status", {
        status: "cancelled",
        expected_status: "open",
      }),
    );
    const [first] = screen.getAllByTestId("manage-group-buy-card");
    expect(actionIds(first)).toEqual(["group-buy-action-cancel"]);
  });

  it("locks both buttons and ignores Escape while the request is in flight", async () => {
    let resolve;
    patch.mockReturnValue(new Promise((r) => { resolve = r; }));
    await renderWith([groupBuy()]);
    fireEvent.click(screen.getByTestId("group-buy-action-cancel"));
    fireEvent.click(screen.getByTestId("group-buy-action-confirm"));
    const dialog = screen.getByRole("dialog");
    within(dialog).getAllByRole("button").forEach((b) => expect(b).toBeDisabled());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => resolve({ data: { detail: "ok", status: "cancelled" } }));
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("a 409 keeps the dialog open with the server's message, locks confirm and reloads the list", async () => {
    patch.mockRejectedValue({ response: { status: 409, data: { detail: "אי אפשר לשנות את קבוצת הרכש למצב הזה" } } });
    await renderWith([groupBuy()]);
    const before = get.mock.calls.filter(([u]) => u === "/producers/me/group-buys").length;
    fireEvent.click(screen.getByTestId("group-buy-action-cancel"));
    fireEvent.click(screen.getByTestId("group-buy-action-confirm"));
    expect(await screen.findByRole("alert")).toHaveTextContent("אי אפשר לשנות את קבוצת הרכש למצב הזה");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Confirming again would only repeat the 409; «חזרה» stays usable.
    expect(screen.getByTestId("group-buy-action-confirm")).toBeDisabled();
    expect(screen.getByText(`${A}.back`)).toBeEnabled();
    await waitFor(() =>
      expect(get.mock.calls.filter(([u]) => u === "/producers/me/group-buys").length).toBe(before + 1),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("Rule 19: the list is validated per row", () => {
  it("drops a row with an unknown status and keeps the rest", async () => {
    await renderWith([groupBuy({ id: "ok" }), groupBuy({ id: "bad", status: "deleted", title: "שבורה" })]);
    const cards = screen.getAllByTestId("manage-group-buy-card");
    expect(cards).toHaveLength(1);
    expect(screen.queryByText("שבורה")).toBeNull();
  });
});
