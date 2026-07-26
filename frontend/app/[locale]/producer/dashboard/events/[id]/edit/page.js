"use client";

/**
 * Producer event edit page — MEH-1405.
 *
 * Loads the event via GET /events/{id} (owner sees it even when inactive) and
 * renders <EventForm mode="edit">. On save, returns to the manage list.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import EventForm from "@/components/EventForm";
// MEH-999: shared back link — one owner for target + arrow direction.
import BackLink from "@/components/ui/BackLink";

const LIST_HREF = "/producer/dashboard/events";

export default function EditEventPage() {
  const t = useTranslations("dashboard.producer.manage_events");
  const router = useRouter();
  const params = useParams();
  const eventId = params?.id;
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api
      .get(`/events/${eventId}`)
      .then((r) => setEvent(r.data))
      .catch(() => setError(t("not_found")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, eventId]);

  if (authLoading || !user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* MEH-999: entered from the events list, so back goes there. */}
      <BackLink href={LIST_HREF} label={t("back")} />
      <h1 className="font-headline-lg text-3xl font-bold text-text mt-1 mb-6">
        {t("edit_heading")}
      </h1>
      {error ? (
        <p className="text-fg-muted">{error}</p>
      ) : event ? (
        <EventForm
          mode="edit"
          initial={event}
          onSuccess={() => router.push(LIST_HREF)}
          cancelHref={LIST_HREF}
        />
      ) : (
        <div className="text-center py-16 text-fg-muted">{t("loading")}</div>
      )}
    </div>
  );
}
