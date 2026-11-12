import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { useRouter } from "next/navigation";

// MEH-2982 — a guest who opens /favorites directly (a bookmark, a shared link)
// is sent to /login WITH a redirect back here. Before the fix she was pushed to
// a bare "/login" and landed on "/" after signing in.
// Mocks below are copied from FavoritesEmptyState.test.jsx; the only change is
// that useAuth answers "signed out".

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

const stableUser = null;
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));

// MEH-2560: /favorites also loads saved recipes / events / experiences. These
// tests are about the businesses, so that half answers "nothing saved" and
// stays off the api.get mock whose call order they assert.
vi.mock("@/app/[locale]/favorites/savedItems", async (importOriginal) => ({
  ...(await importOriginal()),
  loadSavedItems: () => Promise.resolve({ recipes: [], events: [], experiences: [] }),
}));
vi.mock("@/lib/saved-cache", () => ({
  ensureSavedLoaded: () => Promise.resolve(new Set()),
  isSaved: () => false,
  subscribeSaved: () => () => {},
}));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import api from "@/lib/api";
import FavoritesClient from "@/app/[locale]/favorites/FavoritesClient";

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/en/favorites?tab=events");
});

describe("MEH-2982 · /favorites signed out", () => {
  it("sends the guest to /login with a redirect back to this exact page", async () => {
    render(<FavoritesClient />);
    const router = useRouter();
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(router.push).toHaveBeenCalledWith(
      "/login?redirect=%2Fen%2Ffavorites%3Ftab%3Devents",
    );
    expect(api.get).not.toHaveBeenCalledWith("/users/me/favorites");
  });
});
