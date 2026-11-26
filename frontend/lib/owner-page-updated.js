// @ts-check
/**
 * Module:   owner-page-updated
 * Purpose:  Tell the open dashboard screen that the business was saved from
 *           somewhere else on the page (the dashboard assistant's fill), so it
 *           reads the business again instead of showing the old fields.
 *           Also the other direction: a screen asks the assistant to open
 *           with a question (the nudge on the dashboard home).
 * Touches:  window events only.
 * Does NOT: fetch anything — each screen re-reads with its own call.
 * History:  owner assistant (26/11); openOwnerAssistant (26/11, MEH-3902).
 */

import { useEffect, useRef } from "react";

const EVENT = "mehamakor:owner-page-updated";

export function announceOwnerPageUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** @param {() => void} onUpdated */
export function useOwnerPageUpdated(onUpdated) {
  const ref = useRef(onUpdated);
  useEffect(() => {
    ref.current = onUpdated;
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = () => ref.current();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
}

const OPEN_EVENT = "mehamakor:owner-assistant-open";

/** @param {string} [prompt] an `owner_assistant.prompts` key to ask at once */
export function openOwnerAssistant(prompt) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prompt } }));
}

/** @param {(prompt: string | undefined) => void} onOpen */
export function useOpenOwnerAssistant(onOpen) {
  const ref = useRef(onOpen);
  useEffect(() => {
    ref.current = onOpen;
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = (/** @type {Event} */ e) => ref.current(/** @type {CustomEvent} */ (e).detail?.prompt);
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);
}
