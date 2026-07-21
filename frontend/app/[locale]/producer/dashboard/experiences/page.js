"use client";

/**
 * Producer "my experiences" manage list — MEH-1405.
 *
 * Lists the producer's own experiences (GET /experiences/mine — all statuses),
 * with edit / delete (confirm) actions. Experiences have no is_active column
 * (status is admin-controlled), so there is no producer cancel-toggle here —
 * delete is the producer's removal path. See PR: a reversible is_active cancel
 * for experiences needs an Alembic column (Sapir-only) and is out of scope.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Sparkle, PencilSimple, Trash } from "@phosphor-icons/react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { formatEventDate } from "@/lib/format-date";
import { detailToMessage } from "@/lib/errors";

const STATUS_STYLE = {
  approved: "bg-green-50 text-primary",
  pending: "bg-yellow-100 text-yellow-800",
  changes_requested: "bg-yellow-100 text-yellow-800",
  rejected: "bg-red-100 text-red-700",
};
// Experience.status enum (models.py) — labels have he/en twins under
// manage_experiences.status_*. Any unknown value falls back to the raw string.
const KNOWN_STATUSES = ["pending", "approved", "rejected", "changes_requested"];

export default function ManageExperiencesPage() {
  const t = useTranslations("dashboard.producer.manage_experiences");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.get("/experiences/mine").then((r) => setItems(r.data)).catch(() => setItems([]));
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

  const remove = async (ex) => {
    if (!window.confirm(t("delete_confirm", { title: ex.title }))) return;
    setBusyId(ex.id);
    try {
      await api.delete(`/experiences/${ex.id}`);
      setItems((list) => list.filter((e) => e.id !== ex.id));
    } catch (err) {
      showToast.error(detailToMessage(err.response?.data?.detail) || t("action_error"));
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = (s) => (KNOWN_STATUSES.includes(s) ? t(`status_${s}`) : s);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="font-headline-lg text-3xl font-bold text-text">{t("heading")}</h1>
        <Link
          href="/experiences/new"
          className="inline-flex items-center gap-1.5 bg-primary text-white px-4 py-2 min-h-[44px] rounded-[8px] text-sm font-medium hover:bg-primary-dark transition"
        >
          <Sparkle size={18} weight="bold" aria-hidden="true" />
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
          {items.map((ex) => (
            <li key={ex.id} className="bg-white border border-border rounded-[12px] p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-text truncate">{ex.title}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[ex.status] || "bg-gray-100 text-gray-700"}`}>
                      {statusLabel(ex.status)}
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted mt-1">
                    {formatEventDate(ex.event_date, locale, { day: "numeric", month: "long", year: "numeric" })}
                    {ex.city ? ` · ${ex.city}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href={`/producer/dashboard/experiences/${ex.id}/edit`}
                    aria-label={t("action_edit")}
                    className="inline-flex items-center gap-1 border border-border rounded-[8px] px-3 py-1.5 min-h-[44px] text-xs hover:bg-green-50 transition"
                  >
                    <PencilSimple size={16} aria-hidden="true" />
                    {t("action_edit")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(ex)}
                    disabled={busyId === ex.id}
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
