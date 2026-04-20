"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function AdminContactPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const fetchMessages = () => {
    setLoading(true);
    const params = {};
    if (filter === "unread") params.is_read = false;
    if (filter === "read") params.is_read = true;
    if (search.trim()) params.search = search.trim();

    api.get("/admin/contact", { params })
      .then((r) => setMessages(r.data))
      .catch((e) => setError(e.response?.data?.detail || "שגיאה בטעינה"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMessages(); }, [filter, search]);

  const markRead = async (id) => {
    await api.post(`/admin/contact/${id}/mark-read`);
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, is_read: true } : m));
  };

  const deleteMsg = async (id) => {
    if (!confirm("למחוק פנייה זו?")) return;
    await api.delete(`/admin/contact/${id}`);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (expanded === id) setExpanded(null);
  };

  const unreadCount = messages.filter((m) => !m.is_read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">פניות</h1>
          <p className="text-text-secondary text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} פניות שלא נקראו` : "אין פניות חדשות"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex border border-border rounded-[12px] overflow-hidden text-sm">
          {[
            { key: "all", label: "הכל" },
            { key: "unread", label: "לא נקראו" },
            { key: "read", label: "נקראו" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 transition ${
                filter === f.key ? "bg-primary text-white" : "hover:bg-light"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="חיפוש לפי שם, אימייל, הודעה..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-border rounded-[12px] px-3 py-1.5 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-text-secondary text-sm">טוענת פניות...</p>
      ) : messages.length === 0 ? (
        <div className="bg-white border border-border rounded-[12px] p-8 text-center text-text-secondary">
          אין פניות {filter !== "all" && "בפילטר הנוכחי"}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-[12px] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-light/50 text-text-secondary text-xs">
                <th className="text-start px-4 py-2.5 font-medium">שם</th>
                <th className="text-start px-4 py-2.5 font-medium">אימייל</th>
                <th className="text-start px-4 py-2.5 font-medium">הודעה</th>
                <th className="text-start px-4 py-2.5 font-medium">תאריך</th>
                <th className="text-start px-4 py-2.5 font-medium">סטטוס</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b border-border last:border-0 cursor-pointer transition ${
                    !m.is_read ? "bg-light/40 font-medium" : "hover:bg-light/20"
                  }`}
                >
                  <td className="px-4 py-3" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                    {m.name}
                  </td>
                  <td className="px-4 py-3" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                    <a href={`mailto:${m.email}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                      {m.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                    {expanded === m.id ? (
                      <span className="whitespace-pre-wrap">{m.message}</span>
                    ) : (
                      <span className="truncate block">{m.message.slice(0, 80)}{m.message.length > 80 ? "..." : ""}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                    {new Date(m.created_at).toLocaleDateString("he-IL")}
                  </td>
                  <td className="px-4 py-3">
                    {m.is_read ? (
                      <span className="text-xs text-text-secondary">נקראה</span>
                    ) : (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">חדשה</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!m.is_read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead(m.id); }}
                          className="text-xs text-primary hover:underline whitespace-nowrap"
                        >
                          סמני כנקראה
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMsg(m.id); }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
