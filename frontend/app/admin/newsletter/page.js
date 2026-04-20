"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function AdminNewsletterPage() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetch = () => {
    setLoading(true);
    const params = {};
    if (search.trim()) params.search = search.trim();
    api.get("/admin/newsletter", { params })
      .then((r) => setSubscribers(r.data))
      .catch(() => setSubscribers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [search]);

  const removeSub = async (id) => {
    if (!confirm("להסיר נרשמת זו?")) return;
    await api.delete(`/admin/newsletter/${id}`);
    setSubscribers((prev) => prev.filter((s) => s.id !== id));
  };

  const exportCSV = () => {
    api.get("/admin/newsletter/export", { responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(r.data);
        const a = document.createElement("a");
        a.href = url;
        a.download = `newsletter_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const now = new Date();
  const thisMonth = subscribers.filter((s) => {
    const d = new Date(s.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">ניוזלטר</h1>
          <p className="text-text-secondary text-sm mt-1">
            {subscribers.length} נרשמות סה״כ | {thisMonth.length} הצטרפו החודש
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm"
        >
          📤 ייצאי CSV
        </button>
      </div>

      <input
        type="text"
        placeholder="חיפוש לפי אימייל..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-border rounded-[12px] px-3 py-2 text-sm focus:outline-none focus:border-primary"
      />

      {loading ? (
        <p className="text-text-secondary text-sm">טוענת...</p>
      ) : subscribers.length === 0 ? (
        <div className="bg-white border border-border rounded-[12px] p-8 text-center text-text-secondary">
          אין נרשמות לניוזלטר
        </div>
      ) : (
        <div className="bg-white border border-border rounded-[12px] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-light/50 text-text-secondary text-xs">
                <th className="text-start px-4 py-2.5 font-medium">אימייל</th>
                <th className="text-start px-4 py-2.5 font-medium">תאריך הצטרפות</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-light/20">
                  <td className="px-4 py-3">{s.email}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(s.created_at).toLocaleDateString("he-IL")}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => removeSub(s.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      הסר
                    </button>
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
