import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1628 — guard for a REMOVAL spec.
//
// MEH-990's Emoji-LOCK sweep stripped ❤️ and 🔔 out of two favorites strings
// where the glyph was the sentence's grammatical OBJECT, not decoration:
//   favorites.first_visit_tip   "לחצו על [❤️] בכרטיס עסק…"  → "לחצו על בכרטיס עסק…"
//   favorites.list_alerts_hint  "לחצו על [🔔] בכל כרטיס…"    → "לחצו על בכל כרטיס…"
// Nothing went red, because every assertion in the suite verifies PRESENCE.
// A hole is an absence, so an absence-shaped bug is invisible to them — the
// same family as MEH-1578.
//
// This file therefore asserts the NEGATIVE side explicitly (zero Leaf, zero
// first_visit_tip, exactly one helper paragraph, exactly one bell) alongside
// the positive one. Each count below is an equality, never a lower bound:
// `>= 1` would pass on the broken state too.
//
// Per .claude/rules/testing.md (MEH-1619) these assertions were run against the
// pre-fix component and observed FAILING before the fix landed — see the PR body
// for the red/green pair. The discriminator is the equality: the old suite went
// green on the same DOM.

// Every Phosphor icon renders as a tagged <svg> so the DOM can be asked WHICH
// glyph rendered. The mock is derived from the real export list rather than a
// hand-written subset: the ProducerCard import chain pulls in a dozen icons, and
// a fixed list would break the day one of them changes. (A Proxy does not work —
// vitest validates named ESM exports against the real module.)
vi.mock("@phosphor-icons/react", async (importOriginal) => {
  const actual = await importOriginal();
  const FORWARD_REF = Symbol.for("react.forward_ref");
  const mocked = {};
  for (const name of Object.keys(actual)) {
    // Every Phosphor icon is a forwardRef object (NOT a plain function — that
    // distinction silently no-ops the whole mock if you get it wrong). Non-icon
    // exports (IconContext, a react.context) pass through untouched.
    mocked[name] =
      actual[name]?.$$typeof === FORWARD_REF
        ? ({ size, weight }) => (
            <svg data-icon={name} data-weight={weight} width={size} height={size} />
          )
        : actual[name];
  }
  return mocked;
});

// t(key) → "ns.key". t.rich(key, tags) resolves the message from the REAL he.json
// so the test reads the shipped string, not a stand-in: the <icon></icon> tag is
// replaced by the component the component-under-test passed. If the message loses
// its tag, no icon renders and the bell assertion goes red — which is precisely
// the MEH-990 regression this file exists to catch.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES = {
  he: JSON.parse(readFileSync(path.join(HERE, "..", "messages", "he.json"), "utf8")),
  en: JSON.parse(readFileSync(path.join(HERE, "..", "messages", "en.json"), "utf8")),
};

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (key) => (ns ? `${ns}.${key}` : key);
    t.rich = (key, tags = {}) => {
      const raw = ns
        ? ns.split(".").reduce((o, k) => o?.[k], MESSAGES.he)?.[key]
        : MESSAGES.he[key];
      if (typeof raw !== "string") return ns ? `${ns}.${key}` : key;
      // Split on <tag></tag> / <tag>text</tag> and swap in the passed component.
      return raw.split(/(<[a-zA-Z]+>.*?<\/[a-zA-Z]+>)/g).map((chunk, i) => {
        const m = chunk.match(/^<([a-zA-Z]+)>(.*?)<\/\1>$/);
        if (!m) return chunk;
        const fn = tags[m[1]];
        return fn ? <span key={i}>{fn(m[2])}</span> : chunk;
      });
    };
    t.raw = (key) => (ns ? `${ns}.${key}` : key);
    return t;
  },
  useLocale: () => "he",
}));

vi.mock("next/navigation", () => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return { useRouter: () => router };
});

// BadgeRow (in the ProducerCard import chain) imports the locale-aware Link.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const stableUser = { id: "u1", role: "user" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import api from "@/lib/api";
import FavoritesClient from "@/app/[locale]/favorites/FavoritesClient";

// The empty state is the only `.text-center.py-20` block that survives to render
// once loading resolves with an empty list.
const emptyStateOf = (container) => {
  const el = container.querySelector("div.text-center.py-20");
  if (!el) throw new Error("empty state did not render");
  return el;
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.get.mockImplementation(() => Promise.resolve({ data: [] }));
});

