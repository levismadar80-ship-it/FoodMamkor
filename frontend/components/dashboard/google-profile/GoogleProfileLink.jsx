// @ts-check
"use client";

/**
 * Module:   GoogleProfileLink
 * Purpose:  Find the business's own Google profile and link it, or unlink it
 *           (MEH-3641). The server accepts a link only when the Google name or
 *           phone matches the business; its Hebrew refusal is shown as is.
 * Touches:  GET /producers/me/google-profile/candidates · PUT /producers/me/google-profile
 * Does NOT: the comparison — GoogleProfileCheck.jsx, shown once linked.
 * History:  MEH-3641 (creation)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";
import { detailToMessage, errorMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";

/**
 * The shared mapper turns every 5xx into «השרת לא זמין»; a 503 here is the
 * server saying Google cannot be asked, and its Hebrew says exactly that.
 * @param {any} err
 * @param {(key: string) => string} tError
 */
export function googleErrorMessage(err, tError) {
  const res = err?.response;
  return (res?.status === 503 && detailToMessage(res.data?.detail)) || errorMessage(err, tError);
}

/**
 * @typedef {{ place_id: string, display_name?: string | null, formatted_address?: string | null }} Candidate
 * @param {{ linked: boolean, onChange: (placeId: string | null) => void }} props
 */
export default function GoogleProfileLink({ linked, onChange }) {
  const t = useTranslations("google_profile");
  const tError = useTranslations("error");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(/** @type {Candidate[] | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const params = query.trim() ? { q: query.trim() } : undefined;
      const { data } = await api.get("/producers/me/google-profile/candidates", { params });
      setFound(data.candidates);
    } catch (err) {
      setFound(null);
      setError(googleErrorMessage(err, tError));
    } finally {
      setBusy(false);
    }
  };

  /** @param {string | null} placeId */
  const save = async (placeId) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put("/producers/me/google-profile", { google_place_id: placeId });
      setFound(null);
      onChange(data.google_place_id);
    } catch (err) {
      setError(googleErrorMessage(err, tError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="google-profile-link" className="bg-surface border border-border rounded-lg p-5">
      <h2 className="font-headline-md text-lg font-bold text-text mb-3">{t("link_title")}</h2>
      {linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <InlineMessage tone="success" size="sm" data-testid="google-profile-linked">{t("linked")}</InlineMessage>
          <Button variant="secondary" size="sm" loading={busy} onClick={() => save(null)} data-testid="google-profile-unlink">
            {t("unlink")}
          </Button>
        </div>
      ) : (
        <>
          <p data-testid="google-profile-not-linked" className="text-sm text-fg-muted mb-4">{t("not_linked")}</p>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <div className="flex-1 min-w-[12rem]">
              <Input
                label={t("search_label")}
                helperText={t("search_helper")}
                value={query}
                maxLength={120}
                onChange={(/** @type {any} */ e) => setQuery(e.target.value)}
                data-testid="google-profile-query"
              />
            </div>
            <Button type="submit" size="sm" loading={busy} data-testid="google-profile-search">
              {t("search")}
            </Button>
          </form>
          {found && found.length === 0 && (
            <p data-testid="google-profile-none" className="mt-4 text-sm text-fg-muted">{t("none")}</p>
          )}
          {found && found.length > 0 && (
            <ul data-testid="google-profile-candidates" className="mt-4 space-y-3">
              {found.map((c) => (
                <li key={c.place_id} className="flex flex-wrap items-center justify-between gap-3 border border-border rounded-lg p-3">
                  <div>
                    <p className="font-medium text-text">{c.display_name || c.place_id}</p>
                    {c.formatted_address && <p className="text-sm text-fg-muted">{c.formatted_address}</p>}
                  </div>
                  <Button size="sm" disabled={busy} onClick={() => save(c.place_id)} data-testid="google-profile-pick">
                    {t("pick")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <InlineMessage tone="error" size="sm" className="mt-3" data-testid="google-profile-error">{error}</InlineMessage>
      )}
    </section>
  );
}
