/**
 * MEH-2620 — the public /group-buys list says, under the status chips, what
 * the selected tab holds. «הגיעו ליעד» alone did not tell a first-time visitor
 * that those groups can no longer be joined (the commit endpoint refuses any
 * status but "open", group_buys.py:247).
 *
 * Cells: each of the three tabs selected → its own line, and only its own.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import GroupBuysClient from "@/app/[locale]/group-buys/GroupBuysClient";

const NS = "group_buys.list";
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/image", () => ({ default: (props) => <img alt="" {...props} /> }));
vi.mock("@/components/CitySearch", () => ({ default: () => <div /> }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

const hint = () => screen.getByTestId("group-buys-status-hint").textContent;

describe("the status hint under the filter chips", () => {
  it("explains the open tab by default", () => {
    render(<GroupBuysClient />);
    expect(hint()).toBe(`${NS}.status_hint_open`);
  });

  it.each([
    ["status_funded", "status_hint_funded"],
    ["status_fulfilled", "status_hint_fulfilled"],
    ["status_open", "status_hint_open"],
  ])("switches with the %s chip", (chip, line) => {
    render(<GroupBuysClient />);
    // Start from another tab so switching back to «open» is a real change.
    fireEvent.click(screen.getByText(`${NS}.${chip === "status_open" ? "status_funded" : "status_open"}`));
    fireEvent.click(screen.getByText(`${NS}.${chip}`));
    expect(hint()).toBe(`${NS}.${line}`);
  });
});
