"use client";

import { useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Leaf } from "@phosphor-icons/react";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import ExperienceForm from "@/components/ExperienceForm";

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

  // Duplicate role guard, mirroring the sibling edit page
  // (producer/dashboard/experiences/[id]/edit/page.js:35-40). The real UX gate
  // is producer/dashboard/layout.js:115-150 — 401 → /login?redirect=,
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
    showToast.success(t("toast_submitted"), { icon: <Leaf size={18} /> });
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

      <ExperienceForm mode="create" onSuccess={handleSuccess} cancelHref={LIST_HREF} />
    </div>
  );
}
