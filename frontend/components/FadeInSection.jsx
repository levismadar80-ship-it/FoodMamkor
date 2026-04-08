"use client";

import { motion } from "framer-motion";

/**
 * Thin wrapper around framer-motion for the "fade + slide up" entry
 * animation used across the site. Per UX_FIXES.md Fix 6, this is the
 * ONLY motion primitive we use — no 3D rotations, no bounce easing,
 * no heavy perspective. Just fade + slide.
 *
 * Respects prefers-reduced-motion automatically via framer-motion's
 * built-in reducedMotion setting.
 *
 * Usage:
 *   <FadeInSection>        wraps any block
 *   <FadeInSection delay={0.1}>  staggered card
 *   <FadeInSection as="h1" immediate>  hero text that animates on mount
 */
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
