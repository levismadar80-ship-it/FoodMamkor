"use client";

/**
 * Module:   preview-mode
 * Purpose:  Tell the business-page tree that it is being rendered as the
 *           OWNER'S PREVIEW rather than as the live public page.
 * Does NOT: decide what any surface does about it — each consumer owns its own
 *           behaviour. The three that care are listed under Related.
 * Related:  app/[locale]/producer/dashboard/preview/PreviewClient.jsx (the only
 *           provider), producer/[id]/components/ProducerHeader.jsx (hides
 *           favourite + share), components/ImageGallery.jsx (hides the hero
 *           heart), producer/[id]/components/StickyContactBar.jsx and
 *           ContactCard.jsx (contact stays visible, stops acting).
 * History:  MEH-2916 (C4 — the A4 regression; Sapir's ruling 11/11).
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

export function PreviewModeProvider({ children }) {
  return <PreviewModeContext.Provider value={true}>{children}</PreviewModeContext.Provider>;
}

/** @returns {boolean} true only inside the owner's dashboard preview. */
export function usePreviewMode() {
  return useContext(PreviewModeContext);
}