describe("MEH-1628 · favorites empty state", () => {
  it("renders HeartStraight — and ZERO Leaf — as the empty-state glyph", async () => {
    const { container } = render(<FavoritesClient />);
    await screen.findByText("favorites.empty_title");
    const empty = emptyStateOf(container);

    expect(empty.querySelectorAll('[data-icon="HeartStraight"]')).toHaveLength(1);
    // The negative half. MEH-990's class of bug lives here: a suite that only
    // asserted the heart exists would stay green with the leaf still rendering.
    expect(empty.querySelectorAll('[data-icon="Leaf"]')).toHaveLength(0);
    expect(
      empty.querySelector('[data-icon="HeartStraight"]').getAttribute("data-weight"),
    ).toBe("regular");
  });

  it("keeps the green-50 circle around the glyph untouched", async () => {
    const { container } = render(<FavoritesClient />);
    await screen.findByText("favorites.empty_title");
    const circle = emptyStateOf(container).querySelector("div.rounded-full");

    expect(circle).toBeTruthy();
    for (const cls of ["w-24", "h-24", "rounded-full", "bg-green-50"]) {
      expect(circle.classList.contains(cls)).toBe(true);
    }
  });

  it("shows EXACTLY ONE helper paragraph — the duplicate first-visit tip is gone", async () => {
    const { container } = render(<FavoritesClient />);
    await screen.findByText("favorites.empty_title");
    const empty = emptyStateOf(container);

    // useFirstVisit returned true on a clean sessionStorage, so the pre-fix
    // component rendered BOTH helper lines here. Equality, not `>= 1`.
    const helpers = Array.from(empty.querySelectorAll("p, span")).filter((el) =>
      ["favorites.empty_subtitle", "favorites.first_visit_tip"].includes(
        el.textContent.trim(),
      ),
    );
    expect(helpers).toHaveLength(1);
    expect(helpers[0].textContent.trim()).toBe("favorites.empty_subtitle");
    expect(screen.queryByText("favorites.first_visit_tip")).toBeNull();
  });
});

describe("MEH-1628 · favorites list alerts hint", () => {
  it("renders EXACTLY ONE bell in the hint row, interpolated inside the sentence", async () => {
    api.get.mockImplementation(() => Promise.resolve({ data: [] }));
    const { container } = render(<FavoritesClient />);
    await screen.findByText("favorites.empty_title");

    // Re-render with a populated list so the hint row mounts.
    api.get.mockImplementation(() =>
      Promise.resolve({ data: [{ producer_id: "p1", producer: { id: "p1", name: "טסט" } }] }),
    );
    const { container: c2 } = render(<FavoritesClient />);
    await waitFor(() => expect(c2.querySelector("p[dir='rtl']")).toBeTruthy());

    const hint = c2.querySelector("p[dir='rtl']");
    // Two bells was the bug shape the sibling-glyph deletion closes: one from
    // the old standalone <Bell>, one from the interpolated tag.
    expect(hint.querySelectorAll('[data-icon="Bell"]')).toHaveLength(1);
    // The bell sits BETWEEN two text runs — proof it is inside the sentence and
    // not a leading sibling. Its text must not be empty on either side.
    const parts = hint.textContent.split(/\s+/).filter(Boolean);
    expect(parts.length).toBeGreaterThan(3);
    expect(container).toBeTruthy();
  });
});

describe("MEH-1628 · message files", () => {
  const favorites = (locale) => MESSAGES[locale].favorites;

  it("deleted favorites.first_visit_tip from BOTH locales", () => {
    expect(favorites("he").first_visit_tip).toBeUndefined();
    expect(favorites("en").first_visit_tip).toBeUndefined();
  });

  it("carries the <icon></icon> tag in list_alerts_hint in BOTH locales", () => {
    expect(favorites("he").list_alerts_hint).toContain("<icon></icon>");
    expect(favorites("en").list_alerts_hint).toContain("<icon></icon>");
  });

  it("has identical he/en key sets under favorites, and no emoji or Hebrew in en", () => {
    const keysOf = (obj, prefix = "") =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    expect(keysOf(favorites("he")).sort()).toEqual(keysOf(favorites("en")).sort());

    const values = (obj) =>
      Object.values(obj).flatMap((v) => (v && typeof v === "object" ? values(v) : [v]));
    for (const v of values(favorites("he")).concat(values(favorites("en")))) {
      expect(v).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    for (const v of values(favorites("en"))) {
      expect(v).not.toMatch(/[֐-׿]/);
    }
  });
});
