// @ts-check
"use client";

/**
 * Module:   OrderPreviewClient
 * Purpose:  The owner's business page inside the dashboard, in preview mode,
 *           with her own order menu: she picks products and opens the order
 *           form to see what a buyer sees.
 * Does NOT: fetch the menu itself (lib/use-order-cart.js does, and switches to
 *           the owner's preview route under `ownerOrderMenu`) or decide
 *           what is inert (each consumer of usePreviewMode does).
 * Related:  dashboard/preview/PreviewClient.jsx (the same shell for a business
 *           not yet approved), components/public/OrderSheet.jsx
 * History:  MEH-3746 (creation).
 */

import { useTranslations } from "next-intl";
import { Eye } from "@phosphor-icons/react";

import BackLink from "@/components/ui/BackLink";
import { useAuth } from "@/lib/auth-context";
import { PreviewModeProvider } from "@/lib/preview-mode";
import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";

export default function OrderPreviewClient() {
  const t = useTranslations("dashboard.producer.orders");
  const { user, loading } = useAuth();
  const producerId = user?.producer_id;
  // The dashboard layout owns the auth gate; this is only the window before
  // `user` arrives — no fetch for `/producers/undefined`.
  if (loading || !producerId) return null;

  return (
    <div className="max-w-6xl mx-auto" data-testid="order-preview">
      <div className="px-4 pt-4">
        <BackLink href="/producer/dashboard/orders" label={t("title")} />
      </div>
      <p
        role="status"
        data-testid="order-preview-banner"
        className="flex items-start gap-2 bg-green-50 border border-primary/30 rounded-md px-4 py-3 mx-4 mt-3 text-sm text-text text-start"
      >
        <Eye size={18} aria-hidden="true" className="shrink-0 mt-0.5 text-primary" />
        <span>{t("preview_banner")}</span>
      </p>
      <PreviewModeProvider ownerOrderMenu>
        <ProducerDetail fetchPath={`/producers/${producerId}`} />
      </PreviewModeProvider>
    </div>
  );
}
