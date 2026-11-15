/**
 * MEH-2916 (C4) chunk 2 — the failing half.
 *
 * The owner of an unapproved business follows «צפייה בדף» and is told her
 * business «לא נמצא». The backend is not the problem: the two cells in
 * tests/test_meh2916_owner_preview_contract.py show it already serves the
 * owner a 200 and 404s everyone else. What regressed is that MEH-2101 moved
 * the producer page's fetch to anonymous SSR (`lib/server-fetch.js` sends no
 * Authorization), so the page asks as a stranger and gets the stranger's
 * answer.
 *
 * Sapir's ruling (11/11): leave that 404 exactly as it is, and add an
 * owner-only preview inside the dashboard, fetched client-side with the token.
 *
 * EVERY CELL HERE IS RED UNTIL CHUNK 3. They are red for the right reason and
 * each says so by name rather than dying on a bare module-resolution error.
 *
 * 🔴 HONEST LIMIT: these assert the WIRING — which path is fetched, that the
 * route is noindex, that the anonymous server fetch is not used. They do not
 * assert that ProducerDetail renders a business name from that payload; that
 * component has its own suite, and the rendered-pixel half belongs to the 390
 * and 1440 captures chunk 3 owes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROUTE_DIR = path.join(here, "../app/[locale]/producer/dashboard/preview");
const PAGE = path.join(ROUTE_DIR, "page.js");
const CLIENT = path.join(ROUTE_DIR, "PreviewClient.jsx");

// Specifiers held in variables, with @vite-ignore at each import site. A
// literal specifier is resolved by Vite at TRANSFORM time, so while the route
// does not exist yet the whole file fails to collect and the run reports "no
// tests" — a red that proves nothing because nothing ran. Via a variable it
// collects now, each cell fails on its own named assertion, and once chunk 3
// lands the module still resolves and is transformed normally (verified with
// a throwaway module before this file was written).
const PAGE_SPECIFIER = "../app/[locale]/producer/dashboard/preview/page.js";
const CLIENT_SPECIFIER = "../app/[locale]/producer/dashboard/preview/PreviewClient.jsx";

const PRODUCER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "producer", producer_id: PRODUCER_ID, producer_status: "pending" },
    loading: false,
  }),
}));

const apiGet = vi.fn(() => Promise.resolve({ data: { id: PRODUCER_ID, name: "הבית של דנה" } }));
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a), post: vi.fn() } }));

vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return { useTranslations: () => t };
});

// The real ProducerDetail has its own suite; here it stands in so the test can
// read the ONE prop that decides whether the preview asks as the owner or as a
// stranger.
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({
  default: ({ fetchPath }) => <div data-testid="producer-detail" data-fetch-path={fetchPath || ""} />,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MEH-2916 · the owner preview route", () => {
  it("exists at /producer/dashboard/preview", () => {
    expect(
      existsSync(PAGE),
      "the preview route does not exist yet — chunk 3 adds app/[locale]/producer/dashboard/preview/page.js",
    ).toBe(true);
  });

  it("is noindex", async () => {
    if (!existsSync(PAGE)) {
      return expect.unreachable("the preview route does not exist yet");
    }
    const mod = await import(/* @vite-ignore */ PAGE_SPECIFIER);
    expect(mod.metadata?.robots).toMatchObject({ index: false, follow: false });
  });

  it("never reaches for the anonymous server fetch — that IS the regression", () => {
    // The guard with the longest memory in this file. `lib/server-fetch.js`
    // sends no Authorization by design (MEH-2101's contract depends on it), so
    // a preview built on it would 404 for the very owner it exists to serve,
    // and would do so only for unapproved businesses — invisible in any happy
    // path.
    if (!existsSync(PAGE)) {
      return expect.unreachable("the preview route does not exist yet");
    }
    const sources = [readFileSync(PAGE, "utf8")];
    if (existsSync(CLIENT)) sources.push(readFileSync(CLIENT, "utf8"));
    for (const src of sources) {
      // Matches USE, not mention. A bare /server-fetch/ also fires on the
      // comment that explains why the module is avoided, which is prose that
      // cannot cause the regression — and a check that reds on its own
      // documentation teaches the next person to delete the documentation.
      expect(src, "must not import lib/server-fetch").not.toMatch(
        /from\s+["'][^"']*server-fetch["']/,
      );
      expect(src, "must not call serverFetch()").not.toMatch(/\bserverFetch\s*\(/);
    }
  });

  it("fetches the owner's OWN business, client-side, with her token", async () => {
    if (!existsSync(CLIENT)) {
      return expect.unreachable(
        "PreviewClient does not exist yet — chunk 3 adds it beside page.js",
      );
    }
    const { default: PreviewClient } = await import(/* @vite-ignore */ CLIENT_SPECIFIER);
    render(<PreviewClient />);
    await waitFor(
      () =>
        expect(
          screen.queryByTestId("producer-detail"),
          "the preview must render ProducerDetail — chunk 3",
        ).toBeTruthy(),
      { timeout: 2000 },
    );
    // The path carries her own producer id — not a route param, which this
    // route does not have, and not a slug, which an unapproved business may
    // not have either.
    expect(screen.getByTestId("producer-detail").dataset.fetchPath).toBe(
      `/producers/${PRODUCER_ID}`,
    );
  });
});
