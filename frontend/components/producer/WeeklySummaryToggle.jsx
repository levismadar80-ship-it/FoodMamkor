// @ts-check
"use client";

/**
 * Module:   WeeklySummaryToggle
 * Purpose:  The owner's on/off for the weekly summary email, at the bottom of
 *           «תובנות» (MEH-3212). Before it, an unsubscribe — one forwarded
 *           email, or a mail scanner opening the link — stopped the email for
 *           good. Saves immediately (one field, no form).
 * Touches:  GET / PATCH /producers/me/weekly-summary.
 * Does NOT: send the email (backend services/weekly_owner_summary.py) or
 *           unsubscribe from the email link (unsubscribe/weekly/).
 * States:   loading or a failed read → nothing (the card is a setting, not
 *           the page's content); `available: false` (the email is off for the
 *           whole site) → nothing, so the card never promises an email that
 *           is not sent; on / off → the switch.
 * History:  MEH-3212 (creation; copy approved word for word 19/11).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import Switch from "@/components/ui/Switch";

const URL = "/producers/me/weekly-summary";
// Rule 19: parse before use. A payload of any other shape hides the card.
const SettingSchema = z.object({ enabled: z.boolean(), available: z.boolean() });

export default function WeeklySummaryToggle() {
  const t = useTranslations("dashboard.producer.weekly_summary");
  const tErr = useTranslations("error");
  /** @type {[null | { enabled: boolean, available: boolean }, Function]} */
  const [setting, setSetting] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get(URL)
      .then((r) => {
        const parsed = SettingSchema.safeParse(r.data);
        if (alive) setSetting(parsed.success ? parsed.data : null);
      })
      .catch(() => alive && setSetting(null));
    return () => {
      alive = false;
    };
  }, []);

  if (!setting || !setting.available) return null;

  const toggle = async () => {
    const next = !setting.enabled;
    setSetting({ ...setting, enabled: next });
    setSaving(true);
    try {
      await api.patch(URL, { enabled: next });
    } catch {
      setSetting({ ...setting, enabled: !next });
      showToast.error(tErr("generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      data-testid="weekly-summary-card"
      aria-labelledby="weekly-summary-heading"
      className="bg-surface border border-border rounded-lg p-6 mt-8"
    >
      <h2 id="weekly-summary-heading" className="font-headline-md text-lg font-bold text-text mb-1">
        {t("heading")}
      </h2>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="weekly-summary-helper" className="text-sm text-fg-muted">
            {t("helper")}
          </p>
          <p id="weekly-summary-label" className="text-sm font-medium text-text mt-3">
            {t("label")}
          </p>
        </div>
        <Switch
          checked={setting.enabled}
          aria-labelledby="weekly-summary-label"
          aria-describedby="weekly-summary-helper"
          disabled={saving}
          onClick={toggle}
          data-testid="weekly-summary-switch"
        />
      </div>
    </section>
  );
}
