import Link from "next/link";

// MEH-1630 chunk 1 (decision 1): disc geometry per `size`. Class strings are
// literals so Tailwind's scanner sees w-16/w-20/w-24 — never build them by
// concatenation, the JIT would drop them.
const CIRCLE_SIZES = {
  sm: { disc: "w-16 h-16", icon: 28 },
  md: { disc: "w-20 h-20", icon: 32 },
  lg: { disc: "w-24 h-24", icon: 40 },
};

export default function EmptyState({
  // MEH-979b: `icon` is the Emoji-LOCK-safe visual — pass a Phosphor icon
  // component (e.g. ShoppingCart). `emoji` is the legacy prop still used by
  // the not-yet-migrated consumers; prefer `icon` for new usages.
  icon: Icon,
  emoji,
  title,
  description,
  ctaLabel,
  ctaHref,
  ctaOnClick,
  secondaryLabel,
  secondaryHref,
  // MEH-1097 (F15): optional ghost "this is what a good entry looks like" card,
  // rendered under the description. Presentational only — aria-hidden and
  // non-interactive; existing consumers that omit it are unaffected.
  example,
  // MEH-1630 chunk 1 (decision 2): `circle` puts the icon inside the green disc
  // that nine inline empty-state blocks hand-rolled, so chunk 2 can delete them
  // rather than keep a second system alive. Off by default — every existing
  // call site renders the bare icon exactly as before.
  circle = false,
  // MEH-1630 chunk 1 (decision 1): disc size, so chunk 2 can migrate each block
  // at the geometry it already has instead of normalizing. Normalization is
  // deferred to chunk 3 and is blocked by MEH-1727 (webfonts blocked in E2E →
  // VRT regeneration is untrustworthy, must not be run).
  // Inert unless `circle` is set.
  size = "sm",
  // MEH-1630 chunk 1 (decision 4): `gated` is a blocked action — NN/g's rule is
  // that it gets no control at all, not a disabled one. Suppresses the primary
  // CTA even when ctaLabel + a handler are passed, so a caller cannot half-gate
  // a surface by forgetting to strip props. Off by default.
  gated = false,
  // MEH-1630 chunk 1 (decision 3): the way out of a gated state has its own
  // pair, separate from `secondaryLabel`/`secondaryHref` — those keep their
  // existing meaning for the NON-gated case only. One prop, one rendering.
  unblockLabel,
  unblockHref,
}) {
  // Gating wins over any CTA the caller passed — see the `gated` note above.
  const showCta = !gated && ctaLabel && (ctaHref || ctaOnClick);
  const showUnblockLink = gated && unblockLabel && unblockHref;
  // Unknown size falls back to the default rather than crashing on undefined.
  const disc = CIRCLE_SIZES[size] || CIRCLE_SIZES.sm;

  return (
    <div className="text-center py-12 px-6">
      {Icon && circle ? (
        <div
          className={`${disc.disc} rounded-full bg-green-50 mx-auto mb-4 flex items-center justify-center`}
          aria-hidden="true"
        >
          <Icon size={disc.icon} className="text-primary" />
        </div>
      ) : Icon ? (
        <Icon size={56} className="text-primary mx-auto mb-4" aria-hidden="true" />
      ) : emoji ? (
        <p className="text-5xl mb-4" aria-hidden="true">
          {emoji}
        </p>
      ) : null}
      <h3 className="font-headline-md text-2xl font-bold text-text mb-2">{title}</h3>
      {description && (
        <p className="text-[15px] text-fg-muted max-w-xs mx-auto mb-6">{description}</p>
      )}
      {example && (
        <div aria-hidden="true" className="mb-6 flex justify-center">
          {example}
        </div>
      )}
      {showUnblockLink && (
        // Tap-target floor (DESIGN.md "≥ 44 × 44px"): a bare text link is ~20px
        // tall, and in a gated state it is the ONLY control on screen. Same
        // shape and same fix as WhatsThis.jsx:29 — min-h-[44px] + inline-flex
        // enlarges the hit area without changing the visual treatment.
        <Link
          href={unblockHref}
          className="min-h-[44px] inline-flex items-center text-sm font-medium text-primary underline underline-offset-2 hover:text-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-[6px] transition"
        >
          {unblockLabel}
        </Link>
      )}
      {showCta && (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {ctaHref ? (
            <Link
              href={ctaHref}
              className="inline-block bg-primary text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-primary-dark transition focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {ctaLabel}
            </Link>
          ) : (
            <button
              onClick={ctaOnClick}
              className="inline-block bg-primary text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-primary-dark transition focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {ctaLabel}
            </button>
          )}
          {secondaryLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className="inline-block border border-primary text-primary rounded-full px-6 py-3 text-sm font-medium hover:bg-green-50 transition"
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
