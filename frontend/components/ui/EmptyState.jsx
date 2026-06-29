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
}) {
  return (
    <div className="text-center py-12 px-6">
      {Icon ? (
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
      {ctaLabel && (ctaHref || ctaOnClick) && (
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
