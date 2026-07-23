"use client";
// MEH-655 P4 v5 LOCK — Floating Pill Navbar.
// REUSED VERBATIM from approved S3.5. Two states (default + scrolled),
// surface-aware ghost CTA, motion family tokens, focus-visible WCAG 2.2 AA.
//
// "use client" — scroll listener needs window. Threshold 60px (matches Header.jsx prod).

import { useEffect, useState } from "react";
import Logo from "./Logo";

export default function FloatingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 flex justify-center p-4 md:p-6" dir="rtl">
        <nav
          aria-label="primary"
          className={[
            "w-full max-w-[1200px] grid items-center",
            "transition-[background-color,border-color,box-shadow,padding,color] duration-[var(--duration-base)] ease-[var(--ease-quart)]",
            "min-h-[52px] md:min-h-[64px] rounded-full",
            // Two states: default (transparent) + scrolled (cream pill, hairline + soft shadow).
            scrolled
              ? "bg-[var(--bg-card)] border border-[var(--border)] shadow-[0_2px_20px_rgba(46,104,83,0.06)] px-2 md:px-4"
              : "bg-transparent border border-transparent px-3 md:px-6",
            // Desktop grid: logo / spacer / ghost / cta. Mobile: logo / spacer / burger.
            "grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto] md:gap-8",
          ].join(" ")}
        >
          {/* Logo — horizontal on md+, mark only on mobile. */}
          <a href="/" className="inline-flex items-center" aria-label="מהמקור">
            <span className="hidden md:inline-flex"><Logo variant="horizontal" /></span>
            <span className="inline-flex md:hidden"><Logo variant="mark" /></span>
          </a>

          {/* Nav links — desktop only. */}
          <ul className="hidden md:flex items-center justify-center gap-8 font-body font-medium text-[14px]">
            <li><NavLink href="/explore" current>גלי</NavLink></li>
            <li><NavLink href="/map">מפה</NavLink></li>
            <li><NavLink href="/about">אודות</NavLink></li>
          </ul>

          {/* Ghost CTA — surface-aware. */}
          <button
            type="button"
            className={[
              "hidden md:inline-flex min-h-[44px] items-center px-4",
              "font-body font-medium text-[13px] tracking-[0.02em]",
              "rounded-full bg-transparent",
              "border transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)]",
              scrolled
                ? "border-[var(--border)] text-[var(--color-action-ghost-text)] hover:bg-[var(--light)]"
                : "border-transparent text-[var(--color-action-ghost-text)] hover:bg-[var(--light)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--color-action-primary-hover)]",
            ].join(" ")}
          >
            כניסה לחשבון
          </button>

          {/* Primary CTA — green pill. */}
          <a
            href="/register/producer"
            className={[
              "hidden md:inline-flex min-h-[44px] items-center gap-2",
              "px-5 rounded-full",
              "font-body font-medium text-[14px] tracking-[0.02em] text-[var(--background)]",
              "bg-[var(--color-action-primary)] border border-[var(--color-action-primary)]",
              "hover:bg-[var(--color-action-primary-hover)] hover:border-[var(--color-action-primary-hover)]",
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--color-action-primary-hover)]",
            ].join(" ")}
          >
            הוסיפי עסק
            <span aria-hidden="true" style={{ fontFamily: "var(--font-italic)", fontStyle: "italic", color: "#E7C88A" }}>↗</span>
          </a>

          {/* Burger — mobile only. */}
          <button
            type="button"
            aria-label={open ? "סגרי תפריט" : "פתחי תפריט"}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border)]"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </nav>
      </div>

      {/* Mobile drawer — warm-dark surface, gold numerals, on-dark ghost CTA. */}
      {open && (
        <div
          role="dialog"
          aria-label="תפריט ראשי"
          dir="rtl"
          className="fixed inset-x-4 top-[76px] z-40 md:hidden rounded-2xl bg-[var(--green-900)] p-6 shadow-[0_12px_40px_rgba(20,50,40,0.45)] border border-[rgba(245,240,232,0.08)]"
        >
          <ul className="grid gap-0 mb-4">
            {[
              { href: "/explore", label: "גלי", num: "01", current: true },
              { href: "/map", label: "מפה", num: "02" },
              { href: "/about", label: "אודות", num: "03" },
            ].map((l) => (
              <li key={l.label}>
                <a href={l.href}
                   className={`grid grid-cols-[1fr_auto] items-baseline py-4 px-2 font-display font-bold text-[24px] border-b border-[rgba(245,240,232,0.10)] last:border-b-0 ${l.current ? "text-[#E7C88A]" : "text-[var(--background)]"}`}>
                  <span>{l.label}</span>
                  <span className="font-italic font-medium text-[14px] text-[var(--gold)]"
                        style={{ fontStyle: "italic", direction: "ltr" }}>{l.num}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 pt-4 border-t border-[rgba(245,240,232,0.12)]">
            <a href="/register/producer"
               className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-[var(--color-action-primary)] text-[var(--background)] font-body font-medium text-[14px]">
              הוסיפי עסק <span aria-hidden="true" style={{ color: "#E7C88A" }}>↗</span>
            </a>
            <button type="button"
               className="inline-flex items-center justify-center min-h-12 rounded-full bg-transparent border border-[var(--color-action-ghost-border-on-dark)] text-[var(--color-action-ghost-text-on-dark)] font-body font-medium text-[13px]">
              כניסה לחשבון
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function NavLink({ href, current, children }) {
  return (
    <a href={href}
       className={[
         "relative inline-block py-2 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quart)]",
         "text-[var(--text)] hover:text-[var(--color-action-primary)]",
         current && "after:absolute after:inset-x-0 after:bottom-1.5 after:h-px after:bg-[var(--gold)]",
       ].filter(Boolean).join(" ")}>
      {children}
    </a>
  );
}
