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

import { useEffect, useState } from "react";
import api from "@/lib/api";

/** @typedef {{ loading: boolean, source: object|null }} DuplicateSource */

/**
 * @param {"events"|"experiences"} kind
 * @returns {DuplicateSource}
 */
export default function useDuplicateSource(kind) {
  // Starts loading on every render path, server included, so the first client
  // render matches the server's; the URL is read only after mount.
  const [state, setState] = useState(/** @type {DuplicateSource} */ ({ loading: true, source: null }));

  useEffect(() => {
    let alive = true;
    const done = (/** @type {object|null} */ source) => {
      if (alive) setState({ loading: false, source });
    };
    const fromId = new URLSearchParams(window.location.search).get("from");
    if (!fromId) {
      done(null);
      return undefined;
    }
    api
      .get(`/${kind}/mine`)
      .then((r) => {
        const row = Array.isArray(r.data) ? r.data.find((x) => String(x.id) === fromId) : null;
        // The date is the one thing a repeat never shares; the id would make
        // the form think it is editing.
        done(row ? { ...row, id: undefined, event_date: "" } : null);
      })
      .catch(() => done(null));
    return () => {
      alive = false;
    };
  }, [kind]);

  return state;
}
