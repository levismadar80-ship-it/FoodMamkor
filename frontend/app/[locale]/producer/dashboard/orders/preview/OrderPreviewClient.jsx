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
 * History:  MEH-3746 (creation); MEH-3763 a line under the banner when the
 *           form is missing a step (no product, no hours) or did not load.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, Info, Warning } from "@phosphor-icons/react";

import BackLink from "@/components/ui/BackLink";
import InlineMessage from "@/components/ui/InlineMessage";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { loadOwnerMenuPreview } from "@/lib/order-cart";
import { PreviewModeProvider } from "@/lib/preview-mode";
import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";

/**
 * MEH-3763: which step the order form still lacks, or null when a buyer can
 * order. "loading" until the read settles, so no line flashes. A second read
 * of the menu useOrderCart also loads (inside ProducerDetail), on purpose: the
 * cart does not report an empty or failed menu, and one cheap GET per visit
 * keeps this page from reaching into it. Waits for the owner's business id.
 * @param {string | undefined} producerId
 * @returns {"loading" | "failed" | "no_products" | "no_slots" | null}
 */
function useMissingStep(producerId) {
  const [step, setStep] = useState(/** @type {"loading" | "failed" | "no_products" | "no_slots" | null} */ ("loading"));
  useEffect(() => {
    if (!producerId) return undefined;
    let live = true;
    loadOwnerMenuPreview().then((menu) => {
      if (!live) return;
      if (!menu) setStep("failed");
      else if (menu.products.length === 0) setStep("no_products");
      else if (menu.slots.length === 0) setStep("no_slots");
      else setStep(null);
    });
    return () => {
      live = false;
    };
  }, [producerId]);
  return step;
}

/** @param {"failed" | "no_products" | "no_slots"} step */
function stepKey(step) {
  if (step === "failed") return "preview_load_failed";
  return step === "no_products" ? "preview_no_products" : "preview_no_slots";
}

/** @param {{ step: "failed" | "no_products" | "no_slots" }} props */
function MissingStepLine({ step }) {
  const tr = useTranslations("dashboard.producer.orders");
  const failed = step === "failed";
  const Icon = failed ? Warning : Info;
  // REUSES: components/ui/InlineMessage.jsx — the one in-page message look.
  return (
    <InlineMessage
      tone={failed ? "error" : "info"}
      variant="box"
      data-testid="order-preview-missing"
      data-step={step}
      className="flex items-start gap-2 rounded-md px-4 py-3 mx-4 mt-2 text-start"
    >
      <Icon size={18} aria-hidden="true" className="shrink-0 mt-0.5" />
      <span>
        {tr(stepKey(step))}{" "}
        {!failed && (
          <Link href="/producer/dashboard/orders" className="text-primary font-medium underline">
            {tr("preview_fix_link")}
          </Link>
        )}
      </span>
    </InlineMessage>
  );
}

export default function OrderPreviewClient() {
  const t = useTranslations("dashboard.producer.orders");
  const { user, loading } = useAuth();
  const producerId = user?.producer_id;
  const step = useMissingStep(producerId);
  // The dashboard layout owns the auth gate; this is only the window before
  // `user` arrives — no fetch for `/producers/undefined`.
  if (loading || !producerId) return null;

  return (
    <div className="max-w-6xl mx-auto" data-testid="order-preview" data-menu-step={step ?? "ready"}>
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
      {step && step !== "loading" && <MissingStepLine step={step} />}
      <PreviewModeProvider ownerOrderMenu>
        {/* MEH-3777: «→ הזמנות» above is the way back; no second «→ חזרה». */}
        <ProducerDetail fetchPath={`/producers/${producerId}`} hideHistoryBack />
      </PreviewModeProvider>
    </div>
  );
}
