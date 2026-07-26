import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";

/**
 * Module:   BackLink
 * Purpose:  One owner for every "back to X" link in the producer dashboard, so
 *           the arrow direction, icon and spacing can't drift per page.
 * Does NOT: decide the back target or own the label copy — both are the
 *           caller's (`href` / `label`), because the correct target depends on
 *           the page's entry point (see the MEH-999 Phase-0 mapping).
 * Related:  components/ui/index.js (barrel export);
 *           app/[locale]/producer/dashboard/tools/page.js (the hub most
 *           sub-pages return to).
 * History:  MEH-999 (creation) — before this, six pages hand-rolled the link
 *           with three different targets, two different labels, and a text
 *           arrow baked into the translation string that pointed the wrong way
 *           in one locale or the other.
 *
 * Arrow direction: the glyph must point "back" in BOTH directions. ArrowRight
 * points at the physical right unrotated, which IS "back" in he/RTL (the
 * inline start). In en/LTR back is the physical left, so `ltr:rotate-180`
 * flips it there and only there. This is the mirror of the MEH-990 / MEH-938
 * `rtl:rotate-180` FORWARD-indicator convention (EventsClient.jsx:318) — same
 * one-icon idiom, opposite direction, because this link goes backwards.
 *
 * The arrow lives here as an icon, never as a "←"/"→" character inside a
 * translation value: a text arrow is a fixed glyph that cannot flip per locale,
 * which is exactly how the pre-MEH-999 keys ended up pointing the wrong way.
 */
export default function BackLink({ href, label }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      <ArrowRight size={16} weight="bold" aria-hidden="true" className="ltr:rotate-180" />
      {label}
    </Link>
  );
}
