"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
import { Star, Trash } from "@phosphor-icons/react";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import InfoTooltip from "@/components/InfoTooltip";

/**
 * Admin moderation page for producer reviews (MEH-10).
 *
 * Backend endpoints:
 *   GET    /admin/reviews         — list all, newest first
 *   DELETE /reviews/:id           — reuses owner-or-admin handler
 *
 * Filters: star filter (1–5) + free-text search over producer name,
 * user name, title, body. Delete is guarded by a modal confirm dialog
 * (MEH-1040 — replaced the native browser confirm, mirroring the MEH-1023
 * pattern); after deletion the row is optimistically removed and the
 * producer's avg_rating + reviews_count are recomputed server-side by
 * the existing handler.
 */
export default function AdminReviewsPage() {
  const t = useTranslations("admin");
  // MEH-848: shared generic error copy (collapsed from admin.reviews.delete_error).
  const tError = useTranslations("error");
  const locale = useLocale();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState("all");
  const [deletingId, setDeletingId] = useState(null);
  // MEH-1040: full review row while a delete awaits confirmation; null otherwise.
  // Replaces the native browser confirm — the last admin surface with that pattern.
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    load();
  }, []);

  const load = () => {
    setLoading(true);
    api
      .get("/admin/reviews")
      .then((r) => setReviews(r.data))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  };

  // MEH-1040: open the confirm dialog; the DELETE call only fires from
  // confirmRemove. REUSES: frontend/app/[locale]/admin/content/page.js:116
  // (MEH-1023 Ch.B category-delete dialog — same lifecycle + a11y contract).
  const handleDelete = (review) => setConfirmDelete(review);

  const deleting = confirmDelete !== null && deletingId === confirmDelete.id;

  const confirmRemove = async () => {
    const review = confirmDelete;
    setDeletingId(review.id);
    try {
      await api.delete(`/reviews/${review.id}`);
      setReviews((prev) => prev.filter((r) => r.id !== review.id));
      showToast.success(t("reviews.deleted_toast"));
      setConfirmDelete(null); // close only on success
    } catch {
      // Keep the dialog open on failure so the admin can retry or cancel.
      showToast.error(tError("generic"));
    } finally {
      setDeletingId(null);
    }
  };

  // Escape closes the dialog (unless a delete is mid-flight) — mirrors the
  // MEH-1023 Ch.B dismissal contract.
  useEffect(() => {
    if (!confirmDelete) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !deleting) setConfirmDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete, deleting]);

  const filtered = reviews.filter((r) => {
    if (starFilter !== "all" && r.stars !== Number(starFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.producer_name || "").toLowerCase().includes(q) ||
      (r.user_name || "").toLowerCase().includes(q) ||
      (r.user_email || "").toLowerCase().includes(q) ||
      (r.title || "").toLowerCase().includes(q) ||
      (r.body || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {t("reviews.title")}
          <InfoTooltip
            content={t("reviews.tooltip")}
            label={t("reviews.tooltip_label")}
            position="bottom"
          />
        </h1>
        <span className="text-sm text-muted">
          {t("reviews.count", { filtered: filtered.length, total: reviews.length })}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <input
          placeholder={t("reviews.search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-border rounded-[12px] px-3 py-2"
        />
        <select
          value={starFilter}
          onChange={(e) => setStarFilter(e.target.value)}
          className="border border-border rounded-[12px] px-3 py-2 bg-white"
          aria-label={t("reviews.filter_aria")}
        >
          <option value="all">{t("reviews.all_ratings")}</option>
          <option value="1">⭐ 1</option>
          <option value="2">⭐ 2</option>
          <option value="3">⭐ 3</option>
          <option value="4">⭐ 4</option>
          <option value="5">⭐ 5</option>
        </select>
      </div>

      <div className="bg-white border border-border rounded-[12px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-end px-4 py-3 font-medium text-muted">{t("reviews.columns.producer")}</th>
                <th className="text-end px-4 py-3 font-medium text-muted">{t("reviews.columns.user")}</th>
                <th className="text-end px-4 py-3 font-medium text-muted">{t("reviews.columns.rating")}</th>
                <th className="text-end px-4 py-3 font-medium text-muted">{t("reviews.columns.content")}</th>
                <th className="text-end px-4 py-3 font-medium text-muted">{t("reviews.columns.date")}</th>
                <th className="text-end px-4 py-3 font-medium text-muted">{t("reviews.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted">
                    {t("reviews.loading")}
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted">
                    {t("reviews.empty")}
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-4 py-3 font-medium">{r.producer_name || "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      <div>{r.user_name || "—"}</div>
                      {r.user_email && (
                        <div className="text-xs opacity-70">{r.user_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1"
                        aria-label={t("reviews.stars_aria", { stars: r.stars })}
                      >
                        <Star size={14} weight="fill" className="text-yellow-500" />
                        {r.stars}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      {r.title && (
                        <div className="font-medium">{r.title}</div>
                      )}
                      {r.body && (
                        <div className="text-muted text-xs whitespace-pre-line line-clamp-3">
                          {r.body}
                        </div>
                      )}
                      {!r.title && !r.body && (
                        <span className="text-muted opacity-60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {r.created_at
                        ? formatEventDate(r.created_at, locale, { day: "numeric", month: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-red-400/40"
                        aria-label={t("reviews.delete_aria", { user: r.user_name || t("reviews.default_user") })}
                      >
                        <Trash size={14} />
                        {deletingId === r.id ? t("reviews.deleting") : t("reviews.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation modal — mirrors content/page.js category-delete dialog (MEH-1023 Ch.B) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-delete-title"
            className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full mx-4 text-start space-y-4"
          >
            <p id="review-delete-title" className="font-medium text-base">
              {t("reviews.confirm_delete", {
                user: confirmDelete.user_name || t("reviews.default_user"),
                producer: confirmDelete.producer_name || t("reviews.default_producer"),
              })}
            </p>
            <div className="flex gap-3 justify-start">
              <button
                disabled={deleting}
                onClick={confirmRemove}
                className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t("reviews.deleting") : t("reviews.delete")}
              </button>
              <button
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-[10px] text-sm border border-border text-muted hover:bg-gray-50 transition disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
