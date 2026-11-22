// MEH-3609: «הקבוצות שלי». A member could get back to a group buy only
// through the link in an email.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import he from "../messages/he.json";
import api from "@/lib/api";
import MyGroupBuysClient from "@/app/[locale]/my-group-buys/MyGroupBuysClient";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
const push = vi.fn();
const router = { push };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/my-group-buys" }));
const authRef = { current: { user: { id: "u1" }, loading: false } };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authRef.current }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const row = (id, over = {}) => ({
  id, title: "קמח כוסמין", producer_name: "טחנת הגליל", status: "open", quantity: 2, unit: "שק",
  deadline: "2026-12-01T10:00:00", pickup_starts_at: null, pickup_ends_at: null,
  joined_at: "2026-11-20T10:00:00", ...over,
});
const copy = he.my_group_buys;
const mount = () => render(
  // A fresh SWR cache per test: the read goes through lib/use-api.js.
  <SWRConfig value={{ provider: () => new Map() }}>
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <MyGroupBuysClient />
    </NextIntlClientProvider>
  </SWRConfig>,
);

describe("MyGroupBuysClient", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    // Only Date is frozen (the fixtures' deadline is 01.12.2026), so findBy's
    // timers still run.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
    api.get.mockReset();
    push.mockReset();
    authRef.current = { user: { id: "u1" }, loading: false };
  });

  it("0 group buys: the empty state with a way to the group buys", async () => {
    api.get.mockResolvedValueOnce({ data: { group_buys: [] } });
    mount();
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
    expect(screen.getByText(copy.empty_cta).closest("a")).toHaveAttribute("href", expect.stringContaining("/group-buys"));
    expect(api.get.mock.calls[0][0]).toBe("/users/me/group-buys");
  });

  it("1 open group buy without a pickup time: title, business · quantity, status · deadline, opens its page", async () => {
    api.get.mockResolvedValueOnce({ data: { group_buys: [row(A)] } });
    mount();
    const r = await screen.findByTestId("my-group-buys-row");
    expect(r).toHaveAttribute("href", `/group-buys/${A}`);
    expect(r).toHaveTextContent("קמח כוסמין");
    expect(r).toHaveTextContent("טחנת הגליל · 2 שק");
    expect(screen.getByTestId("my-group-buys-row-state")).toHaveTextContent(`${copy.status.open} · ההצטרפות נסגרת ב-01.12.2026`);
  });

  it("many: one row each, in the server's order; a pickup time replaces the deadline", async () => {
    api.get.mockResolvedValueOnce({ data: { group_buys: [
      row(A, { status: "funded", pickup_starts_at: "2026-12-04T07:00:00", pickup_ends_at: "2026-12-04T11:00:00" }),
      row(B, { status: "fulfilled", title: "שמן זית", unit: null, quantity: 1 }),
    ] } });
    mount();
    const rows = await screen.findAllByTestId("my-group-buys-row");
    expect(rows.map((el) => el.getAttribute("href"))).toEqual([`/group-buys/${A}`, `/group-buys/${B}`]);
    const states = screen.getAllByTestId("my-group-buys-row-state");
    expect(states[0]).toHaveTextContent(copy.status.funded);
    expect(states[0]).toHaveTextContent("איסוף:");
    expect(states[0]).toHaveTextContent("09:00");
    expect(states[0]).not.toHaveTextContent("ההצטרפות נסגרת");
    expect(states[1]).toHaveTextContent(copy.status.fulfilled);
    expect(rows[1]).toHaveTextContent("כמות: 1");
  });

  it("a cancelled group shows no pickup time, even with one saved", async () => {
    api.get.mockResolvedValueOnce({ data: { group_buys: [
      row(A, { status: "cancelled", pickup_starts_at: "2026-12-04T07:00:00", pickup_ends_at: "2026-12-04T11:00:00" }),
    ] } });
    mount();
    expect(await screen.findByTestId("my-group-buys-row-state")).toHaveTextContent(new RegExp(`^${copy.status.cancelled}$`));
  });

  it("an open group past its deadline shows no join date", async () => {
    api.get.mockResolvedValueOnce({ data: { group_buys: [row(A, { deadline: "2026-11-20T10:00:00" })] } });
    mount();
    expect(await screen.findByTestId("my-group-buys-row-state")).toHaveTextContent(new RegExp(`^${copy.status.open}$`));
  });

  it("a status the page has no word for shows no status", async () => {
    api.get.mockResolvedValueOnce({ data: { group_buys: [row(A, { status: "archived" })] } });
    mount();
    expect(await screen.findByTestId("my-group-buys-row-state")).toHaveTextContent(/^$/);
  });

  it("a load error offers a retry that asks again", async () => {
    api.get.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ data: { group_buys: [] } });
    mount();
    expect(await screen.findByText(copy.load_error)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("my-group-buys-error-retry"));
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("a bad body is an error, not a list", async () => {
    api.get.mockResolvedValueOnce({ data: { group_buys: [{ id: "x" }] } });
    mount();
    expect(await screen.findByTestId("my-group-buys-error")).toBeInTheDocument();
  });

  it("signed out: sent to log in", async () => {
    authRef.current = { user: null, loading: false };
    window.history.pushState({}, "", "/my-group-buys");
    mount();
    // To the login page, with a way back here — not just "somewhere".
    expect(push).toHaveBeenCalledWith(`/login?redirect=${encodeURIComponent("/my-group-buys")}`);
    expect(api.get).not.toHaveBeenCalled();
  });
});
