// @ts-check
"use client";

/**
 * Module:   use-duplicate-source
 * Purpose:  «שכפול» on the events / experiences list opens the create form at
 *           `?from=<id>`. This hook finds that row among the owner's own items
 *           and returns it as a create-form seed: every field kept, the date
 *           cleared, the id dropped. Nothing is saved until she presses create.
 * Does NOT: fetch by id. The row is looked up in `/events/mine` or
 *           `/experiences/mine`, so an id that is not hers (or a typo) gives
 *           no seed and the form opens empty, never someone else's item.
 * Related:  components/EventForm.jsx seed() · components/ExperienceForm.jsx
 *           seed(); both read `initial` in create mode as well as edit.
 * History:  MEH-3438 (creation).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import api from "@/lib/api";

/** @typedef {{ loading: boolean, source: object|null }} DuplicateSource */

const noSubscribe = () => () => {};
const readFromId = () => new URLSearchParams(window.location.search).get("from");

/**
 * @param {"events"|"experiences"} kind
 * @returns {DuplicateSource}
 */
export default function useDuplicateSource(kind) {
  // The server has no URL: its snapshot is null. On a client navigation (the
  // «שכפול» link) the id is there on the first render, so the skeleton shows
  // at once and an empty form never flashes.
  const fromId = useSyncExternalStore(noSubscribe, readFromId, () => null);
  const [result, setResult] = useState(/** @type {{ forId: string|null, source: object|null }} */ ({ forId: null, source: null }));

  useEffect(() => {
    if (!fromId) return undefined;
    let alive = true;
    const done = (/** @type {object|null} */ source) => {
      if (alive) setResult({ forId: fromId, source });
    };
    // Two literal paths, so the API contract audit can match each to its route.
    const request = kind === "events" ? api.get("/events/mine") : api.get("/experiences/mine");
    request
      .then((r) => {
        const row = Array.isArray(r.data) ? r.data.find((x) => String(x.id) === fromId) : null;
        // The date is the one thing a repeat never shares; the id would make
        // the form think it is editing. A recurring experience keeps its
        // schedule text on purpose: a weekly workshop repeats as a weekly one.
        // MEH-3447: its listed dates are dates too, and carry the source's
        // sign-up counts — a copy starts with none.
        done(row ? { ...row, id: undefined, event_date: "", sessions: [] } : null);
      })
      .catch(() => done(null));
    return () => {
      alive = false;
    };
  }, [fromId, kind]);

  const settled = !fromId || result.forId === fromId;
  return { loading: !settled, source: settled && fromId ? result.source : null };
}
