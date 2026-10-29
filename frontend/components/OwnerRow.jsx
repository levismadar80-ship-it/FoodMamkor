/**
 * OwnerRow — who runs an event or an experience, as one tappable row:
 * initial avatar, the line, and a forward chevron (the Eventbrite «Organized
 * by» / Airbnb «Meet your host» row). As bare green text nothing said the
 * name was a link (MEH-2538).
 *
 * The chevron points left in RTL; `ltr:rotate-180` flips it for /en, as
 * BackLink does. Without an href the same row renders with no chevron and no
 * link, so a missing target is never a dead link.
 */
import { CaretLeft } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";

export default function OwnerRow({ href, name, testId, children }) {
  // A whole code point, never half a surrogate pair (review #3801).
  const initial = Array.from((name || "").trim())[0] ?? "";
  const body = (
    <>
      <span
        aria-hidden="true"
        className="shrink-0 w-11 h-11 rounded-full bg-green-50 text-primary font-headline-md text-lg font-bold grid place-items-center"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1 text-base text-text">{children}</span>
      {href && <CaretLeft size={18} className="shrink-0 text-primary ltr:rotate-180" aria-hidden="true" />}
    </>
  );
  const box = "flex items-center gap-3 rounded-[12px] border border-border bg-white p-3 min-h-[64px]";
  return href ? (
    <Link href={href} data-testid={testId} className={`${box} hover:border-primary transition focus-ring`}>
      {body}
    </Link>
  ) : (
    <div data-testid={testId ? `${testId}-static` : undefined} className={box}>
      {body}
    </div>
  );
}
