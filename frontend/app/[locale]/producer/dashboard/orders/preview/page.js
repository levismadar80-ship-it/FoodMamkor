// @ts-check
import OrderPreviewClient from "./OrderPreviewClient";

/**
 * Route:    /producer/dashboard/orders/preview
 * Purpose:  Let an owner see her business page with the order form exactly as
 *           a buyer gets it — the slots her windows and «כמה זמן מראש» leave,
 *           the cancel line, the minimum — before she switches ordering on.
 * Touches:  nothing itself — the client child reads GET /producers/{id} and
 *           GET /producers/me/order-menu/preview with her token.
 * Does NOT: send an order or a WhatsApp code (both are off inside the
 *           preview; the server also refuses an owner's own order, MEH-3691).
 * History:  MEH-3746 (creation).
 */

// A server component so the noindex export exists (as dashboard/preview).
export const metadata = {
  robots: { index: false, follow: false },
};

export default function OrderPreviewPage() {
  return <OrderPreviewClient />;
}
