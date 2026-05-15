"use client";

import { useEffect, useState } from "react";
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
 * user name, title, body. Delete is confirm-toast gated; after deletion
 * the row is optimistically removed and the producer's avg_rating +
 * reviews_count are recomputed server-side by the existing handler.
 */
export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState("all");
  const [deletingId, setDeletingId] = useState(null);

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

  const handleDelete = async (review) => {
    if (
      !window.confirm(
        `למחוק את הביקורת של ${review.user_name || "משתמשת"} על ${review.producer_name || "העסק"}?`,
      )
    ) {
      return;
    }
    setDeletingId(review.id);
    try {
      await api.delete(`/reviews/${review.id}`);
      setReviews((prev) => prev.filter((r) => r.id !== review.id));
      showToast("הביקורת נמחקה");
    } catch {
      showToast("משהו השתבש, נסי שוב", "error");
    } finally {
      setDeletingId(null);
    }
  };

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
          ביקורות
          <InfoTooltip
            content="Claude עבר על התוכן אוטומטית. 'דורש תיקון' = Claude סימן בעיה אבל לא חסם. 'ממתין' = עבר pre-check, מחכה לאישור ידני שלך."
            label="מידע על מודרציית ביקורות"
            position="bottom"
          />
        </h1>
        <span className="text-sm text-text-secondary">
          {filtered.length} מתוך {reviews.length}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <input
          placeholder="חיפוש לפי עסק, משתמש, כותרת או טקסט..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-border rounded-[12px] px-3 py-2"
        />
        <select
          value={starFilter}
          onChange={(e) => setStarFilter(e.target.value)}
          className="border border-border rounded-[12px] px-3 py-2 bg-white"
          aria-label="סינון לפי דירוג"
        >
          <option value="all">כל הדירוגים</option>
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
                <th className="text-end px-4 py-3 font-medium text-text-secondary">עסק</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">משתמשת</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">דירוג</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">תוכן</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">תאריך</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-text-secondary">
                    טוענת ביקורות...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-text-secondary">
                    אין ביקורות להצגה
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-4 py-3 font-medium">{r.producer_name || "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      <div>{r.user_name || "—"}</div>
                      {r.user_email && (
                        <div className="text-xs opacity-70">{r.user_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1"
                        aria-label={`${r.stars} כוכבים`}
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
                        <div className="text-text-secondary text-xs whitespace-pre-line line-clamp-3">
                          {r.body}
                        </div>
                      )}
                      {!r.title && !r.body && (
                        <span className="text-text-secondary opacity-60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {r.created_at
                        ? new Date(r.created_at).toLocaleDateString("he-IL")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-red-400/40"
                        aria-label={`מחקי ביקורת של ${r.user_name || "משתמשת"}`}
                      >
                        <Trash size={14} weight="duotone" />
                        {deletingId === r.id ? "מוחקת..." : "מחקי"}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
