"use client";

import { useTranslations } from "next-intl";
import { israelToday } from "@/lib/israel-date";

/**
 * Module:   AdminDraftLinkAge
 * Purpose:  On an ownerless draft's row, say when the latest claim link was
 *           sent, until when it is valid, and mark the drafts whose owner has
 *           not claimed for 7+ days — so the admin knows whom to chase
 *           (MEH-2496).
 * Touches:  nothing — reads ProducerAdminOut.claim_link_sent_at, stamped by
 *           POST /admin/producers/{id}/claim-link (producer_claim.py).
 * Does NOT: send reminders or new links (that is the row's copy action,
 *           AdminDraftClaimActions.jsx), or keep a link history — the column
 *           holds the LATEST mint only, which is also the last-expiring one.
 * Related:  backend/app/auth.py PRODUCER_CLAIM_TTL_DAYS (the same 14, pinned
 *           by tests/test_meh2495_admin_draft_owner.py) · lib/israel-date.js.
 * History:  MEH-2496.
 *
 * Two different clocks, on purpose:
 *   - «בתוקף עד» / «הקישור פג» compare INSTANTS: the token expires exactly
 *     TTL × 24 h after it was minted, and that is what the server enforces.
 *   - «ממתין 7+ ימים» counts Israel CALENDAR days (israelToday), the
 *     convention the admin queue's aging uses; 7 × 24 h would drift by an
 *     hour across a DST switch and flip the marker at the wrong moment.
 */

// The claim token's lifetime — auth.PRODUCER_CLAIM_TTL_DAYS. A backend test
// reads this line and fails if the two disagree.
const CLAIM_LINK_TTL_DAYS = 14;
// Calendar days without a claim before the row is marked as waiting.
const WAITING_MARK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_FORMAT = new Intl.DateTimeFormat("he-IL", {
  // guard-ok: display formatting of server-issued instants, not a "today" decision (MEH-2383)
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// `YYYY-MM-DD` → whole days since the epoch, so two Israel dates subtract
// to a calendar-day count with no DST hour in it.
function dayNumber(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function linkAge(sentAtIso, now) {
  const sent = new Date(sentAtIso);
  if (Number.isNaN(sent.getTime())) return null;
  const expires = new Date(sent.getTime() + CLAIM_LINK_TTL_DAYS * DAY_MS);
  return {
    sentDate: DATE_FORMAT.format(sent),
    expiresDate: DATE_FORMAT.format(expires),
    expired: now.getTime() >= expires.getTime(),
    daysWaiting: dayNumber(israelToday(now)) - dayNumber(israelToday(sent)),
  };
}

export function DraftLinkAge({ producer }) {
  const t = useTranslations("admin.producers.table.draft_claim");
  // Ownerless drafts only — a claimed draft is no longer waiting on a link.
  if (producer.status !== "draft" || producer.has_owner !== false) return null;
  if (!producer.claim_link_sent_at) return null;
  const age = linkAge(producer.claim_link_sent_at, new Date());
  if (!age) return null;
  return (
    <div className="flex flex-col items-start gap-0.5 text-[11px] text-muted" data-testid="draft-link-age">
      <span data-testid="draft-link-sent">{t("link_sent", { date: age.sentDate })}</span>
      {age.expired ? (
        <span className="text-error font-medium" data-testid="draft-link-expired">
          {t("link_expired")}
        </span>
      ) : (
        <span data-testid="draft-link-valid-until">{t("link_valid_until", { date: age.expiresDate })}</span>
      )}
      {age.daysWaiting >= WAITING_MARK_DAYS && (
        <span
          className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-medium"
          data-testid="draft-waiting-7"
        >
          {t("waiting_7_days")}
        </span>
      )}
    </div>
  );
}
