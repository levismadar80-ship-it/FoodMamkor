// @ts-check
import EventsClient from "../events/EventsClient";

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
export default function WhatsOnLayout({ children }) {
  return (
    <>
      <EventsClient />
      {children}
    </>
  );
}
