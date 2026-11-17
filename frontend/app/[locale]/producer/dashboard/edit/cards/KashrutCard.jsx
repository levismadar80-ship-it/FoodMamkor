"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/KashrutCard
 * Purpose:  Kashrut certificate requests: approved badges, own requests, request form.
 * Does NOT: approve a certificate: that is the admin kashrut screen.
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Warning, CheckCircle } from "@phosphor-icons/react";
import KashrutBadgeStrip, { CODE_TO_KEY } from "@/components/KashrutBadgeStrip";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

// ============================================================
// MEH-1167: producer-facing kashrut-request card — closes the verified-only
// supply gap (MEH-986 removed free-text kosher from every consumer surface, so
// this request flow is the ONLY way a business appears as kosher). Backend POST
// lived since MEH-51 with zero callers (MEH-1392 audit F0); this card + the new
// GET /producers/me/kashrut-requests + POST /upload/kashrut-cert wire it up.
// Three zones: approved badges (reuse KashrutBadgeStrip), own pending/rejected
// requests with status chips, and the request form. Self-fetches its request
// list (not on the /producers/me profile). v1 is image-only (PDF = non-goal).
// REUSES: edit/cards.jsx OwnerStoryCard (upload + persistent-success contract),
// LicenseCard (MEH-1270 role="status" success), components/KashrutBadgeStrip.
// ============================================================

// MEH-1852: the code → he.json `kashrut.badges.*` key axis is imported from
// KashrutBadgeStrip (line 29), which already owns it and which this file
// already imports for the approved-badges zone. There is no marginal cost here
// and never was.
const KASHRUT_CODES = Object.keys(CODE_TO_KEY);

