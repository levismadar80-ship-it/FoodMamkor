"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

const TABS = [
  { value: "pending", label: "ממתינים" },
  { value: "approved", label: "מאושרים" },
  { value: "changes_requested", label: "שינויים נדרשים" },
  { value: "rejected", label: "נדחו" },
  { value: "all", label: "הכל" },
];

const TYPE_LABELS = { event: "אירוע", experience: "חוויה" };

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminEventsPage() {
  const [tab, setTab] = useState("pending");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalEvent, setModalEvent] = useState(null);
  const [modalAction, setModalAction] = useState(null); // "changes" | "reject"
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/admin/events", { params: { status: tab } })
      .then((r) => {
        setEvents(r.data);
        setError("");
      })
      .catch((e) =>
        setError(e.response?.data?.detail || "שגיאה בטעינה")
      )
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (ev) => {
    setBusy(true);
    try {
      await api.post(`/admin/events/${ev.id}/approve`);
      load();
    } catch (e) {
      alert(e.response?.data?.detail || "שגיאה באישור");
    } finally {
      setBusy(false);
    }
  };

  const openModal = (ev, action) => {
    setModalEvent(ev);
    setModalAction(action);
    setFeedback("");
  };

  const closeModal = () => {
    setModalEvent(null);
    setModalAction(null);
    setFeedback("");
  };

  const submitModal = async () => {
    if (!modalEvent || !modalAction) return;
    if (!feedback.trim()) {
      alert("יש למלא הערה");
      return;
    }
    setBusy(true);
    try {
      const endpoint =
        modalAction === "changes" ? "request-changes" : "reject";
      await api.post(`/admin/events/${modalEvent.id}/${endpoint}`, {
        feedback: feedback.trim(),
      });
      closeModal();
      load();
    } catch (e) {
      alert(e.response?.data?.detail || "שגיאה בשליחה");
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = events.filter((e) => e.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">אירועים וחוויות</h1>
          <p className="text-text-secondary text-sm mt-1">
            מודרציה לאירועים שהוגשו על ידי יצרנים ומשתמשים
          </p>
        </div>
        <Link
          href="/events"
          target="_blank"
          className="text-primary text-sm hover:underline"
        >
          דף ציבורי →
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-[12px] text-sm whitespace-nowrap transition ${
              tab === t.value
                ? "bg-primary text-white"
                : "bg-white border border-border text-text-primary hover:bg-accent"
            }`}
          >
            {t.label}
            {t.value === "pending" && pendingCount > 0 && tab !== "pending" && (
              <span className="mr-1 bg-accent-warm text-white text-xs px-1.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-text-secondary">טוען...</p>
      ) : events.length === 0 ? (
        <div className="bg-white border border-border rounded-[12px] p-8 text-center text-text-secondary">
          אין אירועים בסטטוס הזה 🌿
        </div>
      ) : (
        <div className="bg-white border border-border rounded-[12px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary text-xs">
              <tr>
                <th className="text-right p-3 font-medium">כותרת</th>
                <th className="text-right p-3 font-medium">מארגן/ת</th>
                <th className="text-right p-3 font-medium">תאריך</th>
                <th className="text-right p-3 font-medium">סוג</th>
                <th className="text-right p-3 font-medium">מיקום</th>
                <th className="text-right p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  busy={busy}
                  onApprove={approve}
                  onChanges={(e) => openModal(e, "changes")}
                  onReject={(e) => openModal(e, "reject")}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] p-6 max-w-lg w-full">
            <h2 className="text-xl font-bold mb-2">
              {modalAction === "changes" ? "בקש שינויים" : "דחה אירוע"}
            </h2>
            <p className="text-text-secondary text-sm mb-4">
              "{modalEvent.title}" — {modalEvent.host?.name}
            </p>
            <label className="block text-sm font-medium mb-1">
              {modalAction === "changes" ? "הערות לעריכה" : "סיבת הדחייה"}
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
              className="w-full border border-border rounded-[12px] px-3 py-2 text-sm"
              placeholder={
                modalAction === "changes"
                  ? "לדוגמה: התיאור קצר מדי, חסרה כתובת מדויקת..."
                  : "לדוגמה: תוכן לא רלוונטי לפלטפורמה"
              }
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeModal}
                disabled={busy}
                className="px-4 py-2 rounded-[12px] border border-border hover:bg-accent"
              >
                ביטול
              </button>
              <button
                onClick={submitModal}
                disabled={busy}
                className={`px-4 py-2 rounded-[12px] text-white ${
                  modalAction === "changes"
                    ? "bg-accent-warm hover:bg-accent-warm-light"
                    : "bg-red-600 hover:bg-red-700"
                } disabled:opacity-50`}
              >
                {busy ? "שולח..." : "אישור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ event, busy, onApprove, onChanges, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const mod = event.moderation_flags;

  return (
    <>
      <tr className="border-t border-border hover:bg-gray-50/50">
        <td className="p-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="font-medium hover:text-primary text-right"
          >
            {event.title}
          </button>
          {mod && (mod.flags?.length || mod.summary?.startsWith("not_checked") === false) && (
            <p className="text-xs text-text-secondary mt-1">
              🤖 {mod.summary || "נבדק ע״י Claude"}
            </p>
          )}
        </td>
        <td className="p-3">{event.host?.name || "—"}</td>
        <td className="p-3 text-text-secondary">
          {formatDate(event.starts_at)}
        </td>
        <td className="p-3">{TYPE_LABELS[event.type] || event.type}</td>
        <td className="p-3 text-text-secondary">{event.city || "—"}</td>
        <td className="p-3">
          <div className="flex gap-1 flex-wrap">
            {event.status !== "approved" && (
              <button
                onClick={() => onApprove(event)}
                disabled={busy}
                className="bg-primary text-white px-3 py-1 rounded-[12px] text-xs hover:bg-primary-light disabled:opacity-50"
              >
                אשר
              </button>
            )}
            {event.status !== "changes_requested" && (
              <button
                onClick={() => onChanges(event)}
                disabled={busy}
                className="bg-accent-warm text-white px-3 py-1 rounded-[12px] text-xs hover:bg-accent-warm-light disabled:opacity-50"
              >
                שינויים
              </button>
            )}
            {event.status !== "rejected" && (
              <button
                onClick={() => onReject(event)}
                disabled={busy}
                className="bg-red-600 text-white px-3 py-1 rounded-[12px] text-xs hover:bg-red-700 disabled:opacity-50"
              >
                דחה
              </button>
            )}
            <Link
              href={`/events/${event.id}`}
              target="_blank"
              className="text-primary text-xs px-2 py-1 hover:underline"
            >
              צפה
            </Link>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50 border-t border-border">
          <td colSpan={6} className="p-4">
            <div className="text-sm space-y-2">
              <p className="whitespace-pre-wrap">{event.description}</p>
              {event.address && (
                <p className="text-text-secondary">📍 {event.address}</p>
              )}
              {event.price_per_person != null && (
                <p className="text-text-secondary">
                  💰{" "}
                  {Number(event.price_per_person) === 0
                    ? "חינם"
                    : `₪${event.price_per_person} / אדם`}
                </p>
              )}
              {event.requirements && (
                <p>
                  <span className="font-medium">דרישות:</span>{" "}
                  {event.requirements}
                </p>
              )}
              {mod && (
                <div className="mt-3 bg-white border border-border rounded-[12px] p-3">
                  <p className="font-medium text-xs mb-1">
                    🤖 Claude pre-moderation
                  </p>
                  {mod.flags?.length > 0 && (
                    <p className="text-xs text-red-700">
                      Flags: {mod.flags.join(", ")}
                    </p>
                  )}
                  {mod.missing_info?.length > 0 && (
                    <p className="text-xs text-orange-700">
                      Missing: {mod.missing_info.join("; ")}
                    </p>
                  )}
                  {mod.suggestions?.length > 0 && (
                    <ul className="text-xs text-text-secondary list-disc pr-4">
                      {mod.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                  {mod.summary && (
                    <p className="text-xs text-text-secondary mt-1">
                      {mod.summary}
                    </p>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
