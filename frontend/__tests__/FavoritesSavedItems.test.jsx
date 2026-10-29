import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import { israelToday } from "@/lib/israel-date";

// MEH-2560 — /favorites with saved recipes / events / experiences: the chips,
// the «הכל» sections, «עברו», and the empty state of every filter (0 / 1 /
// many × filter, CLAUDE.md 5-state rule).

vi.mock("next/navigation", () => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return { useRouter: () => router };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
const stableUser = { id: "u1", role: "user" };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: stableUser, loading: false }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(new Set()),
  isFavorited: () => false,
  subscribeFavorites: () => () => {},
}));
// The saved-cache is driven by the test: `savedKeys` is what the server knew
// at load; `unsaved` is what a heart on this page has since removed.
const cache = { savedKeys: new Set(), unsaved: new Set(), listeners: new Set(), seeded: [] };
vi.mock("@/lib/saved-cache", () => ({
  ensureSavedLoaded: () => Promise.resolve(cache.savedKeys),
  isSaved: (type, id) => !cache.unsaved.has(`${type}:${id}`),
  setSavedLocal: (type, id, value) => cache.seeded.push(`${type}:${id}:${value}`),
  subscribeSaved: (l) => {
    cache.listeners.add(l);
    return () => cache.listeners.delete(l);
  },
}));
vi.mock("@/components/ProducerCard", () => ({
  default: ({ producer }) => <div data-testid="card">{producer.name}</div>,
}));
vi.mock("@/components/AlertPrefsPanel", () => ({ default: () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => <nav /> }));
vi.mock("@/components/SaveButton", () => ({
  default: ({ itemType, itemId }) => <button type="button" data-testid={`save-${itemType}`} data-id={itemId} />,
}));
vi.mock("next/image", () => ({ default: (props) => <img alt={props.alt} /> }));

import api from "@/lib/api";
import FavoritesClient from "@/app/[locale]/favorites/FavoritesClient";
import { parseSavedItems, splitByTime } from "@/app/[locale]/favorites/savedItems";

