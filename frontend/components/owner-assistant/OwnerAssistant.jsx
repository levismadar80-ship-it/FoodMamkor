// @ts-check
"use client";

/**
 * Module:   OwnerAssistant
 * Purpose:  The dashboard assistant's entry: one «עוזרת» button in the
 *           dashboard's tab row (phone and desktop, the same element), and the
 *           panel it opens. Keeps the conversation while the owner moves
 *           between screens and for a week in this browser, tells the server
 *           which screen she is on, and opens on a question when a screen
 *           asks it to (openOwnerAssistant).
 * Touches:  localStorage through lib/owner-assistant-store.js (the API calls
 *           are OwnerAssistantPanel's).
 * Does NOT: render the site chat (components/ChatWidget.jsx, kept off the
 *           dashboard by ChatWidgetLazy so there is one assistant per screen).
 * Placement: in the sticky tab row, not a floating button. MEH-2602 took the
 *           floating chat off dashboard phones because it covered chips and
 *           fields; a button in the row covers nothing and stays reachable on
 *           every screen (Shopify Sidekick sits in the admin's top bar).
 * Related:  app/[locale]/producer/dashboard/DashboardLayoutClient.jsx (mount) ·
 *           lib/owner-pages.js (which screen a URL is)
 * History:  owner assistant (26/11); kept across reloads, opened from the
 *           dashboard home (26/11, MEH-3902).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Sparkle } from "@phosphor-icons/react";
import { usePathname } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import OwnerAssistantPanel from "@/components/owner-assistant/OwnerAssistantPanel";
import { ownerSectionFor } from "@/lib/owner-pages";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";
import { useOpenOwnerAssistant } from "@/lib/owner-page-updated";
import { clearOwnerChat, loadOwnerChat, saveOwnerChat } from "@/lib/owner-assistant-store";

const OPEN_ID = "owner-assistant-open";
/** @typedef {import("./OwnerAssistantPanel").OwnerMessage} Msg */
const EMPTY = /** @type {Msg[]} */ ([]);

/** @param {{ className?: string }} props */
export default function OwnerAssistant({ className = "" }) {
  const t = useTranslations("owner_assistant");
  const pathname = usePathname();
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(/** @type {string | null} */ (null));
  // The conversation carries the user it belongs to: a different user (or
  // none) sees an empty chat at once, and nothing of one person's is ever
  // saved under another's key.
  const [chat, setChat] = useState(/** @type {{ owner: unknown, messages: Msg[] }} */ ({ owner: undefined, messages: [] }));
  const messages = chat.owner === userId ? chat.messages : EMPTY;
  const setMessages = useCallback((/** @type {(m: Msg[]) => Msg[]} */ update) => {
    setChat((c) => ({ owner: userId, messages: update(c.owner === userId ? c.messages : EMPTY) }));
  }, [userId]);
  const [mounted, setMounted] = useState(false);
  const loadedFor = useRef(/** @type {unknown} */ (undefined));

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target and browser storage exist only after mount (hydration)
  useEffect(() => setMounted(true), []);
  // Read the stored conversation once per signed-in user, then keep it saved.
  useEffect(() => {
    if (!userId || loadedFor.current === userId) return;
    loadedFor.current = userId;
    setChat({ owner: userId, messages: loadOwnerChat(userId) });
  }, [userId]);
  useEffect(() => {
    if (userId && chat.owner === userId && chat.messages.length) saveOwnerChat(userId, chat.messages);
  }, [chat, userId]);

  const openPanel = useCallback((/** @type {string | null} */ prompt = null) => {
    setAsk(prompt);
    setOpen(true);
    trackEvent("owner_assistant_open", { section: ownerSectionFor(pathname), from: prompt ? "nudge" : "button" });
  }, [pathname]);
  useOpenOwnerAssistant((prompt) => openPanel(prompt || null));
  const newChat = () => {
    clearOwnerChat(userId);
    setChat({ owner: userId, messages: [] });
  };

  const close = useCallback(() => {
    setOpen(false);
    // Button does not forward a ref (React 18), so focus goes back by its id.
    /** @type {HTMLElement | null} */ (document.querySelector(`[data-testid="${OPEN_ID}"]`))?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => (open ? close() : openPanel())}
        aria-expanded={open}
        data-testid={OPEN_ID}
        className={`shrink-0 inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-w-touch px-1 sm:px-3 py-2 sm:py-3 text-xs sm:text-sm font-medium text-primary ${className}`}
      >
        <Sparkle size={20} aria-hidden="true" />
        <span>{t("button")}</span>
      </Button>
      {/* Portalled: the tab row is sticky with a backdrop blur, which would
          make `fixed` relative to the row instead of the screen. */}
      {mounted && open && createPortal(
        <OwnerAssistantPanel
          messages={messages}
          setMessages={setMessages}
          section={ownerSectionFor(pathname)}
          onClose={close}
          onNewChat={newChat}
          ask={ask}
        />,
        document.body,
      )}
    </>
  );
}
