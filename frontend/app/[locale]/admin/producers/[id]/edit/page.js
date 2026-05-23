"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

export default function EditProducerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const [producer, setProducer] = useState(null);
  const [fetching, setFetching] = useState(true);
  const t = useTranslations("admin");

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    api
      .get(`/producers/${id}`)
      .then((r) => setProducer(r.data))
      .catch(() => setProducer(null))
      .finally(() => setFetching(false));
  }, [id, user]);

  if (loading || !user || fetching) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-text-secondary">
        {t("common.loading")}
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-text-secondary">
        {t("producers.edit.not_found")}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin?tab=producers" className="text-sm text-text-secondary hover:text-primary">
          {t("common.back")}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{t("producers.edit.title", { name: producer.name })}</h1>
      </div>
      <ProducerForm initial={producer} producerId={id} />
    </div>
  );
}
