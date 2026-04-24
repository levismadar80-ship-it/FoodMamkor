"use client";

import { useEffect, useState } from "react";
import { Heart } from "@phosphor-icons/react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const SUPER_ADMIN_EMAIL = "levismadar80@gmail.com";

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [favorites, setFavorites] = useState({});
  const [confirm, setConfirm] = useState(null); // { userId, userName, action: "promote"|"demote" }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const load = () => {
    const params = {};
    if (search) params.search = search;
    if (role !== "all") params.role = role;
    api.get("/admin/users", { params }).then((r) => setUsers(r.data)).catch(() => setUsers([]));
  };

  const applyRole = async (id, newRole) => {
    setBusy(true);
    try {
      await api.put(`/admin/users/${id}/role`, { role: newRole });
      load();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const toggleBlock = async (id) => {
    await api.post(`/admin/users/${id}/block`);
    load();
  };

  const toggleExpand = async (u) => {
    if (expanded === u.id) {
      setExpanded(null);
      return;
    }
    setExpanded(u.id);
    if (!favorites[u.id]) {
      const r = await api.get(`/admin/users/${u.id}/favorites`);
      setFavorites({ ...favorites, [u.id]: r.data });
    }
  };

  const isSuperAdmin = (u) => u.email === SUPER_ADMIN_EMAIL;
  const isMe = (u) => me && u.id === me.id;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">משתמשים</h1>
        <span className="text-sm text-text-secondary">{users.length} משתמשים</span>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <input
          placeholder="חיפוש לפי אימייל או שם..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          className="flex-1 border border-border rounded-[12px] px-3 py-2"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border border-border rounded-[12px] px-3 py-2 bg-white"
        >
          <option value="all">כל התפקידים</option>
          <option value="consumer">צרכן</option>
          <option value="producer">בית עסק</option>
          <option value="admin">אדמין</option>
        </select>
        <button onClick={load} className="bg-secondary text-white px-4 py-2 rounded-[12px] text-sm">
          חפש
        </button>
      </div>

      <div className="bg-white border border-border rounded-[12px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">שם</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">אימייל</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">עיר</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">תפקיד</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">מועדפים</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">הצטרף</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-text-secondary">אין משתמשים</td>
                </tr>
              )}
              {users.map((u) => (
                <>
                  <tr key={u.id} className={`border-t ${u.is_blocked ? "bg-red-50" : ""}`}>
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-text-secondary">{u.city || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Role badge */}
                        {u.role === "admin" ? (
                          isSuperAdmin(u) ? (
                            <>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[#EAF3DE] text-[#2e6853] font-medium">
                                אדמין
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#8B6914] font-medium">
                                מוגן
                              </span>
                            </>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#EAF3DE] text-[#2e6853] font-medium">
                              אדמין
                            </span>
                          )
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {u.role === "producer" ? "בית עסק" : "צרכן"}
                          </span>
                        )}

                        {/* Promote button — show when not already admin */}
                        {u.role !== "admin" && (
                          <button
                            onClick={() => setConfirm({ userId: u.id, userName: u.name, action: "promote" })}
                            className="text-xs px-2 py-0.5 rounded border border-[#2e6853] text-[#2e6853] hover:bg-[#EAF3DE] transition"
                          >
                            העלי לאדמין
                          </button>
                        )}

                        {/* Demote button — hidden for super-admin and self */}
                        {u.role === "admin" && !isSuperAdmin(u) && !isMe(u) && (
                          <button
                            onClick={() => setConfirm({ userId: u.id, userName: u.name, action: "demote" })}
                            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition"
                          >
                            הסירי הרשאות
                          </button>
                        )}

                        {/* Tooltip for protected super-admin row */}
                        {isSuperAdmin(u) && (
                          <span className="text-xs text-text-secondary" title="לא ניתן להסיר הרשאות מהאדמין הראשי">
                            🔒
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      <button onClick={() => toggleExpand(u)} className="hover:text-primary hover:underline">
                        {u.favorites_count} ❤️
                      </button>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {new Date(u.created_at).toLocaleDateString("he-IL")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleBlock(u.id)}
                        className={`text-xs px-2 py-1 rounded ${
                          u.is_blocked
                            ? "bg-red-100 text-red-700"
                            : "text-text-secondary hover:text-red-600"
                        }`}
                      >
                        {u.is_blocked ? "🚫 שחרר חסימה" : "חסום"}
                      </button>
                    </td>
                  </tr>
                  {expanded === u.id && favorites[u.id] && (
                    <tr key={u.id + "-fav"} className="border-t bg-background/30">
                      <td colSpan={7} className="px-6 py-3 text-xs">
                        <p className="font-medium mb-2">המועדפים של {u.name}:</p>
                        {favorites[u.id].length === 0 ? (
                          <p className="text-text-secondary">אין מועדפים</p>
                        ) : (
                          <ul className="space-y-1">
                            {favorites[u.id].map((f) => (
                              <li key={f.producer_id} className="inline-flex items-center gap-1">
                                <Heart size={12} weight="fill" className="text-red-500" aria-hidden="true" />
                                {f.producer_name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full mx-4 text-end space-y-4">
            <p className="font-medium text-base">
              {confirm.action === "promote"
                ? `את בטוחה שברצונך להעניק הרשאות אדמין ל${confirm.userName}?`
                : `את בטוחה שברצונך להסיר הרשאות אדמין מ${confirm.userName}?`}
            </p>
            <div className="flex gap-3 justify-start">
              <button
                disabled={busy}
                onClick={() =>
                  applyRole(confirm.userId, confirm.action === "promote" ? "admin" : "consumer")
                }
                className={`px-4 py-2 rounded-[10px] text-sm font-medium text-white transition ${
                  confirm.action === "promote"
                    ? "bg-[#2e6853] hover:bg-[#2E4A2E]"
                    : "bg-red-600 hover:bg-red-700"
                } disabled:opacity-50`}
              >
                {busy ? "..." : "אישור"}
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-[10px] text-sm border border-border text-text-secondary hover:bg-gray-50 transition"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
