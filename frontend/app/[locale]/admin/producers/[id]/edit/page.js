"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";
import AdminLoadError from "@/components/admin/AdminLoadError";

export default function EditProducerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const [producer, setProducer] = useState(null);
  const [fetching, setFetching] = useState(true);
  // MEH-2096: a catch that nulled the producer fell through to the "not found"
  // branch, so a failed request told the admin the business does not exist.
  // A 404 and an unreachable API are different facts and now render differently.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const t = useTranslations("admin");

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    setFetching(true);
    setLoadError(false);
    api
      // MEH-2072: the ADMIN shape, not the public one. This used to call
      // `/producers/${id}` -> ProducerDetailOut, which by design carries no
      // admin-only field — so ProducerForm hydrated producer_license_number,
      // address, referral_source and license_expires_at as "" and then wrote
      // those blanks back on save. Measured: a save that changed only the name
      // wiped producer_license_number '1234567' -> '' and address -> NULL.
      .get(`/admin/producers/${id}`)
      .then((r) => { setProducer(r.data); setLoadError(false); })
      .catch((err) => {
        // A real 404 keeps the existing "not found" copy; anything else — network
        // down, 500, timeout — is a load failure the admin can retry.
        if (err?.response?.status === 404) setProducer(null);
        else setLoadError(true);
      })
      .finally(() => setFetching(false));
  }, [id, user, reloadKey]);

  if (loading || !user || fetching) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-muted">
        {t("common.loading")}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <AdminLoadError
          onRetry={() => setReloadKey((k) => k + 1)}
          testId="admin-producer-edit-load-error"
        />
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-muted">
        {t("producers.edit.not_found")}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin?tab=producers" className="text-sm text-muted hover:text-primary">
          {t("common.back")}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{t("producers.edit.title", { name: producer.name })}</h1>
      </div>
      <ProducerForm initial={producer} producerId={id} />
    </div>
  );
}
