"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import ProducerForm from "@/components/admin/ProducerForm";

export default function NewProducerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("admin");

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin?tab=producers" className="text-sm text-text-secondary hover:text-primary">
          {t("common.back")}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{t("producers.new.title")}</h1>
        <p className="text-text-secondary text-sm mt-1">
          {t("producers.new.subtitle")}
        </p>
      </div>
      <ProducerForm />
    </div>
  );
}
