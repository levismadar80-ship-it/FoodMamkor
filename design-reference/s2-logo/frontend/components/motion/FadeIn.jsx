"use client";
// Framer Motion fade-in on whileInView. Used by Server Components by wrapping
// children. The "use client" marker is the only thing that needs it — keeps
// the rest of the tree static. NO parallax. NO motion-heavy.
//
// Respects prefers-reduced-motion via Framer's `useReducedMotion`.

import { motion, useReducedMotion } from "framer-motion";

export default function FadeIn({
  children,
  delay = 0,
  y = 12,
  as = "div",
  className = "",
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] || motion.div;

  if (reduce) return <MotionTag className={className}>{children}</MotionTag>;

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </MotionTag>
  );
}
