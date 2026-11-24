import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { uuidFor } from "./helpers/contract-row";
import GroupBuyPickupList from "@/components/group-buy/GroupBuyPickupList";

// MEH-3735 — the owner's pickup-code list on /producer/dashboard/group-buys.
// Codes and quantities only, never a name (MEH-1651). Cells: closed (nothing
// fetched) · open × 0 / 1 / many rows · before the pickup ends (hint, no
// buttons) · a «לא הגיע» press posts to the no-show route and reloads.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vals) => (vals ? `${ns}.${key}:${JSON.stringify(vals)}` : `${ns}.${key}`),
}));

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(() => Promise.resolve({})) }));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const GB = { id: uuidFor("gb") };
const ENDED = "2026-11-20T10:00:00"; // the server sends naive UTC
const row = (n, over = {}) => ({
  id: uuidFor(`c${n}`),
  pickup_code: `000${n}`,
  quantity: n,
  handed_at: null,
  no_show_at: null,
  ...over,
});
const payload = (pickups, canMark = true, state = canMark ? "open" : "wait") => ({
  data: { can_mark: canMark, mark_state: state, pickup_ended_at: ENDED, pickups },
});

const openList = () => fireEvent.click(screen.getByRole("button", { name: "group_buys.dashboard.pickups.title" }));

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockClear();
});

describe("GroupBuyPickupList", () => {
  it("closed: fetches nothing and shows no rows", () => {
    render(<GroupBuyPickupList gb={GB} />);
    expect(apiMock.get).not.toHaveBeenCalled();
    expect(screen.queryByText("0001")).toBeNull();
  });

  it("open with no participants: no row, no button", async () => {
    apiMock.get.mockResolvedValue(payload([]));
    render(<GroupBuyPickupList gb={GB} />);
    openList();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(`/producers/me/group-buys/${GB.id}/pickups`));
    expect(screen.queryByTestId("group-buy-pickup-no-show")).toBeNull();
  });

  it("open with many: one row per code with its quantity, and a pair of buttons on each", async () => {
    apiMock.get.mockResolvedValue(payload([row(1), row(2), row(3)]));
    render(<GroupBuyPickupList gb={GB} />);
    openList();
    expect(await screen.findByText("0001")).toBeTruthy();
    expect(screen.getByText("0003")).toBeTruthy();
    expect(screen.getAllByTestId("group-buy-pickup-handed")).toHaveLength(3);
    expect(screen.getAllByTestId("group-buy-pickup-no-show")).toHaveLength(3);
  });

  it("before the pickup ends: shows the hint and no buttons", async () => {
    apiMock.get.mockResolvedValue(payload([row(1)], false));
    render(<GroupBuyPickupList gb={GB} />);
    openList();
    expect(await screen.findByTestId("group-buy-pickups-wait")).toBeTruthy();
    expect(screen.queryByTestId("group-buy-pickup-handed")).toBeNull();
  });

  it.each([
    ["no_window", "group_buys.dashboard.pickups.no_window"],
    ["closed", "group_buys.dashboard.pickups.closed"],
  ])("state %s: shows its own line and no buttons", async (state, line) => {
    apiMock.get.mockResolvedValue(payload([row(1)], false, state));
    render(<GroupBuyPickupList gb={GB} />);
    openList();
    expect(await screen.findByText(line)).toBeTruthy();
    expect(screen.queryByTestId("group-buy-pickup-no-show")).toBeNull();
  });

  it("a refused mark shows the server's reason and reloads the list", async () => {
    apiMock.get.mockResolvedValue(payload([row(1)]));
    apiMock.post.mockRejectedValueOnce({ response: { data: { detail: "ההזמנה הזאת כבר סומנה" } } });
    render(<GroupBuyPickupList gb={GB} />);
    openList();
    fireEvent.click(await screen.findByTestId("group-buy-pickup-handed"));
    expect(await screen.findByText("ההזמנה הזאת כבר סומנה")).toBeTruthy();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
  });

  it("a marked row shows its outcome instead of the buttons", async () => {
    apiMock.get.mockResolvedValue(payload([row(1, { no_show_at: ENDED })]));
    render(<GroupBuyPickupList gb={GB} />);
    openList();
    expect(await screen.findByText("rescue.dashboard.status.no_show")).toBeTruthy();
    expect(screen.queryByTestId("group-buy-pickup-no-show")).toBeNull();
  });

  it("«לא הגיע» posts to the no-show route of that commit and reloads", async () => {
    const one = row(1);
    apiMock.get.mockResolvedValueOnce(payload([one])).mockResolvedValueOnce(payload([{ ...one, no_show_at: ENDED }]));
    render(<GroupBuyPickupList gb={GB} />);
    openList();
    fireEvent.click(await screen.findByTestId("group-buy-pickup-no-show"));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(`/group-buys/${GB.id}/commits/${one.id}/no-show`));
    expect(await screen.findByText("rescue.dashboard.status.no_show")).toBeTruthy();
    expect(apiMock.get).toHaveBeenCalledTimes(2);
  });
});
