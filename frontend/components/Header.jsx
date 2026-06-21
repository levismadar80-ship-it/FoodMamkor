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
// MEH-896 polish: LanguageToggle removed from the nav until the EN i18n wave
// (MEH-472). The component file is unchanged; only its nav entry is gone.

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
 * Positioning (MEH-896): only the PILL section is `sticky top-0` (the
 * <header> wrapper around it). The MEH-884 homepage trust strip is
 * rendered as a normal-flow sibling BEFORE the <header>, so it scrolls
 * away with the page; the pill stays at the top on every page. The
 * <header> band itself is transparent; only the inner pill carries fill
 * — that yields the "floating" look without making the header overlap
 * content.
 *
 * Two surface states (reuse MEH-29 scroll machinery verbatim). MEH-890 chunk 2
 * gave the at-rest pill its own glass surface + dark ink (no scrim), so the two
 * states now differ only in glass opacity / padding, not ink:
 *   - at rest    → `transparent = isHomepage && scrollY < 60`: pill is SOFT
 *     glass — translucent cream `bg-background/70` + 12px backdrop-blur (opaque
 *     `bg-background` fallback), hairline border, resting shadow. Ink is DARK
 *     (same as scrolled), logo NOT inverted, no scrim. Only the surface-free
 *     trust strip above the pill keeps cream ink + its own (strengthened)
 *     text-shadow over the hero.
 *   - scrolled   → scrolled OR any inner page (no hero): MEH-896 chunk 2
 *     LIGHTER translucent glass — `bg-background/60` (was /85 pre-chunk-2)
 *     + 12px backdrop-blur where supported, solid `bg-background` fallback
 *     via `supports-[backdrop-filter]`, 1px `border-border`, green resting
 *     shadow, dark ink. Lighter than the solid hero search card so the nav
 *     stays the lighter member of the rounded-white family (Gestalt: same
 *     family, different weight). Layout (MEH-890 chunk 1 + MEH-896 chunk 2):
 *     compact centered pill at ~50px effective height — lead group
 *     [logo + links] · inter-group gap · action cluster. MEH-899: at rest the
 *     pill is WIDER, with the extra width DISTRIBUTED (end-cap px-11, inter-group
 *     gap-14, lead-group intra-gap gap-11) so the middle gap isn't the only
 *     thing growing (MEH-890 void trap). All SNAP compact (px-4 / gap-8 /
 *     gap-9) at the y=60 scroll threshold — not animated (gap/px stay out of
 *     the transition allowlist, MEH-732 guardrail).
 *
 * LOCKs: no shadow-lift on hover (MEH-638 — hover = color/bg shift only);
 * active link = MEH-896 chunk 2 soft green-tint chip (was the MEH-643 gold
 * underline). MEH-732 SUPERSEDES the MEH-638 "no glass" lock for the pill
 * (pill-only glass, never a full-width band). Transition never animates
 * backdrop-filter (background + shadow only).
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

  // Close the avatar dropdown on route change so it doesn't look stuck
  // during the fade. (MEH-789 PR-B: the drawer's menuOpen reset left with it.)
  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  // MEH-29: rAF-throttled scroll listener. MEH-732: threshold 80 → 60px.
  // MEH-896: drives the transparent→solid pill fade only — the MEH-734/884
  // direction-tracked trust-strip collapse was removed; the strip now lives
  // outside the sticky header and scrolls away naturally with the page.
  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        setScrolled(window.scrollY >= 60);
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
  // MEH-896: trust strip render gate (JS-level — desktop-only is enforced
  // by the strip's own `hidden md:flex` below; pill top-padding compensates
  // at md+ when this is true so total spacing matches the pre-split layout).
  const showStrip = isHomepage && locale === "he";

  const isActive = (href) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {/* MEH-896: trust strip lives outside the sticky <header> (chunk 1, #1277)
          so it scrolls away with the page naturally. Polish: ink is always
          text-fg-muted on the body's cream — the prior surface-aware cream ink
          was a holdover from when the strip sat over the hero photo, and
          rendered cream-on-cream once the strip moved onto the body bg
          (1.00:1 AA fail). #5C584F on #F5F0E8 = 7.66:1 AA pass; the black
          text-shadow halo went with it (it only existed to rescue the cream
          ink). Desktop-only via `hidden md:flex`; copy + gold SealCheck kept. */}
      {showStrip && (
        <div className="hidden md:flex justify-center px-5 sm:px-6 pt-4">
          <p
            className="flex items-center justify-center gap-1.5 pb-2.5 text-xs font-medium text-fg-muted"
          >
            <SealCheck size={15} weight="fill" className="text-accent" aria-hidden="true" />
            {t("nav.trust_strip")}
          </p>
        </div>
      )}
      <header
        // MEH-896: sticky lives on the pill <header> only. The trust strip
        // above is a normal-flow sibling so it scrolls away with the page.
        // MEH-890 chunk 2: the black hero scrim was REMOVED. The pill carries
        // its own glass surface at rest (dark ink, no scrim).
        className="sticky top-0 z-[1000]"
      >
        {/* Nav-shell — centers the pill. When the strip rendered above already
            provided desktop top-padding, drop the pill's md+ top padding to
            avoid doubling (mobile + non-strip pages keep pt-4). */}
        <div
          className={[
            "relative flex flex-col items-center px-5 sm:px-6 pb-2",
            showStrip ? "pt-4 md:pt-0" : "pt-4",
          ].join(" ")}
        >
        <nav
          aria-label={t("nav.main_label")}
          className={[
            // MEH-890 chunk 1 (layout-only): the pill hugs its content and
            // centers (parent flex-col items-center) instead of spreading
            // edge-to-edge. Lead group (logo + links) and action cluster sit
            // together with the inter-group air gap — no central void.
            // Supersedes the MEH-732 w-full/max-w-[940px]/justify-between
            // spread (itself a replacement for the MEH-643 grid layout).
            // MEH-899: the gap is now state-dependent (gap-14 at rest, gap-8
            // scrolled) — see the branch classes below; pill stays w-auto.
            "w-auto max-w-[92vw] flex items-center rounded-full border",
            // MEH-732 guardrail: animate background + shadow (+ the ink/border
            // cross-fade for AA legibility over the hero) — NOT padding (no
            // layout reflow on scroll) and never backdrop-filter.
            "transition-[background-color,border-color,box-shadow,color] duration-base ease-quart motion-reduce:transition-none",
            transparent
              // MEH-890 chunk 2 + MEH-896 chunk 2 + polish: at rest the pill
              // carries clean glass — /70 -> /85 (polish: /70 read the produce
              // photo colors through and looked muddy; /85 stops the bleed
              // while staying glass — still translucent enough to feel
              // floating over the hero). 12px blur (opaque /100 fallback),
              // hairline border, resting shadow, py-0.5 (slim ~50px pill).
              // MEH-899: WIDER at rest — gap-14 + px-11 give the pill spacious
              // breathing room over the hero. The extra width is DISTRIBUTED
              // (not piled into the single middle gap → MEH-890 void trap):
              // end-cap px-11, inter-group gap-14, AND the lead-group intra-gap
              // widens to gap-11 (see :239). Snaps to the compact gap-8 + px-4
              // (+ lead gap-9) at y=60 (scrolled branch) — the SAME threshold
              // the surface already crosses, so it reads as the nav "settling"
              // into compact mode. NOT animated: gap/px are NOT in the
              // transition allowlist above (MEH-732 perf guardrail upheld),
              // so the change snaps like the pre-existing px delta did.
              ? "bg-background supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur-md border-border shadow-[0_8px_30px_rgba(46,104,83,0.12)] gap-14 py-0.5 px-11"
              // MEH-896 chunk 2: scrolled glass LIGHTENED /85 → /60 so the nav
              // reads lighter than the solid hero search card (Gestalt: same
              // family, different weight). py-2.5 → py-0.5 (slim pill match).
              // MEH-899: compact gap-8 (was the shared base gap pre-MEH-899).
              : "bg-background supports-[backdrop-filter]:bg-background/60 supports-[backdrop-filter]:backdrop-blur-md border-border shadow-[0_8px_30px_rgba(46,104,83,0.12)] gap-8 py-0.5 px-4",
          ].join(" ")}
        >
          {/* LEAD GROUP — logo + nav links together. MEH-899: the intra-group
              gap (logo ↔ links) widens at rest (gap-11) and snaps compact
              (gap-9) at y=60 — distributes the rest widening so the middle
              inter-group gap isn't the only thing growing (MEH-890 void trap).
              start of the row (visual right in RTL). */}
          <div className={["flex items-center", transparent ? "gap-11" : "gap-9"].join(" ")}>
            <Link href="/" className="shrink-0 inline-flex items-center min-h-[44px]" aria-label={BRAND_NAME}>
              <Image
                src="/logo.png"
                alt={BRAND_NAME}
                // MEH-896 chunk 2: 122×46 → 101×38 (≈17% reduction, aspect
                // 2.652 → 2.658, ~0.2% off — visually identical). Pairs with
                // the slim pill (~50px); tap target preserved by the wrapper
                // Link's min-h-[44px] above.
                width={101}
                height={38}
                priority
              />{/* MEH-890 chunk 2: logo no longer inverted — it sits on the
                   at-rest glass pill now, not a bare/scrimmed hero. */}
            </Link>

            {/* NAV LINKS — desktop only, part of the lead group. */}
            <div className="hidden md:flex items-center gap-9">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(item.href)}
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
              className="hidden md:flex items-center justify-center w-11 h-11 rounded-full transition-colors duration-fast ease-quart focus-ring text-fg-muted hover:bg-primary/5"
            >
              <MagnifyingGlass size={22} weight="regular" aria-hidden="true" />
            </button>
            {/* MEH-896 polish: LanguageToggle removed from the nav until the
                EN i18n wave (MEH-472). Import dropped at :12. */}

            {user ? (
              <UserMenu
                user={user}
                logout={logout}
                open={userMenuOpen}
                setOpen={setUserMenuOpen}
                menuRef={userMenuRef}
              />
            ) : (
              // MEH-732: quiet text link, hidden on /login.
              !isLoginPage && (
                <LoginAccount label={t("nav.login")} />
              )
            )}

            {showAddBusinessCta && (
              <Link
                href="/register/producer"
                // MEH-890 chunk 2: promoted to the one filled-green CTA (was the
                // MEH-732 outlined secondary). bg-action-primary + white ink,
                // surface-independent now that the pill carries its own glass —
                // identical at rest and scrolled. Mirrors ui/Button.jsx:32.
                className="hidden md:inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-fast ease-quart focus-ring bg-action-primary text-white hover:bg-action-primary-hover"
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
              className="md:hidden flex items-center justify-center w-11 h-11 rounded-full focus-ring text-fg-muted"
            >
              <MagnifyingGlass size={22} weight="regular" aria-hidden="true" />
            </button>
          </div>
        </nav>
      </div>
    </header>
    </>
  );
}

