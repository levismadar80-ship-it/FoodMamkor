// @ts-check
"use client";

/**
 * Module:   OrderWeekShareCard
 * Purpose:  «מה יש השבוע» in the «הזמנות» tab: a ready message with what can
 *           be ordered this week, the open days and the order link, with
 *           «שליחה בוואטסאפ» (she picks the chat, group or status) and
 *           «העתקת ההודעה».
 * Touches:  GET /producers/me/order-menu/preview (lib/order-cart.js), the
 *           same menu a buyer gets.
 * Does NOT: send anything itself, or keep a list of who got it. Does NOT
 *           render a message for an empty week: it says why instead.
 * Related:  lib/weekly-menu-share.js (the text), the orders page (the host,
 *           shown once ordering is set up)
 * History:  MEH-3931 (creation, 27/11/2026)
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Copy, WhatsappLogo } from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import Heading from "@/components/ui/Heading";
import InlineMessage from "@/components/ui/InlineMessage";
import { loadOwnerMenuPreview } from "@/lib/order-cart";
import { copyOrThrow } from "@/lib/clipboard";
import { SITE_URL } from "@/lib/env";
import { producerPath } from "@/lib/producer-path";
import { getWhatsAppHref } from "@/lib/utils";
import { weekMenuText } from "@/lib/weekly-menu-share";

/** @param {{ text: string }} props */
function ShareActions({ text }) {
  const t = useTranslations("dashboard.producer.orders.share");
  const [note, setNote] = useState(/** @type {"copied" | "copy_failed" | null} */ (null));
  const copy = () =>
    copyOrThrow(text)
      .then(() => setNote("copied"))
      .catch(() => setNote("copy_failed"));
  // A plain wa.me link with no number: WhatsApp asks her who to send it to.
  const send = () => window.open(getWhatsAppHref("", text), "_blank", "noopener,noreferrer");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={send} leadingIcon={<WhatsappLogo size={18} aria-hidden="true" />} data-testid="week-share-whatsapp">
          {t("send")}
        </Button>
        <Button variant="outlined" size="sm" onClick={copy} leadingIcon={<Copy size={18} aria-hidden="true" />} data-testid="week-share-copy">
          {t("copy")}
        </Button>
      </div>
      {note && (
        <InlineMessage tone={note === "copied" ? "success" : "error"}>{t(note)}</InlineMessage>
      )}
    </div>
  );
}

/**
 * @param {{ business: { name?: string | null, slug?: string | null, id?: string | null } | null, refresh?: number, now?: Date }} props
 *   business: GET /producers/me, for the name and the page link;
 *   refresh: changes when a product is switched, so the text is read again
 */
export default function OrderWeekShareCard({ business, refresh = 0, now }) {
  const t = useTranslations("dashboard.producer.orders.share");
  const tOrders = useTranslations("dashboard.producer.orders");
  const tUnit = useTranslations("price_unit");
  const locale = useLocale();
  const [menu, setMenu] = useState(/** @type {any} */ (null));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    loadOwnerMenuPreview().then((m) => {
      if (!live) return;
      // readMenu answers null on a failed read: say so, not «nothing this week».
      setFailed(m === null);
      setMenu(m);
    });
    return () => {
      live = false;
    };
  }, [attempt, refresh]);

  const path = business ? producerPath(business) : null;
  if (!business?.name || !path) return null;
  const text = menu
    ? weekMenuText({ menu, name: business.name, url: `${SITE_URL}${path}`, locale, t, tUnit, now })
    : null;
  return (
    <section
      className="rounded-lg border border-border bg-surface p-4 space-y-3"
      aria-labelledby="orders-week-share-title"
      data-testid="orders-week-share"
    >
      <Heading level={2} variant="sans" id="orders-week-share-title" className="!text-base">{t("title")}</Heading>
      <p className="text-sm text-fg-muted">{t("intro")}</p>
      {failed && (
        <div className="space-y-2">
          <InlineMessage tone="error">{t("load_error")}</InlineMessage>
          <Button variant="outlined" size="sm" onClick={() => setAttempt((n) => n + 1)} data-testid="week-share-retry">
            {tOrders("retry")}
          </Button>
        </div>
      )}
      {menu && !text && (
        <p className="text-sm text-fg-muted" data-testid="week-share-empty">{t("empty")}</p>
      )}
      {text && (
        <>
          <p
            className="whitespace-pre-line [overflow-wrap:anywhere] rounded-md bg-background p-3 text-sm text-text"
            data-testid="week-share-text"
          >
            {text}
          </p>
          <ShareActions text={text} />
        </>
      )}
    </section>
  );
}
