"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/LicenseCard
 * Purpose:  Owner-facing producer licence number editor.
 * Does NOT: decide when a licence is required: the server does (producer_me.py).
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning, CheckCircle } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { requiresProducerLicense, hasLicenseFormatWarning } from "@/lib/license-required-categories";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

// ============================================================
// MEH-1258: producer-facing license-number editor — closes the "נשאר להשלים:
// חסר מספר רישיון יצרן" loop (MEH-1011 banner asks, MEH-1236 resubmits, this
// card is where she actually fills it). Backend write path already open
// (MEH-530: producer_license_number in _PRODUCER_WRITABLE_FIELDS,
// producer_me.py:205) — same "missing editor" family as MEH-1242 PR3.
// The clear-while-category-requires guard stays server-side ONLY (MEH-999 2c,
// producer_me.py:143-152); its Hebrew 422 detail is surfaced inline via
// detailToMessage — never duplicated client-side.
// REUSES: components/admin/ProducerForm.jsx:42-97 (ProducerLicenseField —
// numeric / dir="ltr" / maxLength 20 / non-blocking format warning),
// producer-self version on the PricingCard save/dirty contract.
// ============================================================

// Exported for isolation tests (EditTabLicenseCard.test.jsx) — see CategoriesCard.
export function LicenseCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.license");
  // Format-warning copy reused verbatim from the admin field — one Hebrew SoT
  // (same reuse idiom as MEH-1237's heading strings).
  const tAdmin = useTranslations("admin.producers.form.fields");
  const seed = profile?.producer_license_number ?? "";
  const [value, setValue] = useState(seed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty = value !== seed;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("license", dirty);
    return () => reportDirty("license", false);
  }, [dirty, reportDirty]);

  // UX nudge only (lib/license-required-categories.js) — enforcement is
  // ensure_license_for_categories server-side, regardless of this flag.
  const required = requiresProducerLicense(
    profile?.categories || [],
    (profile?.categories || []).map((c) => c.id),
  );
  const warning = hasLicenseFormatWarning(value);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      const payload = { producer_license_number: value.trim() || null };
      await api.put("/producers/me", payload);
      onSave(payload);
      // MEH-1270: persist the success signal until the next edit (onChange
      // resets it) — the prior 3s auto-hide made a real save read as a failed
      // one. The masked header chip updates via onSave→profile immediately.
      setSaved(true);
    } catch (err) {
      // Surfaces the MEH-999 2c clear-while-required Hebrew 422 inline.
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Chrome + heading live in the EditAccordionCard header (MEH-1116). */}
      {required && (
        <p className="text-xs text-fg-muted mb-3">{t("required_hint")}</p>
      )}
      {/* MEH-1597: the "where it appears" line the MEH-1539 standard requires.
          Unconditional — `required_hint` above renders only for a category that
          demands a license, so without this an owner in any other category was
          asked for a regulated number with nothing said about where it goes.
          Deliberately silent on the verified badge: filling this number does
          not grant it (admin-granted after document review, ADR-022), and
          implying otherwise is the over-claim class MEH-1579 fixed. */}
      <p className="text-xs text-fg-muted mb-3">{t("where")}</p>
      <Input
        type="text"
        dir="ltr"
        inputMode="numeric"
        maxLength={20}
        label={t("field_label")}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
          setErrorMsg(null);
        }}
      />
      {warning && (
        // Amber + non-blocking, mirroring the admin field — the backend
        // deliberately doesn't enforce the regex (manual-approval flow).
        <p className="text-xs text-warning-600 mt-1">
          {tAdmin("license_format_warning")}
        </p>
      )}

      {errorMsg && (
        <InlineMessage size="xs" className="mt-3 flex items-center gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </InlineMessage>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !dirty}
        variant="primary" size="sm" className="mt-4"
      >
        {saving ? t("saving") : t("save_cta")}
      </Button>

      {/* MEH-1270: explicit, persistent success confirmation — the single
          live region for the card (the button no longer swaps its label, so
          a real save can't read as a failed one). Cleared on the next edit;
          the masked header chip updates via onSave→profile immediately. */}
      {saved && !errorMsg && (
        <p
          className="mt-3 flex items-center gap-1.5 text-xs text-primary"
          role="status"
          data-testid="license-save-success"
        >
          <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {t("save_success")}
        </p>
      )}
    </div>
  );
}
