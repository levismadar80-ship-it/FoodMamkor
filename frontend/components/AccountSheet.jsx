"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Heart, Gear, Storefront, SignIn, SignOut, User, ArrowUpLeft, Gauge, Lock } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import LanguageToggle from "@/components/LanguageToggle";
import { itemsForSurface } from "@/lib/nav-registry";

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
 * History:  MEH-789 (creation, 2026-06-10; bottom nav system port, PR-A);
 *           MEH-868 (chrome polish: "↗" dingbat → Phosphor ArrowUpLeft;
 *           static non-interactive language row; safe-area-derived sheet
 *           offset);
 *           MEH-908 (logout copy → gerund "התנתקות" via shared
 *           account.menu.logout; deduped language row — dropped redundant
 *           leading Globe + "שפה" label, LanguageToggle is the single control).
 *           MEH-1703 chunk 3 (rows are derived from lib/nav-registry — which
 *           row exists, its href and its i18n key now have ONE declaration;
 *           order, icons and markup stay here because they genuinely differ
 *           per shell. The `showBiz` prop is gone: it was a second owner of
 *           the MEH-669 gate that the registry spells as audience "consumer").
 */
export default function AccountSheet({ open, onClose, user, logout }) {
  const t = useTranslations();
  const panelRef = useRef(null);
  const isIn = !!user;
  const hasAvatar = !!user?.avatar_url;
  const initial = user ? (user.name || "?").trim().charAt(0).toUpperCase() : null;

  // MEH-1703 chunk 3: which rows this sheet offers, and their hrefs/i18n keys,
  // come from the registry — the shell no longer restates them. `row(id)`
  // returns the record when the current audience earns it and undefined
  // otherwise, so each <li> below reads as an existence question.
  //
  // Order is NOT derived: the sequence is the JSX order below, because the
  // sheet's order differs from the desktop dropdown's and no single
  // declaration order describes both (the chunk-0 finding — see
  // lib/nav-registry.js's SHAPE NOTE). Icons and markup stay here for the
  // same reason.
  //
  // MEH-669's producer/admin exclusion is the registry's audience "consumer"
  // (nav-registry.js:76-77), which is why `showBiz` no longer crosses the
  // prop boundary — one owner, not two.
  const byId = new Map(
    itemsForSurface("accountSheet", {
      signedIn: isIn,
      role: user?.role ?? null,
    }).map((entry) => [entry.item.id, entry]),
  );
  const row = (id) => byId.get(id);

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
        // MEH-868: clear the floating pill AND the safe-area inset (the pill
        // itself rides above safe-area via calc(env(safe-area-inset-bottom)+16px),
        // so a flat 88px overlapped it on notched devices).
        className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[1002] rounded-[20px] bg-green-900 border border-white/10 p-[22px] shadow-[0_12px_40px_rgba(20,50,40,0.45)]"
      >
        {/* Head — avatar · name · state */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <span className="w-10 h-10 rounded-full overflow-hidden inline-flex items-center justify-center bg-white/10 border border-white/30 text-background">
            {isIn ? (
              hasAvatar ? (
                // raw img: OAuth provider avatar — host not in remotePatterns
                // (frozen this ticket).
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
          {row("login") && (
            <li className={liCls}>
              <Link href={row("login").item.href} onClick={onClose} className={rowCls}>
                <SignIn size={19} weight="regular" className={iconCls} aria-hidden="true" />
                {t(row("login").surface.labelKey)}
              </Link>
            </li>
          )}
          {/* MEH-2070 (A-narrow): the admin entry. It sat on the desktop
              dropdown only, so an admin on a phone had no route into /admin at
              all — manual approval is a LOCK, and a solo operator has to be
              able to clear the queue from a phone. Audience "admin" comes from
              the registry, so a consumer or producer sheet is unchanged. */}
          {row("admin") && (
            <li className={liCls}>
              <Link href={row("admin").item.href} onClick={onClose} className={rowCls}>
                <Lock size={19} weight="regular" className={iconCls} aria-hidden="true" />
                {t(row("admin").surface.labelKey)}
              </Link>
            </li>
          )}
          {/* MEH-1228: producer dashboard entry — first row (above favorites),
              mirroring the desktop UserMenu order. Guest/consumer sheets are
              unchanged (the registry gives this row audience "producer"). */}
          {row("producerDashboard") && (
            <li className={liCls}>
              <Link href={row("producerDashboard").item.href} onClick={onClose} className={rowCls}>
                <Gauge size={19} weight="regular" className={iconCls} aria-hidden="true" />
                {t(row("producerDashboard").surface.labelKey)}
              </Link>
            </li>
          )}
          {/* Ungated on purpose — a signed-out mobile reader sees both rows,
              while the desktop dropdown auth-gates them. The asymmetry is
              recorded on the records themselves (nav-registry.js:213-227) and
              is NOT changed here; MEH-1703 is a refactor. */}
          {row("favorites") && (
            <li className={liCls}>
              <Link href={row("favorites").item.href} onClick={onClose} className={rowCls}>
                <Heart size={19} weight="regular" className={iconCls} aria-hidden="true" />
                {t(row("favorites").surface.labelKey)}
              </Link>
            </li>
          )}
          {row("settings") && (
            <li className={liCls}>
              <Link href={row("settings").item.href} onClick={onClose} className={rowCls}>
                <Gear size={19} weight="regular" className={iconCls} aria-hidden="true" />
                {t(row("settings").surface.labelKey)}
              </Link>
            </li>
          )}
          {row("registerProducer") && (
            <li className={liCls}>
              {/* Quiet "for businesses" entry — gold icon + outbound arrow. MEH-669-gated. */}
              <Link href={row("registerProducer").item.href} onClick={onClose} className={rowCls}>
                {/* MEH-730: gold-on-dark token replaces the amber-200 stopgap. */}
                <Storefront size={19} weight="regular" className="text-gold-on-dark" aria-hidden="true" />
                {t(row("registerProducer").surface.labelKey)}
                {/* MEH-868: raw "↗" dingbat → Phosphor ArrowUpLeft (RTL-correct
                    onward diagonal; ms-auto pins it to the row end).
                    MEH-877: KEPT (not bidi-flipped) — design intent is a diagonal
                    outbound/external-link arrow, direction-neutral by convention
                    (not an rtl.md-listed exception). */}
                <ArrowUpLeft size={16} weight="bold" className="ms-auto text-gold-on-dark" aria-hidden="true" />
              </Link>
            </li>
          )}
          {/* Language row.
              MEH-908: dropped the redundant leading Globe + "שפה" label; the
              LanguageToggle already renders its own Globe (single control),
              and "עב / EN" reads as the language affordance on its own.
              MEH-1196: dropped the leftover `ms-auto` wrapper that pushed this
              row to the OPPOSITE (END) edge from its siblings.
              MEH-1279: MEH-1196 fixed the SIDE but not the GEOMETRY — the
              embedded LanguageToggle was a 36px circle chip, so its Globe sat
              ~8px inside the sibling icon line and inflated the row height. The
              row is now the toggle itself (`variant="bare"` → bare Globe 19)
              carrying rowCls — geometrically identical to the SignOut row (same
              min-h-[48px], gap-3, start line, /65 tertiary tier) and a single
              full-row tap target (≥44px). "עב / EN" moves inside as the visible
              affordance label (aria-hidden — the button's aria-label already
              names the switch action). */}
          {row("language") && (
            <li className={liCls}>
              <LanguageToggle
                variant={row("language").surface.variant}
                className={rowCls + " text-background/65 text-[13.5px] hover:bg-white/10"}
              >
                {/* MEH-1542: full native language names replace the "עב / EN"
                    abbreviation — W3C / NN/g best practice (language named in its
                    own script, no flags). Text-only change; dir="ltr" keeps the
                    Hebrew-then-English visual order and order logic is untouched. */}
                <span className="font-english" dir="ltr" aria-hidden="true">
                  עברית / English
                </span>
              </LanguageToggle>
            </li>
          )}
          {row("logout") && (
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
                {/* MEH-908: gerund "התנתקות" (ADR-014) via the shared
                    account.menu.logout key — neutral, aligns with the
                    noun-based sheet items, and fixes desktop UserMenu in one
                    place (both surfaces read the same key). */}
                {t(row("logout").surface.labelKey)}
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
