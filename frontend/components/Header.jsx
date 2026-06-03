"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useTranslations } from "next-intl";
import { Heart, List, MagnifyingGlass, X } from "@phosphor-icons/react";
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
 *   - over-image  → `transparent = isHomepage && scrollY < 80`: pill is
 *     transparent, nav ink light (`text-background`), inner darkening
 *     gradient kept for legibility over the hero photo, logo inverted.
 *   - pill        → scrolled OR any inner page (no hero): cream
 *     `surface-card` fill, 1px border, single resting shadow, dark ink.
 *
 * LOCKs (MEH-638): no shadow-lift on hover (hover = color/bg shift only);
 * no glass anywhere except the mobile hamburger over the hero image
 * (single allowed ingredient); active link = gold underline.
 */
export default function Header() {
  const { user, logout } = useAuth();
  const { lang } = useLanguage();
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const rafRef = useRef(null);
  const userMenuRef = useRef(null);

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

  // Close menus on route change so they don't look stuck during the fade.
  useEffect(() => {
    setUserMenuOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // MEH-29: rAF-throttled scroll listener — threshold 80px.
  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        setScrolled(window.scrollY >= 80);
        rafRef.current = null;
      });
    };
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

  // MEH-643: navbar uses nav.explore ("גלי", feminine) — NOT nav.discover
  // ("גלה"), which stays bound to the BottomNav home tab.
  const NAV_ITEMS = [
    { href: "/", label: t("nav.explore") },
    { href: "/map", label: t("nav.map") },
    { href: "/about", label: t("nav.about") },
  ];

  const isHomepage = pathname === "/";
  const transparent = isHomepage && !scrolled;

  const isActive = (href) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const textShadow = transparent ? { textShadow: "0 1px 4px rgba(0,0,0,0.6)" } : undefined;

  return (
    <header className="sticky top-0 z-[1000]">
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

      {/* Nav-shell — centers the pill; transparent band reserves height. */}
      <div className="relative flex justify-center px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
        <nav
          aria-label={t("nav.main_label")}
          className={[
            "w-full max-w-[1200px] grid items-center rounded-full border",
            "grid-cols-[auto_1fr_auto] gap-3 md:gap-8",
            "transition-[background-color,border-color,box-shadow,padding,color] duration-base ease-quart",
            transparent
              ? "bg-transparent border-transparent px-3 py-1.5 md:px-6 md:py-2"
              : "bg-surface-card border-border shadow-[0_2px_20px_rgba(46,104,83,0.06)] px-3 py-1.5 md:px-4 md:py-2",
          ].join(" ")}
        >
          {/* LOGO — start (visual right in RTL). Inverted white over hero. */}
          <Link href="/" className="shrink-0 inline-flex items-center" aria-label={BRAND_NAME}>
            <Image
              src="/logo.png"
              alt={BRAND_NAME}
              width={106}
              height={40}
              priority
              style={
                transparent
                  ? { filter: "brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }
                  : undefined
              }
            />
          </Link>

          {/* NAV LINKS — center (desktop only). */}
          <div className="hidden md:flex items-center justify-center gap-8">
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

          {/* ACTIONS — end (visual left in RTL). */}
          <div className="flex items-center gap-1.5 md:gap-2 justify-self-end">
            {/* Desktop: search + lang + account + CTA */}
            <button
              onClick={() => router.push("/search?focus=1")}
              aria-label={t("nav.search_label")}
              className={[
                "hidden md:flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-fast ease-quart focus-ring",
                transparent ? "text-background hover:bg-white/10" : "text-fg-muted hover:bg-primary/5",
              ].join(" ")}
              style={textShadow}
            >
              <MagnifyingGlass size={20} weight="regular" aria-hidden="true" />
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
              <LoginAccount label={t("nav.login")} transparent={transparent} scrolled={!transparent} textShadow={textShadow} />
            )}

            {showAddBusinessCta && (
              <Link
                href="/register/producer"
                className="hidden md:inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full bg-action-primary hover:bg-action-primary-hover text-white text-sm font-medium whitespace-nowrap border border-action-primary transition-colors duration-fast ease-quart focus-ring"
              >
                {t("nav.add_business_short")}
                <span className="inline-block scale-x-[-1] text-white/70" aria-hidden="true">↗</span>
              </Link>
            )}

            {/* Mobile: search + hamburger */}
            <button
              onClick={() => router.push("/search?focus=1")}
              aria-label={t("nav.search_label")}
              className={`md:hidden flex items-center justify-center w-10 h-10 rounded-full ${transparent ? "text-background" : "text-fg-muted"}`}
              style={textShadow}
            >
              <MagnifyingGlass size={22} weight="regular" aria-hidden="true" />
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? t("nav.menu_close") : t("nav.menu_open")}
              aria-expanded={menuOpen}
              className={[
                "md:hidden flex items-center justify-center w-11 h-11 rounded-full transition-colors duration-fast ease-quart focus-ring",
                transparent
                  ? "bg-white/15 backdrop-blur-sm border border-white/40 text-background"
                  : "bg-surface-card border border-border text-text",
              ].join(" ")}
              style={transparent ? textShadow : undefined}
            >
              {menuOpen ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile drawer — MEH-643 warm-dark (green-900) surface for ghost-on-dark
          legibility. Replaces the MEH-29 cream drawer; all of its contents are
          migrated here (nav · CTAs · lang · logged-in items). In normal flow
          (expands the band) — no overlay z-index. */}
      {menuOpen && (
        <div className="md:hidden px-4 pb-2">
          <div className="rounded-2xl bg-green-900 border border-white/10 p-6 shadow-[0_12px_40px_rgba(20,50,40,0.45)]">
            {/* Nav links — Frank Ruhl 700 / 24px / gold editorial numerals. */}
            <nav className="grid" aria-label={t("nav.mobile_label")}>
              {NAV_ITEMS.map((item, i) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={[
                      "grid grid-cols-[1fr_auto] items-baseline py-4 border-b border-white/10 last:border-b-0",
                      "font-headline-md font-bold text-[24px] transition-colors duration-fast ease-quart",
                      active ? "text-amber-200" : "text-background",
                    ].join(" ")}
                  >
                    <span>{item.label}</span>
                    <span className="text-[14px] font-normal text-amber-200" dir="ltr" aria-hidden="true">
                      0{i + 1}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {/* CTA row + account/logged-in actions. */}
            <div className="grid gap-2 mt-4 pt-4 border-t border-white/15">
              {showAddBusinessCta && (
                <Link
                  href="/register/producer"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center justify-center gap-2 w-full min-h-[48px] rounded-full bg-action-primary hover:bg-action-primary-hover text-white text-sm font-medium transition-colors duration-fast ease-quart focus-ring"
                >
                  {t("nav.add_business_short")}
                  <span className="inline-block scale-x-[-1] text-white/70" aria-hidden="true">↗</span>
                </Link>
              )}

              {user ? (
                <>
                  <Link
                    href="/favorites"
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex items-center justify-center gap-2 w-full min-h-[48px] rounded-full action-ghost-on-dark hover:bg-white/10 text-sm font-medium transition-colors duration-fast ease-quart focus-ring"
                  >
                    <Heart size={18} weight="duotone" aria-hidden="true" />
                    {t("nav.favorites")}
                  </Link>
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="inline-flex items-center justify-center w-full min-h-[48px] rounded-full action-ghost-on-dark hover:bg-white/10 text-sm font-medium transition-colors duration-fast ease-quart focus-ring"
                    >
                      {t("nav.admin")}
                    </Link>
                  )}
                  <button
                    onClick={() => { logout(); setMenuOpen(false); }}
                    className="inline-flex items-center justify-center w-full min-h-[48px] rounded-full border border-red-400/50 text-red-300 hover:bg-red-500/10 text-sm font-medium transition-colors duration-fast ease-quart focus-ring"
                  >
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center justify-center w-full min-h-[48px] rounded-full action-ghost-on-dark hover:bg-white/10 text-sm font-medium transition-colors duration-fast ease-quart focus-ring"
                >
                  {t("nav.login")}
                </Link>
              )}
            </div>

            {/* Language toggle — tinted cream for the dark surface. */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/15">
              <LanguageToggle className="text-background hover:bg-white/10" />
              <span className="text-sm text-background/80">
                {lang === "he" ? t("nav.lang_en") : t("nav.lang_he")}
              </span>
            </div>
          </div>
        </div>
      )}
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
 * MEH-643 — ghost "כניסה לחשבון" account button (guests). Replaces the
 * MEH-39 outlined-primary pill with the surface-aware ghost CTA: subtle on
 * the cream pill, on-dark variant over the hero. No fill, no shadow-lift —
 * hover = background tint only.
 */
function LoginAccount({ label, transparent, scrolled, textShadow }) {
  const variant = transparent
    ? "text-background border border-background/50 hover:bg-white/10"
    : `text-primary border ${scrolled ? "border-border" : "border-transparent"} hover:bg-primary/5`;
  return (
    <Link
      href="/login"
      className={[
        "hidden md:inline-flex items-center justify-center min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors duration-fast ease-quart focus-ring",
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
    <div ref={menuRef} className="relative">
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
