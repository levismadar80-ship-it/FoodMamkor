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

import { useLayoutEffect, useState } from "react";
import api from "@/lib/api";

/** @typedef {{ loading: boolean, source: object|null }} DuplicateSource */

/**
 * @param {"events"|"experiences"} kind
 * @returns {DuplicateSource}
 */
export default function useDuplicateSource(kind) {
  // The URL is read only after mount (the server has none), and in a layout
  // effect, before the first paint: without ?from the form shows at once with
  // no skeleton; with it the skeleton replaces the form before anyone sees it.
  const [state, setState] = useState(/** @type {DuplicateSource} */ ({ loading: false, source: null }));

  useLayoutEffect(() => {
    let alive = true;
    const fromId = new URLSearchParams(window.location.search).get("from");
    if (!fromId) return undefined;
    setState({ loading: true, source: null });
    const done = (/** @type {object|null} */ source) => {
      if (alive) setState({ loading: false, source });
    };
    api
      .get(`/${kind}/mine`)
      .then((r) => {
        const row = Array.isArray(r.data) ? r.data.find((x) => String(x.id) === fromId) : null;
        // The date is the one thing a repeat never shares; the id would make
        // the form think it is editing. A recurring experience keeps its
        // schedule text on purpose: a weekly workshop repeats as a weekly one.
        done(row ? { ...row, id: undefined, event_date: "" } : null);
      })
      .catch(() => done(null));
    return () => {
      alive = false;
    };
  }, [kind]);

  return state;
}
