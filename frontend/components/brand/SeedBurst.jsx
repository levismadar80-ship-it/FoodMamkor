"use client";

/**
 * Module:   SeedBurst
 * Purpose:  The seed layer's success moment (MEH-2833, board 5 v2): the logo
 *           bloom and two rings of single seeds pointing outward, open
 *           below the bloom (where the headline goes), opening once from the
 *           centre (~600ms). Decoration only.
 * Does NOT: carry any text — the caller's headline sits below the burst's own
 *           box, so no seed is ever under it. No animation library: a single
 *           CSS transition per seed.
 * Related:  components/brand/SeedMark.jsx · Seed.jsx · lib/brand-seeds.js
 * History:  MEH-2833 PR 6 (creation; replaces the group-buy canvas confetti,
 *           whose colours were not the brand's).
 */
import { useEffect, useState } from "react";
import SeedMark from "@/components/brand/SeedMark";
import Seed from "@/components/brand/Seed";
import { SEEDS_DARK, SEEDS_LIGHT } from "@/lib/brand-seeds";

const BOX_W = 260;
const MARK_PX = 56;
// [count, radius px, seed width px, opacity] — Seed widths (height = 1.5 ×
// width); the outer ring at ~65%. Radii as measured on board 5 v2.
const RINGS = [
  [8, 68, 10, 1],
  [12, 104, 8, 0.65],
];
// Board 5 v2 leaves the rings open below the bloom — that is where the
// headline sits — so no seed is drawn within 40° of straight down (inner
// ring: 7 of 8 seeds, outer: 10 of 12).
const OPEN_BELOW_DEG = 40;
// Every ring seed's angle and resting offset from the bloom's centre.
const PLACES = RINGS.flatMap(([count, radius, width, opacity], ring) =>
  Array.from({ length: count }, (_, i) => {
    // Offset the outer ring by half a step so the two rings interleave.
    const deg = (360 / count) * i + (ring ? 180 / count : 0);
    const rad = (deg * Math.PI) / 180;
    return { ring, i, deg, width, opacity, x: Math.sin(rad) * radius, y: -Math.cos(rad) * radius };
  }).filter(({ deg }) => Math.abs(deg - 180) >= OPEN_BELOW_DEG),
);
// The bloom's centre sits one outer radius + a seed below the top; the box
// ends just under the lowest seed, so the caller's headline sits close under
// the bloom, as on the board.
const CENTER_Y = Math.ceil(Math.max(...PLACES.map((p) => -p.y + p.width * 0.75)));
const BOX_H = Math.ceil(CENTER_Y + Math.max(...PLACES.map((p) => p.y + p.width * 0.75)));
const REVEAL_MS = 600;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * @param {object} props
 * @param {"light"|"dark"} [props.variant] dark = on bg-primary (SEEDS_DARK)
 * @param {string} [props.className]
 */
export default function SeedBurst({ variant = "light", className = "" }) {
  const seeds = variant === "dark" ? SEEDS_DARK : SEEDS_LIGHT;
  // Open from the centre once. Reduced motion → the final state from the
  // first paint, no movement at all.
  const [open, setOpen] = useState(prefersReducedMotion);
  useEffect(() => {
    if (open) return undefined;
    const id = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const ringSeeds = PLACES.map(({ ring, i, deg, width, opacity, x, y }) => {
    const seed = seeds[(i + ring) % seeds.length];
    return (
      <span
        key={`${ring}-${i}`}
        data-burst-ring={ring}
        data-angle={deg}
        className="absolute"
        style={{
          left: BOX_W / 2 - width / 2,
          top: CENTER_Y - (width * 1.5) / 2,
          opacity: open ? opacity : 0,
          transform: open ? `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` : "translate(0, 0)",
          transition: `transform ${REVEAL_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${REVEAL_MS}ms ease-out`,
        }}
      >
        {/* rotate = the ring angle, so each seed's round end points outward */}
        <Seed color={seed.fill} size={width} rotate={deg} />
      </span>
    );
  });

  return (
    <div
      aria-hidden="true"
      data-testid="seed-burst"
      data-variant={variant}
      data-open={open ? "true" : "false"}
      className={`relative mx-auto ${className}`}
      style={{ width: BOX_W, height: BOX_H, maxWidth: "100%" }}
    >
      {ringSeeds}
      <span
        className="absolute"
        style={{
          left: BOX_W / 2 - MARK_PX / 2,
          top: CENTER_Y - MARK_PX / 2,
          transform: open ? "scale(1)" : "scale(0.6)",
          transition: `transform ${REVEAL_MS}ms cubic-bezier(.2,.8,.2,1)`,
        }}
      >
        <SeedMark size={MARK_PX} variant={variant} />
      </span>
    </div>
  );
}
