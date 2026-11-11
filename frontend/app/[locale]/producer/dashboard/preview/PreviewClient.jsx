"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Eye } from "@phosphor-icons/react";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "@/i18n/navigation";
import { PreviewModeProvider } from "@/lib/preview-mode";
import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";

/**
 * Module:   PreviewClient
 * Purpose:  Render the owner's own business page inside the dashboard, from a
 *           CLIENT fetch carrying her token.
 * Does NOT: fetch on the server. `lib/server-fetch.js` deliberately sends no
 *           Authorization, which is why the public route 404s her — the whole
 *           point of this route is to ask as her instead.
 * History:  MEH-2916 (C4).
 */
export default function PreviewClient() {
  const t = useTranslations("dashboard.page_preview");
  const { user, loading } = useAuth();
  const router = useRouter();

  const producerId = user?.producer_id;
  const isApproved = user?.producer_status === "approved";

  // Sapir, 11/11: once the business is approved the preview has nothing left
  // to show that the real page does not, so the route sends her there. The
  // tab link stops pointing here at the same moment (DashboardLayoutClient),
  // so this is the direct-URL and already-open-tab path, not the usual one.
  useEffect(() => {
    if (!loading && isApproved && producerId) {
      router.replace(`/producer/${producerId}`);
    }
  }, [loading, isApproved, producerId, router]);

  // The dashboard layout owns the auth gate (skeleton, /login redirect, the
  // wrong-role state), so by the time this renders she is a producer. What is
  // left is the window where `user` has not arrived yet, and the approved case
  // above while the replace is in flight: render nothing rather than fire a
  // fetch for `/producers/undefined`.
  if (loading || !producerId || isApproved) return null;

  return (
    <div className="max-w-6xl mx-auto" data-testid="producer-page-preview">
      <p
        role="status"
        data-testid="preview-banner"
        className="flex items-start gap-2 bg-green-50 border border-primary/30 rounded-md px-4 py-3 mb-4 text-sm text-text text-start"
      >
        <Eye size={18} aria-hidden="true" className="shrink-0 mt-0.5 text-primary" />
        <span>{t("banner")}</span>
      </p>

      {/* Inside the provider the page hides favourite + share (a shared link
          would 404 for whoever opened it) and leaves the contact buttons
          visible but inert — Sapir's ruling, 11/11. */}
      <PreviewModeProvider>
        <ProducerDetail fetchPath={`/producers/${producerId}`} />
      </PreviewModeProvider>
    </div>
  );
}
