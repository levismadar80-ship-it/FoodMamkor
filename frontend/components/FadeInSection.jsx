"use client";

import { motion } from "framer-motion";

/**
 * Thin wrapper around framer-motion for the "fade + slide up" entry
 * animation used across the site. Per docs/archive/UX_FIXES.md Fix 6, this is the
 * ONLY motion primitive we use — no 3D rotations, no bounce easing,
 * no heavy perspective. Just fade + slide.
 *
 * Reduced-motion: framer-motion only honors prefers-reduced-motion when a
 * `<MotionConfig reducedMotion="user">` is mounted above it. MEH-788 mounts
 * that at the layout root (app/[locale]/layout.js), so every instance here
 * resolves transform/opacity to instant for reduced-motion users — the
 * global JS-motion off-switch. (The prior "auto via framer's built-in"
 * note was inaccurate: framer's default is reducedMotion="never".)
 *
 * Timing: the default (600ms / y=40) is the original editorial reveal,
 * still used by the home blocks. MEH-788 adds REVEAL_PRESET — a faster
 * (250ms / y=16) scroll-reveal in the 150–300ms spec band — for the
 * /about + ProducerDetail section reveals. Spread it: `<FadeInSection
 * {...REVEAL_PRESET}>`. Single source for the new timing — no per-call
 * magic numbers, and no motion token exists yet (MEH-136 ships none).
 *
 * Usage:
 *   <FadeInSection>        wraps any block (600ms editorial)
 *   <FadeInSection {...REVEAL_PRESET}>  250ms section scroll-reveal (MEH-788)
 *   <FadeInSection delay={0.1}>  staggered card
 *   <FadeInSection as="h1" immediate>  hero text that animates on mount
 */

// MEH-788: gentle scroll-reveal preset — small translateY, 250ms (within the
// 150–300ms band), no spring. Opacity/transform only → no layout shift.
export const REVEAL_PRESET = { duration: 0.25, y: 16 };

export default function FadeInSection({
  children,
  as: Component = "div",
  delay = 0,
  duration = 0.6,
  y = 40,
  immediate = false,
  className = "",
  ...rest
}) {
  const MotionComponent = motion[Component] || motion.div;

  const animationProps = immediate
    ? {
        initial: { opacity: 0, y },
        animate: { opacity: 1, y: 0 },
      }
    : {
        initial: { opacity: 0, y },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.2 },
      };

  return (
    <MotionComponent
      {...animationProps}
      transition={{ duration, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
      {...rest}
    >
      {children}
    </MotionComponent>
  );
}
