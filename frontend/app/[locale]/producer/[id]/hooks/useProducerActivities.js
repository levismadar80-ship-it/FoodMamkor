// @ts-check
/**
 * Module:   useProducerActivities
 * Purpose:  The business page's upcoming events, experiences and open group
 *           buys, read together so the page paints them in one go instead of
 *           inserting each list above the reviews and delivery as it lands.
 * Does NOT: render them (components/ProducerActivities.jsx), and does not read
 *           the producer itself (useProducerData.js).
 * Related:  app/[locale]/[slug]/page.js (getProducerActivities — the server
 *           seeds `initial`, so the slug route reads nothing in the browser) ·
 *           ProducerDetail.jsx (the client route waits for `ready`).
 * History:  MEH-3819 (creation). On a phone deep-linked to #reviews the three
 *           lists landing one by one moved the page by ~0.8 CLS (24/11).
 */
import { useEffect, useState } from "react";

import api from "@/lib/api";

// The page waits this long at most. A slower list arrives late (one shift,
// as before MEH-3819) rather than holding the whole page on its loading line.
export const ACTIVITIES_WAIT_MS = 2500;

/**
 * A failed read is an empty list, as it was before: the section hides.
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
    // The server already answered for this business (slug route).
    if (!producerId || initial) return undefined;
    let cancelled = false;
    const id = encodeURIComponent(producerId);
    /** @param {string} path */
    const list = (path) =>
      api
        .get(path)
        .then((r) => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []);
    const cap = setTimeout(() => {
      if (!cancelled) setState((s) => (s.ready ? s : { ...s, ready: true }));
    }, ACTIVITIES_WAIT_MS);
    Promise.all([
      list(`/events?producer_id=${id}`),
      list(`/experiences?producer_id=${id}`),
      list(`/group-buys?producer_id=${id}`),
    ]).then(([events, experiences, groupBuys]) => {
      clearTimeout(cap);
      if (!cancelled) setState({ events, experiences, groupBuys, ready: true });
    });
    return () => {
      cancelled = true;
      clearTimeout(cap);
    };
  }, [producerId, initial]);

  return state;
}
