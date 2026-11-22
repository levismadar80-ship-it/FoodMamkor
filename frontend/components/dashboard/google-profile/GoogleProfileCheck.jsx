// @ts-check
"use client";

/**
 * Module:   GoogleProfileCheck
 * Purpose:  Compare what Google shows with the business page, on request
 *           (MEH-3641): name, phone and website each get a verdict; opening
 *           hours are shown side by side with no verdict, because the two
 *           sides write hours in different formats.
 * Touches:  GET /producers/me/google-profile/check (live; nothing stored).
 * Does NOT: fix anything — she edits Google or her page herself.
 * History:  MEH-3641 (creation)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { googleErrorMessage } from "./GoogleProfileLink";

const TONE = /** @type {const} */ ({ same: "text-primary", different: "text-warning-800", missing: "text-warning-800" });

/**
 * @typedef {{ field: "name" | "phone" | "website", ours?: string | null, google?: string | null, verdict: "same" | "different" | "missing" }} Row
 * @typedef {{ rows: Row[], hours_ours?: string | null, hours_google: string[] }} Check
 */
export default function GoogleProfileCheck() {
  const t = useTranslations("google_profile");
  const tError = useTranslations("error");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(/** @type {Check | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.get("/producers/me/google-profile/check");
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(googleErrorMessage(err, tError));
    } finally {
      setBusy(false);
    }
  };

  const dash = t("empty_value");
  return (
    <section data-testid="google-profile-check" className="bg-surface border border-border rounded-lg p-5">
      <h2 className="font-headline-md text-lg font-bold text-text mb-2">{t("check_title")}</h2>
      <p className="text-sm text-fg-muted mb-4">{t("check_intro")}</p>
      <Button size="sm" loading={busy} onClick={run} data-testid="google-profile-run-check">
        {result ? t("run_again") : t("run_check")}
      </Button>
      {error && (
        <InlineMessage tone="error" size="sm" className="mt-3" data-testid="google-profile-check-error">{error}</InlineMessage>
      )}
      {result && (
        <div className="mt-4 space-y-3" data-testid="google-profile-check-result">
          {result.rows.map((row) => (
            <div key={row.field} data-testid={`google-profile-row-${row.field}`} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text">{t(`field_${row.field}`)}</p>
                <p className={`text-sm font-medium ${TONE[row.verdict]}`} data-testid="verdict">{t(`verdict_${row.verdict}`)}</p>
              </div>
              <p className="text-sm text-fg-muted mt-1">{t("ours")}: <span dir="auto">{row.ours || dash}</span></p>
              <p className="text-sm text-fg-muted">{t("google")}: <span dir="auto">{row.google || dash}</span></p>
            </div>
          ))}
          {result.rows.some((r) => r.verdict !== "same") && (
            <p className="text-sm text-text" data-testid="google-profile-fix-hint">{t("fix_hint")}</p>
          )}
          <div data-testid="google-profile-hours" className="border border-border rounded-lg p-3">
            <p className="font-medium text-text">{t("hours_title")}</p>
            <p className="text-xs text-fg-muted mb-2">{t("hours_note")}</p>
            <p className="text-sm text-fg-muted">{t("ours")}: <span dir="auto">{result.hours_ours || dash}</span></p>
            <p className="text-sm text-fg-muted">{t("google")}:</p>
            {result.hours_google.length > 0 ? (
              <ul className="text-sm text-fg-muted ps-4">
                {result.hours_google.map((line) => (
                  <li key={line} dir="auto">{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted ps-4">{dash}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
