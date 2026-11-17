// @ts-check
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, LinkBreak } from "@phosphor-icons/react";

import api from "@/lib/api";
import { PreviewModeProvider } from "@/lib/preview-mode";
import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";
import StatusPage from "@/components/StatusPage";
import BrandLoader from "@/components/BrandLoader";

/**
 * Module:   DraftPreviewClient
 * Purpose:  Show a business the page we prepared for it, from the read-only
 *           link the admin sent (MEH-3377).
 * Touches:  GET /producer-preview/<token>
 *           (backend/app/routers/producer_draft_preview.py).
 * Does NOT: hand the payload to ProducerDetail's own fetch. It fetches here
 *           and passes `initialProducer`, because a dead link has to become
 *           the «לא פעיל» page below and ProducerDetail's own miss renders
 *           «בית העסק הזה לא נמצא» — true of the public page, wrong here.
 * Related:  app/[locale]/producer/dashboard/preview/PreviewClient.jsx (the
 *           owner's preview; same PreviewModeProvider, so favourite and share
 *           are hidden and the contact buttons do nothing) ·
 *           components/admin/DraftPreviewLinkPanel.jsx (where the link is made).
 *
 * Three states: loading → the page (valid link) | the dead-link page (expired,
 * published, claimed, deleted or mistyped — the server answers one 404 for all).
 */
export default function DraftPreviewClient({ token }) {
  const t = useTranslations("draft_preview");
  // undefined = loading, null = dead link, object = the draft.
  const [producer, setProducer] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/producer-preview/${encodeURIComponent(token)}`)
      .then((r) => {
        if (!cancelled) setProducer(r.data?.id ? r.data : null);
      })
      .catch(() => {
        if (!cancelled) setProducer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (producer === undefined) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" data-testid="draft-preview-loading">
        <BrandLoader />
      </div>
    );
  }

  if (producer === null) {
    return (
      <StatusPage
        testid="draft-preview-invalid"
        icon={LinkBreak}
        title={t("invalid.title")}
        body={t("invalid.body")}
        primary={{ href: "/contact?topic=business", label: t("invalid.contact") }}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto" data-testid="draft-preview">
      <p
        role="status"
        data-testid="draft-preview-banner"
        className="flex items-start gap-2 bg-green-50 border border-primary/30 rounded-md px-4 py-3 mx-4 mt-4 mb-2 text-sm text-text text-start"
      >
        <Eye size={18} aria-hidden="true" className="shrink-0 mt-0.5 text-primary" />
        <span>{t("banner")}</span>
      </p>
      <PreviewModeProvider>
        <ProducerDetail initialProducer={producer} />
      </PreviewModeProvider>
    </div>
  );
}
