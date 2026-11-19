// @ts-check
"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { detailToMessage } from "@/lib/errors";
import { ProducerClaimLinkSchema } from "@/lib/api-schemas";
import Button from "@/components/ui/Button";
import { formatDate } from "@/lib/format-date";
import InlineMessage from "@/components/ui/InlineMessage";
import { copyOrThrow } from "@/lib/clipboard";
import Input from "@/components/ui/Input";

/**
 * Module:   AdminLinkPanel
 * Purpose:  The admin panel that mints a signed 14-day link for a DRAFT
 *           business and lets her copy it: the owner-claim link
 *           (ClaimLinkPanel) and the read-only preview link
 *           (DraftPreviewLinkPanel) are this one panel with a different
 *           endpoint, copy namespace and test-id prefix (MEH-3464).
 * Touches:  whatever `mint` posts (each wrapper names its own endpoint, so the
 *           static API-contract audit can read it) — stateless, no DB write.
 * Does NOT: send the link anywhere (the admin pastes it herself), or decide
 *           who may use it — the server does (409 shown verbatim).
 * Related:  components/admin/ClaimLinkPanel.jsx · DraftPreviewLinkPanel.jsx.
 * History:  MEH-2325 (claim panel) · MEH-3377 (preview panel, a copy) ·
 *           MEH-3464 (one panel).
 *
 * Mint on click, copy on a second click: the clipboard write stays inside its
 * own user gesture, which Safari needs (same reason as RequestReviewCard).
 *
 * @param {{ mint: () => Promise<{ data: unknown }>, namespace: string, testid: string }} props
 */
export default function AdminLinkPanel({ mint, namespace, testid }) {
  const t = useTranslations(namespace);
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
    // error: after a 409 the draft is published or has an owner, so that link
    // is dead.
    setLink(null);
    setCopied(false);
    setCopyFailed(false);
    try {
      const r = await mint();
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
      data-testid={`${testid}-panel`}
      className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl"
    >
      <h2 className="font-semibold text-lg mb-2 text-primary">{t("title")}</h2>
      <p className="text-sm text-muted mb-4">{t("intro")}</p>

      {link && (
        <div className="mb-4" data-testid={`${testid}-result`}>
          <label className="block text-sm text-muted mb-1" htmlFor={`${testid}-url`}>
            {t("url_label")}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input inline size="sm"
              id={`${testid}-url`}
              data-testid={`${testid}-url`}
              readOnly
              dir="ltr"
              value={link.url}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0"
            />
            <Button
              type="button"
              data-testid={`${testid}-copy`}
              onClick={copy}
              variant="primary" size="sm"
            >
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          <p className="text-xs text-muted mt-2" data-testid={`${testid}-expires`}>
            {t("expires", { date: expires })}
          </p>
          {copyFailed && (
            <InlineMessage className="mt-2" data-testid={`${testid}-copy-failed`}>
              {t("copy_failed")}
            </InlineMessage>
          )}
        </div>
      )}

      {error && (
        <InlineMessage className="mb-4" data-testid={`${testid}-error`}>
          {error}
        </InlineMessage>
      )}

      <Button
        type="button"
        variant="outlined"
        size="sm"
        data-testid={`${testid}-create`}
        onClick={create}
        disabled={busy}
      >
        {busy ? t("creating") : t("create")}
      </Button>
    </section>
  );
}
