"use client";

/**
 * Module:   use-experiences-nav-gate
 * Purpose:  MEH-1918 — decide whether the "חוויות" link appears in the nav.
 *           It appears only once the surface has real supply, so a reader who
 *           follows it never lands on a near-empty shelf.
 * Does NOT: render anything, and does NOT decide WHERE the link goes — Header
 *           and Footer each own their own markup. It also never gates the
 *           BottomNav, whose slots are full (out of scope by ticket).
 * Related:  backend/app/routers/experiences.py (`GET /experiences/count`, the
 *           one predicate this reads), components/Header.jsx +
 *           components/Footer.jsx (the two consumers).
 *
 * Why a hook and not the fetch inlined twice: Header and Footer both need the
 * same answer on the same page load, and two copies of a cache-plus-fetch
 * would be two owners of one piece of state — the exact smell
 * .claude/rules/workflow.md catalogues. One definition, two callers, one
 * network request per session.
 */

import { useEffect, useState } from "react";
import { z } from "zod";

import api from "@/lib/api";

/**
 * Below this many upcoming public experiences the link stays hidden.
 *
 * MEH-1918: three is the point at which the page reads as a shelf rather than
 * as an accident. Marketplace cold-start convention — density before exposure;
 * a thin shelf on a first visit costs more trust than a missing link does.
 */
export const EXPERIENCES_NAV_THRESHOLD = 3;

const CACHE_KEY = "meh_experiences_count";
const TTL_MS = 60 * 60 * 1000; // 1h — supply moves in days, not seconds.

// Rule 19: validate before consuming. A malformed body must fail the parse and
// take the fail-closed path, never reach a `>=` comparison as `undefined`
// (which is silently false, i.e. right answer, wrong reason).
const CountSchema = z.object({ count: z.number().int().nonnegative() });

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.count !== "number" || typeof parsed?.at !== "number") return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
    return parsed.count;
  } catch {
    // Private mode, quota, or a hand-edited value — treat as a cache miss and
    // fetch. Never as an error: a broken cache must not hide the link.
    return null;
  }
}

function writeCache(count) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ count, at: Date.now() }));
  } catch {
    // Caching is an optimisation. Failing to cache is not failing.
  }
}

/**
 * @returns {boolean} whether the nav should show the experiences link.
 *
 * FAIL-CLOSED, in three senses, and all three matter:
 *   - it starts `false`, so the server pass and the first client render agree
 *     and the link cannot flash in and out during hydration;
 *   - a network error, a non-2xx, or a body that fails the schema leaves it
 *     `false` — a link we cannot justify is not shown;
 *   - an unmounted component never sets state, so a slow response after a
 *     route change is dropped rather than warned about.
 */
export function useExperiencesNavGate() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;

    const cached = readCache();
    if (cached !== null) {
      setVisible(cached >= EXPERIENCES_NAV_THRESHOLD);
      return () => {
        alive = false;
      };
    }

    api
      .get("/experiences/count")
      .then((res) => {
        const parsed = CountSchema.safeParse(res?.data);
        if (!parsed.success) return; // stays hidden
        writeCache(parsed.data.count);
        if (alive) setVisible(parsed.data.count >= EXPERIENCES_NAV_THRESHOLD);
      })
      .catch(() => {
        // Deliberately silent: a hidden nav link is not a user-facing error,
        // and a toast here would surface an infrastructure hiccup as though
        // the reader had done something wrong.
      });

    return () => {
      alive = false;
    };
  }, []);

  return visible;
}
