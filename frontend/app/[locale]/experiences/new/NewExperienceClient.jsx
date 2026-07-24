"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Leaf } from "@phosphor-icons/react";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import Breadcrumb from "@/components/Breadcrumb";
import ExperienceForm from "@/components/ExperienceForm";

/**
 * Create-form page for a community experience. MEH-1405 extracted the form body
 * into <ExperienceForm> (shared with the dashboard edit page); this page keeps
 * the auth gate + breadcrumb/heading chrome and the post-create toast+redirect
 * to the public detail (?pending=1 hint).
 */
export default function NewExperienceClient() {
  const t = useTranslations("experiences.new");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/experiences/new");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-fg-muted">{t("auth_loading")}</div>;
  }

  const handleSuccess = (data) => {
    showToast.success(t("toast_submitted"), { icon: <Leaf size={18} /> });
    router.push(`/experiences/${data.id}?pending=1`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { href: "/", label: t("breadcrumb_home") },
          { href: "/experiences", label: t("breadcrumb_experiences") },
          { label: t("breadcrumb_submit") },
        ]}
        className="mb-4"
      />

      <h1 className="font-headline-lg text-3xl md:text-4xl font-bold text-text mb-2">{t("title")}</h1>
      <p className="text-fg-muted mb-8">{t("subtitle")}</p>

      <ExperienceForm mode="create" onSuccess={handleSuccess} cancelHref="/experiences" />
    </div>
  );
}