/**
 * Nav link — MEH-896 chunk 2 soft active-chip (replaces the MEH-643 gold
 * underline). Polish: tint NEUTRALIZED — bg-text/[0.07] (warm grey) instead of
 * the original bg-primary/10 so the active chip no longer reads as a sibling
 * to the green CTA. Text stays text-primary + font-semibold (two cues —
 * shape + color, AA preserved on both /85 at-rest and /60 scrolled glass).
 * Inactive = plain text-text with primary-ink hover. min-h-[44px] keeps each
 * link a ≥44px tap target independent of the slim pill chrome (~50px) around it.
 */
function NavLink({ href, label, active }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex items-center min-h-[44px] px-3 rounded-full text-sm transition-colors duration-fast ease-quart focus-ring",
        active
          // MEH-896 polish: neutral warm tint (text-token at 7%) instead of
          // green so the active chip no longer echoes the green CTA. Text
          // stays primary + semibold (two cues — shape + color, AA preserved).
          ? "bg-text/[0.07] text-primary font-semibold"
          : "text-text font-medium hover:text-primary",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

/**
 * MEH-643/MEH-732 — quiet "כניסה לחשבון" account link (guests). MEH-732
 * dropped the border → no fill, no border (search is the one bold action);
 * hover = ink shift only. Hidden on /login (gated at the call site via
 * isLoginPage). MEH-890 chunk 2: ink is now always primary — the pill is glass
 * in every state, so the surface-aware on-dark branch + over-hero shadow were
 * dropped. Quiet text link (no fill, no border); hover = ink shift only.
 */
function LoginAccount({ label }) {
  return (
    <Link
      href="/login"
      className="hidden md:inline-flex items-center justify-center min-h-[44px] px-2 rounded-full text-sm font-medium transition-colors duration-fast ease-quart focus-ring text-primary hover:text-primary-dark"
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
function UserMenu({ user, logout, open, setOpen, menuRef }) {
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
