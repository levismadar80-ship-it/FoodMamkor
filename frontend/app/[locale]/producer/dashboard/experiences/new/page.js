// @ts-check
"use client";

import { useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Seed from "@/components/brand/Seed";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import ExperienceForm from "@/components/ExperienceForm";
import useDuplicateSource from "@/lib/use-duplicate-source";
import { SkeletonForm } from "@/components/Skeleton";

// MEH-2249: experience creation moved here from the public /experiences/new.
// Creation now sits beside the list and the edit page it belongs with, and the
// dashboard layout is the gate — no new auth code. /experiences/new 308s here
// (next.config.js redirects()).
// REUSES: producer/dashboard/events/new/page.js (crumb nav + heading shape),
//         producer/dashboard/experiences/[id]/edit/page.js (guard + success).

const LIST_HREF = "/producer/dashboard/experiences";

export default function NewExperiencePage() {
  const t = useTranslations("experiences.new");
  const tCrumb = useTranslations("sweep_tail.event_new");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  // MEH-3438: «שכפול» lands here with ?from=<id>; the form opens pre-filled.
  const tDup = useTranslations("dashboard.producer.manage_experiences");
  const dup = useDuplicateSource("experiences");

  // Duplicate role guard, mirroring the sibling edit page
  // (producer/dashboard/experiences/[id]/edit/page.js:35-40). The real UX gate
  // is producer/dashboard/DashboardLayoutClient.jsx:115-150 — 401 → /login?redirect=,
  // 403 → the in-app denied state — and it returns BEFORE this page mounts, so
  // a consumer never reaches this push. The layout's own comment records that
  // child pages keep their duplicate guard until its Phase 2; this is that.
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") router.push("/login");
  }, [user, authLoading, router]);

  if (authLoading || !user || user.role !== "producer") return null;

  // Unchanged from the page this replaces: moderation already yields a pending
  // state, and GET /experiences/{id} lets the owner read her own pending item
  // (experiences.py `is_owner` bypasses the public-visibility filter), so the
  // ?pending=1 detail redirect stays valid. No producerStatus branch here —
  // that one belongs to events, where a pending business's event 404s.
  const handleSuccess = (data) => {
    showToast.success(t("toast_submitted"), { icon: <Seed size={12} /> });
    router.push(`/experiences/${data.id}?pending=1`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <nav className="text-sm text-fg-muted mb-4">
        <Link href={LIST_HREF} className="hover:text-primary">
          {tCrumb("crumb_dashboard")}
        </Link>
        <span className="mx-2">›</span>
        <span className="text-text">{t("crumb_current")}</span>
      </nav>

      <h1 className="font-headline-lg text-3xl md:text-4xl font-bold text-text mb-2">
        {t("title")}
      </h1>
      <p className="text-fg-muted mb-8">{t("subtitle")}</p>

      {dup.source && (
        <p className="text-sm text-text bg-green-50 rounded-md px-4 py-3 mb-6" role="status" data-testid="duplicate-note">
          {tDup("copied_from", { title: dup.source.title })}
        </p>
      )}
      {dup.loading ? (
        <SkeletonForm />
      ) : (
        <ExperienceForm mode="create" initial={dup.source} onSuccess={handleSuccess} cancelHref={LIST_HREF} emailUnverified={user?.email_verified === false} />
      )}
    </div>
  );
}
