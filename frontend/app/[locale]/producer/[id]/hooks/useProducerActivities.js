// @ts-check
/**
 * Module:   useProducerActivities
 * Purpose:  The business page's upcoming events, experiences and open group
 *           buys, read together so the page paints them in one go instead of
 *           inserting each list above the reviews and delivery as it lands.
 * Does NOT: render them (components/ProducerActivities.jsx), and does not read
 *           the producer itself (useProducerData.js).
 * Related:  app/[locale]/[slug]/page.js (getProducerActivities — the server
 *           seeds `initial`, so the slug route paints at once and refreshes
 *           the lists once after mount) ·
 *           ProducerDetail.jsx (the client route waits for `ready`).
 * History:  MEH-3819 (creation). On a phone deep-linked to #reviews the three
 *           lists landing one by one moved the page by ~0.8 CLS (24/11).
 */
import { useEffect, useState } from "react";

import api from "@/lib/api";

// The page waits this long at most. A slower list arrives late (one shift,
// as before MEH-3819) rather than holding the whole page on its loading line.
export const ACTIVITIES_WAIT_MS = 2500;

/** @param {{ events: any[], experiences: any[], groupBuys: any[] }} a @param {{ events: any[], experiences: any[], groupBuys: any[] }} b */
function sameLists(a, b) {
  return JSON.stringify([a.events, a.experiences, a.groupBuys]) ===
    JSON.stringify([b.events, b.experiences, b.groupBuys]);
}

/**
 * A failed read is an empty list, as it was before: the section hides
 * (except on a refresh of server-sent lists, which keeps them).
 *
 * @param {{ producerId?: string | null, initial?: { events: any[], experiences: any[], groupBuys: any[] } | null }} args
 */
export function useProducerActivities({ producerId, initial = null }) {
  const [state, setState] = useState(() =>
    initial
      ? { ...initial, ready: true }
      : { events: [], experiences: [], groupBuys: [], ready: false },
  );

  useEffect(() => {
    if (!producerId) return undefined;
    // The slug route's lists come from an ISR page that can be minutes or
    // hours old (an event that is over, a group buy past its deadline, an old
    // join count). They paint at once; one read after mount refreshes them, and
    // the state changes only when an answer differs, so a fresh page never moves.
    const refresh = Boolean(initial);
    let cancelled = false;
    const id = encodeURIComponent(producerId);
    /** @param {string} path */
    const list = (path) =>
      api
        .get(path)
        .then((r) => (Array.isArray(r.data) ? r.data : null))
        .catch(() => null);
    const cap = refresh ? undefined : setTimeout(() => {
      if (!cancelled) setState((s) => (s.ready ? s : { ...s, ready: true }));
    }, ACTIVITIES_WAIT_MS);
    Promise.all([
      list(`/events?producer_id=${id}`),
      list(`/experiences?producer_id=${id}`),
      list(`/group-buys?producer_id=${id}`),
    ]).then(([events, experiences, groupBuys]) => {
      clearTimeout(cap);
      if (cancelled) return;
      setState((s) => {
        // A failed read is an empty list on the client route; on a refresh it
        // keeps what the server sent rather than hiding a section.
        const keep = (/** @type {any[] | null} */ got, /** @type {any[]} */ had) => got ?? (refresh ? had : []);
        const next = {
          events: keep(events, s.events),
          experiences: keep(experiences, s.experiences),
          groupBuys: keep(groupBuys, s.groupBuys),
          ready: true,
        };
        return refresh && sameLists(s, next) ? s : next;
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(cap);
    };
  }, [producerId, initial]);

  return state;
}
