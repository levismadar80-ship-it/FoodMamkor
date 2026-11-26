// @ts-check
"use client";

/**
 * Module:   SlugConfirmDialog
 * Purpose:  Before a business with no English address goes live, the admin
 *           sees the suggested address, edits it if it reads badly, and
 *           confirms (MEH-3914). Opened by the approve 422 `slug_required`.
 * Touches:  nothing itself — `onConfirm(slug)` re-sends the approve with it.
 * Does NOT: decide whether an address is needed (backend
 *           services/producer_approval.py assert_slug_decided) or check that it
 *           is free (the backend appends the town on a collision, MEH-3336).
 * Related:  use-admin-producers.js quickApprove · components/ui/Dialog.jsx.
 * History:  MEH-3914 (creation).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { isLatinSlug, normaliseLatinSlug } from "@/lib/slug";

/**
 * @param {{
 *   slugPrompt: { producer: { id: string, name?: string }, suggested: string } | null,
 *   busy: boolean,
 *   onConfirm: (slug: string) => void,
 *   onCancel: () => void,
 * }} props
 */
export default function SlugConfirmDialog({ slugPrompt, busy, onConfirm, onCancel }) {
  if (!slugPrompt) return null;
  // Keyed by producer so a second prompt starts from its own suggestion.
  return (
    <SlugConfirmForm key={slugPrompt.producer.id} slugPrompt={slugPrompt} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />
  );
}

/** @param {Parameters<typeof SlugConfirmDialog>[0] & { slugPrompt: NonNullable<Parameters<typeof SlugConfirmDialog>[0]["slugPrompt"]> }} props */
function SlugConfirmForm({ slugPrompt, busy, onConfirm, onCancel }) {
  const t = useTranslations("admin.producers.slug_confirm");
  const [value, setValue] = useState(slugPrompt.suggested);
  const [invalid, setInvalid] = useState(false);
  const submit = (/** @type {any} */ e) => {
    e.preventDefault();
    const slug = normaliseLatinSlug(value);
    if (!isLatinSlug(slug)) {
      setInvalid(true);
      return;
    }
    onConfirm(slug);
  };
  return (
    <Dialog
      labelledBy="slug-confirm-title"
      size="sm"
      dismissible={!busy}
      onClose={onCancel}
      as="form"
      onSubmit={submit}
      className="space-y-4"
      testId="slug-confirm-dialog"
    >
      <p id="slug-confirm-title" className="font-medium text-base">{t("title")}</p>
      <p className="text-sm text-muted">{t("intro")}</p>
      <Input
        label={t("label")}
        dir="ltr"
        value={value}
        maxLength={60}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        helperText={t("hint")}
        error={invalid ? t("invalid") : undefined}
        data-testid="slug-confirm-input"
      />
      <div className="flex gap-3 justify-start">
        <Button type="submit" disabled={busy} variant="primary" size="sm">
          {t("confirm")}
        </Button>
        <Button type="button" data-autofocus disabled={busy} onClick={onCancel} variant="secondary" size="sm">
          {t("cancel")}
        </Button>
      </div>
    </Dialog>
  );
}
