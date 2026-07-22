import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  EnvelopeSimple,
  FacebookLogo,
  Globe,
  InstagramLogo,
  Phone,
  Receipt,
  WhatsappLogo,
} from "@phosphor-icons/react";

import PrimaryContactButton from "@/components/PrimaryContactButton";
import ReportInfoModal from "@/components/ReportInfoModal";
import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import { getPrimaryMethod } from "@/lib/contact-method";
import { markWhatsAppClickedLocal, pingWhatsAppBeacon, trackContactClick } from "@/lib/contact-tracking";
import { showToast } from "@/lib/toast";

// MEH-1221: silent-mailto fallback window. mailto: fails silently on desktops
// with no mail handler (no error, no navigation). The email icon is a bare
// mailto and the address is not shown anywhere on the card, so a customer on
// such a desktop has NO email path at all. We race this timer against window
// "blur" / visibilitychange (either fires when a handler grabs focus); timer
// wins → no handler → copy the address + toast so she can paste it.
// REUSES: frontend/app/[locale]/share/ShareClient.jsx:104-143 (MEH-1220/1223)
// — same detection mechanics + MEH-1223 real-success flag (a double failure
// shows the failure toast, never a false "copied").
const MAIL_FALLBACK_MS = 1200;

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
    let copied = false;
    try {
      await navigator.clipboard.writeText(email);
      copied = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = email;
      document.body.appendChild(ta);
      ta.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        document.body.removeChild(ta);
      }
    }
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
 *           MEH-1334 chunk 1 (status line + follow/share row removed).
 */

// Secondary contact channels rendered as the quiet icon row. Each entry
// resolves its own href from the producer with the trim/prefix guards the
// prior ContactSidebar tiles carried. The channel equal to the primary
// method is filtered out so it never duplicates the big CTA.
const CHANNELS = [
  { key: "phone", Icon: Phone, href: (p) => (p.phone ? `tel:${p.phone}` : null) },
  {
    key: "instagram",
    Icon: InstagramLogo,
    href: (p) => {
      const handle = (p.instagram || "").trim().replace(/^@+/, "");
      return handle ? `https://instagram.com/${handle}` : null;
    },
  },
  { key: "website", Icon: Globe, href: (p) => httpUrl(p.website) },
  {
    key: "email",
    Icon: EnvelopeSimple,
    href: (p) => (p.contact_email?.trim() ? `mailto:${p.contact_email.trim()}` : null),
  },
  { key: "facebook", Icon: FacebookLogo, href: (p) => httpUrl(p.facebook) },
  { key: "external_order", Icon: Receipt, href: (p) => httpUrl(p.external_order_form) },
  {
    key: "whatsapp_group",
    Icon: WhatsappLogo,
    href: (p) => (p.whatsapp_group?.trim() ? p.whatsapp_group.trim() : null),
    track: false,
  },
];

/** Coerce a bare/whitespace/protocol-less URL field into a safe https href. */
function httpUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return null;
  return v.startsWith("http") ? v : `https://${v}`;
}

export default function ContactCard({ producer, isVacation }) {
  const t = useTranslations();
  const primaryMethod = getPrimaryMethod(producer);

  // MEH-1334 chunk 2: desktop phone tap reveals the number inline instead of
  // dialing (there's no dialer on desktop) — mobile keeps the tel: dial. The
  // device is read at click time via matchMedia so no unreliable UA sniff /
  // render-time guess is needed.
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  // MEH-1443: "report wrong info" modal — additive; the contact block above
  // is untouched.
  const [reportOpen, setReportOpen] = useState(false);

  // whatsapp primary has no matching row icon (its CTA is phone-derived), so
  // the phone tel: icon — a distinct "call" action — is intentionally kept.
  const channels = CHANNELS.filter((c) => c.key !== primaryMethod && c.href(producer));

  return (
    <div className="bg-white rounded-lg p-6 border border-border">
      <div className={isVacation ? "opacity-50 pointer-events-auto" : ""}>
        {/* MEH-1334: the "פתוח להזמנות" status line moved to the header meta
            line (3 states, one status home per page — revision-2 #2). */}

        {/* The one primary CTA — color/label driven by primary_contact_method
            (WhatsApp green only on WhatsApp). */}
        <PrimaryContactButton
          producer={producer}
          onClick={() => {
            // MEH-1426: attribution + unlock fire together, and ONLY on a
            // WhatsApp primary CTA. Previously markWhatsAppClickedLocal ran
            // unconditionally, so a phone/email/website primary still unlocked
            // the review form — a click that never created an attributed WA row,
            // so the reviews gate (reviews.py guard 3) would 403 anyway.
            // Invariant: every WhatsApp click = attribution + unlock; non-WA = neither.
            if (primaryMethod === "whatsapp") {
              pingWhatsAppBeacon(producer.id);
              markWhatsAppClickedLocal(producer.id);
            }
          }}
        />

        {/* Ready-made questions as quiet text links under the CTA. */}
        <WhatsAppQuestionChips producer={producer} />

        {/* Quiet secondary-channel icon row — MEH-1334 chunk 2: circular
            hairline-bordered 44px targets on white, primary-dark glyph (the
            approved mockup's .iconrow anatomy). */}
        {channels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 mb-1" role="list">
            {channels.map(({ key, Icon, href, track }) => (
              <a
                key={key}
                href={href(producer)}
                {...(key === "phone"
                  ? {}
                  : { target: "_blank", rel: "noopener noreferrer" })}
                role="listitem"
                aria-label={t(`producer.detail.contact_card.aria.${key}`)}
                title={t(`producer.detail.contact_card.aria.${key}`)}
                onClick={(e) => {
                  // MEH-1334: on desktop a phone tap reveals the number inline
                  // (no dialer) — swallow the tel: navigation and show the pill.
                  if (
                    key === "phone" &&
                    typeof window !== "undefined" &&
                    window.matchMedia("(min-width: 1024px)").matches
                  ) {
                    e.preventDefault();
                    setPhoneRevealed(true);
                  }
                  if (track === false) return;
                  // Fires exactly once per click (fallback must not double-track).
                  trackContactClick(producer.id, key);
                  // MEH-1221: email-only silent-mailto fallback.
                  if (key === "email") {
                    armMailtoFallback(producer.contact_email?.trim(), t);
                  }
                }}
                className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-border bg-white text-primary-dark hover:text-primary hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Icon size={18} aria-hidden="true" />
              </a>
            ))}
          </div>
        )}

        {/* Desktop-revealed phone number pill (MEH-1334). Number is dir="ltr"
            + .numeric so RTL can't reorder the digits; still a tel: link so a
            desktop softphone / click-to-call extension can act on it. */}
        {phoneRevealed && producer.phone && (
          <a
            href={`tel:${producer.phone}`}
            dir="ltr"
            data-testid="revealed-phone"
            className="numeric inline-flex items-center gap-2 mt-2 px-3 min-h-[44px] rounded-full border border-border bg-white text-sm text-text focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Phone size={16} className="text-primary-dark" aria-hidden="true" />
            {producer.phone}
          </a>
        )}

        {/* MEH-1334: the tertiary follow + share row moved to the header's
            quiet actions row (שמירה · מעקב · שיתוף) — one home per action. */}

        {/* MEH-1443: discreet "found wrong info?" report link (opens a modal;
            v1 emails the admin). */}
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="mt-4 text-xs text-fg-muted underline hover:text-text transition"
        >
          {t("producer.detail.contact_card.report_info_link")}
        </button>
      </div>

      <ReportInfoModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        producerSlug={producer.slug || producer.id}
      />
    </div>
  );
}
