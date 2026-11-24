// @ts-check
"use client";

/**
 * Module:   preview-mode
 * Purpose:  Tell the business-page tree that it is being rendered as the
 *           OWNER'S PREVIEW rather than as the live public page.
 * Does NOT: decide what any surface does about it — each consumer owns its own
 *           behaviour. The three that care are listed under Related.
 * Related:  providers: app/[locale]/producer/dashboard/preview/PreviewClient.jsx,
 *           draft-preview/[token]/DraftPreviewClient.jsx (MEH-3377, no login),
 *           producer/dashboard/orders/preview/OrderPreviewClient.jsx (the only
 *           one with `ownerOrderMenu`, MEH-3746). Consumers:
 *           producer/[id]/components/ProducerHeader.jsx (hides
 *           favourite + share), components/ImageGallery.jsx (hides the hero
 *           heart), components/SaveButton.jsx (hides the event / experience /
 *           recipe heart, MEH-2969), producer/[id]/components/StickyContactBar.jsx and
 *           ContactCard.jsx (contact stays visible, stops acting),
 *           components/public/OrderSheet.jsx + OrderSheetPhone.jsx (no quote,
 *           no send, no code), lib/use-order-cart.js (reads useOwnerOrderMenu).
 * History:  MEH-2916 (C4 — the A4 regression; Sapir's ruling 11/11);
 *           MEH-3746 (ownerOrderMenu: an explicit opt-in, because the
 *           draft-preview page has no owner session to read the menu with).
 */

import { createContext, useContext } from "react";

/**
 * MEH-2916: a context rather than a prop threaded through ProducerDetail.
 *
 * The three surfaces that change sit at three different depths — the header,
 * the gallery (a SHARED component used on other pages too) and the contact
 * bar — and none of them is a direct child. Prop-drilling would change four
 * component signatures to carry a flag only one caller ever sets, and
 * ImageGallery's signature is shared with surfaces that have nothing to do
 * with this.
 *
 * Defaults to `false`, so every existing render — the public page included —
 * is untouched and needs no provider.
 */
const PreviewModeContext = createContext(false);
// MEH-3746: true only where the signed-in owner previews her own order form.
// Not implied by preview mode: the draft-preview page is opened without a
// login, and the dashboard preview of a pending business has no menu yet.
const OwnerOrderMenuContext = createContext(false);

/** @param {{ children: import("react").ReactNode, ownerOrderMenu?: boolean }} props */
export function PreviewModeProvider({ children, ownerOrderMenu = false }) {
  return (
    <PreviewModeContext.Provider value={true}>
      <OwnerOrderMenuContext.Provider value={ownerOrderMenu}>{children}</OwnerOrderMenuContext.Provider>
    </PreviewModeContext.Provider>
  );
}

/** @returns {boolean} true only inside the owner's dashboard preview. */
export function usePreviewMode() {
  return useContext(PreviewModeContext);
}

/** @returns {boolean} true only in the owner's order preview (MEH-3746). */
export function useOwnerOrderMenu() {
  return useContext(OwnerOrderMenuContext);
}
