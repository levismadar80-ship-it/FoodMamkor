/**
 * MEH-2868 — /admin/group-buys shows only the moves the server accepts
 * (MEH-2866: ADMIN_TRANSITIONS = OWNER_TRANSITIONS), sends expected_status,
 * and reloads on a 409.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import { ADMIN_NEXT_STATUSES } from "@/lib/group-buy-transitions";
import Page from "@/app/[locale]/admin/group-buys/page";

const apiMock = vi.hoisted(() => ({ rows: [], get: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({
  default: {
    get: (...a) => {
      apiMock.get(...a);
      return Promise.resolve({ data: apiMock.rows });
    },
    patch: (...a) => apiMock.patch(...a),
  },
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }) => <a href={String(href)} {...p}>{children}</a> }));

const gb = (id, status) => ({
  id, status, title: `קבוצה ${id}`, producer_name: "חוות", city: "חיפה",
  price_per_unit_group: 30, price_per_unit_regular: 40, commits_count: 1,
  min_participants: 5, deadline: "2026-12-01",
});
const G = he.admin.group_buys;

async function renderWith(rows) {
  apiMock.rows = rows;
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <Page />
    </NextIntlClientProvider>,
  );
  await screen.findByText(rows[0].title);
}
const card = (title) => within(screen.getByText(title).closest("div.bg-surface"));

beforeEach(() => {
  apiMock.get.mockClear();
  apiMock.patch.mockReset();
});

describe("the frontend map mirrors the server's table", () => {
  it("equals OWNER_TRANSITIONS in backend/app/routers/group_buys.py", () => {
    const src = readFileSync(path.resolve(__dirname, "../../backend/app/routers/group_buys.py"), "utf8");
    const block = src.match(/OWNER_TRANSITIONS = frozenset\(\s*\{([\s\S]*?)\}\s*\)/);
    expect(block, "OWNER_TRANSITIONS not found — did it move?").not.toBeNull();
    const pairs = [...block[1].matchAll(/\("(\w+)",\s*"(\w+)"\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    expect(pairs.length).toBeGreaterThan(0);
    const mine = Object.entries(ADMIN_NEXT_STATUSES).flatMap(([a, bs]) => bs.map((b) => `${a}>${b}`)).sort();
    expect(mine).toEqual(pairs);
  });

  it("the admin route enforces that same table (ADMIN_TRANSITIONS = OWNER_TRANSITIONS)", () => {
    // Review of #4258: the comparison above is only right while the admin
    // route checks OWNER_TRANSITIONS. If ADMIN_TRANSITIONS ever becomes its
    // own table, this goes red and the map above must follow it instead.
    const src = readFileSync(path.resolve(__dirname, "../../backend/app/routers/group_buys.py"), "utf8");
    expect(src).toMatch(/^ADMIN_TRANSITIONS = OWNER_TRANSITIONS$/m);
    expect(src).toMatch(/_refuse_unless_allowed\(gb, status, expected_status, ADMIN_TRANSITIONS\)/);
  });
});

describe("buttons per status (0 / 1 / many)", () => {
  it("open → «בוטלה» only · funded → «הושלמה» + «בוטלה» · cancelled and fulfilled → none, no label", async () => {
    await renderWith([gb(1, "open"), gb(2, "funded"), gb(3, "cancelled"), gb(4, "fulfilled")]);
    expect(card("קבוצה 1").queryAllByRole("button").map((b) => b.dataset.testid)).toEqual(["gb-move-cancelled"]);
    expect(card("קבוצה 2").queryAllByRole("button").map((b) => b.dataset.testid)).toEqual(["gb-move-fulfilled", "gb-move-cancelled"]);
    for (const t of ["קבוצה 3", "קבוצה 4"]) {
      expect(card(t).queryAllByRole("button")).toHaveLength(0);
      expect(card(t).queryByText(G.change_status)).not.toBeInTheDocument();
    }
    expect(card("קבוצה 1").getByText(G.change_status)).toBeInTheDocument();
  });
});

describe("the request and a 409", () => {
  it("sends expected_status = the status on screen", async () => {
    apiMock.patch.mockResolvedValue({ data: {} });
    await renderWith([gb(5, "funded")]);
    fireEvent.click(screen.getByTestId("gb-move-fulfilled"));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalled());
    expect(apiMock.patch.mock.calls[0][2]).toEqual({ params: { status: "fulfilled", expected_status: "funded" } });
  });

  it("a 409 shows the server's message and reloads the list", async () => {
    apiMock.patch.mockRejectedValue({ response: { status: 409, data: { detail: "קבוצת הרכישה השתנתה" } } });
    await renderWith([gb(6, "open")]);
    const before = apiMock.get.mock.calls.length;
    fireEvent.click(screen.getByTestId("gb-move-cancelled"));
    expect(await screen.findByText("קבוצת הרכישה השתנתה")).toBeInTheDocument();
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(before));
  });

  it("the error is cleared by the next action that succeeds", async () => {
    apiMock.patch.mockRejectedValueOnce({ response: { status: 409, data: { detail: "קבוצת הרכישה השתנתה" } } });
    apiMock.patch.mockResolvedValueOnce({ data: {} });
    await renderWith([gb(7, "funded")]);
    fireEvent.click(screen.getByTestId("gb-move-fulfilled"));
    expect(await screen.findByText("קבוצת הרכישה השתנתה")).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("gb-move-cancelled"));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("קבוצת הרכישה השתנתה")).not.toBeInTheDocument());
  });
});
