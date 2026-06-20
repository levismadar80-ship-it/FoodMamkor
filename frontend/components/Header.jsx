"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations, useLocale } from "next-intl";
import { MagnifyingGlass, ArrowUpLeft, SealCheck } from "@phosphor-icons/react";
import { BRAND_NAME } from "@/lib/constants";
import LanguageToggle from "@/components/LanguageToggle";

/**
 * Header — MEH-643 (S3 chunk 4) floating-pill navbar. Global chrome,
 * mounted once in app/[locale]/layout.js. Replaces the MEH-29 full-width
 * sticky bar with a centered floating pill, while preserving every
 * auth-aware behavior the bar carried (MEH-39 UserMenu, MEH-669 CTA role
 * gate, MEH-475 LanguageToggle, "/" search shortcut). The email-verify
 * banner was extracted to VerifyBanner.jsx (MEH-731) so it no longer grows
 * the floating band. usePathname comes from @/i18n/navigation (locale-
 * stripped: "/" on /he and /en) — next/navigation's is locale-prefixed and
 * broke isHomepage/isActive on the homepage (MEH-731).
 *
 * Positioning (unchanged from MEH-29 — preserved by decision): the
 * <header> is `sticky top-0` and reserves its own height, so <main>
 * content always flows below it (no per-page padding). The band itself is
 * transparent; only the inner pill carries fill — that yields the
 * "floating" look without making the header overlap content.
 *
 * Two surface states (reuse MEH-29 scroll machinery verbatim):
 *   - over-image  → `transparent = isHomepage && scrollY < 60`: pill is
 *     transparent, nav ink light (`text-background`), inner darkening
 *     gradient kept for legibility over the hero photo, logo inverted.
 *   - pill (glass) → scrolled OR any inner page (no hero): MEH-732 pill-only
 *     glass — translucent cream (`bg-background/85`) + 12px backdrop-blur where
 *     supported, solid `bg-background` fallback via `supports-[backdrop-filter]`,
 *     1px `border-border`, green resting shadow, dark ink. Layout is MEH-732
 *     Composition B (flex space-between: lead group [logo + links] · action
 *     cluster) across both states.
 *
 * LOCKs: no shadow-lift on hover (MEH-638 — hover = color/bg shift only);
 * active link = gold underline. MEH-732 SUPERSEDES the MEH-638 "no glass"
 * lock for the pill (pill-only glass, never a full-width band). Transition
 * never animates backdrop-filter (background + shadow only).
 *
 * MEH-789 PR-B: the mobile hamburger + drawer were RETIRED — BottomNav
 * (PR-A) owns mobile navigation; its AccountSheet carries favorites /
 * settings / language / logout / the add-business entry. Mobile header
 * chrome is now logo + search only. Desktop nav is untouched.
 */
