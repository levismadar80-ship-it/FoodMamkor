// @ts-check
"use client";

/**
 * Module:   GoogleProfileTool
 * Purpose:  The body of /producer/dashboard/google-profile (MEH-3641): reads
 *           whether the business is linked and whether Google can be asked,
 *           then shows the link half, the check half (linked only) and the
 *           guide.
 * Touches:  GET /producers/me/google-profile · GET /producers/me (slug and
 *           status, for the page link in the guide).
 * Does NOT: call Google itself — every Google call is the server's.
 * History:  MEH-3641 (creation)
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";
import { SITE_URL } from "@/lib/env";
import { producerPath } from "@/lib/producer-path";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import GoogleProfileGuide from "./GoogleProfileGuide";
import GoogleProfileLink from "./GoogleProfileLink";
import GoogleProfileCheck from "./GoogleProfileCheck";

/** @param {any} profile */
function pageUrlOf(profile) {
  if (profile?.status !== "approved") return null;
  const path = producerPath(profile);
  return path ? `${SITE_URL}${path}` : null;
}

export default function GoogleProfileTool() {
  const t = useTranslations("google_profile");
  const [status, setStatus] = useState(/** @type {{ available: boolean, google_place_id: string | null } | null} */ (null));
  // undefined = not known (the read failed): the guide then says nothing
  // about the link rather than «after approval» to an approved business.
  const [pageUrl, setPageUrl] = useState(/** @type {string | null | undefined} */ (undefined));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    api
      .get("/producers/me/google-profile")
      .then(({ data }) => alive && setStatus(data))
      .catch(() => alive && setFailed(true));
    api
      .get("/producers/me")
      .then(({ data }) => alive && setPageUrl(pageUrlOf(data)))
      .catch(() => alive && setPageUrl(undefined));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const guide = <GoogleProfileGuide pageUrl={pageUrl} />;
  if (failed) {
    return (
      <div className="space-y-6">
        <div role="alert" data-testid="google-profile-load-error" className="bg-surface border border-border rounded-lg p-5 text-center">
          <p className="text-fg-muted mb-3">{t("load_error")}</p>
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>{t("retry")}</Button>
        </div>
        {guide}
      </div>
    );
  }
  if (!status) return <p className="text-sm text-fg-muted">{t("loading")}</p>;

  const linked = Boolean(status.google_place_id);
  return (
    <div className="space-y-6">
      {status.available ? (
        <GoogleProfileLink linked={linked} onChange={(id) => setStatus({ ...status, google_place_id: id })} />
      ) : (
        <InlineMessage tone="info" variant="box" data-testid="google-profile-unavailable">{t("unavailable")}</InlineMessage>
      )}
      {status.available && linked && <GoogleProfileCheck />}
      {guide}
    </div>
  );
}
