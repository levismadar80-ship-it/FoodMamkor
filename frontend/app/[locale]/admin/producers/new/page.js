// @ts-check
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import ProducerForm from "@/components/admin/ProducerForm";
import { useApi } from "@/lib/use-api";
import BackLink from "@/components/ui/BackLink";

export default function NewProducerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("admin");

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  // MEH-3818: the form draws once its category list is in, not before it
  // (ProducerForm reads the same cached key; field CLS p75 1.0, Sentry 25/11).
  const categories = useApi(user?.role === "admin" ? "/categories" : null);
  if (loading || !user || categories.isLoading) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <BackLink href="/admin?tab=producers" label={t("common.back")} />
        <h1 className="text-2xl font-bold mt-2">{t("producers.new.title")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("producers.new.subtitle")}
        </p>
      </div>
      <ProducerForm />
    </div>
  );
}
