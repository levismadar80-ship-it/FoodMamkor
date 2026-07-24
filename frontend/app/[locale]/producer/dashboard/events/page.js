"use client";

/**
 * Producer "my events" manage list — MEH-1405.
 *
 * Lists the producer's own events (GET /events/mine, includes canceled ones),
 * with edit / cancel-toggle (is_active via PUT) / delete (confirm) actions.
 * Create is reachable from the header CTA.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { CalendarPlus, PencilSimple, Prohibit, ArrowCounterClockwise, Trash } from "@phosphor-icons/react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { formatEventDate } from "@/lib/format-date";
import { detailToMessage } from "@/lib/errors";

export default function ManageEventsPage() {
  const t = useTranslations("dashboard.producer.manage_events");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.get("/events/mine").then((r) => setItems(r.data)).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    load();
  }, [user, authLoading, router, load]);

  if (authLoading || !user || user.role !== "producer") return null;

  // Cancel/reactivate: optimistic is_active flip, revert on error.
  const toggleActive = async (ev) => {
    const next = !ev.is_active;
    setBusyId(ev.id);
    setItems((list) => list.map((e) => (e.id === ev.id ? { ...e, is_active: next } : e)));
    try {
      await api.put(`/events/${ev.id}`, { is_active: next });
    } catch (err) {
      setItems((list) => list.map((e) => (e.id === ev.id ? { ...e, is_active: ev.is_active } : e)));
      showToast.error(detailToMessage(err.response?.data?.detail) || t("action_error"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (ev) => {
    if (!window.confirm(t("delete_confirm", { title: ev.title }))) return;
    setBusyId(ev.id);
    try {
      await api.delete(`/events/${ev.id}`);
      setItems((list) => list.filter((e) => e.id !== ev.id));
    } catch (err) {
      showToast.error(detailToMessage(err.response?.data?.detail) || t("action_error"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="font-headline-lg text-3xl font-bold text-text">{t("heading")}</h1>
        <Link
          href="/producer/dashboard/events/new"
          className="inline-flex items-center gap-1.5 bg-primary text-white px-4 py-2 min-h-[44px] rounded-[8px] text-sm font-medium hover:bg-primary-dark transition"
        >
          <CalendarPlus size={18} weight="bold" aria-hidden="true" />
          {t("create_cta")}
        </Link>
      </div>

      {items === null ? (
        <div className="text-center py-16 text-fg-muted">{t("loading")}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-muted bg-white border border-border rounded-[12px] p-6 text-center">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((ev) => (
            <li
              key={ev.id}
              className={`bg-white border rounded-[12px] p-4 ${ev.is_active ? "border-border" : "border-yellow-300 bg-yellow-50/40"}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-text truncate">{ev.title}</h2>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${ev.is_active ? "bg-green-50 text-primary" : "bg-yellow-100 text-yellow-800"}`}
                    >
                      {ev.is_active ? t("badge_active") : t("badge_inactive")}
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted mt-1">
                    {formatEventDate(ev.event_date, locale, { day: "numeric", month: "long", year: "numeric" })}
                    {ev.city ? ` · ${ev.city}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href={`/producer/dashboard/events/${ev.id}/edit`}
                    aria-label={t("action_edit")}
                    className="inline-flex items-center gap-1 border border-border rounded-[8px] px-3 py-1.5 min-h-[44px] text-xs hover:bg-green-50 transition"
                  >
                    <PencilSimple size={16} aria-hidden="true" />
                    {t("action_edit")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleActive(ev)}
                    disabled={busyId === ev.id}
                    className="inline-flex items-center gap-1 border border-border rounded-[8px] px-3 py-1.5 min-h-[44px] text-xs hover:bg-green-50 transition disabled:opacity-50"
                  >
                    {ev.is_active ? (
                      <>
                        <Prohibit size={16} aria-hidden="true" />
                        {t("action_cancel")}
                      </>
                    ) : (
                      <>
                        <ArrowCounterClockwise size={16} aria-hidden="true" />
                        {t("action_activate")}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(ev)}
                    disabled={busyId === ev.id}
                    aria-label={t("action_delete")}
                    className="inline-flex items-center gap-1 border border-red-300 text-red-600 rounded-[8px] px-3 py-1.5 min-h-[44px] text-xs hover:bg-red-50 transition disabled:opacity-50"
                  >
                    <Trash size={16} aria-hidden="true" />
                    {t("action_delete")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
