import PreviewClient from "./PreviewClient";

/**
 * Route:    /producer/dashboard/preview
 * Purpose:  Let an owner whose business is not yet approved see how her page
 *           will look, instead of the «בית העסק הזה לא נמצא» that
 *           /producer/{id} correctly shows a stranger.
 * Touches:  nothing itself — the client child reads GET /producers/{id} with
 *           her token.
 * Does NOT: change what /producer/{id} answers. MEH-2101's real 404 for an
 *           anonymous or SSR caller is Sapir's explicit ruling (11/11) and is
 *           pinned by tests/test_meh2916_owner_preview_contract.py.
 * History:  MEH-2916 (C4 — the A4 regression).
 */

// A server component purely so this export exists: the sibling dashboard
// sub-pages are bare "use client" files and cannot carry metadata.
//
// `noindex` belongs here even though public/robots.txt already disallows
// /producer/dashboard/ for every crawler group. The two do different jobs: a
// Disallow stops a crawler fetching the URL, and therefore also stops it ever
// SEEING a noindex tag — so the tag is what covers a URL that reaches an index
// another way, via a link or a sitemap mistake.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function ProducerPagePreview() {
  return <PreviewClient />;
}
