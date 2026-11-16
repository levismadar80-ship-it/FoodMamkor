"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/ContactChannelsCard
 * Purpose:  Owner-facing contact channels editor (primary method + the value fields), saved via PUT /producers/me.
 * Does NOT: validate the method or URLs: the server does (schemas.ProducerUpdate).
 * Related:  ../page.js (renders this card inside its accordion).
 * History:  MEH-3157 — moved VERBATIM out of edit/page.js (1,747 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";
import api from "@/lib/api";
import WhatsThis from "@/components/WhatsThis";
import Input from "@/components/ui/Input";
import { detailToMessage } from "@/lib/errors";
import { ViewOnPageLink } from "../cards";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import PhoneVerifyCard from "@/components/PhoneVerifyCard";

// Which value field backs each primary method (empty-on-save guard). Shared
// by the contact preview above and ContactChannelsCard below. MEH-1165 item 5
// (PR #1682 nit): declared before its first use (the preview composition)
// instead of after ContactChannelsCard's section banner.
export const METHOD_FIELD = {
  whatsapp: "phone",
  phone: "phone",
  instagram: "instagram",
  email: "contact_email",
  website: "website",
  facebook: "facebook",
  external_order: "external_order_form",
};

// ============================================================
// MEH-296 Chunk 3b: producer-facing contact-channels editor.
// Mirrors CustomQuestionsCard — local form seeded from profile, saves the
// contact subset via PUT /producers/me. The 7-value method guard + http(s)
// URL guard run server-side (Chunk 2, schemas.ProducerUpdate); 422 detail is
// surfaced inline. whatsapp + phone both back onto the `phone` value field.
// ============================================================

const PRIMARY_METHODS = [
  "whatsapp",
  "phone",
  "instagram",
  "email",
  "website",
  "facebook",
  "external_order",
];

export function ContactChannelsCard({
  profile,
  onSave,
  reportDirty = () => {},
  // MEH-2207: report the LIVE radio selection up so the questions card can warn
  // that custom questions only render on the public page for a WhatsApp-primary
  // business. Same lift-up shape as reportDirty; this card's own behaviour is
  // unchanged.
  onMethodChange = () => {},
  // Grill B8: a live business that changed its number re-verifies here.
  onPhoneVerified = () => {},
}) {
  const t = useTranslations("dashboard.producer.contact_channels");
  // MEH-1115: point-of-decision explainers (top-level whats_this namespace).
  const tWhat = useTranslations("whats_this");
  const seed = {
    phone: profile?.phone || "",
    // MEH-3339: optional second number + label (text line on the page).
    secondary_phone: profile?.secondary_phone || "",
    secondary_phone_label: profile?.secondary_phone_label || "",
    instagram: profile?.instagram || "",
    website: profile?.website || "",
    // MEH-1242 PR3: whatsapp_group — backend whitelist already accepts it and
    // the public ContactCard already renders it; this is the missing editor.
    whatsapp_group: profile?.whatsapp_group || "",
    contact_email: profile?.contact_email || "",
    facebook: profile?.facebook || "",
    external_order_form: profile?.external_order_form || "",
    primary_contact_method: profile?.primary_contact_method || "whatsapp",
  };
  const [form, setForm] = useState(seed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hintField, setHintField] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty = Object.keys(seed).some((k) => form[k] !== seed[k]);
  // MEH-2207: fires on mount (reporting the seeded value) and on every change
  // of the radio — including a change the owner has NOT saved yet, which is the
  // whole point.
  useEffect(() => {
    onMethodChange(form.primary_contact_method);
  }, [form.primary_contact_method, onMethodChange]);
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("contact", dirty);
    return () => reportDirty("contact", false);
  }, [dirty, reportDirty]);

  const upd = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
    // Clear a stale empty-primary hint/summary when its backing field is
    // edited, OR when the primary method changes (the prior hint targeted a
    // field that may no longer back the chosen method). PR #1137 review.
    if (hintField === field || field === "primary_contact_method") {
      setHintField(null);
      setErrorMsg(null);
    }
  };

  const handleSave = async () => {
    // Validate on save (not while typing): the chosen primary method must
    // have its backing value field filled. Inline hint + block, no disable.
    const backing = METHOD_FIELD[form.primary_contact_method];
    if (backing && !form[backing].trim()) {
      setHintField(backing);
      setErrorMsg(t("error_summary"));
      return;
    }
    setHintField(null);
    setErrorMsg(null);
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        phone: form.phone.trim() || null,
        secondary_phone: form.secondary_phone.trim() || null,
        secondary_phone_label: form.secondary_phone.trim() ? form.secondary_phone_label.trim() || null : null,
        instagram: form.instagram.trim() || null,
        website: form.website.trim() || null,
        whatsapp_group: form.whatsapp_group.trim() || null,
        contact_email: form.contact_email.trim() || null,
        facebook: form.facebook.trim() || null,
        external_order_form: form.external_order_form.trim() || null,
        primary_contact_method: form.primary_contact_method,
      };
      const res = await api.put("/producers/me", payload);
      // Grill B8: a changed number comes back unverified; carry that up so
      // the verify box below opens without a reload.
      const verified = res?.data?.phone_verified;
      onSave(typeof verified === "boolean" ? { ...payload, phone_verified: verified } : payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // Surface the server contact guards inline (Chunk-2 scheme / 7-value +
      // MEH-1537 email/phone/whatsapp_group format). detailToMessage handles
      // BOTH the string detail (400/409) and the 422 RequestValidationError
      // array — the earlier `typeof detail === "string"` check collapsed the
      // 422 array to the generic copy, hiding the specific Hebrew field error.
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field) => (hintField === field ? t("hint_empty") : undefined);

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>
      {/* MEH-1306: back-link to the public contact-card section. */}
      <ViewOnPageLink producerId={profile?.id} anchor="section-contact" />

      <div className="space-y-3">
        <Input type="tel" inputMode="tel" dir="ltr" label={t("field_phone")} helperText={t("phone_field_helper")} value={form.phone}
          onChange={(e) => upd("phone", e.target.value)} error={fieldError("phone")} />
        {/* Grill B8 (Sapir 14/11, «שניהם»): a draft verifies in its submit
            banner; a live business whose new number is unverified does it here,
            right under the field. The dashboard home shows the same box. */}
        {profile?.status !== "draft" && profile?.phone && profile?.phone_verified === false && (
          <PhoneVerifyCard variant="reverify" onVerified={onPhoneVerified} />
        )}
        {/* MEH-3339: the second number never drives a button — call, WhatsApp
            and the sticky bar stay on the main number above. */}
        <Input type="tel" inputMode="tel" dir="ltr" label={t("field_secondary_phone")} value={form.secondary_phone}
          placeholder={t("secondary_phone_placeholder")} helperText={t("secondary_phone_where")}
          onChange={(e) => upd("secondary_phone", e.target.value)} error={fieldError("secondary_phone")} />
        <Input type="text" label={t("field_secondary_phone_label")} value={form.secondary_phone_label} maxLength={30}
          onChange={(e) => upd("secondary_phone_label", e.target.value)} />
        {/* MEH-1597: each placeholder shows the shape that field's validator
            actually accepts (ProducerUpdate, backend/app/schemas/schemas.py).
            instagram is the odd one out: it has NO validator (:997 is a bare
            `str | None` — :1205 covers only website/facebook/external_order_form)
            and ContactCard.jsx:105-106 builds `https://instagram.com/${handle}`
            itself, so a URL here would render a doubled, dead link. Bare handle
            on purpose. */}
        <Input type="text" dir="ltr" label={t("field_instagram")} value={form.instagram}
          placeholder={t("instagram_placeholder")}
          onChange={(e) => upd("instagram", e.target.value)} error={fieldError("instagram")} />
        <Input type="url" dir="ltr" label={t("field_website")} value={form.website}
          placeholder={t("website_placeholder")}
          onChange={(e) => upd("website", e.target.value)} error={fieldError("website")} />
        {/* MEH-1242 PR3: WhatsApp group link — not a primary method, so no
            empty-primary guard applies (fieldError never targets it).
            MEH-2626: now the WhatsApp UPDATES link (group or channel); the
            helper recommends a channel and the placeholder shows its shape. */}
        <Input type="url" dir="ltr" label={t("field_whatsapp_group")} value={form.whatsapp_group}
          helperText={t("whatsapp_group_helper")}
          placeholder={t("whatsapp_group_placeholder")}
          onChange={(e) => upd("whatsapp_group", e.target.value)} />
        <Input type="email" inputMode="email" dir="ltr" label={t("field_email")} value={form.contact_email}
          placeholder={t("email_placeholder")}
          onChange={(e) => upd("contact_email", e.target.value)} error={fieldError("contact_email")} />
        <Input type="url" dir="ltr" label={t("field_facebook")} value={form.facebook}
          placeholder={t("facebook_placeholder")}
          onChange={(e) => upd("facebook", e.target.value)} error={fieldError("facebook")} />
        <Input type="url" dir="ltr" label={t("field_external_order")} value={form.external_order_form}
          onChange={(e) => upd("external_order_form", e.target.value)} error={fieldError("external_order_form")} />
        {/* MEH-1115: what an external order form is, right under its field. */}
        <WhatsThis content={tWhat("order_form")} testId="whats-this-order-form" />
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-text">{t("primary_legend")}</legend>
        {/* MEH-1115: what the primary channel means, at the point of choice. */}
        <WhatsThis content={tWhat("primary_channel")} className="mb-1" testId="whats-this-primary-channel" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PRIMARY_METHODS.map((m) => {
            // MEH-1093 F5: disable a method whose backing field is empty up-front
            // (except the current selection — the save-time guard + inline hint
            // still cover that), so the owner can't pick a channel that would
            // only fail on save. Filling the field re-enables it live.
            const backing = METHOD_FIELD[m];
            const backingEmpty = backing && !form[backing].trim();
            const disabled = backingEmpty && form.primary_contact_method !== m;
            return (
              <label
                key={m}
                title={disabled ? t("hint_empty") : undefined}
                className={`flex items-center gap-2 text-sm ${
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="primary_contact_method"
                  value={m}
                  checked={form.primary_contact_method === m}
                  disabled={disabled}
                  onChange={() => upd("primary_contact_method", m)}
                  className="accent-primary"
                />
                <span>{t(`primary_${m}`)}</span>
              </label>
            );
          })}
        </div>
        {PRIMARY_METHODS.some((m) => {
          const b = METHOD_FIELD[m];
          return b && !form[b].trim() && form.primary_contact_method !== m;
        }) && <p className="text-xs text-fg-muted mt-2">{t("hint_empty")}</p>}
      </fieldset>

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
        {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
      </Button>
    </div>
  );
}
