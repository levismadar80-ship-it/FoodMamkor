// @ts-check
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
import Avatar from "@/components/ui/Avatar";

export default function OwnerRow({ href, name, testId, children }) {
  const body = (
    <>
      {/* MEH-3461: the shared Avatar (was a hand-drawn circle). */}
      <Avatar name={name} fallback="" size={44} tone="soft" aria-hidden="true" letterClassName="font-headline-md text-lg font-bold" />
      <span className="min-w-0 flex-1 text-base text-text">{children}</span>
      {href && <CaretLeft size={18} className="shrink-0 text-primary ltr:rotate-180" aria-hidden="true" />}
    </>
  );
  const box = "flex items-center gap-3 rounded-md border border-border bg-surface p-3 min-h-[64px]";
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
