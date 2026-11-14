"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { ProducerClaimLinkSchema } from "@/lib/api-schemas";
import Button from "@/components/ui/Button";
import { formatDate } from "@/lib/format-date";
import InlineMessage from "@/components/ui/InlineMessage";
import { copyOrThrow } from "@/lib/clipboard";
import Input from "@/components/ui/Input";

/**
 * Module:   ClaimLinkPanel
 * Purpose:  The admin side of the owner-claim link: on a DRAFT business's edit
 *           page, mint the signed link the owner opens to take the page over
 *           with her own account (MEH-2321 chunk C).
 * Touches:  POST /admin/producers/{id}/claim-link (producer_claim.py) — stateless,
 *           re-mints a 14-day token per click, no DB write.
 * Does NOT: send the link anywhere (the admin pastes it to the owner herself),
 *           or decide who may claim — the server does (draft + no owner, 409
 *           otherwise, shown here verbatim).
 * Related:  components/producer/RequestReviewCard.jsx (the copy pattern),
 *           app/[locale]/admin/producers/[id]/edit/page.js (gates on draft).
 * History:  MEH-2325.
 *
 * Mint on click, copy on a second click: the clipboard write stays inside its
 * own user gesture, which Safari needs (same reason as RequestReviewCard).
 */
export default function ClaimLinkPanel({ producerId }) {
  const t = useTranslations("admin.producers.claim");
  const locale = useLocale();
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimer = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const create = async () => {
    setBusy(true);
    setError(null);
    // A failed re-mint must not leave the previous link on screen beside the
    // error: after a 409 that link belongs to a draft that is no longer
    // claimable, so it is dead.
    setLink(null);
    setCopied(false);
    setCopyFailed(false);
    try {
      const r = await api.post(`/admin/producers/${producerId}/claim-link`);
      // Rule 19: a malformed payload is an error, never a link to paste.
      const parsed = ProducerClaimLinkSchema.safeParse(r.data);
      if (parsed.success) setLink(parsed.data);
      else setError(t("error"));
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("error"));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!link) return;
    copyOrThrow(link.url)
      .then(() => {
        setCopyFailed(false);
        setCopied(true);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopyFailed(true));
  };

  const expires = link
    ? formatDate(link.expires_at, locale)
    : null;

  return (
    <section
      data-testid="claim-link-panel"
      className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl"
    >
      <h2 className="font-semibold text-lg mb-2 text-primary">{t("title")}</h2>
      <p className="text-sm text-muted mb-4">{t("intro")}</p>

      {link && (
        <div className="mb-4" data-testid="claim-link-result">
          <label className="block text-sm text-muted mb-1" htmlFor="claim-link-url">
            {t("url_label")}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input inline size="sm"
              id="claim-link-url"
              data-testid="claim-link-url"
              readOnly
              dir="ltr"
              value={link.url}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0"
            />
            <Button
              type="button"
              data-testid="claim-link-copy"
              onClick={copy}
              variant="primary" size="sm"
            >
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          <p className="text-xs text-muted mt-2" data-testid="claim-link-expires">
            {t("expires", { date: expires })}
          </p>
          {copyFailed && (
            <InlineMessage className="mt-2" data-testid="claim-link-copy-failed">
              {t("copy_failed")}
            </InlineMessage>
          )}
        </div>
      )}

      {error && (
        <InlineMessage className="mb-4" data-testid="claim-link-error">
          {error}
        </InlineMessage>
      )}

      <button
        type="button"
        data-testid="claim-link-create"
        onClick={create}
        disabled={busy}
        className="min-h-touch bg-surface border border-primary text-primary rounded-full px-6 py-2 text-sm font-medium hover:bg-background transition disabled:opacity-50"
      >
        {busy ? t("creating") : t("create")}
      </button>
    </section>
  );
}
