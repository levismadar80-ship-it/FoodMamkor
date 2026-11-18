/**
 * MEH-3200 part 2: the once-only «רגע ראשון» cards and the «חדש» tool pill.
 *
 * Cells (CLAUDE.md 5-state rule):
 *   moments: first visit (silent) / crossing after it / already past at first
 *            sight / two crossing at once (priority, then the next) / retired /
 *            missing field / storage that throws
 *   card:    each of the 4 moments renders its approved copy; button + «סגירה»
 *   new tools: 0 / 1 / many hrefs × inside / outside 14 days / future date
 * Rendered with the real message files so copy is read, not keys.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));

const toolsMock = vi.hoisted(() => ({ list: null }));
vi.mock("@/lib/whats-new", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    newToolHrefs: (now, releases) => real.newToolHrefs(now, toolsMock.list ?? releases),
  };
});

import { MOMENTS, firstMomentsKey, retireMoment, stepMoments } from "@/lib/first-moments";
import { readFileSync } from "node:fs";
import path from "node:path";
import { newToolHrefs, NEW_TOOL_DAYS, WHATS_NEW_RELEASES } from "@/lib/whats-new";
import { useFirstMoment } from "@/hooks/useFirstMoment";
import { israelToday } from "@/lib/israel-date";
import FirstMomentCard from "@/components/producer/FirstMomentCard";
import NewToolPill from "@/components/producer/NewToolPill";

const wrap = (ui) => render(<NextIntlClientProvider locale="he" messages={he}>{ui}</NextIntlClientProvider>);
const A = ({ reviews = 0, wa = 0, views = 0, followers = 0 } = {}) => ({
  total_reviews: reviews,
  whatsapp_clicks: { total: wa },
  profile_views: { total: views },
  follower_count: followers,
});
const fm = he.dashboard.producer.first_moments;
const KEY = firstMomentsKey(7);

// The table Sapir approved word for word on 14/11 — pinned here, so a typo in
// he.json goes red instead of being read back as the expected value.
const APPROVED = {
  pill: "חדש",
  dot: "יש כלי חדש",
  close: "סגירה",
  first_review: ["הביקורת הראשונה שלכם הגיעה", "מישהי טרחה לכתוב עליכם. תשובה קצרה מכם מראה לאחרות שאכפת לכם.", "לקריאה ולתשובה"],
  first_whatsapp: ["הלחיצה הראשונה על וואטסאפ", "מישהי לחצה על הכפתור בעמוד שלכם כדי לכתוב לכם. כדאי לבדוק אם הגיעה הודעה.", "לכל הנתונים"],
  views_100: ["100 צפיות בעמוד שלכם", "מאה פעמים מישהי עצרה לקרוא עליכם. שיתוף הלינק שלכם יביא עוד.", "לכל הנתונים"],
  first_follower: ["העוקבת הראשונה שלכם", "מישהי שמרה את העסק שלכם, ועדכונים על מה שתפרסמו יגיעו אליה.", "לכל הנתונים"],
};

beforeEach(() => {
  window.localStorage.clear();
  toolsMock.list = null;
  vi.restoreAllMocks();
});

describe("lib/first-moments — stepMoments", () => {
  it("first visit: stores every count silently, nothing due", () => {
    const { state, due } = stepMoments(null, A({ reviews: 0, views: 40 }));
    expect(due).toBeNull();
    expect(state.baseline).toEqual({ first_review: 0, first_whatsapp: 0, views_100: 40, first_follower: 0 });
    expect(state.done).toEqual([]);
  });

  it("a count that crosses after the first visit is due", () => {
    const s0 = stepMoments(null, A()).state;
    expect(stepMoments(s0, A({ views: 99 })).due).toBeNull();
    expect(stepMoments(s0, A({ views: 100 })).due?.key).toBe("views_100");
    expect(stepMoments(s0, A({ reviews: 1 })).due?.key).toBe("first_review");
  });

  it("already past the threshold at first sight: never celebrated", () => {
    const s0 = stepMoments(null, A({ reviews: 3 })).state;
    expect(s0.done).toEqual(["first_review"]);
    expect(stepMoments(s0, A({ reviews: 4 })).due).toBeNull();
  });

  it("two crossing at once: priority order, then the next one after retiring", () => {
    const s0 = stepMoments(null, A()).state;
    const both = A({ reviews: 1, followers: 1 });
    const first = stepMoments(s0, both);
    expect(first.due?.key).toBe("first_review");
    const second = stepMoments(retireMoment(first.state, "first_review"), both);
    expect(second.due?.key).toBe("first_follower");
    expect(stepMoments(retireMoment(second.state, "first_follower"), both).due).toBeNull();
  });

  it("a missing field is skipped and gets its baseline when it appears", () => {
    const s0 = stepMoments(null, { total_reviews: 0 }).state;
    expect(Object.keys(s0.baseline)).toEqual(["first_review"]);
    const s1 = stepMoments(s0, A({ followers: 1 }));
    expect(s1.due).toBeNull();
    expect(s1.state.baseline.first_follower).toBe(1);
  });

  it("he.json holds exactly the approved copy", () => {
    expect(MOMENTS.map((m) => m.key)).toEqual(["first_review", "first_whatsapp", "views_100", "first_follower"]);
    for (const m of MOMENTS) expect([fm[m.key].title, fm[m.key].body, fm[m.key].cta]).toEqual(APPROVED[m.key]);
    expect(fm.close).toBe(APPROVED.close);
    expect(he.dashboard.producer.new_tool).toEqual({ pill: APPROVED.pill, dot: APPROVED.dot });
  });
});

describe("useFirstMoment", () => {
  it("silent on the first visit, the card on a later crossing, gone for good after dismiss", () => {
    const h = renderHook(({ a }) => useFirstMoment(a, 7), { initialProps: { a: A() } });
    expect(h.result.current.moment).toBeNull();
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    h.rerender({ a: A({ wa: 1 }) });
    expect(h.result.current.moment?.key).toBe("first_whatsapp");
    act(() => h.result.current.dismiss());
    expect(h.result.current.moment).toBeNull();
    h.rerender({ a: A({ wa: 2 }) });
    expect(h.result.current.moment).toBeNull();
  });

  it("null analytics (still loading): nothing stored, nothing due", () => {
    const h = renderHook(() => useFirstMoment(null, 7));
    expect(h.result.current.moment).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("no business id: nothing stored, nothing due", () => {
    const h = renderHook(({ a }) => useFirstMoment(a, undefined), { initialProps: { a: A() } });
    h.rerender({ a: A({ reviews: 1 }) });
    expect(h.result.current.moment).toBeNull();
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  it("per business: A's state never decides B's first visit", () => {
    // A saw 3 reviews (done) and 0 followers.
    renderHook(() => useFirstMoment(A({ reviews: 3 }), "A"));
    // B: first visit with 5 followers → silent; then 1 review → B's own card.
    const b = renderHook(({ a }) => useFirstMoment(a, "B"), { initialProps: { a: A({ followers: 5 }) } });
    expect(b.result.current.moment).toBeNull();
    b.rerender({ a: A({ followers: 5, reviews: 1 }) });
    expect(b.result.current.moment?.key).toBe("first_review");
  });

  it("dismiss with corrupt storage keeps the other baselines", () => {
    const h = renderHook(({ a }) => useFirstMoment(a, 7), { initialProps: { a: A() } });
    h.rerender({ a: A({ reviews: 1 }) });
    window.localStorage.setItem(KEY, "{not json");
    act(() => h.result.current.dismiss());
    const stored = JSON.parse(window.localStorage.getItem(KEY));
    expect(stored.done).toEqual(["first_review"]);
    expect(stored.baseline).toEqual({ first_review: 0, first_whatsapp: 0, views_100: 0, first_follower: 0 });
  });

  it("storage that throws: no card, no error", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const h = renderHook(({ a }) => useFirstMoment(a, 7), { initialProps: { a: A() } });
    h.rerender({ a: A({ reviews: 1 }) });
    expect(h.result.current.moment).toBeNull();
  });
});

describe("FirstMomentCard", () => {
  for (const m of MOMENTS) {
    it(`${m.key}: approved title, line and button; both actions close it`, () => {
      const onClose = vi.fn();
      wrap(<FirstMomentCard moment={m} onClose={onClose} />);
      const card = screen.getByTestId("first-moment");
      expect(screen.getByRole("heading")).toHaveTextContent(fm[m.key].title);
      expect(card).toHaveTextContent(fm[m.key].body);
      const cta = screen.getByRole("link", { name: fm[m.key].cta });
      expect(cta).toHaveAttribute("href", m.href);
      fireEvent.click(cta);
      fireEvent.click(screen.getByRole("button", { name: "סגירה" }));
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  }
});

describe("new tools («חדש» pill)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const rel = (date, tools) => ({ version: "9.9.9", key: "x", date, items: 1, tools });
  const day0 = Date.parse("2026-11-15T00:00:00Z");

  it("0 tools: empty", () => {
    expect(newToolHrefs(day0, [rel("2026-11-15")]).size).toBe(0);
  });

  it("1 tool: new on its release day, gone after the window", () => {
    const one = [rel("2026-11-15", ["/a"])];
    expect([...newToolHrefs(day0, one)]).toEqual(["/a"]);
    expect(newToolHrefs(day0 + (NEW_TOOL_DAYS + 1) * DAY, one).size).toBe(0);
  });

  it("days are Israel days: 00:30 Israel on the release day is already day 0", () => {
    // 2026-11-14 22:30 UTC = 2026-11-15 00:30 Israel (UTC+2 in November).
    const justAfterMidnight = Date.parse("2026-11-14T22:30:00Z");
    expect(newToolHrefs(justAfterMidnight, [rel("2026-11-15", ["/a"])]).has("/a")).toBe(true);
    // …and 23:30 Israel on day 14 is still inside, 00:30 on day 15 is out.
    expect(newToolHrefs(Date.parse("2026-11-29T21:30:00Z"), [rel("2026-11-15", ["/a"])]).has("/a")).toBe(true);
    expect(newToolHrefs(Date.parse("2026-11-29T22:30:00Z"), [rel("2026-11-15", ["/a"])]).size).toBe(0);
  });

  it("every `tools` href in the real releases has a «חדש» pill on a «כלים» tile", () => {
    const page = readFileSync(path.resolve(__dirname, "../app/[locale]/producer/dashboard/tools/page.js"), "utf8");
    const pilled = new Set([...page.matchAll(/<NewToolPill href="([^"]+)"/g)].map((m) => m[1]));
    expect(pilled.size).toBeGreaterThan(0);
    for (const r of WHATS_NEW_RELEASES) for (const href of r.tools ?? []) expect(pilled).toContain(href);
  });

  it("1 and many tools: new from day 0 through day 14, not on day 15 or before release", () => {
    const list = [rel("2026-11-15", ["/a", "/b"]), rel("2026-10-01", ["/old"])];
    expect([...newToolHrefs(day0, list)]).toEqual(["/a", "/b"]);
    expect(newToolHrefs(day0 + NEW_TOOL_DAYS * DAY, list).has("/a")).toBe(true);
    expect(newToolHrefs(day0 + (NEW_TOOL_DAYS + 1) * DAY, list).size).toBe(0);
    expect(newToolHrefs(day0 - DAY, list).has("/a")).toBe(false);
  });

  it("the pill shows on a new tool's tile only", () => {
    const today = israelToday();
    toolsMock.list = [rel(today, ["/producer/dashboard/rescue"])];
    wrap(
      <>
        <p data-testid="t1">a<NewToolPill href="/producer/dashboard/rescue" /></p>
        <p data-testid="t2">b<NewToolPill href="/producer/dashboard/recipes" /></p>
      </>,
    );
    expect(screen.getByTestId("t1")).toHaveTextContent("חדש");
    expect(screen.getAllByTestId("new-tool-pill")).toHaveLength(1);
    expect(screen.getByTestId("t2").querySelector("[data-testid=new-tool-pill]")).toBeNull();
  });
});
