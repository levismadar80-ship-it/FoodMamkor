"use client";

/**
 * BadgesExplainer — body of /about/badges (MEH-2701).
 *
 * Generated from BADGE_CONFIG via badgesByEvidence(): one section per evidence
 * group, anchored by the evidence key (#admin-verified, #editorial,
 * #self-declared, #system) — the anchors BadgeRow's hero popovers link to.
 * Each badge shows the same pill the reader tapped plus its locked tooltip
 * copy; this page adds only the group headings and intros.
 */
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { badgesByEvidence } from "@/lib/badges";
import { useBadgeCopy } from "@/lib/use-badge-copy";
import { badgeIcon } from "@/lib/chip-icons";
import { COLOR_CLASSES, VerifiedChip } from "@/components/BadgeRow";
import { rescueBagsEnabled } from "@/lib/rescue";
import SectionHeading from "@/components/ui/SectionHeading";

// Target of the <link> tag inside a group's intro, when it has one. The link
// text lives inside the sentence (t.rich), so no locale is left with a
// dangling lead-in.
const GROUP_LINKS = {
  "admin-verified": "/about/process",
  // MEH-2832: a self-declared badge that looks wrong is a correction.
  "self-declared": "/contact?topic=correction",
};

const ITEM_CLASS = "grid gap-1.5 rounded-xl border border-border bg-surface-card p-4";
const ITEM_TEXT_CLASS = "text-base leading-[1.7] text-text/85";

// MEH-2827: «מובילת קהילה» is a TrustBadge (reviews-driven), not a
// BADGE_CONFIG entry, so badgesByEvidence() never listed it. It is earned by
// the system, so it opens the «אוטומטי» group, with the tooltip readers see.
function CommunityLeaderItem() {
  const tTrust = useTranslations("trust");
  return (
    <li data-testid="badges-item-community_leader" className={ITEM_CLASS}>
      {/* TrustBadge's tier-4 face, without its tooltip wrapper (a role-less
          span with aria-label; the text below is the tooltip anyway). Parity
          with the real TrustBadge: AboutTrustCards.test.jsx. */}
      <span
        data-testid="community-chip"
        className="justify-self-start inline-flex items-center rounded-full border font-medium text-xs px-2 py-0.5 bg-warning-50 text-warning-700 border-warning-200"
      >
        {tTrust("tier_4.label")}
      </span>
      <p className={ITEM_TEXT_CLASS}>{tTrust("tier_4.tooltip")}</p>
    </li>
  );
}

// The badge face as readers see it. MEH-2827: «מאומת» is the gold seal chip
// from the business page (BadgeRow's VerifiedChip), not the green pill its
// BADGE_CONFIG color would give — that color stays as is for the surfaces
// that use it.
function BadgeFace({ badge, icon }) {
  if (badge.key === "verified") return <VerifiedChip label={badge.label} className="justify-self-start" />;
  return (
    <span
      className={`justify-self-start inline-flex items-center gap-1 px-2.5 text-xs py-0.5 rounded-full font-medium ${COLOR_CLASSES[badge.color] || COLOR_CLASSES.muted}`}
    >
      {icon && <span aria-hidden="true" className="inline-flex">{icon}</span>}
      {badge.label}
    </span>
  );
}

export default function BadgesExplainer() {
  const t = useTranslations("about_badges");
  // MEH-2716: «מצילים מזון» can only light while the rescue pilot is on, so
  // the page does not explain a badge nobody can see.
  const pilotOn = rescueBagsEnabled();
  const withCopy = useBadgeCopy();
  const groups = badgesByEvidence()
    .map((g) => ({
      ...g,
      badges: g.badges.filter((b) => b.key !== "rescue_saving" || pilotOn).map(withCopy),
    }))
    .filter((g) => g.badges.length > 0);

  return (
    <section className="min-h-screen bg-background text-text">
      <article data-testid="badges-explainer" className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-8 sm:mb-10">
          <h1 className="font-headline-lg mb-5 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black">
            {t("h1")}
          </h1>
          <p className="text-lg sm:text-xl leading-[1.8] text-text/90">{t("intro")}</p>
        </header>

        {groups.map(({ evidence, badges }) => {
          const href = GROUP_LINKS[evidence];
          return (
            <section
              key={evidence}
              id={evidence}
              data-testid={`badges-group-${evidence}`}
              className="scroll-mt-24 mt-10 sm:mt-12"
            >
              <SectionHeading size="content" className="mb-2 text-primary">
                {t(`groups.${evidence}.heading`)}
              </SectionHeading>
              <p className="mb-4 text-base sm:text-lg leading-[1.8] text-text/90">
                {t.rich(`groups.${evidence}.intro`, {
                  link: (chunks) => (
                    <Link href={href} className="underline text-primary hover:opacity-90 focus-ring rounded-sm">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
              <ul className="grid gap-3">
                {evidence === "system" && <CommunityLeaderItem />}
                {badges.map((badge) => (
                  <li key={badge.key} data-testid={`badges-item-${badge.key}`} className={ITEM_CLASS}>
                    <BadgeFace badge={badge} icon={badgeIcon(badge.key)} />
                    <p className={ITEM_TEXT_CLASS}>{badge.tooltip}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </article>
    </section>
  );
}
