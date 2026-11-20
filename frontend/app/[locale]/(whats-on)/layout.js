// @ts-check
import EventsClient from "../events/EventsClient";
import { serverFetch } from "@/lib/server-fetch";
import { API_URL } from "@/lib/env";

/**
 * Module:   (whats-on)/layout
 * Purpose:  MEH-3463 — /events and /experiences are two URLs of ONE screen.
 *           This layout renders that screen once (EventsClient: hero, tab row,
 *           filters, list) and keeps it mounted while the URL moves between
 *           the two pages, so a tab switch is a plain Next navigation with no
 *           whole-page loader and no remount.
 * Does NOT: decide the tab. EventsClient reads it from the URL (usePathname);
 *           the two pages only carry the route and its metadata.
 * Related:  app/[locale]/events/EventsClient.jsx, e2e/flows/46-hub-tab-switch.spec.ts.
 * History:  MEH-3463 (creation). Replaces MEH-2980's in-place history.pushState,
 *           which showed one URL with the other page's tree and left the screen
 *           half events, half experiences on a phone (20/11).
 */
export default async function WhatsOnLayout({ children }) {
  // MEH-2233: both lists are read here, on the server, so the first HTML
  // already holds the rows. Before, the list waited for the JS bundle and a
  // client request: the LCP (a row's text) landed at ~6.3s on a phone
  // (staging 20/11, slow 4G + CPU x4). The layout does not know the tab, so it
  // reads both; each is cached for 60s (ISR), like the home page's feed.
  const [events, experiences] = await Promise.all([firstList("/events"), firstList("/experiences")]);
  return (
    <>
      <EventsClient initialRows={{ events, experiences }} />
      {children}
    </>
  );
}

const FIRST_PAINT_TIMEOUT_MS = 2500;

/**
 * The unfiltered list, or null on any failure — null tells EventsClient to
 * fetch it itself, exactly as before (a backend blip never becomes an error
 * page or an empty list).
 * @param {string} path
 */
async function firstList(path) {
  try {
    // One short attempt: the HTML waits on it, and a miss only means the client
    // fetches (serverFetch's defaults, 8s × 3, could hold a cold page ~25s).
    const res = await serverFetch(`${API_URL}${path}`, { next: { revalidate: 60 } }, { timeoutMs: FIRST_PAINT_TIMEOUT_MS, retries: 0 });
    if (!res.ok) return null;
    const json = await res.json();
    // Every row an object with an id: a malformed row must not break the server render.
    return Array.isArray(json) && json.every((x) => !!x && typeof x === "object" && "id" in x) ? json : null;
  } catch {
    return null;
  }
}
