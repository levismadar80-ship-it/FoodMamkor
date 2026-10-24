"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sticky in-page section anchor-nav (a row of pills). Each pill is a real
 * `<a href="#id">` — keyboard-reachable, and it still jumps with JS off. The
 * landing offset is the TARGET's own `scroll-margin-top` (no JS offset math);
 * this component publishes its live height as `--section-nav-h` on :root so
 * those scroll-margins can clear it, the same way Header.jsx publishes
 * `--chrome-top`.
 *
 * Data gating is the caller's: items with `show: false` render no pill, and a
 * row with nothing to show renders nothing at all.
 *
 * Active pill: IntersectionObserver over the target sections (no scroll-spy
 * library). `aria-current="true"` marks it. prefers-reduced-motion → instant
 * jump instead of a smooth scroll.
 *
 * @param {{ items: Array<{id: string, label: string, Icon?: any, show?: boolean}>,
 *           ariaLabel: string, className?: string }} props
 */
export default function SectionAnchorNav({ items, ariaLabel, className = "" }) {
  const visible = items.filter((item) => item.show !== false);
  const ids = visible.map((item) => item.id);
  const idsKey = ids.join("|");

  const [activeId, setActiveId] = useState(null);
  const navRef = useRef(null);
  const rowRef = useRef(null);
  const pillRefs = useRef(new Map());

  // Publish the bar's live height for the targets' scroll-margin-top.
  // display:none (desktop) measures 0, which the md: scroll-margins ignore.
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--section-nav-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--section-nav-h");
    };
  }, [idsKey]);

  // Active section: the first section (in page order) inside a band near the
  // top of the viewport. When none is in the band, the last answer stands.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const targets = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (targets.length === 0) return undefined;
    const inBand = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inBand.set(entry.target.id, entry.isIntersecting);
        const first = ids.find((id) => inBand.get(id));
        if (first) setActiveId(first);
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // idsKey stands for `ids` (a fresh array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const effectiveActive = ids.includes(activeId) ? activeId : ids[0];

  // Keep the active pill inside the (horizontally scrolling) row. scrollBy on
  // the row only — never scrollIntoView, which would also move the page and
  // cancel a smooth scroll in progress. Visual-px delta, so RTL needs no sign
  // handling.
  useEffect(() => {
    const row = rowRef.current;
    const pill = pillRefs.current.get(effectiveActive);
    if (!row || !pill || typeof row.scrollBy !== "function") return;
    const r = row.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    let delta = 0;
    if (p.left < r.left) delta = p.left - r.left;
    else if (p.right > r.right) delta = p.right - r.right;
    if (delta !== 0) row.scrollBy({ left: delta, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [effectiveActive]);

  if (visible.length === 0) return null;

  function onPillClick(event, id) {
    const target = document.getElementById(id);
    if (!target) return; // let the native anchor do whatever it can
    event.preventDefault();
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    setActiveId(id);
  }

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      data-testid="section-anchor-nav"
      style={{ top: "var(--chrome-top, 82px)" }}
      className={`sticky z-30 bg-white border-b border-border ${className}`}
    >
      <div
        ref={rowRef}
        className="flex gap-2 overflow-x-auto py-2 scrollbar-hide min-w-0 snap-x snap-proximity"
      >
        {visible.map(({ id, label, Icon }) => {
          const active = id === effectiveActive;
          return (
            <a
              key={id}
              ref={(el) => {
                if (el) pillRefs.current.set(id, el);
                else pillRefs.current.delete(id);
              }}
              href={`#${id}`}
              onClick={(e) => onPillClick(e, id)}
              aria-current={active ? "true" : undefined}
              data-testid={`section-nav-pill-${id}`}
              // Chip styling from ChipScrollRow (the /producers category row):
              // rounded-md, px-4, text-sm, border; solid state-selected fill
              // when active. min-h-[44px] keeps the touch target.
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 min-h-[44px] rounded-md text-sm font-medium border transition shrink-0 snap-start focus-ring ${
                active
                  ? "bg-state-selected text-white border-state-selected"
                  : "bg-white text-text border-border hover:border-primary hover:text-primary"
              }`}
            >
              {Icon && <Icon size={16} weight={active ? "fill" : "regular"} aria-hidden="true" />}
              {label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !!window.matchMedia("(prefers-reduced-motion: reduce)")?.matches
  );
}
