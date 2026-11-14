// @ts-check
"use client";

/**
 * Module:   ReviewReportMenu
 * Purpose:  The ⋮ at the top-end of a review card, with one item
 *           «דיווח על הביקורת» that opens the report dialog (MEH-3260).
 *           Guests, signed-in visitors and the business owner may report;
 *           the review's own author does not see the menu.
 * Touches:  POST /reports/review (routers/report_info.py) — email to the
 *           admin only, no automatic action on the review.
 * Does NOT: hide or delete anything (admin does that on /admin/reviews), or
 *           decide who may see the review. The menu shell is
 *           admin/AdminRowMenu.jsx (`touch` = 44px public target); the
 *           dialog shell is ui/Dialog.jsx, modelled on ReportInfoModal.jsx.
 * Related:  components/ReviewsSection.jsx (public card),
 *           app/[locale]/producer/dashboard/reviews/page.js (owner card).
 * History:  MEH-3260 (creation; placement option א and copy decided on
 *           review, 14/11).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import AdminRowMenu from "@/components/admin/AdminRowMenu";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { useAccountPrefillValue } from "@/lib/use-account-prefill";

const REASONS = ["fake", "abusive", "personal", "irrelevant", "other"];

/**
 * @param {{ reviewId: string, producerId: string, onClose: () => void }} props
 */
function ReviewReportDialog({ reviewId, producerId, onClose }) {
  const t = useTranslations("reviews.report");
  const tInfo = useTranslations("modals.report_info");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  useAccountPrefillValue(setEmail, "email");
  const [loading, setLoading] = useState(false);

  const needsDetails = reason === "other";
  const canSubmit = reason !== "" && (!needsDetails || details.trim().length > 0);

  /** @param {any} e */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      await api.post("/reports/review", {
        producer_slug: producerId,
        review_id: reviewId,
        reason,
        details: details.trim() || null,
        reporter_email: email.trim() || null,
      });
      showToast.success(t("success_toast"), { duration: 4000 });
      onClose();
    } catch {
      showToast.error(tInfo("toasts.error"));
    } finally {
      setLoading(false);
    }
  };

  const titleId = `review-report-title-${reviewId}`;
  return (
    <Dialog labelledBy={titleId} size="sm" onClose={onClose} dismissible={!loading}>
      <h2 id={titleId} className="font-headline-md text-lg font-bold text-text mb-2">
        {t("dialog_title")}
      </h2>
      <p className="text-sm text-fg-muted mb-4">{t("dialog_intro")}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-1">
          <legend className="sr-only">{t("dialog_title")}</legend>
          {REASONS.map((r, i) => (
            <label
              key={r}
              className="flex items-center gap-3 min-h-11 text-sm text-text cursor-pointer"
            >
              <input
                type="radio"
                name={`review-report-reason-${reviewId}`}
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                data-autofocus={i === 0 ? true : undefined}
                className="accent-primary size-4"
              />
              {t(`reason_${r}`)}
            </label>
          ))}
        </fieldset>

        <Textarea
          id={`review-report-details-${reviewId}`}
          label={needsDetails ? t("details_required") : t("details_label")}
          required={needsDetails}
          maxLength={1000}
          rows={3}
          value={details}
          onChange={(/** @type {any} */ e) => setDetails(e.target.value)}
          className="text-start resize-none"
        />

        <Input
          size="sm"
          id={`review-report-email-${reviewId}`}
          type="email"
          label={tInfo("email_label")}
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(/** @type {any} */ e) => setEmail(e.target.value)}
          className="text-start"
        />

        <div className="flex gap-3 pt-1">
          <Button
            type="submit"
            disabled={loading || !canSubmit}
            variant="primary"
            size="sm"
            className="flex-1"
          >
            {loading ? tInfo("submit_loading") : tInfo("submit")}
          </Button>
          <Button type="button" onClick={onClose} variant="outlined" size="sm" disabled={loading}>
            {tInfo("close")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * @param {{ review: { id: string, user_id?: string | null }, producerId: string, authorName: string }} props
 */
export default function ReviewReportMenu({ review, producerId, authorName }) {
  const t = useTranslations("reviews.report");
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  // Wait for the session: before it loads, the author would briefly see the
  // menu on her own review.
  if (loading) return null;
  // The author does not report her own review (she can edit or delete it).
  if (user && review.user_id && String(user.id) === String(review.user_id)) return null;

  return (
    <>
      <AdminRowMenu
        touch
        ariaLabel={t("menu_aria", { user: authorName })}
        items={[{ key: "report", label: t("report_link"), onSelect: () => setOpen(true) }]}
      />
      {open && (
        <ReviewReportDialog
          reviewId={review.id}
          producerId={producerId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
