// @ts-check
"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import AddToCalendarButton from "@/components/ui/AddToCalendarButton";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import LoginPromptModal from "@/components/LoginPromptModal";
import { StickyRegistrationBar, useInView } from "@/components/RegistrationOverlays";
import RescueConfirmation from "@/components/rescue/RescueConfirmation";
import RescueErrorLine from "@/components/rescue/RescueErrorLine";
import RescueReview from "@/components/rescue/RescueReview";
import NotAPartyLine from "@/components/public/NotAPartyLine"; // MEH-3570
import { bagDay, rescueCancelText, israelTime, shekels, worthAgorot } from "@/lib/rescue";
import useIsraelToday from "@/lib/use-israel-today";
import StruckPrice from "@/components/ui/StruckPrice";
import { addressLine } from "@/lib/address-line";

const STATE_KEY = {
  sold_out: "offer_page.state_sold_out",
  cancelled: "offer_page.state_cancelled",
  ended: "offer_page.state_ended",
};
// MEH-3702: tomorrow's bag names its day. «נסגרו» only happens on the day.
const STATE_KEY_TOMORROW = {
  ...STATE_KEY,
  sold_out: "offer_page.state_sold_out_tomorrow",
  cancelled: "offer_page.state_cancelled_tomorrow",
};

/**
 * Module:   RescueOfferAction
 * Purpose:  The bag page's side card (MEH-3586): price against the worth,
 *           how many are left, the reserve button and the free-cancel line —
 *           or, once reserved, the same confirmation and code the business
 *           page shows. On a phone a sticky bar repeats price and button.
 * Does NOT: hold reservation state (lib/use-rescue-reservation.js) or invent a
 *           discount: the worth is the business's own low estimate, shown
 *           only when it is above the price (worthAgorot).
 *           A reserved bag also gets «הוספה ליומן» for the pickup window
 *           (the shared AddToCalendarButton, MEH-3616).
 * History:  MEH-3586 (creation) · MEH-3570 (not-a-party line under the button) · MEH-3636 (add to calendar)
 *           · MEH-3702 (tomorrow's bag: its states and the business-cancel notice)
 *
 * @param {{ offer: any, reservation: ReturnType<typeof import("@/lib/use-rescue-reservation").default> }} props
 */
