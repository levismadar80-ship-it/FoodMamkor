// @ts-check
"use client";

/**
 * Module:   GroupBuyPickupList
 * Purpose:  MEH-3735 — on the owner's card of a group buy that reached its
 *           goal: each participant's pickup code and quantity, and after the
 *           pickup ended a «נמסר» / «לא הגיע» per code. A no-show mails her;
 *           two in 30 days block her from joining (server side).
 * Does NOT: show a name, email or phone — the business sees codes only
 *           (MEH-1651), like the rescue dashboard. The rules live in
 *           backend/app/services/group_buy_no_show.py.
 * Related:  app/[locale]/producer/dashboard/rescue/ (the same marks for bags)
 * History:  MEH-3735 (creation)
 */
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import api from "@/lib/api";
import { GroupBuyPickupsSchema } from "@/lib/api-responses";
import { detailToMessage } from "@/lib/errors";

// Why the buttons are not shown, per the server's mark_state ("open" shows them).
/** @type {Record<string, string>} */
const HINT_BY_STATE = { wait: "after_pickup", no_window: "no_window", closed: "closed" };

/** @param {{ gb: { id: string } }} props */
export default function GroupBuyPickupList({ gb }) {
  const t = useTranslations("group_buys.dashboard.pickups");
  const tSettings = useTranslations("group_buys.dashboard.settings");
  // REUSES: rescue.dashboard.status — the same «נמסר» / «לא הגיע» words as rescue bags.
  const tStatus = useTranslations("rescue.dashboard.status");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (keepError = false) => {
    if (!keepError) setError("");
    try {
      const r = await api.get(`/producers/me/group-buys/${gb.id}/pickups`);
      const parsed = GroupBuyPickupsSchema.safeParse(r.data);
      if (!parsed.success) throw new Error("bad pickups payload");
      setData(parsed.data);
    } catch (error_) {
      setError(detailToMessage(error_.response?.data?.detail) || tSettings("failed"));
    }
  }, [gb.id, tSettings]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data) load(false);
  };

  const markAs = async (/** @type {string} */ commitId, /** @type {"handed" | "no-show"} */ kind) => {
    setError("");
    setBusy(commitId);
    try {
      await (kind === "handed"
        ? api.post(`/group-buys/${gb.id}/commits/${commitId}/handed`)
        : api.post(`/group-buys/${gb.id}/commits/${commitId}/no-show`));
      await load();
    } catch (error_) {
      setError(detailToMessage(error_.response?.data?.detail) || tSettings("failed"));
      // Another tab may have marked it already: show what the server holds.
      await load(true);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border" data-testid="group-buy-pickups">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="text-sm font-medium text-primary hover:underline min-h-touch"
        data-testid="group-buy-pickups-toggle"
      >
        {t("title")}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {error && <InlineMessage>{error}</InlineMessage>}
          {data && HINT_BY_STATE[data.mark_state] && (
            <p className="text-xs text-fg-muted" data-testid="group-buy-pickups-wait">{t(HINT_BY_STATE[data.mark_state])}</p>
          )}
          {data && data.pickups.length > 0 && (
            <ul className="divide-y divide-border">
              {data.pickups.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2" data-testid="group-buy-pickup-row">
                  <span className="font-mono text-base tabular-nums" dir="ltr">{p.pickup_code || "—"}</span>
                  <span className="text-sm text-fg-muted tabular-nums" dir="ltr">×{p.quantity}</span>
                  <span className="ms-auto flex gap-2">
                    {p.handed_at && <span className="text-sm text-primary">{tStatus("handed")}</span>}
                    {p.no_show_at && <span className="text-sm text-danger-700">{tStatus("no_show")}</span>}
                    {data.can_mark && !p.handed_at && !p.no_show_at && (
                      <>
                        <Button size="sm" variant="primary" disabled={busy === p.id} onClick={() => markAs(p.id, "handed")} data-testid="group-buy-pickup-handed">
                          {tStatus("handed")}
                        </Button>
                        <Button size="sm" variant="outlined" disabled={busy === p.id} onClick={() => markAs(p.id, "no-show")} data-testid="group-buy-pickup-no-show">
                          {tStatus("no_show")}
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
