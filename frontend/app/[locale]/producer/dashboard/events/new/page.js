"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import EventForm from "@/components/EventForm";

export default function NewEventPage() {
  const router = useRouter();
  const t = useTranslations("sweep_tail.event_new");
  const { user, loading: authLoading } = useAuth();
  // MEH-1161: a pending producer's event is hidden from the public until the
  // business is approved — the public detail would 404 for anyone else, so
  // instead of redirecting there, show an in-page success state with the
  // "visible after approval" hint. null = status unknown → keep the redirect.
  const [producerStatus, setProducerStatus] = useState(null);
  const [createdPending, setCreatedPending] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "producer") return;
    api
      .get("/producers/me")
      .then((r) => setProducerStatus(r.data?.status || null))
      .catch(() => setProducerStatus(null));
  }, [user]);

  if (!authLoading && (!user || user.role !== "producer")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  // MEH-1405: form body extracted to <EventForm>. The create page keeps the
  // pending-approval decision (it depends on the page-level producerStatus).
  const handleSuccess = (data) => {
    if (producerStatus && producerStatus !== "approved") {
      setCreatedPending(true);
      return;
    }
    router.push(`/events/${data.id}`);
  };

  if (createdPending) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div
          className="bg-green-50 border border-primary rounded-[12px] p-6 text-center"
          role="status"
        >
          <h1 className="font-headline-lg text-2xl font-bold text-text mb-2">
            {t("pending_success_title")}
          </h1>
          <p className="text-fg-muted mb-6">{t("pending_success_hint")}</p>
          <Link
            href="/producer/dashboard"
            className="inline-block bg-primary text-white px-6 py-3 rounded-[8px] hover:bg-primary-dark transition font-medium"
          >
            {t("pending_success_dashboard")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <nav className="text-sm text-fg-muted mb-4">
        <Link href="/producer/dashboard/events" className="hover:text-primary">{t("crumb_dashboard")}</Link>
        <span className="mx-2">›</span>
        <span className="text-text">{t("crumb_current")}</span>
      </nav>

      <h1 className="font-headline-lg text-4xl font-bold text-text mb-2">{t("heading")}</h1>
      <p className="text-fg-muted mb-8">{t("subtitle")}</p>

      <p className="text-sm text-fg-muted bg-green-50 rounded-[10px] px-4 py-3 mb-6 leading-relaxed">
        {t("info_paragraph")}
      </p>

      <EventForm mode="create" onSuccess={handleSuccess} cancelHref="/producer/dashboard/events" />
    </div>
  );
}
