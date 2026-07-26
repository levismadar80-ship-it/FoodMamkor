"use client";

/**
 * Producer experience edit page — MEH-1405.
 *
 * Loads the experience via GET /experiences/{id} (owner/admin see it even when
 * pending; the owner also gets the private address) and renders
 * <ExperienceForm mode="edit">. On save, returns to the manage list.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Leaf } from "@phosphor-icons/react";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import ExperienceForm from "@/components/ExperienceForm";
// MEH-999: shared back link — one owner for target + arrow direction.
import BackLink from "@/components/ui/BackLink";

const LIST_HREF = "/producer/dashboard/experiences";

export default function EditExperiencePage() {
  const t = useTranslations("dashboard.producer.manage_experiences");
  const tNew = useTranslations("experiences.new");
  const router = useRouter();
  const params = useParams();
  const experienceId = params?.id;
  const { user, loading: authLoading } = useAuth();
  const [experience, setExperience] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api
      .get(`/experiences/${experienceId}`)
      .then((r) => setExperience(r.data))
      .catch(() => setError(t("not_found")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, experienceId]);

  if (authLoading || !user) return null;

  const handleSuccess = () => {
    showToast.success(tNew("toast_submitted"), { icon: <Leaf size={18} /> });
    router.push(LIST_HREF);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* MEH-999: entered from the experiences list, so back goes there. */}
      <BackLink href={LIST_HREF} label={t("back")} />
      <h1 className="font-headline-lg text-3xl font-bold text-text mt-1 mb-6">{t("edit_heading")}</h1>
      {error ? (
        <p className="text-fg-muted">{error}</p>
      ) : experience ? (
        <ExperienceForm mode="edit" initial={experience} onSuccess={handleSuccess} cancelHref={LIST_HREF} />
      ) : (
        <div className="text-center py-16 text-fg-muted">{t("loading")}</div>
      )}
    </div>
  );
}
