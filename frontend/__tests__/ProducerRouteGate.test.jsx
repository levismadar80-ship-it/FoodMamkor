/**
 * Module:   ProducerRouteGate.test
 * Purpose:  Lock the MEH-2148 chrome gate. Two independent guards:
 *           (1) `isProducerDetail` recognises the canonical `/[slug]` business
 *               leaf as well as `/producer/<id>`, and recognises NOTHING else;
 *           (2) a DRIFT gate — every real `app/[locale]/` route directory is in
 *               `lib/slug.js`'s RESERVED set. Guard (1) is what makes guard (2)
 *               load-bearing: once a single-segment path can unmount BottomNav
 *               and ChatWidgetLazy, a route missing from RESERVED loses its
 *               mobile nav. Before MEH-2148 that same gap only skipped a fetch.
 * Does NOT: render BottomNav/ChatWidgetLazy. Their gate is one line each
 *           (BottomNav.jsx:342, ChatWidgetLazy.jsx:43) calling this helper; the
 *           decision under test is the helper's.
 * Related:  frontend/lib/producer-route.js · frontend/lib/slug.js ·
 *           frontend/__tests__/producerRoute.test.js (the MEH-1202 cases, kept
 *           as-is — `/producers` there is now a RESERVED-dependent assertion).
 * History:  MEH-2148.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { isProducerDetail } from "@/lib/producer-route";
import { isReserved } from "@/lib/slug";

// Resolve from THIS FILE, never from cwd. A cwd-relative root resolves
// elsewhere under a different runner invocation and the readdir below throws
// (or reads a wrong directory) — an invocation error that reads like a finding.
const LOCALE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "[locale]"
);

// The 16 directories MEH-2148 added. Named individually and NOT derived from
// the directory listing: the drift test below reads the listing, so deriving
// this from the same source would make both assertions restatements of one
// read. Delete any single name from RESERVED and exactly one case here goes red.
const ROUTES_ADDED_BY_MEH_2148 = [
  "accessibility",
  "contact",
  "dev",
  "events",
  "experiences",
  "forgot-password",
  "group-buys",
  "home",
  "join",
  "privacy",
  "producers",
  "ref",
  "reset-password",
  "search",
  "share",
  "verify-email",
];

describe("MEH-2148 — isProducerDetail covers both business URLs", () => {
  it("matches the /producer/<id> leaf (MEH-1202 arm, unchanged)", () => {
    expect(isProducerDetail("/producer/123")).toBe(true);
    expect(isProducerDetail("/producer/ruach-hasadeh")).toBe(true);
  });

  it("matches the canonical /[slug] business leaf", () => {
    expect(isProducerDetail("/maafiat-dana")).toBe(true);
    // Hebrew slugs are the common case in production (backend _slugify keeps
    // the Hebrew block), so the shape check must accept them.
    expect(isProducerDetail("/מאפיית-דנה")).toBe(true);
  });

  it("excludes the /producer/dashboard owner subtree", () => {
    expect(isProducerDetail("/producer/dashboard")).toBe(false);
    expect(isProducerDetail("/producer/dashboard/edit")).toBe(false);
  });

  it("excludes real single-segment routes", () => {
    expect(isProducerDetail("/experiences")).toBe(false);
    expect(isProducerDetail("/map")).toBe(false);
    expect(isProducerDetail("/producers")).toBe(false);
  });

  it("is LEAF-only — a nested path keeps its chrome", () => {
    expect(isProducerDetail("/x/recipes")).toBe(false);
    expect(isProducerDetail("/x/recipes/y")).toBe(false);
    expect(isProducerDetail("/producer/123/reviews")).toBe(false);
  });

  it("excludes the root and empty/nullish input", () => {
    expect(isProducerDetail("/")).toBe(false);
    expect(isProducerDetail("")).toBe(false);
    expect(isProducerDetail(null)).toBe(false);
    expect(isProducerDetail(undefined)).toBe(false);
  });

  it("still rejects the bot probes lib/slug.js exists to reject", () => {
    // Regression guard on the new arm: it delegates to isSlugShaped, so the
    // MEH-1045 hardening must survive being reused as a chrome gate.
    expect(isProducerDetail("/.env")).toBe(false);
    expect(isProducerDetail("/wp-admin")).toBe(false);
    expect(isProducerDetail("/xmlrpc.php")).toBe(false);
  });
});

describe("MEH-2148 — RESERVED does not drift from the router", () => {
  // Reads the router's OWN directory listing. Mirrors the EXPECTED_TABLES
  // drift-gate pattern: the guard is worthless if it restates a hardcoded list,
  // so the source of truth here is the filesystem.
  const dirs = fs
    .readdirSync(LOCALE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    // Dynamic segments (`[slug]`, `[id]`) are not literal paths — `[slug]` IS
    // the business route this whole gate exists to identify.
    .filter((e) => !e.name.startsWith("["))
    .map((e) => e.name);

  it("CONTROL — the listing is real (read this first on a failure)", () => {
    // A readdir that silently returned [] would satisfy every "for each dir"
    // assertion below vacuously — the null that is also the reassuring answer.
    // `about` and `map` are RESERVED-since-MEH-1045 routes: if either is
    // missing, this test is reading the wrong directory and every verdict
    // below in this file is void, not passing.
    expect(dirs.length).toBeGreaterThan(20);
    expect(dirs).toContain("about");
    expect(dirs).toContain("map");
  });

  it("every real route directory is RESERVED", () => {
    const missing = dirs.filter((d) => !isReserved(d));
    expect(
      missing,
      `app/[locale]/ route directories missing from RESERVED in lib/slug.js: ` +
        `${missing.join(", ")}. Since MEH-2148 a gap here does not just skip a ` +
        `fetch — isProducerDetail treats the path as a business slug and ` +
        `BottomNav + ChatWidgetLazy unmount on a real page.`
    ).toEqual([]);
  });

  it.each(ROUTES_ADDED_BY_MEH_2148)(
    "/%s is a route, not a business slug",
    (route) => {
      // Two assertions on purpose. The first is the user-visible property; the
      // second names WHY it holds, so removing the entry from RESERVED fails
      // here rather than only in the aggregate test above.
      expect(isProducerDetail(`/${route}`)).toBe(false);
      expect(isReserved(route)).toBe(true);
    }
  );

  it("CONTROL — isReserved discriminates, it is not a constant", () => {
    // Without this, every `isReserved(x) === true` above passes against a
    // helper that returns true for everything — which would ALSO make
    // isProducerDetail return false for every slug and silently disable the fix.
    expect(isReserved("maafiat-dana")).toBe(false);
    expect(isReserved("some-business-that-does-not-exist")).toBe(false);
  });
});