const day = (n) => {
  const d = new Date(`${israelToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const uid = (n) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const business = (n) => ({ producer_id: uid(n), producer: { id: uid(n), name: `עסק ${n}` } });
const recipe = (n) => ({ id: uid(100 + n), title: `מתכון ${n}`, producer_name: "מאפייה", producer_slug: "bakery" });
const event = (n, offset) => ({ id: uid(200 + n), title: `אירוע ${n}`, event_date: day(offset), producer_name: "מאפייה", category: "שוק" });
const experience = (n, offset, extra = {}) => ({
  id: uid(300 + n),
  title: `חוויה ${n}`,
  event_date: day(offset),
  host: { name: "נועה" },
  is_active: true,
  ...extra,
});

function serve({ businesses = [], recipes = [], events = [], experiences = [], savedFails = 0 } = {}) {
  let failures = savedFails;
  cache.savedKeys = new Set([
    ...recipes.map((r) => `recipe:${r.id}`),
    ...events.map((e) => `event:${e.id}`),
    ...experiences.map((e) => `experience:${e.id}`),
  ]);
  api.get.mockImplementation((url) => {
    if (url === "/users/me/favorites") return Promise.resolve({ data: businesses });
    if (url === "/users/me/saved") {
      if (failures > 0) {
        failures -= 1;
        return Promise.reject(new Error("down"));
      }
      return Promise.resolve({ data: { recipes, events, experiences } });
    }
    return Promise.resolve({ data: [] });
  });
}

const renderPage = async () => {
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem" onError={() => {}}>
      <FavoritesClient />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(document.querySelector('[data-testid="skeleton-grid"], .animate-pulse')).toBeNull());
};
const F = he.favorites;
const chip = (label) => screen.getAllByRole("button").find((b) => b.textContent.startsWith(label));
const sectionKeys = () =>
  [...document.querySelectorAll('[data-testid^="favorites-section-"]')].map((s) =>
    s.getAttribute("data-testid").replace("favorites-section-", ""),
  );

beforeEach(() => {
  vi.clearAllMocks();
  cache.unsaved = new Set();
  cache.listeners = new Set();
  cache.seeded = [];
});

describe("savedItems — parse", () => {
  it("a malformed envelope is an error, not an empty list", () => {
    expect(parseSavedItems([])).toBeNull();
    expect(parseSavedItems({ recipes: [] })).toBeNull();
  });

  it("a malformed row costs that row only; a recipe with no business slug is dropped", () => {
    const out = parseSavedItems({
      recipes: [recipe(1), { ...recipe(2), producer_slug: null }, { id: 5 }],
      events: [event(1, 3), { title: "no id" }],
      experiences: [experience(1, 3)],
    });
    expect(out.recipes.map((r) => r.title)).toEqual(["מתכון 1"]);
    expect(out.events).toHaveLength(1);
    expect(out.experiences).toHaveLength(1);
  });
});

describe("savedItems — «עברו»", () => {
  const today = israelToday();
  it("an event: yesterday is past, today is not", () => {
    const { upcomingEvents, past } = splitByTime([event(1, -1), event(2, 0)], [], today);
    expect(upcomingEvents.map((e) => e.title)).toEqual(["אירוע 2"]);
    expect(past.map((p) => p.row.title)).toEqual(["אירוע 1"]);
  });

  it("an experience: a one-off whose date passed and a cancelled one are past; a recurring one never is", () => {
    const { upcomingExperiences, past } = splitByTime(
      [],
      [
        experience(1, -5),
        experience(2, 4, { is_active: false }),
        experience(3, -30, { is_recurring: true }),
        experience(4, 2),
      ],
      today,
    );
    expect(upcomingExperiences.map((e) => e.title)).toEqual(["חוויה 3", "חוויה 4"]);
    expect(past.map((p) => p.row.title).sort()).toEqual(["חוויה 1", "חוויה 2"]);
  });

  it("a cancelled event is past even when its date is ahead", () => {
    const { upcomingEvents, past } = splitByTime([{ ...event(1, 5), is_active: false }, event(2, 5)], [], today);
    expect(upcomingEvents.map((e) => e.title)).toEqual(["אירוע 2"]);
    expect(past.map((p) => p.row.title)).toEqual(["אירוע 1"]);
  });

  it("upcoming soonest first; past most recent first", () => {
    const { upcomingEvents, past } = splitByTime(
      [event(1, 9), event(2, 1), event(3, -10), event(4, -2)],
      [],
      today,
    );
    expect(upcomingEvents.map((e) => e.title)).toEqual(["אירוע 2", "אירוע 1"]);
    expect(past.map((p) => p.row.title)).toEqual(["אירוע 4", "אירוע 3"]);
  });
});

describe("/favorites — nothing saved (0)", () => {
  it("the «הכל» empty state, no chips", async () => {
    serve();
    await renderPage();
    expect(await screen.findByText(F.empty_all_title)).toBeTruthy();
    expect(screen.getByText(F.empty_all_subtitle)).toBeTruthy();
    expect(screen.queryByText(F.filter_recipes)).toBeNull();
  });
});

describe("/favorites — one saved item (1)", () => {
  it("one recipe: chips with counts, only the recipes section, heart on the card", async () => {
    serve({ recipes: [recipe(1)] });
    await renderPage();
    await screen.findByText("מתכון 1");
    expect(screen.getByTestId("favorites-count-all").textContent).toBe("1");
    expect(screen.getByTestId("favorites-count-recipes").textContent).toBe("1");
    expect(screen.getByTestId("favorites-count-businesses").textContent).toBe("0");
    expect(sectionKeys()).toEqual(["recipes"]);
    const card = screen.getByTestId("saved-recipe");
    const heart = within(card).getByTestId("save-recipe");
    expect(card.querySelector("a").contains(heart)).toBe(false);
  });

  it("seeds the shared cache with every row, so a heart here always unsaves", async () => {
    serve({ recipes: [recipe(1)], events: [event(1, 3)], experiences: [experience(1, 3)] });
    await renderPage();
    await screen.findByText("מתכון 1");
    expect(cache.seeded.sort()).toEqual(
      [`recipe:${uid(101)}:true`, `event:${uid(201)}:true`, `experience:${uid(301)}:true`].sort(),
    );
  });

  it("one recipe, «בתי עסק» chip: the businesses empty state as before", async () => {
    serve({ recipes: [recipe(1)] });
    await renderPage();
    await screen.findByText("מתכון 1");
    fireEvent.click(chip(F.filter_businesses));
    expect(screen.getByText(F.empty_title)).toBeTruthy();
    expect(screen.queryByText("מתכון 1")).toBeNull();
  });

  it("one recipe, «אירועים» chip: «עדיין לא שמרת אירועים»", async () => {
    serve({ recipes: [recipe(1)] });
    await renderPage();
    await screen.findByText("מתכון 1");
    fireEvent.click(chip(F.filter_events));
    expect(screen.getByTestId("favorites-type-empty").textContent).toBe(F.empty_events);
  });
});

describe("/favorites — many, mixed", () => {
  const data = {
    businesses: [business(1), business(2)],
    recipes: [recipe(1), recipe(2)],
    events: [event(1, 5), event(2, -3)],
    experiences: [experience(1, 7), experience(2, -1)],
  };

  it("«הכל»: events, experiences, businesses, recipes, then «עברו» at the bottom", async () => {
    serve(data);
    await renderPage();
    await screen.findByText("אירוע 1");
    expect(sectionKeys()).toEqual(["events", "experiences", "businesses", "recipes", "past"]);
    const past = within(screen.getByTestId("favorites-section-past"));
    expect(past.getByText(F.past_heading)).toBeTruthy();
    expect(past.getByText("אירוע 2")).toBeTruthy();
    expect(past.getByText("חוויה 2")).toBeTruthy();
    expect(screen.getByTestId("favorites-count-all").textContent).toBe("8");
  });

  it("«אירועים»: upcoming events, then only the past EVENTS", async () => {
    serve(data);
    await renderPage();
    await screen.findByText("אירוע 1");
    fireEvent.click(chip(F.filter_events));
    expect(screen.getByText("אירוע 1")).toBeTruthy();
    const past = within(screen.getByTestId("favorites-section-past"));
    expect(past.getByText("אירוע 2")).toBeTruthy();
    expect(past.queryByText("חוויה 2")).toBeNull();
    expect(screen.queryByText("חוויה 1")).toBeNull();
    expect(screen.queryByText("מתכון 1")).toBeNull();
    expect(screen.queryAllByTestId("card")).toHaveLength(0);
  });

  it("«חוויות» with only upcoming ones: no «עברו» heading", async () => {
    serve({ ...data, experiences: [experience(1, 7)] });
    await renderPage();
    await screen.findByText("אירוע 1");
    fireEvent.click(chip(F.filter_experiences));
    expect(screen.getByText("חוויה 1")).toBeTruthy();
    expect(screen.queryByTestId("favorites-section-past")).toBeNull();
  });

  it("a heart tapped on the page hides its row at once", async () => {
    serve(data);
    await renderPage();
    await screen.findByText("מתכון 1");
    cache.unsaved.add(`recipe:${uid(101)}`);
    cache.listeners.forEach((l) => l());
    await waitFor(() => expect(screen.queryByText("מתכון 1")).toBeNull());
    expect(screen.getByText("מתכון 2")).toBeTruthy();
    expect(screen.getByTestId("favorites-count-recipes").textContent).toBe("1");
  });
});

describe("/favorites — the saved half fails", () => {
  it("businesses still render; the saved part shows error + retry, never «nothing saved»", async () => {
    serve({ businesses: [business(1)], recipes: [recipe(1)], savedFails: 1 });
    await renderPage();
    await screen.findByText("עסק 1");
    expect(screen.getByTestId("favorites-saved-error")).toBeTruthy();
    expect(screen.queryByText(F.empty_all_title)).toBeNull();
    // No false «0» on chips the failed half owns; businesses keep theirs.
    expect(screen.queryByTestId("favorites-count-recipes")).toBeNull();
    expect(screen.queryByTestId("favorites-count-all")).toBeNull();
    expect(screen.getByTestId("favorites-count-businesses").textContent).toBe("1");
    fireEvent.click(screen.getByTestId("favorites-saved-retry"));
    expect(await screen.findByText("מתכון 1")).toBeTruthy();
    expect(screen.queryByTestId("favorites-saved-error")).toBeNull();
    expect(screen.getByTestId("favorites-count-recipes").textContent).toBe("1");
  });
});
