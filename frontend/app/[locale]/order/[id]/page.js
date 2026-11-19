// @ts-check
import { getTranslations } from "next-intl/server";

import OrderStatusClient from "./OrderStatusClient";

// MEH-3216 stage 5a: the buyer's page for one on-site order — the link in her
// WhatsApp messages (services/product_order_outbox.py buyer_link):
// /he/order/{id}#t={token}. The token rides after `#`, so it never reaches a
// server; the client reads it and sends it in a POST body.
// Private: never indexed, never followed, no Referer leaves it.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "order_status" });
  return {
    title: t("title"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function OrderStatusPage({ params }) {
  const { id } = await params;
  return <OrderStatusClient orderId={id} />;
}
