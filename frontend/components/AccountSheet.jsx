"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Heart, Gear, Storefront, SignIn, SignOut, Globe, User } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import LanguageToggle from "@/components/LanguageToggle";

/**
 * Module:   AccountSheet
 * Purpose:  MEH-789 (Phase 6 "Cream Signature" nav system) warm-dark account
 *           sheet — the secondary-actions surface opened from the bottom
 *           pill's account tab (favorites / settings / language / logout + a
 *           quiet "יש לך בית עסק?" entry). Inherits the retired hamburger
 *           drawer's green-900 DNA, demoted to secondary duty.
 * Touches:  next-intl (labels), LanguageToggle (locale flip, reused 1:1).
 * Does NOT: own primary navigation (that's the pill in BottomNav.jsx); render
 *           on desktop (md:hidden); persist anything; route the account tab.
 * Related:  frontend/components/BottomNav.jsx (sole caller + the trigger),
 *           frontend/components/LanguageToggle.jsx (embedded language row),
 *           frontend/components/Header.jsx (legacy drawer it supersedes —
 *           removed in the Header minimal-top PR, MEH-789 PR-B).
 * History:  MEH-789 (creation, 2026-06-10; bottom nav system port, PR-A).
 */
export default function AccountSheet({ open, onClose, user, logout, showBiz }) {
  const t = useTranslations();
  const panelRef = useRef(null);
  const isIn = !!user;
  const hasAvatar = !!user?.avatar_url;
  const initial = user ? (user.name || "?").trim().charAt(0).toUpperCase() : null;

  // Modal a11y: Escape closes, Tab is trapped inside the panel, and focus
  // returns to the trigger (the account tab) on close.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement;
    const items = () =>
      panelRef.current
        ? panelRef.current.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')
        : [];
    items()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prevActive instanceof HTMLElement) prevActive.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  // Border lives on the <li> (last:border-b-0 works there); the interactive
  // row carries layout + ink only.
  const liCls = "border-b border-white/10 last:border-b-0";
  const rowCls =
    "flex items-center gap-3 w-full min-h-[48px] px-1 text-start text-[14.5px] font-medium text-background transition-colors duration-fast ease-quart motion-reduce:transition-none focus-ring";
  const iconCls = "text-background/65";

  return (
    <div className="md:hidden">
      {/* Scrim — click to close. Sits above the pill (z-1000), below the panel. */}
      <button
        type="button"
        aria-label={t("nav.menu_close")}
        onClick={onClose}
        className="fixed inset-0 z-[1001] bg-green-900/50"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.account")}
        dir="rtl"
        className="fixed inset-x-4 bottom-[88px] z-[1002] rounded-[20px] bg-green-900 border border-white/10 p-[22px] shadow-[0_12px_40px_rgba(20,50,40,0.45)]"
      >
        {/* Head — avatar · name · state */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <span className="w-10 h-10 rounded-full overflow-hidden inline-flex items-center justify-center bg-white/10 border border-white/30 text-background">
            {isIn ? (
              hasAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-headline-md font-bold text-lg leading-none">{initial}</span>
              )
            ) : (
              <User size={20} weight="regular" aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="font-headline-md font-bold text-lg text-background m-0">
              {isIn ? user.name : t("account.sheet.guest_name")}
            </p>
            <p className="text-xs text-background/60 mt-0.5">
              {isIn ? t("account.sheet.connected") : t("account.sheet.guest_sub")}
            </p>
          </div>
        </div>

        {/* Secondary rows */}
        <ul className="list-none m-0 pt-1">
          {!isIn && (
            <li className={liCls}>
              <Link href="/login" onClick={onClose} className={rowCls}>
                <SignIn size={19} weight="regular" className={iconCls} aria-hidden="true" />
                {t("nav.login")}
              </Link>
            </li>
          )}
          <li className={liCls}>
            <Link href="/favorites" onClick={onClose} className={rowCls}>
              <Heart size={19} weight="regular" className={iconCls} aria-hidden="true" />
              {t("nav.favorites")}
            </Link>
          </li>
          <li className={liCls}>
            <Link href="/settings" onClick={onClose} className={rowCls}>
              <Gear size={19} weight="regular" className={iconCls} aria-hidden="true" />
              {t("account.menu.settings")}
            </Link>
          </li>
          {showBiz && (
            <li className={liCls}>
              {/* Quiet "for businesses" entry — gold icon + ↗ only. MEH-669-gated. */}
              <Link href="/register/producer" onClick={onClose} className={rowCls}>
                <Storefront size={19} weight="regular" className="text-amber-200" aria-hidden="true" />
                {t("account.sheet.biz_cta")}
                <span className="ms-auto font-english italic text-base text-amber-200" aria-hidden="true">
                  ↗
                </span>
              </Link>
            </li>
          )}
          {/* Language — not a button (embeds the LanguageToggle control 1:1). */}
          <li className={liCls}>
            <div className={rowCls + " text-background/65 text-[13.5px]"}>
              <Globe size={19} weight="regular" className={iconCls} aria-hidden="true" />
              {t("nav.language")}
              <span className="ms-auto inline-flex items-center gap-1.5">
                <span className="font-english text-[13px] text-background/70" dir="ltr" aria-hidden="true">
                  עב / EN
                </span>
                <LanguageToggle className="text-background hover:bg-white/10" />
              </span>
            </div>
          </li>
          {isIn && (
            <li className={liCls}>
              <button
                type="button"
                onClick={() => {
                  logout();
                  onClose();
                }}
                className={rowCls + " text-background/65 text-[13.5px]"}
              >
                <SignOut size={19} weight="regular" className={iconCls} aria-hidden="true" />
                {t("nav.logout")}
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
