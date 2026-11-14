import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bell,
  EnvelopeSimple,
  FacebookLogo,
  Globe,
  InstagramLogo,
  Phone,
  Receipt,
} from "@phosphor-icons/react";

import PrimaryContactButton from "@/components/PrimaryContactButton";
import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import { contactHref, getPrimaryMethod } from "@/lib/contact-method";
import { instagramHandle } from "@/lib/social-links";
import { withReferralParams } from "@/lib/utils";
import { whatsappUpdatesHref } from "@/components/WhatsAppUpdatesPill";
import { trackContactClick } from "@/lib/contact-tracking";
import { showToast } from "@/lib/toast";
import { usePreviewMode } from "@/lib/preview-mode"; // MEH-2916

// MEH-1221: silent-mailto fallback window. mailto: fails silently on desktops
// with no mail handler (no error, no navigation). The email circle is a bare
// mailto and shows no address (MEH-2775: only the SOLE-channel row shows it),
// so a customer on such a desktop has NO email path at all. We race this
// timer against window "blur" / visibilitychange (either fires when a handler
// grabs focus); timer wins → no handler → copy the address + toast so she can paste it.
// REUSES: frontend/app/[locale]/share/ShareClient.jsx:104-143 (MEH-1220/1223)
// — same detection mechanics + MEH-1223 real-success flag (a double failure
// shows the failure toast, never a false "copied").
const MAIL_FALLBACK_MS = 1200;
import { copyText } from "@/lib/clipboard";

