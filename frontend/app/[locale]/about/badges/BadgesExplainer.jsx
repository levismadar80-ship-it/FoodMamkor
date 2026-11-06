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
import { badgeIcon } from "@/lib/chip-icons";
import { COLOR_CLASSES } from "@/components/BadgeRow";

// Target of the <link> tag inside a group's intro, when it has one. The link
// text lives inside the sentence (t.rich), so no locale is left with a
// dangling lead-in.
const GROUP_LINKS = {
  "admin-verified": "/about/process",
  "self-declared": "/contact",
};

export default function BadgesExplainer() {
  const t = useTranslations("about_badges");
  const groups = badgesByEvidence();

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
              <h2 className="font-headline-md mb-2 text-primary text-2xl font-bold">
                {t(`groups.${evidence}.heading`)}
              </h2>
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
                {badges.map((badge) => {
                  const icon = badgeIcon(badge.key);
                  return (
                    <li
                      key={badge.key}
                      data-testid={`badges-item-${badge.key}`}
                      className="grid gap-1.5 rounded-xl border border-border bg-surface-card p-4"
                    >
                      <span
                        className={`justify-self-start inline-flex items-center gap-1 px-2.5 text-xs py-0.5 rounded-full font-medium ${COLOR_CLASSES[badge.color] || COLOR_CLASSES.muted}`}
                      >
                        {icon && <span aria-hidden="true" className="inline-flex">{icon}</span>}
                        {badge.label}
                      </span>
                      <p className="text-base leading-[1.7] text-text/85">{badge.tooltip}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </article>
    </section>
  );
}