export default function Header() {
  const { user, logout } = useAuth();
  const t = useTranslations();
  // MEH-884: the trust-strip copy lives only in he.json this chunk (en → MEH-472),
  // and request.js loads each locale's own messages with no he-fallback — so the
  // strip is gated to Hebrew to avoid rendering the raw `nav.trust_strip` key on /en.
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // MEH-734/MEH-884: scroll direction drives the homepage trust strip —
  // collapse on scroll-down past the threshold, expand on scroll-up / at-top.
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const rafRef = useRef(null);
  const userMenuRef = useRef(null);
  const lastYRef = useRef(0);
  const headerRef = useRef(null);

  // MEH-39: close the avatar dropdown when the user clicks outside it.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocMouseDown = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [userMenuOpen]);

  // Close the avatar dropdown on route change so it doesn't look stuck
  // during the fade. (MEH-789 PR-B: the drawer's menuOpen reset left with it.)
  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  // MEH-29: rAF-throttled scroll listener. MEH-732: threshold 80 → 60px.
  // MEH-734/MEH-884: the same callback also drives the homepage trust strip's
  // collapse flag — direction-tracked off the existing 60px threshold (no
  // second constant, no second listener). At/above the threshold, or while
  // focus is inside the header, the strip stays expanded; past it, scrolling
  // down collapses it and any scroll up re-expands. (MEH-789 PR-B removed the
  // mobile drawer, so there's no drawer-open state left to pin against.)
  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const past = y >= 60;
        setScrolled(past);
        const focusWithin = headerRef.current?.contains(document.activeElement);
        if (!past || focusWithin) setStripCollapsed(false);
        else if (y > lastYRef.current) setStripCollapsed(true);
        else if (y < lastYRef.current) setStripCollapsed(false);
        lastYRef.current = y;
        rafRef.current = null;
      });
    };
    // MEH-734: seed last-Y with the restored position so a reload / back-
    // forward at a scrolled offset isn't read as a downward delta (which
    // would collapse the strip on mount with no user gesture).
    lastYRef.current = window.scrollY;
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Press "/" outside an input to open search.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/") return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (document.activeElement?.isContentEditable) return;
      e.preventDefault();
      router.push("/search?focus=1");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  const isProducer = user?.role === "producer";
  // MEH-669: hide "add business" CTA from producers + admins (server guard
  // at auth.py:432 is the authority; this is defense-in-depth UX).
  const isAdmin = user?.role === "admin";
  const showAddBusinessCta = !isProducer && !isAdmin;

  // MEH-643: navbar uses nav.explore (not nav.discover). MEH-732: both keys
  // de-masculinized to "גלו" (ADR-014 plural-voice for nav chrome) — nav.explore
  // here, nav.discover on the BottomNav home tab.
  const NAV_ITEMS = [
    { href: "/", label: t("nav.explore") },
    { href: "/map", label: t("nav.map") },
    { href: "/about", label: t("nav.about") },
  ];

  const isHomepage = pathname === "/";
  // MEH-732: hide the guest login link on /login (locale-stripped pathname).
  const isLoginPage = pathname === "/login";
  const transparent = isHomepage && !scrolled;

  const isActive = (href) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const textShadow = transparent ? { textShadow: "0 1px 4px rgba(0,0,0,0.6)" } : undefined;

  return (
    <header
      ref={headerRef}
      // MEH-884: hide-on-scroll detached — the nav STAYS sticky at the top
      // (no slide-out) and still fades transparent→solid on the homepage.
      // Chunk 2 re-purposed the retained scroll-direction machinery
      // (stripCollapsed / lastYRef) to collapse/expand the homepage trust strip.
      className={[
        "sticky top-0 z-[1000]",
      ].join(" ")}
    >
      {/* Local darkening gradient — only over the hero (transparent). Keeps
          light nav ink legible regardless of the hero crop. pointer-events
          off so taps pass to the pill. */}
      {transparent && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 70%, transparent 100%)",
          }}
        />
      )}

      {/* Nav-shell — stacks the trust strip above the centered pill; the
          transparent band reserves height. flex-col + items-center keeps the
          pill centering identical to the prior justify-center row. */}
      <div className="relative flex flex-col items-center px-5 sm:px-6 pt-5 sm:pt-8 pb-2">
        {/* MEH-884: homepage-only, desktop-only, Hebrew-only trust strip above
            the pill. Collapses (height+opacity → 0) on scroll-down, re-expands
            on scroll-up / at-top, driven by stripCollapsed. overflow-hidden +
            max-height animation = no layout placeholder, no CLS. Ink is surface-
            aware like the nav (cream + textShadow over the hero, dark on the
            scrolled/solid surface); gold seal is the brand accent in both. */}
        {isHomepage && locale === "he" && (
          <div
            aria-hidden={stripCollapsed ? "true" : undefined}
            className={[
              "hidden md:block w-full max-w-[940px] overflow-hidden",
              "transition-[max-height,opacity] duration-base ease-quart motion-reduce:transition-none",
              stripCollapsed ? "max-h-0 opacity-0" : "max-h-12 opacity-100",
            ].join(" ")}
          >
            <p
              className={[
                "flex items-center justify-center gap-1.5 pb-2.5 text-xs font-medium",
                transparent ? "text-background" : "text-fg-muted",
              ].join(" ")}
              style={textShadow}
            >
              <SealCheck size={15} weight="fill" className="text-accent" aria-hidden="true" />
              {t("nav.trust_strip")}
            </p>
          </div>
        )}
        <nav
          aria-label={t("nav.main_label")}
          className={[
            // MEH-890 chunk 1 (layout-only): the pill hugs its content and
            // centers (parent flex-col items-center) instead of spreading
            // edge-to-edge. Lead group (logo + links) and action cluster sit
            // together with one ~32px air gap (gap-8) — no central void.
            // Supersedes the MEH-732 w-full/max-w-[940px]/justify-between
            // spread (itself a replacement for the MEH-643 grid layout).
            "w-auto max-w-[92vw] flex items-center gap-8 rounded-full border",
            // MEH-732 guardrail: animate background + shadow (+ the ink/border
            // cross-fade for AA legibility over the hero) — NOT padding (no
            // layout reflow on scroll) and never backdrop-filter.
            "transition-[background-color,border-color,box-shadow,color] duration-base ease-quart",
            transparent
              ? "bg-transparent border-transparent py-3 px-5"
              // MEH-732 pill-only glass: translucent cream + 12px blur where
              // supported, solid bg-background fallback otherwise. The
              // transition never animates backdrop-filter (guardrail).
              : "bg-background supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur-md border-border shadow-[0_8px_30px_rgba(46,104,83,0.12)] py-2.5 px-4",
          ].join(" ")}
        >
          {/* LEAD GROUP — logo + nav links together (internal gap 36px).
              start of the row (visual right in RTL). */}
          <div className="flex items-center gap-9">
            <Link href="/" className="shrink-0 inline-flex items-center min-h-[44px]" aria-label={BRAND_NAME}>
              <Image
                src="/logo.png"
                alt={BRAND_NAME}
                width={122}
                height={46}
                priority
                style={
                  transparent
                    ? { filter: "brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }
                    : undefined
                }
              />
            </Link>

            {/* NAV LINKS — desktop only, part of the lead group. */}
            <div className="hidden md:flex items-center gap-9">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(item.href)}
                  transparent={transparent}
                  textShadow={textShadow}
                />
              ))}
            </div>
          </div>

          {/* ACTION CLUSTER — end of the row (visual left in RTL). */}
          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Desktop search — MEH-789: quiet icon-only affordance (was the
                MEH-732 filled-primary action). The hero owns the prominent
                search field, so a filled green search here was redundant +
                competed with the add-business CTA + lengthened the pill. Same
                route + a11y as the mobile circle (:261). */}
            <button
              onClick={() => router.push("/search?focus=1")}
              aria-label={t("nav.search_label")}
              className={`hidden md:flex items-center justify-center w-11 h-11 rounded-full transition-colors duration-fast ease-quart focus-ring ${transparent ? "text-background hover:bg-white/10" : "text-fg-muted hover:bg-primary/5"}`}
              style={textShadow}
            >
              <MagnifyingGlass size={22} weight="regular" aria-hidden="true" />
            </button>
            <span className="hidden md:inline-flex">
              <LanguageToggle className={transparent ? "text-background hover:bg-white/10" : ""} />
            </span>

            {user ? (
              <UserMenu
                user={user}
                logout={logout}
                open={userMenuOpen}
                setOpen={setUserMenuOpen}
                menuRef={userMenuRef}
                transparent={transparent}
                textShadow={textShadow}
              />
            ) : (
              // MEH-732: quiet text link, hidden on /login.
              !isLoginPage && (
                <LoginAccount label={t("nav.login")} transparent={transparent} textShadow={textShadow} />
              )
            )}

            {showAddBusinessCta && (
              <Link
                href="/register/producer"
                // MEH-732: demoted to outlined secondary (search is the one
                // filled action). Surface-aware border/ink over hero vs pill.
                className={[
                  "hidden md:inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors duration-fast ease-quart focus-ring",
                  transparent
                    ? "border-background/60 text-background hover:bg-white/10"
                    : "border-action-primary text-action-primary hover:bg-primary/5",
                ].join(" ")}
                style={textShadow}
              >
                {t("nav.add_business_short")}
                {/* MEH-868: raw "↗" dingbat → Phosphor ArrowUpLeft (the RTL-
                    correct "onward" diagonal; mirrors the prior scale-x flip)
                    — Phosphor-only, matching the CTA-row arrow affordance.
                    MEH-877: KEPT (not bidi-flipped) — design intent is a diagonal
                    outbound/external-link arrow, direction-neutral by convention
                    (not an rtl.md-listed exception). */}
                <ArrowUpLeft size={14} weight="bold" className="opacity-70" aria-hidden="true" />
              </Link>
            )}

            {/* Mobile: search (44px circle) — nav lives in BottomNav (MEH-789 PR-A) */}
            <button
              onClick={() => router.push("/search?focus=1")}
              aria-label={t("nav.search_label")}
              className={`md:hidden flex items-center justify-center w-11 h-11 rounded-full focus-ring ${transparent ? "text-background" : "text-fg-muted"}`}
              style={textShadow}
            >
              <MagnifyingGlass size={22} weight="regular" aria-hidden="true" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}