function armMailtoFallback(email, t) {
  if (!email) return;
  let timer;
  const removeListeners = () => {
    window.removeEventListener("blur", onHandlerOpened);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  const onHandlerOpened = () => {
    clearTimeout(timer);
    removeListeners();
  };
  const onVisibility = () => {
    if (document.hidden) onHandlerOpened();
  };
  window.addEventListener("blur", onHandlerOpened);
  document.addEventListener("visibilitychange", onVisibility);
  timer = setTimeout(async () => {
    removeListeners();
    const copied = await copyText(email);
    showToast.error(
      copied
        ? t("producer.detail.contact_card.email_fallback_toast")
        : t("producer.detail.contact_card.email_copy_failed_toast"),
    );
  }, MAIL_FALLBACK_MS);
}

/**
 * Module:   ContactCard
 * Purpose:  The single editorial contact card for the producer detail
 *           page — exactly one primary CTA, ready-made question links, and
 *           a quiet secondary-channel icon row. Rendered twice by
 *           ProducerDetail: once inline on mobile/tablet (the
 *           IntersectionObserver target for the sticky bar) and once as
 *           the desktop sticky sidebar.
 * Touches:  contact-tracking (WhatsApp beacon + per-channel click ping).
 * Does NOT: own the sticky-bar visibility (StickyContactBar + useStickyBar),
 *           the order-status line, or follow/save/share — status + quiet
 *           actions moved to ProducerHeader (MEH-1334: one status home,
 *           one home per action).
 * Related:  ContactSidebar.jsx (desktop wrapper), StickyContactBar.jsx.
 * History:  MEH-1146 chunk A (creation — action-hierarchy rebuild,
 *           consolidates the old ContactSidebar + ActionRow CTAs);
 *           MEH-1334 chunk 1 (status line + follow/share row removed);
 *           MEH-1551 (degenerate states — sole channel renders a labeled row,
 *           phone reveal swaps in place instead of appending a sibling);
 *           MEH-1583 (reveal adopts the geometry of the element it replaces —
 *           one row anatomy across every cell of the count x state matrix);
 *           MEH-2626 (whatsapp_group circle → tracked «עדכונים» bell).
 */

// Secondary contact channels rendered as the quiet icon row. Each entry's
// href comes from the one table in lib/contact-method.js (contactHref,
// MEH-2991) — the organizer page reads the same table. The channel equal to the primary
// method is filtered out so it never duplicates the big CTA.
//
// MEH-2775: `display` is what the SOLE-channel info row shows instead of the
// channel's name — the value people recognise (the number, @handle, domain,
// address), the way Google Maps / Yelp list contact details on desktop. A
// channel without one (facebook / order form / updates: their value is a long
// URL that says nothing) keeps its `single.*` label.
const CHANNELS = [
  {
    key: "phone",
    Icon: Phone,
    href: (p) => contactHref("phone", p),
    display: (p) => p.phone?.trim() || null,
  },
  {
    key: "instagram",
    Icon: InstagramLogo,
    href: (p) => contactHref("instagram", p),
    display: (p) => {
      const handle = instagramHandle(p.instagram);
      // A legacy row stored as a full URL is not a handle — keep the label
      // rather than print "@https://…" (social-links.js: URL rows out of scope).
      return handle && !/[/:]/.test(handle) ? `@${handle}` : null;
    },
  },
  // MEH-1525: the business-website tile carries referral UTM (rel drops
  // noreferrer at the render site below). Social / order tiles are untouched.
  {
    key: "website",
    Icon: Globe,
    href: (p) => withReferralParams(contactHref("website", p)),
    display: (p) => websiteHost(p.website),
  },
  {
    key: "email",
    Icon: EnvelopeSimple,
    href: (p) => contactHref("email", p),
    display: (p) => p.contact_email?.trim() || null,
  },
  { key: "facebook", Icon: FacebookLogo, href: (p) => contactHref("facebook", p) },
  { key: "external_order", Icon: Receipt, href: (p) => contactHref("external_order", p) },
  // MEH-2626: the WhatsApp updates link (group or channel) — the «עדכונים»
  // bell. REPLACES the untracked WhatsappLogo circle that sat here: a neutral
  // Bell so it never reads as a second «שליחת הודעה» (MEH-1466 / MEH-1049),
  // and a tap is now a contact click (method "whatsapp_group", reviews gate).
  // `ariaKey`: the circle's visible name is the short «עדכונים»; the accessible
  // name spells out what it opens and still starts with that word (WCAG 2.5.3).
  {
    key: "whatsapp_group",
    Icon: Bell,
    href: whatsappUpdatesHref,
    ariaKey: "producer.detail.whatsapp_updates.full",
  },
];

/** MEH-2775: "https://www.x.co.il/shop/" → "x.co.il" — the host people know. */
function websiteHost(raw) {
  const v = (raw || "").trim();
  if (!v) return null;
  const host = v.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
  return host || null;
}

// MEH-1551: the circle and the single-channel row are two renderings of the
// same link, so the target/rel policy lives in one place. Output for the
// circle is unchanged — phone stays a bare tel:, website keeps noopener only
// (MEH-1525 referral), everything else noopener noreferrer.
const linkAttrs = (key) =>
  key === "phone"
    ? {}
    : { target: "_blank", rel: key === "website" ? "noopener" : "noopener noreferrer" };

// MEH-1583: the ONE row anatomy. Both full-width affordances — the labeled
// sole-channel row and the revealed number row — spread this constant, which
// is what makes "(1 x closed)" and "(1 x open)" provably the same box (zero
// layout jump on reveal). MEH-1551 fixed the reveal's POSITION but left it
// wearing pill anatomy (inline-flex + rounded-full + no w-full), so a card
// could show two geometric languages at once. Only the trailing state classes
// (hover/text colour) differ per affordance.
// MEH-2775: the box is gone. A bordered full-width row sitting right under the
// bordered «שאלה אחרת?» pill read as one more question (Sapir 06/11). The row
// is now a plain info line — icon + value — under the same hairline the
// circle grid already has, so a sole channel reads as a contact DETAIL.
const ROW_ANATOMY = "flex w-full min-w-0 items-center gap-2 min-h-touch text-sm rounded-md";

/** MEH-2775: a value in Latin script runs LTR so "@handle" keeps its "@" first. */
const isLatinValue = (v) => /[a-z0-9]/i.test(v) && !/[\u0590-\u05FF]/.test(v);

export default function ContactCard({ producer, isVacation }) {
  const t = useTranslations();
  const primaryMethod = getPrimaryMethod(producer);

  // MEH-1334 chunk 2: desktop phone tap reveals the number inline instead of
  // dialing (there's no dialer on desktop) — mobile keeps the tel: dial. The
  // device is read at click time via matchMedia so no unreliable UA sniff /
  // render-time guess is needed.
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  // whatsapp primary has no matching row icon (its CTA is phone-derived), so
  // the phone tel: icon — a distinct "call" action — is intentionally kept.
  const available = CHANNELS.filter((c) => c.key !== primaryMethod && c.href(producer));

  // MEH-1583: once the number is on screen the phone LEAVES the channel map
  // entirely and the number takes its own full-width row as the last child of
  // the same container. Previously the phone entry stayed in the map and the
  // pill rendered in its slot, so a revealed card mixed a wide pill with 44px
  // circles on one line (Sapir 26/07, phone + instagram).
  const revealed = phoneRevealed && Boolean(producer.phone);
  const channels = revealed ? available.filter((c) => c.key !== "phone") : available;

  // MEH-1551: exactly one surviving channel used to render a lone unlabeled
  // 44px circle floating on its own — a degenerate state MEH-1334's icon-row
  // design never specified (it assumed a row of 3-6). One channel = one quiet
  // labeled row instead.
  // MEH-1583: computed AFTER the reveal filter on purpose — revealing the
  // phone on a 2-channel card leaves one survivor, and leaving THAT as a bare
  // circle would re-create the very orphan MEH-1551 closed.
  const single = channels.length === 1;

  // `|| revealed` is defensive only: since MEH-2775 a SOLE phone never reveals
  // (its number is already on the row), so a reveal always leaves ≥1 survivor.
  const showChannelRow = channels.length > 0 || revealed;

  // Shared by both affordances (circle + single row) so the tracking and the
  // desktop phone-reveal behave identically whichever one is rendered.
  // MEH-2916: in the owner's preview every contact channel stays VISIBLE —
  // she is looking at how her page reads — but none of them acts. No href, so
  // no WhatsApp app switch and no dialler; out of the tab order; announced as
  // disabled. Sapir's ruling, 11/11.
  const isPreview = usePreviewMode();
  const linkTarget = (value) =>
    isPreview ? { "aria-disabled": "true", tabIndex: -1 } : { href: value };

  const onChannelClick = (e, { key }) => {
    if (isPreview) {
      e.preventDefault(); // MEH-2916
      return;
    }
    // MEH-1334: on desktop a phone tap reveals the number inline (no dialer)
    // — swallow the tel: navigation and show the pill.
    // MEH-2775: a SOLE phone already shows its number, so there is nothing to
    // reveal — the tap stays a plain tel: link (desktop softphone can act).
    if (
      key === "phone" &&
      !single &&
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      e.preventDefault();
      setPhoneRevealed(true);
    }
    // MEH-2626: every channel is tracked now — the `track: false` opt-out
    // existed only for the old untracked whatsapp_group circle.
    // Fires exactly once per click (fallback must not double-track).
    trackContactClick(producer.id, key);
    // MEH-1221: email-only silent-mailto fallback.
    if (key === "email") {
      armMailtoFallback(producer.contact_email?.trim(), t);
    }
  };

  // MEH-1649: data-testid="contact-card" is a stable locator for the card
  // boundary. The QA harness asserts the closed-window note is a DOM
  // DESCENDANT of this container, not merely "not floating" — a note flung
  // anywhere else would satisfy the negative check alone (MEH-1592). Class
  // selectors are brittle; docs/E2E-LOCATORS.md mandates data-testid.
  return (
    <div className="bg-surface rounded-lg p-6 border border-border" data-testid="contact-card">
      <div className={isVacation ? "opacity-50 pointer-events-auto" : ""}>
        {/* MEH-1334: the "פתוח להזמנות" status line moved to the header meta
            line (3 states, one status home per page — revision-2 #2). */}

        {/* The one primary CTA — color/label driven by primary_contact_method
            (WhatsApp green only on WhatsApp). */}
        {/* MEH-2999: the button records its own click (any channel). */}
        <PrimaryContactButton producer={producer} />

        {/* MEH-1652: the closed-window context line that used to sit here is
            GONE, not reworded. It said the message "תמתין לבית העסק" — a claim
            about what the business would do, which BRAND.md §7 forbids and
            ADR-031 explains we can never observe (the CTA is a `wa.me` deep
            link; the message never touches our servers). MEH-1546 → MEH-1600 →
            MEH-1649 each rewrote this one line and each stayed untrue, because
            the problem was never the wording. §7's answer for "nothing honest
            to say" is silence, so the button now stands on its own. The order
            window itself is still said — as a SCHEDULE, in
            OrderWindowScheduleBlock (MEH-1875), and as a status in
            ProducerHeader. Do NOT re-add a note here without a claim the site
            can actually verify. */}

        {/* Ready-made questions as quiet text links under the CTA. */}
        <WhatsAppQuestionChips producer={producer} />

        {/* Secondary channels — MEH-2592 C: a four-column grid of 44px cream
            circles, each with its name under it (the existing aria strings,
            now visible), like the action row on a Google Maps place card.
            Seven bare circles in two rows gave no hint which was which. */}
        {showChannelRow && (
          <div
            className={
              single
                ? "flex flex-col gap-1 mt-4 pt-3 border-t border-border"
                : "grid grid-cols-4 gap-x-1 gap-y-3 mt-4 pt-4 border-t border-border"
            }
            role="list"
          >
            {channels.map((channel) => {
              const { key, Icon, href } = channel;

              // MEH-1551: sole channel → a labeled quiet row (the visible label
              // IS the accessible name here, so no aria-label overriding it).
              // MEH-2775: the label is the channel's VALUE when it has one.
              if (single) {
                const value = channel.display?.(producer);
                return (
                  <a
                    key={key}
                    {...linkTarget(href(producer))}
                    {...linkAttrs(key)}
                    role="listitem"
                    data-testid="contact-single-row"
                    // MEH-2775: a bare value ("0501234567") says nothing to a
                    // screen reader — prefix the channel's existing aria name.
                    // The visible value stays inside the name (WCAG 2.5.3).
                    aria-label={
                      value
                        ? `${t(channel.ariaKey ?? `producer.detail.contact_card.aria.${key}`)} ${value}`
                        : undefined
                    }
                    onClick={(e) => onChannelClick(e, channel)}
                    className={`${ROW_ANATOMY} text-primary-dark hover:text-primary hover:underline underline-offset-2 transition focus-visible:ring-2 focus-visible:ring-primary/40`}
                  >
                    <Icon size={18} className="shrink-0" aria-hidden="true" />
                    {value ? (
                      <span
                        dir={isLatinValue(value) ? "ltr" : undefined}
                        // full value on hover when a long email/domain truncates
                        title={value}
                        className={`truncate${key === "phone" ? " numeric" : ""}`}
                      >
                        {value}
                      </span>
                    ) : (
                      t(`producer.detail.contact_card.single.${key}`)
                    )}
                  </a>
                );
              }

              return (
                <a
                  key={key}
                  {...linkTarget(href(producer))}
                  {...linkAttrs(key)}
                  role="listitem"
                  // MEH-1583: stable locator for the VRT reveal shot — the
                  // circle's only other handle is its Hebrew aria-label, and
                  // E2E must not key on copy (docs/E2E-LOCATORS.md).
                  data-testid={`contact-channel-${key}`}
                  // Same string as the visible name (WCAG 2.5.3 holds); kept so
                  // the accessible name is the name alone, not "name + icon".
                  aria-label={t(channel.ariaKey ?? `producer.detail.contact_card.aria.${key}`)}
                  onClick={(e) => onChannelClick(e, channel)}
                  className="group flex flex-col items-center gap-1.5 text-center text-xs leading-tight text-text rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className="flex items-center justify-center w-11 h-11 rounded-full bg-background text-primary-dark transition group-hover:bg-green-50 group-hover:text-primary">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  {t(`producer.detail.contact_card.aria.${key}`)}
                </a>
              );
            })}

            {/* MEH-1583: the revealed number is the LAST child of the same
                container and wears ROW_ANATOMY, so it reads as one more row
                rather than a pill wedged between circles. w-full + the
                container's flex-wrap put it on its own line under any
                surviving circles. dir="ltr" + .numeric sit on the NUMBER SPAN
                only — on the row they would flip the icon to the visual end in
                RTL; on the span they just stop the digits reordering. Still a
                tel: link so a desktop softphone / click-to-call can act on it. */}
            {revealed && (
              <a
                {...linkTarget(contactHref("phone", producer))}
                data-testid="revealed-phone"
                role="listitem"
                className={`${ROW_ANATOMY} ${single ? "" : "col-span-4"} text-primary-dark focus-visible:ring-2 focus-visible:ring-primary/40`}
              >
                <Phone size={18} className="shrink-0" aria-hidden="true" />
                <span dir="ltr" className="numeric">
                  {producer.phone.trim()}
                </span>
              </a>
            )}
          </div>
        )}

        {/* MEH-1334: the tertiary follow + share row moved to the header's
            quiet actions row (שמירה · מעקב · שיתוף) — one home per action. */}

        {/* MEH-1460: the "טעות בפרטים?" correction link moved OUT of the
            contact card to the page-end meta block (ProducerSections.jsx,
            below ReportButton) — the conversion card no longer mixes a
            site-directed action with the business-directed CTA. */}
      </div>
    </div>
  );
}
