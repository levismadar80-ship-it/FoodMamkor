"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Gauge,
  Storefront,
  Users,
  Star,
  Warning,
  Sparkle,
  Lifebuoy,
  LinkSimple,
  ArrowUpRight,
} from "@phosphor-icons/react";

/**
 * /admin/help — internal admin handbook (MEH-21, i18n MEH-475 PR-B).
 *
 * Static admin guide rendered inside the /admin layout. A sticky
 * table-of-contents links to in-page anchors; each section is a
 * self-contained block that admins can skim without scrolling the
 * whole document.
 *
 * Credentials, project IDs, and personal contacts are intentionally
 * left as `<להזין>` placeholders — they belong in the team's password
 * manager, not in git. The handover checklist in docs/ADMIN.md has
 * the same redaction pattern.
 */
export default function AdminHelpPage() {
  const t = useTranslations("admin.help");

  const richComponents = {
    strong: (chunks) => <strong>{chunks}</strong>,
    code: (chunks) => (
      <code className="bg-light px-1.5 py-0.5 rounded text-xs">{chunks}</code>
    ),
    em: (chunks) => <em>{chunks}</em>,
    placeholder: (chunks) => <>&lt;{chunks}&gt;</>,
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Lifebuoy size={28} weight="fill" className="text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6 leading-relaxed">
        {t("intro")}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        {/* Sticky TOC */}
        <aside className="md:sticky md:top-24 self-start bg-white border border-border rounded-[12px] p-4 text-sm">
          <p className="text-xs uppercase tracking-wider text-text-secondary mb-2">{t("toc_label")}</p>
          <nav className="flex flex-col gap-1.5">
            <a href="#dashboard" className="hover:text-primary transition">{t("toc.dashboard")}</a>
            <a href="#producers" className="hover:text-primary transition">{t("toc.producers")}</a>
            <a href="#users" className="hover:text-primary transition">{t("toc.users")}</a>
            <a href="#reviews" className="hover:text-primary transition">{t("toc.reviews")}</a>
            <a href="#reports" className="hover:text-primary transition">{t("toc.reports")}</a>
            <a href="#experiences" className="hover:text-primary transition">{t("toc.experiences")}</a>
            <a href="#emergency" className="hover:text-primary transition">{t("toc.emergency")}</a>
            <a href="#urls" className="hover:text-primary transition">{t("toc.urls")}</a>
          </nav>
        </aside>

        {/* Content */}
        <div className="space-y-10">
          {/* ===== Dashboard ===== */}
          <Section id="dashboard" icon={Gauge} title={t("sections.dashboard.title")}>
            <p>{t.rich("sections.dashboard.p1", richComponents)}</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li>{t.rich("sections.dashboard.li1", richComponents)}</li>
              <li>{t.rich("sections.dashboard.li2", richComponents)}</li>
              <li>{t.rich("sections.dashboard.li3", richComponents)}</li>
              <li>{t.rich("sections.dashboard.li4", richComponents)}</li>
            </ul>
          </Section>

          {/* ===== Producers ===== */}
          <Section id="producers" icon={Storefront} title={t("sections.producers.title")}>
            <p>{t.rich("sections.producers.p1", richComponents)}</p>
            <ol className="list-decimal ps-5 space-y-2 mt-3">
              <li>{t.rich("sections.producers.li1", richComponents)}</li>
              <li>{t.rich("sections.producers.li2", richComponents)}</li>
              <li>{t.rich("sections.producers.li3", richComponents)}</li>
              <li>{t.rich("sections.producers.li4", richComponents)}</li>
              <li>{t.rich("sections.producers.li5", richComponents)}</li>
            </ol>
            <p className="mt-3 text-xs text-text-secondary">
              {t.rich("sections.producers.footnote", richComponents)}
            </p>
          </Section>

          {/* ===== Users ===== */}
          <Section id="users" icon={Users} title={t("sections.users.title")}>
            <p>{t.rich("sections.users.p1", richComponents)}</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li>{t.rich("sections.users.li1", richComponents)}</li>
              <li>{t.rich("sections.users.li2", richComponents)}</li>
              <li>{t.rich("sections.users.li3", richComponents)}</li>
            </ul>
            <p className="mt-3 text-xs text-text-secondary">
              {t.rich("sections.users.footnote", richComponents)}
            </p>
          </Section>

          {/* ===== Reviews ===== */}
          <Section id="reviews" icon={Star} title={t("sections.reviews.title")}>
            <p>{t.rich("sections.reviews.p1", richComponents)}</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li>{t.rich("sections.reviews.li1", richComponents)}</li>
              <li>{t.rich("sections.reviews.li2", richComponents)}</li>
              <li>{t.rich("sections.reviews.li3", richComponents)}</li>
            </ul>
          </Section>

          {/* ===== Reports ===== */}
          <Section id="reports" icon={Warning} title={t("sections.reports.title")}>
            <p>{t.rich("sections.reports.p1", richComponents)}</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li>{t.rich("sections.reports.li1", richComponents)}</li>
              <li>{t.rich("sections.reports.li2", richComponents)}</li>
              <li>{t.rich("sections.reports.li3", richComponents)}</li>
            </ul>
            <p className="mt-3 text-xs text-text-secondary">
              {t.rich("sections.reports.footnote", richComponents)}
            </p>
          </Section>

          {/* ===== Experiences ===== */}
          <Section id="experiences" icon={Sparkle} title={t("sections.experiences.title")}>
            <p>{t.rich("sections.experiences.p1", richComponents)}</p>
            <ul className="list-disc ps-5 space-y-1.5 mt-2">
              <li>{t.rich("sections.experiences.li1", richComponents)}</li>
              <li>{t.rich("sections.experiences.li2", richComponents)}</li>
            </ul>
          </Section>

          {/* ===== Emergency ===== */}
          <Section id="emergency" icon={Warning} title={t("sections.emergency.title")} danger>
            <ul className="space-y-3">
              <li>
                <strong>{t("sections.emergency.site_down_title")}</strong>
                <p className="text-sm text-text-secondary mt-1">
                  {t.rich("sections.emergency.site_down_body", richComponents)}
                </p>
              </li>
              <li>
                <strong>{t("sections.emergency.migration_title")}</strong>
                <p className="text-sm text-text-secondary mt-1">
                  {t.rich("sections.emergency.migration_body", richComponents)}
                </p>
              </li>
              <li>
                <strong>{t("sections.emergency.login_broken_title")}</strong>
                <p className="text-sm text-text-secondary mt-1">
                  {t.rich("sections.emergency.login_broken_body", richComponents)}
                </p>
              </li>
              <li>
                <strong>{t("sections.emergency.spam_title")}</strong>
                <p className="text-sm text-text-secondary mt-1">
                  {t.rich("sections.emergency.spam_body", richComponents)}
                </p>
              </li>
              <li>
                <strong>{t("sections.emergency.ai_silent_title")}</strong>
                <p className="text-sm text-text-secondary mt-1">
                  {t.rich("sections.emergency.ai_silent_body", richComponents)}
                </p>
              </li>
            </ul>
          </Section>

          {/* ===== URLs ===== */}
          <Section id="urls" icon={LinkSimple} title={t("sections.urls.title")}>
            <p className="text-sm text-text-secondary mb-3">
              {t("sections.urls.intro")}
            </p>
            <ul className="space-y-2">
              <ExternalRow label={t("sections.urls.prod_label")} href="https://mehamakor.online">mehamakor.online</ExternalRow>
              <ExternalRow label={t("sections.urls.staging_label")} href="https://staging.mehamakor.online">staging.mehamakor.online</ExternalRow>
              <ExternalRow label={t("sections.urls.github_label")} href="https://github.com/levismadar80-ship-it/FoodMamkor">{t("sections.urls.github_text")}</ExternalRow>
              <li className="flex items-start gap-3 text-sm">
                <span className="text-text-secondary min-w-[140px]">{t("sections.urls.railway_label")}</span>
                <span className="text-site-muted">{t.rich("sections.urls.railway_text", richComponents)}</span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="text-text-secondary min-w-[140px]">{t("sections.urls.vercel_label")}</span>
                <span className="text-site-muted">{t.rich("sections.urls.vercel_text", richComponents)}</span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="text-text-secondary min-w-[140px]">{t("sections.urls.cloudinary_label")}</span>
                <span className="text-site-muted">{t.rich("sections.urls.cloudinary_text", richComponents)}</span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="text-text-secondary min-w-[140px]">{t("sections.urls.anthropic_label")}</span>
                <span className="text-site-muted">{t.rich("sections.urls.anthropic_text", richComponents)}</span>
              </li>
            </ul>
          </Section>

          {/* Footer link back to the docs */}
          <div className="pt-6 border-t border-border">
            <p className="text-xs text-text-secondary">
              {t.rich("footer", richComponents)}
              <Link href="/admin" className="ms-3 text-primary hover:underline">
                {t("footer_back")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, children, danger = false }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-3">
        <Icon
          size={22}
          weight="duotone"
          className={danger ? "text-red-600" : "text-primary"}
          aria-hidden="true"
        />
        <h2 className={`text-xl font-bold ${danger ? "text-red-700" : "text-site-text"}`}>
          {title}
        </h2>
      </div>
      <div className="text-sm text-site-text leading-relaxed space-y-2 bg-white border border-border rounded-[12px] p-5">
        {children}
      </div>
    </section>
  );
}

function ExternalRow({ label, href, children }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className="text-text-secondary min-w-[140px]">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1"
      >
        {children}
        <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
      </a>
    </li>
  );
}