/**
 * Nav link with the MEH-643 gold-underline active indicator (replaces the
 * MEH-29 primary border-b). Ink follows surface: light over hero, dark on
 * the pill. Underline is the gold accent in both states.
 */
function NavLink({ href, label, active, transparent, textShadow }) {
  const ink = transparent
    ? active
      ? "text-background"
      : "text-background/90 hover:text-background"
    : active
      ? "text-text"
      : "text-text hover:text-primary";
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "relative text-sm font-medium py-2 transition-colors duration-fast ease-quart",
        ink,
        active
          ? "after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent"
          : "",
      ].join(" ")}
      style={textShadow}
    >
      {label}
    </Link>
  );
}

/**
 * MEH-643/MEH-732 — quiet "כניסה לחשבון" account link (guests). MEH-732
 * dropped the border → no fill, no border (search is the one bold action);
 * hover = ink shift only. Hidden on /login (gated at the call site via
 * isLoginPage). Surface-aware ink: on-dark over the hero, primary on the pill.
 */
function LoginAccount({ label, transparent, textShadow }) {
  const variant = transparent
    ? "text-background hover:text-background/80"
    : "text-primary hover:text-primary-dark";
  return (
    <Link
      href="/login"
      className={[
        "hidden md:inline-flex items-center justify-center min-h-[44px] px-2 rounded-full text-sm font-medium transition-colors duration-fast ease-quart focus-ring",
        variant,
      ].join(" ")}
      style={textShadow}
    >
      {label}
    </Link>
  );
}

