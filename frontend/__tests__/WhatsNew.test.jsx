/**
 * MEH-3200: «מה חדש» for business owners + the one-time welcome card.
 *
 * Cells covered (CLAUDE.md 5-state rule, state × count):
 *   releases 0 / 1 / many  ×  seen / unseen   (pure helpers, synthetic lists)
 *   card: unseen → open; × → closed and remembered; seen → absent
 *   row: dot while unseen, no dot once seen, gone with 0 releases
 *   card: «לכל העדכונים» also marks seen; storage that throws never breaks it
 *   archive page: many (newest flagged «חדש») / 0 (empty line)
 *   welcome: new business → shown; dismissed / old / no date → not shown
 * Plus the data contract: every release line exists in he AND en, nothing extra.
 * Rendered with the real message files so copy is read, not keys.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));

// `list` overrides what visibleReleases() returns: [] = zero, two entries = many.
const releasesMock = vi.hoisted(() => ({ list: null }));
vi.mock("@/lib/whats-new", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    visibleReleases: (...a) => releasesMock.list ?? real.visibleReleases(...a),
  };
});

import {
  WHATS_NEW_RELEASES,
  WHATS_NEW_SEEN_KEY,
  compareVersions,
  latestRelease,
  unseenRelease,
  visibleReleases,
} from "@/lib/whats-new";
import { WELCOME_DISMISSED_KEY, isNewBusiness, useOwnerWelcome } from "@/hooks/useWhatsNew";
import WhatsNewCard from "@/components/producer/WhatsNewCard";
import WhatsNewRow from "@/components/producer/WhatsNewRow";
import OwnerWelcomeCard from "@/components/producer/OwnerWelcomeCard";
import WhatsNewPage from "@/app/[locale]/producer/dashboard/whats-new/page";

const wrap = (ui) => render(<NextIntlClientProvider locale="he" messages={he}>{ui}</NextIntlClientProvider>);
// The newest release WITH lines: a patch with items: 0 (1.5.2) is never shown.
const newest = visibleReleases()[0];
const lines = (key) => Object.values(he.dashboard.producer.whats_new.releases[key]);

const R = (version, items) => ({ version, key: `v${version.replaceAll(".", "_")}`, date: "2026-11-15", items });

beforeEach(() => {
  window.localStorage.clear();
  releasesMock.list = null;
  vi.restoreAllMocks();
});

describe("lib/whats-new — pure helpers", () => {
  it("compareVersions orders numerically, not as text", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.5.1", "1.5.1")).toBe(0);
    expect(compareVersions("1.5.0", "1.5.1")).toBeLessThan(0);
  });

  it("0 releases: nothing latest, nothing unseen", () => {
    expect(latestRelease([])).toBeNull();
    expect(unseenRelease(null, [])).toBeNull();
  });

  it("a release with items: 0 is never shown", () => {
    expect(visibleReleases([R("1.6.0", 0)])).toEqual([]);
    expect(unseenRelease(null, [R("1.6.0", 0), R("1.5.1", 2)])?.version).toBe("1.5.1");
  });

  it("1 release: unseen until that version is marked, then seen", () => {
    const list = [R("1.5.1", 3)];
    expect(unseenRelease(null, list)?.version).toBe("1.5.1");
    expect(unseenRelease("1.5.1", list)).toBeNull();
  });

  it("many releases: an older seen version still shows the newest", () => {
    const list = [R("1.7.0", 2), R("1.6.0", 1), R("1.5.1", 3)];
    expect(unseenRelease("1.5.1", list)?.version).toBe("1.7.0");
    expect(unseenRelease("1.7.0", list)).toBeNull();
  });
});

describe("release data contract", () => {
  it("versions are unique and newest first", () => {
    const v = WHATS_NEW_RELEASES.map((r) => r.version);
    expect(new Set(v).size).toBe(v.length);
    for (let i = 1; i < v.length; i += 1) expect(compareVersions(v[i - 1], v[i])).toBeGreaterThan(0);
  });

  it("every line exists, non-empty, in he and en — and no line is left over", () => {
    for (const msgs of [he, en]) {
      const bag = msgs.dashboard.producer.whats_new.releases;
      expect(Object.keys(bag).sort()).toEqual(WHATS_NEW_RELEASES.filter((r) => r.items > 0).map((r) => r.key).sort());
      for (const r of WHATS_NEW_RELEASES.filter((x) => x.items > 0)) {
        const want = Array.from({ length: r.items }, (_, i) => `i${i}`);
        expect(Object.keys(bag[r.key])).toEqual(want);
        for (const k of want) expect(bag[r.key][k].trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("WhatsNewCard (placement א׳)", () => {
  it("unseen: shows the approved title and every line of the newest release", () => {
    wrap(<WhatsNewCard />);
    const card = screen.getByTestId("whats-new-card");
    expect(within(card).getByRole("heading")).toHaveTextContent("חדש במהמקור");
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(lines(newest.key));
    expect(within(card).getByRole("link", { name: "לכל העדכונים" })).toHaveAttribute(
      "href",
      "/producer/dashboard/whats-new",
    );
  });

  it("× closes it and remembers the version", () => {
    wrap(<WhatsNewCard />);
    fireEvent.click(screen.getByRole("button", { name: "סגירה" }));
    expect(screen.queryByTestId("whats-new-card")).toBeNull();
    expect(window.localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe(newest.version);
  });

  it("«לכל העדכונים» marks the release seen too", () => {
    wrap(<WhatsNewCard />);
    fireEvent.click(screen.getByRole("link", { name: "לכל העדכונים" }));
    expect(window.localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe(newest.version);
  });

  it("storage that throws: the card still renders and closes without an error", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    wrap(<WhatsNewCard />);
    expect(screen.getByTestId("whats-new-card")).toBeInTheDocument();
    expect(() => fireEvent.click(screen.getByRole("button", { name: "סגירה" }))).not.toThrow();
  });

  it("seen: renders nothing", () => {
    window.localStorage.setItem(WHATS_NEW_SEEN_KEY, newest.version);
    const { container } = wrap(<WhatsNewCard />);
    expect(container.innerHTML).toBe("");
  });
});

describe("WhatsNewRow (placement ג׳)", () => {
  it("unseen: dot with its screen-reader text; the link goes to the archive", () => {
    wrap(<WhatsNewRow />);
    const row = screen.getByTestId("whats-new-row");
    expect(row).toHaveTextContent("מה חדש במהמקור");
    expect(within(row).getByTestId("whats-new-dot")).toHaveTextContent("יש עדכון חדש");
    expect(within(row).getByRole("link", { name: "לקריאה" })).toHaveAttribute("href", "/producer/dashboard/whats-new");
  });

  it("0 releases: no row at all", () => {
    releasesMock.list = [];
    const { container } = wrap(<WhatsNewRow />);
    expect(container.innerHTML).toBe("");
  });

  it("closing the card clears the row's dot on the same page", () => {
    wrap(
      <>
        <WhatsNewCard />
        <WhatsNewRow />
      </>,
    );
    expect(screen.getByTestId("whats-new-dot")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "סגירה" }));
    expect(screen.queryByTestId("whats-new-dot")).toBeNull();
    expect(screen.getByTestId("whats-new-row")).toBeInTheDocument();
  });
});

describe("archive page", () => {
  it("1: lists the release with month + year, labelled «חדש», and marks it seen", () => {
    wrap(<WhatsNewPage />);
    const items = screen.getAllByTestId("whats-new-release");
    expect(items).toHaveLength(visibleReleases().length);
    expect(within(items[0]).getByTestId("whats-new-latest")).toHaveTextContent("חדש");
    expect(items[0]).toHaveTextContent("נובמבר 2026");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("מה חדש במהמקור");
    expect(window.localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe(newest.version);
  });

  it("many: only the newest carries the «חדש» label, each with its own month", () => {
    releasesMock.list = [newest, { ...newest, version: "1.5.0", date: "2026-10-01" }];
    wrap(<WhatsNewPage />);
    const items = screen.getAllByTestId("whats-new-release");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByTestId("whats-new-latest")).toBeInTheDocument();
    expect(within(items[1]).queryByTestId("whats-new-latest")).toBeNull();
    expect(items[1]).toHaveTextContent("אוקטובר 2026");
  });

  it("0: shows the empty line instead of a list", () => {
    releasesMock.list = [];
    wrap(<WhatsNewPage />);
    expect(screen.getByTestId("whats-new-empty")).toHaveTextContent("עוד אין עדכונים. כשמשהו ישתנה, הוא יופיע כאן.");
    expect(screen.queryByTestId("whats-new-release")).toBeNull();
  });
});

describe("welcome card", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 15, 12);

  it("isNewBusiness: day 0, 29 and 30 yes; day 31, missing or bad date no", () => {
    expect(isNewBusiness(new Date(now).toISOString(), now)).toBe(true);
    expect(isNewBusiness(new Date(now - 29 * DAY).toISOString(), now)).toBe(true);
    expect(isNewBusiness(new Date(now - 30 * DAY).toISOString(), now)).toBe(true);
    expect(isNewBusiness(new Date(now - 31 * DAY).toISOString(), now)).toBe(false);
    expect(isNewBusiness(null, now)).toBe(false);
    expect(isNewBusiness("not a date", now)).toBe(false);
  });

  it("useOwnerWelcome with storage that throws: shown, and dismiss hides it without an error", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const created = new Date().toISOString();
    const h = renderHook(({ c }) => useOwnerWelcome(c), { initialProps: { c: created } });
    expect(h.result.current.show).toBe(true);
    act(() => h.result.current.dismiss());
    expect(h.result.current.show).toBe(false);
    // A later re-read (new created_at value) must not bring it back this visit.
    h.rerender({ c: new Date(Date.parse(created) - 1000).toISOString() });
    expect(h.result.current.show).toBe(false);
  });

  it("useOwnerWelcome.ready: false until worked out for the current created_at", () => {
    const h = renderHook(({ c }) => useOwnerWelcome(c), { initialProps: { c: undefined } });
    expect(h.result.current.ready).toBe(true);
    // The profile lands: the very render that carries the new date is not ready.
    const seen = [];
    const probe = renderHook(({ c }) => { const r = useOwnerWelcome(c); seen.push([c, r.ready]); return r; }, { initialProps: { c: undefined } });
    const created = new Date().toISOString();
    probe.rerender({ c: created });
    expect(seen).toContainEqual([created, false]);
    expect(probe.result.current.ready).toBe(true);
    expect(probe.result.current.show).toBe(true);
  });

  it("useOwnerWelcome: shown for a new business until dismissed, then never again", () => {
    const created = new Date().toISOString();
    const first = renderHook(() => useOwnerWelcome(created));
    expect(first.result.current.show).toBe(true);
    act(() => first.result.current.dismiss());
    expect(first.result.current.show).toBe(false);
    expect(window.localStorage.getItem(WELCOME_DISMISSED_KEY)).toBe("1");
    const again = renderHook(() => useOwnerWelcome(created));
    expect(again.result.current.show).toBe(false);
  });

  it("renders the approved copy; «סגירה» calls onClose; the CTA goes to edit", () => {
    const onClose = vi.fn();
    wrap(<OwnerWelcomeCard onClose={onClose} />);
    const card = screen.getByTestId("owner-welcome");
    expect(within(card).getByRole("heading")).toHaveTextContent("ברוכים הבאים למהמקור");
    expect(card).toHaveTextContent(he.dashboard.producer.welcome_card.body);
    expect(card).toHaveTextContent("שאלה? אני עונה בוואטסאפ.");
    expect(within(card).getByRole("link", { name: "להשלמת העמוד" })).toHaveAttribute("href", "/producer/dashboard/edit");
    fireEvent.click(within(card).getByRole("button", { name: "סגירה" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
