// @ts-check
"use client";

/**
 * Module:   PreviewBanner
 * Purpose:  The one green «you are looking at a preview» strip, with the eye,
 *           above a page shown as someone else would see it.
 * Does NOT: own the copy (the caller passes the translated text), or the
 *           outer spacing (`className`, layout only). It does not switch the
 *           page into preview mode either — that is `PreviewModeProvider`
 *           in `lib/preview-mode.js`.
 * Related:  app/[locale]/producer/dashboard/preview/PreviewClient.jsx ·
 *           app/[locale]/producer/dashboard/orders/preview/OrderPreviewClient.jsx ·
 *           app/[locale]/draft-preview/[token]/DraftPreviewClient.jsx
 * History:  MEH-3776 — the same <p> was copied by hand into those three
 *           screens (MEH-2916, MEH-3377, MEH-3746).
 */

import { Eye } from "@phosphor-icons/react";

/**
 * @param {{ className?: string, children?: import("react").ReactNode, [key: string]: any }} props
 */
export default function PreviewBanner({ className = "", children, ...rest }) {
  return (
    // rest first: role stays "status" whatever the caller passes
    <p
      {...rest}
      role="status"
      className={`flex items-start gap-2 bg-green-50 border border-primary/30 rounded-md px-4 py-3 text-sm text-text text-start ${className}`.trim()}
    >
      <Eye size={18} aria-hidden="true" className="shrink-0 mt-0.5 text-primary" />
      <span>{children}</span>
    </p>
  );
}
