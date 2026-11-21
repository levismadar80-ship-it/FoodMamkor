// @ts-check
"use client";

/**
 * MEH-3592: a full group buy offers a waitlist instead of a dead end
 * (Eventbrite: a released ticket emails the first in line). The place is not
 * held — whoever joins first gets it; the copy says so.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { loginHrefBackHere } from "@/lib/safe-redirect";

/** @param {{ gb: any, user: any, onChanged: () => Promise<void> | void }} props */
export default function GroupBuyWaitlistPanel({ gb, user, onChanged }) {
  const t = useTranslations("group_buys.detail");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = async (/** @type {"join" | "leave"} */ kind) => {
    if (!user) {
      router.push(loginHrefBackHere());
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (kind === "join") await api.post(`/group-buys/${gb.id}/waitlist`, { quantity: 1 });
      else await api.delete(`/group-buys/${gb.id}/waitlist`);
      await onChanged();
    } catch (error_) {
      setError(detailToMessage(error_.response?.data?.detail) || t("errors.action_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="group-buy-waitlist">
      <div className="rounded-md bg-border px-4 py-3 text-fg-muted text-sm text-center" data-testid="group-buy-full">
        {t("full")}
      </div>
      {gb.user_waitlisted ? (
        <>
          <p className="text-sm text-text text-center" data-testid="group-buy-waitlisted">{t("waitlisted")}</p>
          <button
            type="button"
            onClick={() => act("leave")}
            disabled={busy}
            className="w-full text-sm text-fg-muted hover:text-error transition text-center"
          >
            {t("waitlist_leave")}
          </button>
        </>
      ) : (
        <>
          <Button variant="outlined" size="lg" className="w-full" disabled={busy} onClick={() => act("join")} data-testid="group-buy-waitlist-join">
            {t("waitlist_cta")}
          </Button>
          <p className="text-xs text-fg-muted text-center">{t("waitlist_hint")}</p>
        </>
      )}
      {error && <InlineMessage>{error}</InlineMessage>}
    </div>
  );
}
