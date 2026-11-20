// @ts-check
/**
 * Module:   business-chat
 * Purpose:  Open the site chat for ONE business from that business's page
 *           (MEH-3489). The page has no floating chat button (MEH-1168), so a
 *           button inside the page asks the mounted ChatWidget to open,
 *           scoped to this business.
 * Does NOT: render anything or call the API (ChatWidget.jsx does both), or
 *           decide which business the server reads (routers/chat.py:
 *           a name in the question wins, else this page).
 * History:  MEH-3489 (creation)
 */

import { useEffect } from "react";

export const BUSINESS_CHAT_EVENT = "mehamakor:business-chat";
// The widget is a lazy chunk; a tap before it has mounted would be lost (an
// event has no memory). The last request is kept this long and replayed when
// the widget subscribes.
const REPLAY_MS = 10_000;
/** @type {{ business: { id: string, name: string }, at: number } | null} */
let pending = null;

/** @param {{ id: string, name: string }} business */
export function openBusinessChat(business) {
  if (typeof window === "undefined" || !business?.id) return;
  const detail = { id: business.id, name: business.name || "" };
  pending = { business: detail, at: Date.now() };
  window.dispatchEvent(new CustomEvent(BUSINESS_CHAT_EVENT, { detail }));
}

/**
 * Calls `onOpen({ id, name })` each time a page asks for the business chat.
 * @param {(business: { id: string, name: string }) => void} onOpen
 */
export function useBusinessChatRequest(onOpen) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    /** @param {Event} e */
    const handler = (e) => {
      const detail = /** @type {CustomEvent} */ (e).detail;
      pending = null;
      if (detail?.id) onOpen(detail);
    };
    window.addEventListener(BUSINESS_CHAT_EVENT, handler);
    if (pending && Date.now() - pending.at < REPLAY_MS) {
      const { business } = pending;
      pending = null;
      onOpen(business);
    }
    return () => window.removeEventListener(BUSINESS_CHAT_EVENT, handler);
  }, [onOpen]);
}
