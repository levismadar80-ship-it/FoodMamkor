"use client";

import { useTranslations } from "next-intl";
import { ShareNetwork, LinkSimple, EnvelopeSimple, Check } from "@phosphor-icons/react";
import { showToast } from "@/lib/toast";
import { SITE_URL } from "@/lib/env";
import { BRAND_NAME } from "@/lib/constants";
import { tryNativeShare } from "@/lib/share-link";

/**
 * Module:   ShareSiteActions
 * Purpose:  The ONE way the site asks a reader to share: a «שתפו» button that
 *           opens the phone's own share sheet (WhatsApp, Instagram, Facebook…
 *           are all inside it), with copy-link as the fallback where there is
 *           no sheet. `full` adds copy-link + email cards under it.
 * Touches:  navigator.share · navigator.clipboard · mailto.
 * Does NOT: offer a WhatsApp-only share (Sapir 08/11 — sharing is the generic
 *           sheet; contact-the-business WhatsApp buttons are a different thing
 *           and live elsewhere) or share a single business page (ShareButton.jsx).
 * Related:  app/[locale]/share/ShareClient.jsx (the «ספרו עלינו» section on
 *           /recommend) · components/Footer.jsx (after the newsletter) ·
 *           components/RegistrationCta.jsx (after an event sign-up).
 * History:  MEH-1160 (actions created in ShareClient) · MEH-1220/1223 (silent
 *           mailto + honest copy toasts) · MEH-2827 PR 5 (extracted, one
 *           «שתפו» replaces the WhatsApp button and «עוד דרכים לשתף»).
 */

// Silent-mailto detection window. mailto: fails silently on desktops with no
// mail handler (no error, no navigation) — if neither "blur" nor a
// visibilitychange-to-hidden fires within this window after a click, we treat
// it as "no handler opened" and run the clipboard fallback.
const MAIL_FALLBACK_MS = 1200;

// MEH-1223: real success — execCommand can return false OR throw, so a double
// failure must be reported as one, never as «הועתק».
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  }
}

const SHARE_TONE = {
  light: "bg-primary text-background hover:bg-primary-dark",
  dark: "bg-background text-primary hover:bg-surface-card",
};

const CARD_CLASSES =
  "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-card px-2 py-3 min-h-[72px] text-xs font-medium text-text text-center leading-tight hover:border-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/**
 * @param {object} props
 * @param {"full"|"compact"} [props.layout] full = «שתפו» + copy/email cards; compact = «שתפו» only.
 * @param {"light"|"dark"} [props.tone] dark = on a bg-primary-dark surface (the footer).
 * @param {string} [props.url] what is shared; the site root by default.
 * @param {string} [props.title] share-sheet title; the brand by default.
 * @param {string} [props.message] text for the copy/email paths (the native sheet gets title + url only); the site message by default. Pass "" for none.
 */
export default function ShareSiteActions({
  layout = "full",
  tone = "light",
  url = SITE_URL,
  title = BRAND_NAME,
  message,
  className = "",
}) {
  const t = useTranslations("share_page");
  const tShare = useTranslations("share");
  const text = message ?? t("message", { url });

  const copyLink = async () => {
    if (await copyText(url)) {
      showToast.success(t("copy_toast"), { icon: <Check size={18} /> });
    } else {
      showToast.error(t("copy_failed_toast"));
    }
  };

  // Native sheet first; a cancelled sheet is the reader's answer, so it never
  // falls through to a copy. No sheet (most desktops) → copy the link.
  // MEH-2827 PR 6: the sheet gets the title and the URL ONLY as `url`. With
  // the URL also inside `text` (share_page.message ends with it), iOS can
  // share it as plain text with a generic compass icon instead of a link
  // card with the preview image. The message stays for copy/email.
  const share = async () => {
    // MEH-2996: lib/share-link.js owns the sequence. A sheet that refuses
    // (not a cancel) now falls through to the copy, as on every other page.
    if ((await tryNativeShare({ title, url })) === "unavailable") await copyLink();
  };

  // MEH-1220: the email action is a real <a href=mailto>, so a present handler
  // opens as before (no preventDefault). With no handler, mailto: does nothing;
  // a timer races window blur / visibilitychange, and if the timer wins the
  // message is copied with a toast saying so. Listeners are removed on every path.
  const handleEmailClick = () => {
    let timer;
    const removeListeners = () => {
      window.removeEventListener("blur", onHandlerOpened);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    const onHandlerOpened = () => {
      clearTimeout(timer);
      removeListeners();
    };
    const onVisibility = () => {
      if (document.hidden) onHandlerOpened();
    };
    window.addEventListener("blur", onHandlerOpened);
    document.addEventListener("visibilitychange", onVisibility);
    timer = setTimeout(async () => {
      removeListeners();
      const copied = await copyText(text || url);
      showToast.error(copied ? t("email_fallback_toast") : t("email_copy_failed_toast"));
    }, MAIL_FALLBACK_MS);
  };

  const shareButton = (
    <button
      type="button"
      onClick={share}
      data-testid="share-native"
      className={`flex w-full items-center justify-center gap-2 rounded-lg ${SHARE_TONE[tone] ?? SHARE_TONE.light} ${layout === "full" ? "min-h-[52px] text-base" : "min-h-touch text-sm"} px-4 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
    >
      <ShareNetwork size={18} aria-hidden="true" />
      {tShare("trigger")}
    </button>
  );

  if (layout === "compact") {
    return <div className={className} data-testid="share-site-actions">{shareButton}</div>;
  }

  const mailHref = `mailto:?subject=${encodeURIComponent(t("email_subject"))}&body=${encodeURIComponent(text || url)}`;

  return (
    <div className={className} data-testid="share-site-actions">
      {shareButton}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={copyLink} className={CARD_CLASSES} data-testid="share-copy">
          <LinkSimple size={22} aria-hidden="true" className="text-primary" />
          {t("copy")}
        </button>
        <a href={mailHref} onClick={handleEmailClick} className={CARD_CLASSES} data-testid="share-email">
          <EnvelopeSimple size={22} aria-hidden="true" className="text-primary" />
          {t("email")}
        </a>
      </div>
    </div>
  );
}
