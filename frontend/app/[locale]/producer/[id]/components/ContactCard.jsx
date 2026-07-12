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

import FollowButton from "@/components/FollowButton";
import PrimaryContactButton from "@/components/PrimaryContactButton";
import ShareButton from "@/components/ShareButton";
import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import { getPrimaryMethod } from "@/lib/contact-method";
import { markWhatsAppClickedLocal, pingWhatsAppBeacon, trackContactClick } from "@/lib/contact-tracking";

/**
 * Module:   ContactCard
 * Purpose:  The single editorial contact card for the producer detail
 *           page — one status line, exactly one primary CTA, ready-made
 *           question links, a quiet secondary-channel icon row, and
 *           tertiary follow + share. Rendered twice by ProducerDetail:
 *           once inline on mobile/tablet (the IntersectionObserver target
 *           for the sticky bar) and once as the desktop sticky sidebar.
 * Touches:  contact-tracking (WhatsApp beacon + per-channel click ping).
 * Does NOT: own the sticky-bar visibility (StickyContactBar +
 *           useStickyBar) or the header availability badge (ProducerHeader).
 * Related:  ContactSidebar.jsx (desktop wrapper), StickyContactBar.jsx.
 * History:  MEH-1146 chunk A (creation — action-hierarchy rebuild,
 *           consolidates the old ContactSidebar + ActionRow CTAs).
 */

// Availability states that honestly read as "open for orders" — the status
// line (invention-fix 2) is suppressed for full/busy/vacation so it never
// contradicts the header AvailabilityBadge.
const OPEN_STATES = ["available", "accepting_orders", "available_today"];

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

export default function ContactCard({ producer, isVacation, primaryCategory, shareUrl }) {
  const t = useTranslations();
  const primaryMethod = getPrimaryMethod(producer);

  const availState = producer.availability_state || producer.availability_status;
  const showOpenStatus = !isVacation && (!availState || OPEN_STATES.includes(availState));

  // whatsapp primary has no matching row icon (its CTA is phone-derived), so
  // the phone tel: icon — a distinct "call" action — is intentionally kept.
  const channels = CHANNELS.filter((c) => c.key !== primaryMethod && c.href(producer));

  return (
    <div className="bg-white rounded-lg p-6 border border-border">
      <div className={isVacation ? "opacity-50 pointer-events-auto" : ""}>
        {/* Status line — invention-fix 2: "פתוח להזמנות" only, no
            response-time claim; suppressed for full/busy/vacation. */}
        {showOpenStatus && (
          <p className="flex items-center gap-1.5 text-sm text-fg-muted mb-3">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
            {t("producer.detail.contact_card.status_open")}
          </p>
        )}

        {/* The one primary CTA — color/label driven by primary_contact_method
            (WhatsApp green only on WhatsApp). */}
        <PrimaryContactButton
          producer={producer}
          onClick={() => {
            if (primaryMethod === "whatsapp") {
              pingWhatsAppBeacon(producer.id);
            }
            // Unlocks the review form (localStorage.wa_clicked_<id>).
            markWhatsAppClickedLocal(producer.id);
          }}
        />

        {/* Ready-made questions as quiet text links under the CTA. */}
        <WhatsAppQuestionChips producer={producer} />

        {/* Quiet secondary-channel icon row. */}
        {channels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-1" role="list">
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
                onClick={track === false ? undefined : () => trackContactClick(producer.id, key)}
                className="inline-flex items-center justify-center w-11 h-11 rounded-md text-fg-muted hover:text-primary hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Icon size={20} aria-hidden="true" />
              </a>
            ))}
          </div>
        )}

        {/* Tertiary: follow (shared component, unchanged per fix 8) + share. */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <div className="flex-1">
            <FollowButton producerId={producer.id} />
          </div>
          <ShareButton
            url={shareUrl}
            title={producer.name}
            description={producer.description}
            city={producer.city}
            category={primaryCategory?.name}
          />
        </div>
      </div>
    </div>
  );
}
