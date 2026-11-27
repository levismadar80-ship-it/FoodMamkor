// @ts-check
/**
 * Module:   AdminDuplicateMatches
 * Purpose:  On the admin «new business» form, after the server answered 409
 *           DUPLICATE_BUSINESS, list the businesses we already have that share
 *           a phone, email, Instagram, website or Facebook with the one being
 *           created, each with a link to its edit page, and let the admin go
 *           on only by a second, explicit click (MEH-3883).
 * Touches:  nothing; the parent resends the form with `allow_duplicate`.
 * Does NOT: decide what matches (services/admin_create_duplicates.py), or
 *           show anything outside /admin.
 * Related:  components/admin/ProducerForm.jsx (the caller) ·
 *           app/[locale]/admin/producers/AdminDraftTwin.jsx (same reason labels).
 * History:  MEH-3883 (creation).
 */
"use client";

import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import Link from "@/components/ui/Link";

/**
 * @typedef {{ id: string, name: string, status?: string | null,
 *   owner_email?: string | null, reasons: string[] }} DuplicateMatch
 */

/** The 409 body's matches and total, or null when the error is something else.
 * @param {any} err
 * @returns {{ matches: DuplicateMatch[], total: number } | null}
 */
export function duplicateMatchesOf(err) {
  const detail = err?.response?.status === 409 ? err.response.data?.detail : null;
  if (detail?.code !== "DUPLICATE_BUSINESS" || !Array.isArray(detail.matches)) return null;
  const total = Number.isInteger(detail.total) ? detail.total : detail.matches.length;
  return { matches: detail.matches, total };
}

/**
 * @param {{ matches: DuplicateMatch[], total?: number, busy?: boolean, onCreateAnyway: () => void }} props
 */
export default function AdminDuplicateMatches({ matches, total = matches.length, busy = false, onCreateAnyway }) {
  const t = useTranslations("admin.producers.form.duplicate");
  const tReason = useTranslations("admin.producers.table.draft_twin.reasons");
  const tStatus = useTranslations("admin.producers.status_label");
  return (
    // MEH-3072: the in-place message look (role="alert", one red) is InlineMessage's.
    <InlineMessage
      as="div"
      variant="box"
      size="inherit"
      data-testid="admin-duplicate-matches"
      className="rounded-md p-4 space-y-3"
    >
      <p className="font-semibold">{t("title")}</p>
      <p className="text-sm text-muted">{t("intro")}</p>
      <ul className="space-y-2">
        {matches.map((m) => (
          <li key={m.id} className="text-sm">
            <Link href={`/admin/producers/${m.id}/edit`} className="font-medium underline">
              {m.name || t("open")}
            </Link>
            <span className="text-muted">
              {" · "}
              {[
                m.status && tStatus.has(m.status) ? tStatus(m.status) : null,
                m.owner_email ? null : t("no_owner"),
                m.reasons.filter((r) => tReason.has(r)).map((r) => tReason(r)).join(", "),
              ]
                .filter(Boolean)
                .join(" · ")}
              {m.owner_email && (
                <>
                  {" · "}
                  {t("owner_prefix")} <bdi dir="ltr">{m.owner_email}</bdi>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {total > matches.length && (
        <p className="text-sm text-muted">{t("more", { count: total - matches.length })}</p>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={onCreateAnyway}
        data-testid="admin-duplicate-create-anyway"
      >
        {t("create_anyway")}
      </Button>
    </InlineMessage>
  );
}
