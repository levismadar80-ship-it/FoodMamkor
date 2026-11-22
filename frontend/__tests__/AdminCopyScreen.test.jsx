/**
 * MEH-3672 — /admin/copy («טקסטים באתר»).
 *
 * Cells (5-state rule, count × open/closed):
 *   0 matches               → the empty state, no group
 *   1 group                 → that group, open
 *   many groups, no search  → every group, closed
 *   many groups, a search   → only the matching groups, open, matching rows only
 * Plus the screen filter, «בכל המסכים» for a group every screen reads, and
 * «לא נמצא מסך» for a group no screen reads. Real he.json for the labels, so a
 * missing key shows.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CopyScreenClient from "@/app/[locale]/admin/copy/CopyScreenClient";
import { filterCopy } from "@/app/[locale]/admin/copy/copy-filter";

const messages = {
  map: { title: "מפת בתי העסק", cta: "לכל העסקים" },
  nav: { home: "דף הבית" },
  orphan: { x: "טקסט בלי מסך" },
};
const index = {
  screens: ["/", "/map"],
  groups: { map: ["/map"], nav: ["/", "/map"], orphan: [] },
};

const renderScreen = (msgs = messages) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <CopyScreenClient messages={msgs} index={index} />
    </NextIntlClientProvider>,
  );

const groups = () => screen.queryAllByTestId("copy-group");

describe("AdminCopyScreen", () => {
  it("many groups, no search: every group, closed, with where it is shown", () => {
    renderScreen();
    expect(groups()).toHaveLength(3);
    expect(groups().every((g) => !g.open)).toBe(true);
    // closed: no row is drawn until the block is opened
    expect(screen.queryByText("מפת בתי העסק")).toBeNull();
    groups()[0].open = true;
    fireEvent(groups()[0], new Event("toggle"));
    expect(screen.getByText("מפת בתי העסק")).toBeTruthy();
    expect(within(groups()[1]).getByText(/בכל המסכים/)).toBeTruthy();
    expect(
      within(groups()[2]).getByText("לא נמצא מסך שמשתמש בקבוצה הזו"),
    ).toBeTruthy();
  });

  it("a search keeps only matching rows, and opens their groups", () => {
    renderScreen();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "לכל" },
    });
    expect(groups()).toHaveLength(1);
    expect(groups()[0].open).toBe(true);
    expect(screen.getByText("לכל העסקים")).toBeTruthy();
    expect(screen.queryByText("מפת בתי העסק")).toBeNull();
  });

  it("a search by key matches too", () => {
    renderScreen();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "nav.home" },
    });
    expect(groups()).toHaveLength(1);
    expect(screen.getByText("דף הבית")).toBeTruthy();
  });

  it("0 matches: the empty state and no group", () => {
    renderScreen();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzz-אין" },
    });
    expect(groups()).toHaveLength(0);
    expect(screen.getByText("לא נמצא טקסט שמתאים לחיפוש")).toBeTruthy();
  });

  it("1 group: shown open", () => {
    renderScreen({ map: messages.map });
    expect(groups()).toHaveLength(1);
    expect(groups()[0].open).toBe(true);
  });

  it("many groups, a filter: every matching group open, and a block closes again", () => {
    renderScreen();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "/map" },
    });
    expect(groups()).toHaveLength(2);
    expect(groups().every((g) => g.open)).toBe(true);
    expect(screen.getByText("מפת בתי העסק")).toBeTruthy();
    expect(screen.getByText("דף הבית")).toBeTruthy();
    expect(screen.getByText("3 טקסטים")).toBeTruthy();
    groups()[0].open = false;
    fireEvent(groups()[0], new Event("toggle"));
    expect(screen.queryByText("מפת בתי העסק")).toBeNull();
    expect(screen.getByText("דף הבית")).toBeTruthy();
  });

  it("a capped search says how many rows are hidden, on the page and in the group", () => {
    const big = {
      a: Object.fromEntries(
        Array.from({ length: 290 }, (_, i) => [`k${i}`, `ערך ${i}`]),
      ),
      b: Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [`k${i}`, `ערך ${i}`]),
      ),
    };
    render(
      <NextIntlClientProvider
        locale="he"
        messages={he}
        timeZone="Asia/Jerusalem"
      >
        <CopyScreenClient
          messages={big}
          index={{ screens: ["/"], groups: { a: [], b: [] } }}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "ערך" },
    });
    expect(screen.getByText("מוצגים 300 מתוך 310")).toBeTruthy();
    expect(
      within(groups()[1]).getByText(
        "ועוד 10 טקסטים בקבוצה. כדאי לצמצם את החיפוש.",
      ),
    ).toBeTruthy();
    expect(within(groups()[0]).queryByText(/כדאי לצמצם/)).toBeNull();
  });

  it("the screen filter keeps the groups that screen reads", () => {
    renderScreen();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "/" } });
    expect(groups()).toHaveLength(1);
    expect(screen.getByText("דף הבית")).toBeTruthy();
  });
});

describe("filterCopy", () => {
  it("draws at most 300 rows and counts the rest", () => {
    const big = {
      g: Object.fromEntries(
        Array.from({ length: 305 }, (_, i) => [`k${i}`, `ערך ${i}`]),
      ),
    };
    const r = filterCopy(big, { groups: { g: [] } }, { cap: true });
    expect(r.total).toBe(305);
    expect(r.drawn).toBe(300);
    expect(r.groups[0].rows).toHaveLength(300);
  });
  it("without a filter nothing is capped (groups are closed, rows drawn on open)", () => {
    const big = {
      g: Object.fromEntries(
        Array.from({ length: 305 }, (_, i) => [`k${i}`, `ערך ${i}`]),
      ),
    };
    expect(filterCopy(big, { groups: { g: [] } }, {}).drawn).toBe(305);
  });
});