// Exported for isolation tests (EditTabKashrutCard.test.jsx) — see CategoriesCard.
export function KashrutCard({ profile, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.kashrut");
  const tBadges = useTranslations("kashrut.badges");
  const [requests, setRequests] = useState([]);
  // MEH-2405: the missing-cert nudge reads `requests`; until the list has
  // actually loaded, "no cert on file" is unknown, not missing.
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [badgeCode, setBadgeCode] = useState("");
  const [certUrl, setCertUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // A half-filled request form counts as unsaved work (page-level aggregate).
  const dirty = Boolean(badgeCode || certUrl);
  useEffect(() => {
    reportDirty("kashrut", dirty);
    return () => reportDirty("kashrut", false);
  }, [dirty, reportDirty]);

  const loadRequests = useCallback(async () => {
    try {
      const r = await api.get("/producers/me/kashrut-requests");
      setRequests(Array.isArray(r.data) ? r.data : []);
      setRequestsLoaded(true);
    } catch {
      // Non-blocking: the request form still works if the list read fails.
    }
  }, []);
  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const uploadCert = async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/kashrut-cert", fd);
      setCertUrl(r.data.url);
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!badgeCode) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/producers/me/kashrut-request", {
        badge_code: badgeCode,
        cert_url: certUrl || null,
      });
      setSubmitted(true);
      setBadgeCode("");
      setCertUrl("");
      loadRequests();
    } catch (err) {
      // 409 duplicate-pending surfaces the backend Hebrew detail inline.
      setError(detailToMessage(err?.response?.data?.detail) || t("error_submit"));
    } finally {
      setSubmitting(false);
    }
  };

  const approvedBadges = profile?.kashrut_badges || [];
  // MEH-2518: a revoked badge stays in the list with its reason, like a
  // rejected request — the owner should see why it left the page.
  // A rejected/revoked row is history once a newer request for the same badge
  // exists (a re-request or renewal) — showing «התג הוסר» beside the re-approved
  // badge would contradict it.
  const newerRequestFor = (r) =>
    requests.some(
      (o) => o.id !== r.id && o.badge_code === r.badge_code && o.created_at > r.created_at,
    );
  const openRequests = requests.filter(
    (r) =>
      r.status === "pending" ||
      ((r.status === "rejected" || r.status === "revoked") && !newerRequestFor(r)),
  );
  const isEmpty = approvedBadges.length === 0 && openRequests.length === 0;
  // MEH-2405: an approved badge is tappable on the public page only when a
  // certificate is servable for it (MEH-1672). Approved or pending with a
  // photo counts as covered — pending already shows its own chip below.
  const missingCert = requestsLoaded
    ? approvedBadges.filter(
        (code) =>
          !requests.some(
            (r) =>
              r.badge_code === code &&
              r.cert_url &&
              (r.status === "approved" || r.status === "pending"),
          ),
      )
    : [];

  return (
    <div className="space-y-4">
      {/* Chrome + heading live in the EditAccordionCard header (MEH-1116). */}
      <p className="text-xs text-fg-muted">{t("intro")}</p>

      {/* MEH-1439: the owner filled the free-text kosher field but has no
          verified certificate — free-text drives NO public "כשר" filter
          appearance (MEH-986, verified-only). Explain why + point at the cert. */}
      {profile?.kosher?.trim() && !profile?.kashrut_verified_at && (
        <p data-testid="kashrut-filter-hint" className="text-xs text-fg-muted">
          {t("filter_hint")}
        </p>
      )}

      {/* Zone 1 — approved badges (reuse the public strip + its expiry gate). */}
      {approvedBadges.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium block">{t("approved_heading")}</span>
          <KashrutBadgeStrip
            badges={approvedBadges}
            verified_at={profile?.kashrut_verified_at}
            expires_at={profile?.kashrut_expires_at}
          />
          {missingCert.map((code) => {
            const key = CODE_TO_KEY[code];
            return (
              <p
                key={code}
                data-testid="kashrut-missing-cert"
                className="text-xs text-fg-muted"
              >
                {t("missing_cert", { badge: key ? tBadges(`${key}.label`) : code })}
              </p>
            );
          })}
        </div>
      )}

      {/* Zone 2 — own requests with status chips. */}
      {openRequests.length > 0 && (
        <ul className="space-y-1.5" data-testid="kashrut-requests">
          {openRequests.map((r) => {
            const key = CODE_TO_KEY[r.badge_code];
            const label = key ? tBadges(`${key}.label`) : r.badge_code;
            const rejected = r.status === "rejected" || r.status === "revoked";
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{label}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    rejected ? "bg-error/10 text-error" : "bg-primary/10 text-primary"
                  }`}
                >
                  {r.status === "revoked"
                    ? t("status_revoked")
                    : rejected
                      ? t("status_rejected")
                      : t("status_pending")}
                </span>
                {rejected && r.notes && (
                  <span className="text-xs text-fg-muted">{r.notes}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isEmpty && <p className="text-xs text-fg-muted">{t("empty")}</p>}

      {/* Zone 3 — request form. */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-1.5">
          <label htmlFor="kashrut-badge-select" className="text-sm font-medium block">
            {t("select_label")}
          </label>
          <select
            id="kashrut-badge-select"
            value={badgeCode}
            onChange={(e) => {
              setBadgeCode(e.target.value);
              setSubmitted(false);
            }}
            className="w-full border border-primary/30 bg-primary/5 rounded-sm px-3 py-2 text-sm focus-ring"
            data-testid="kashrut-badge-select"
          >
            <option value="">{t("select_placeholder")}</option>
            {KASHRUT_CODES.map((code) => (
              <option key={code} value={code}>
                {tBadges(`${CODE_TO_KEY[code]}.label`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium block">{t("upload_label")}</span>
          <div className="flex items-center gap-3">
            {certUrl && (
              /* raw img: certificate upload preview, same mixed provenance
                 as the photo above (upload.py:115). */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={certUrl}
                alt={t("upload_label")}
                className="w-16 h-16 rounded-sm object-cover border border-border"
              />
            )}
            <label className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark cursor-pointer transition">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={uploadCert}
                disabled={uploading}
                data-testid="kashrut-cert-input"
              />
              <span aria-live="polite">
                {uploading
                  ? t("uploading")
                  : certUrl
                    ? t("upload_replace_cta")
                    : t("upload_cta")}
              </span>
            </label>
          </div>
        </div>

        <Button
          onClick={submit}
          disabled={submitting || !badgeCode}
          variant="primary" size="sm"
        >
          <span aria-live="polite" aria-atomic="true">
            {submitting ? t("submitting") : t("submit_cta")}
          </span>
        </Button>

        {error && (
          <InlineMessage size="xs" className="flex items-start gap-1.5">
            <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0 mt-px" />
            {error}
          </InlineMessage>
        )}
        {submitted && !error && (
          <p
            className="flex items-center gap-1.5 text-xs text-primary"
            role="status"
            data-testid="kashrut-submit-success"
          >
            <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
            {t("success")}
          </p>
        )}
      </div>
    </div>
  );
}
