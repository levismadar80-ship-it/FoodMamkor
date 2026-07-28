import Link from "next/link";

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
  // Disc geometry is w-16/size-32, byte-identical to the four blocks that
  // already use it (ForgotPassword, ResetPassword ×2, VerifyEmail). The other
  // five sit at w-20 (×1) and w-24 (×2) with 40px icons; whether those
  // normalize down or the variant needs a size prop is a CHUNK 2 decision, and
  // deliberately not pre-empted here.
  circle = false,
  // MEH-1630 chunk 1 (decision 4): `gated` is a blocked action — NN/g's rule is
  // that it gets no control at all, not a disabled one. Suppresses the primary
  // CTA even when ctaLabel + a handler are passed, so a caller cannot half-gate
  // a surface by forgetting to strip props. `secondaryHref` survives as a plain
  // text link: the description says why it is locked, the link says where to go
  // to unlock it. Off by default.
  gated = false,
}) {
  // Gating wins over any CTA the caller passed — see the `gated` note above.
  const showCta = !gated && ctaLabel && (ctaHref || ctaOnClick);
  const showGatedLink = gated && secondaryLabel && secondaryHref;

  return (
    <div className="text-center py-12 px-6">
      {Icon && circle ? (
        <div
          className="w-16 h-16 rounded-full bg-green-50 mx-auto mb-4 flex items-center justify-center"
          aria-hidden="true"
        >
          <Icon size={32} className="text-primary" />
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
      {showGatedLink && (
        <Link
          href={secondaryHref}
          className="text-sm font-medium text-primary underline underline-offset-2 hover:text-primary-dark transition"
        >
          {secondaryLabel}
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