export default function RescueOfferAction({ offer, reservation }) {
  const day = useIsraelToday(); // MEH-3805: «מחר» turns into «היום» at midnight
  const t = useTranslations("rescue");
  const { order, busy, errorKey, loginOpen, setLoginOpen, reviewed, setReviewed, cancelled, businessCancelled, businessCancelledDay, reserve, cancel } = reservation;
  const tomorrow = bagDay(offer.date, day) === "tomorrow";
  // REUSES: components/RegistrationOverlays.jsx useInView — the phone bar
  // comes up only once the card's own button has scrolled away (the event
  // page rule), so the two buttons are never on screen together.
  const buttonRef = useRef(null);
  const available = !order && offer.state === "available";
  const buttonInView = useInView(buttonRef, available);
  const pickupLine = addressLine(offer.producer?.location_address, offer.producer?.location_city) || null;

  if (order) {
    return (
      <div className="space-y-4" data-testid="rescue-offer-reserved">
        <RescueConfirmation
          order={order}
          onCancel={cancel}
          cancelling={busy}
          place={{ name: offer.producer?.name, address: pickupLine }} // MEH-3704
          prepay={{ link: offer.producer?.prepay_link ?? null, timing: offer.producer?.prepay_timing ?? null }} // MEH-3895
        />
        {order.status === "reserved" && offer.pickup_start && offer.pickup_end && (
          <AddToCalendarButton
            testId="rescue-offer-add-to-calendar"
            slot={{
              uid: `bag-${order.id}`,
              start: offer.pickup_start,
              end: offer.pickup_end,
              title: t("offer_page.calendar_title", { business_name: offer.producer?.name ?? "" }),
              location: pickupLine,
              // The bag page is public, but the pickup code is not: no URL,
              // so the calendar entry never carries anything secret.
            }}
          />
        )}
        <RescueErrorLine errorKey={errorKey} />
        {/* The review only once the business marked it handed (409 before). */}
        {order.status === "handed" && !reviewed && <RescueReview orderId={order.id} onDone={() => setReviewed(true)} />}
        {reviewed && (
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-review-thanks">{t("review.thanks")}</p>
        )}
      </div>
    );
  }

  const price = shekels(offer.price_agorot);
  const until = israelTime(offer.pickup_end);
  const cancelUntil = rescueCancelText(offer.cancel_until, t, day); // MEH-3702
  const cutoffPassed = new Date(offer.cancel_until) <= new Date();
  const button = (label, testId) => (
    <Button type="button" onClick={() => reserve(offer.id)} disabled={busy} data-testid={testId} variant="primary" size="lg" className="w-full">
      {label}
    </Button>
  );

  return (
    <div className="bg-surface border border-border rounded-lg p-4 grid gap-3 lg:shadow-lg" data-testid="rescue-offer-action">
      <LoginPromptModal
        open={loginOpen}
        reason="rescue"
        onClose={() => setLoginOpen(false)}
        title={t("login_prompt_title")}
        message={t("login_prompt_message")}
        nextPath={typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/rescue"}
      />
      {cancelled && <Notice testId="rescue-cancelled-notice">{t("section.cancelled")}</Notice>}
      {businessCancelled && <Notice testId="rescue-business-cancelled">{t(businessCancelledDay === "tomorrow" ? "section.business_cancelled_tomorrow" : "section.business_cancelled")}</Notice>}

      <PriceRow offer={offer} price={price} t={t} />

      {available ? (
        <>
          <RescueErrorLine errorKey={errorKey} />
          <div ref={buttonRef}>{button(t("section.cta"), "rescue-reserve")}</div>
          <NotAPartyLine name={offer.producer?.name} testId="rescue-not-a-party" />
          <p className="font-body-sm text-sm text-fg-muted text-center" data-testid="rescue-section-terms">
            {cutoffPassed ? t("section.no_cancel") : t("section.cancel_until", { time: cancelUntil })}
          </p>
          {buttonInView === false && (
            <StickyRegistrationBar note={t("offer_page.bar_note", { price, until })}>
              {button(t("offer_page.bar_cta"), "rescue-reserve-bar")}
            </StickyRegistrationBar>
          )}
        </>
      ) : (
        <InlineMessage tone="info" variant="box" className="rounded-md px-3 py-2 grid gap-1" data-testid="rescue-offer-unavailable">
          <span className="text-text">{t((tomorrow ? STATE_KEY_TOMORROW : STATE_KEY)[offer.state])}</span>
          <Link href="/rescue" className="text-primary font-semibold underline">{t("offer_page.other_bags")}</Link>
        </InlineMessage>
      )}
    </div>
  );
}

function Notice({ testId, children }) {
  return (
    <p role="status" data-testid={testId} className="font-body-sm text-sm text-text bg-surface-card border border-border rounded-md px-4 py-3">
      {children}
    </p>
  );
}

/** Price, the worth (a range when the business gave one), and the stock. */
function PriceRow({ offer, price, t }) {
  const low = worthAgorot(offer);
  const high = typeof offer.value_max_agorot === "number" && low !== null && offer.value_max_agorot > low ? offer.value_max_agorot : null;
  return (
    <div className="flex items-start gap-3">
      <div className="leading-tight">
        <b dir="ltr" className="block font-headline-display font-black text-3xl text-primary numeric" data-testid="rescue-offer-price">
          {t("row.price", { price })}
        </b>
        {low !== null && high === null && (
          <StruckPrice className="block text-sm numeric" testId="rescue-offer-worth">
            {t("row.price", { price: shekels(low) })}
          </StruckPrice>
        )}
        {low !== null && (
          <span className={high === null ? "sr-only" : "block text-sm text-fg-muted"} data-testid="rescue-offer-worth-text">
            {high === null
              ? t("offer_page.worth_one", { min: shekels(low) })
              : t("offer_page.worth_range", { min: shekels(low), max: shekels(high) })}
          </span>
        )}
      </div>
      {offer.state === "available" && (
        <span className="ms-auto text-xs font-bold text-gold-deep bg-gold-deep/10 rounded-full px-2.5 py-0.5 whitespace-nowrap" data-testid="rescue-offer-stock">
          {t("row.left", { count: offer.qty_left })}
        </span>
      )}
    </div>
  );
}
