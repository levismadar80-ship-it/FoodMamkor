import Link from "next/link";

export default function EmptyState({
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
      {emoji && <p className="text-5xl mb-4">{emoji}</p>}
      <h3 className="font-headline text-2xl text-text-primary mb-2">{title}</h3>
      {description && (
        <p className="font-body text-[15px] text-text-secondary max-w-xs mx-auto mb-6">
          {description}
        </p>
      )}
      {(ctaLabel && (ctaHref || ctaOnClick)) && (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {ctaHref ? (
            <Link
              href={ctaHref}
              className="inline-block bg-primary text-white rounded-[8px] px-6 py-[10px] text-sm font-medium hover:bg-primary-dark transition"
            >
              {ctaLabel}
            </Link>
          ) : (
            <button
              onClick={ctaOnClick}
              className="inline-block bg-primary text-white rounded-[8px] px-6 py-[10px] text-sm font-medium hover:bg-primary-dark transition"
            >
              {ctaLabel}
            </button>
          )}
          {secondaryLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className="inline-block border border-border text-text-primary rounded-[8px] px-6 py-[10px] text-sm font-medium hover:bg-gray-50 transition"
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