/**
 * MEH-39 — Circular avatar button (34×34) with click-toggle dropdown.
 * Preserved verbatim by decision (MEH-643 design is silent on the
 * logged-in state). Dropdown: profile / settings / dashboard (producer) /
 * admin (admin) / logout.
 */
function UserMenu({ user, logout, open, setOpen, menuRef, transparent, textShadow }) {
  const t = useTranslations();
  const initial = (user.name || "?").trim().charAt(0).toUpperCase();
  const hasAvatar = !!user.avatar_url;
  const isProducer = user.role === "producer";
  const isAdmin = user.role === "admin";

  const items = [
    { href: isProducer ? "/producer/dashboard" : "/settings?tab=profile", label: t("account.menu.profile") },
    { href: "/settings?tab=security", label: t("account.menu.settings") },
    ...(isProducer ? [{ href: "/producer/dashboard", label: t("account.menu.dashboard") }] : []),
    ...(isAdmin ? [{ href: "/admin", label: t("account.menu.admin") }] : []),
  ];

  return (
    // MEH-789: desktop-only — the bottom-pill account tab + AccountSheet own
    // mobile account, so the top-bar avatar is gated off mobile (was a
    // double account entry; matches the :47 docstring "logo + search only").
    <div ref={menuRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("account.menu.aria", { name: user.name })}
        className={`w-[34px] h-[34px] rounded-full overflow-hidden flex items-center justify-center focus-ring ${hasAvatar ? "" : "bg-primary"}`}
        style={transparent ? textShadow : undefined}
      >
        {hasAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-white text-sm font-semibold leading-none">{initial}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-11 bg-surface-card border border-border rounded-[10px] shadow-[0_4px_16px_rgba(0,0,0,0.08)] py-1 z-[1001]"
          style={{ minWidth: 160, insetInlineStart: 0 }}
        >
          {items.map((item) => (
            <Link
              key={item.label}
              role="menuitem"
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-text hover:bg-background transition-colors duration-fast ease-quart"
            >
              {item.label}
            </Link>
          ))}
          <div className="h-px bg-border my-1" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); logout(); }}
            className="w-full text-start px-4 py-2 text-sm text-red-700 hover:bg-background transition-colors duration-fast ease-quart"
          >
            {t("account.menu.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
