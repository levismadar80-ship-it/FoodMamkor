"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [favorites, setFavorites] = useState({});

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

  const updateRole = async (id, newRole) => {
    await api.put(`/admin/users/${id}/role`, { role: newRole });
    load();
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

  const roleBadge = (r) => {
    const map = {
      admin: { label: "אדמין", cls: "bg-primary text-white" },
      producer: { label: "בית עסק", cls: "bg-secondary text-white" },
      consumer: { label: "צרכן", cls: "bg-gray-100 text-gray-700" },
    };
    const m = map[r] || { label: r, cls: "bg-gray-100" };
    return <span className={`text-xs px-2 py-1 rounded-full ${m.cls}`}>{m.label}</span>;
  };

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
                      <select
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value)}
                        className="text-xs border border-border rounded px-2 py-1 bg-white"
                      >
                        <option value="consumer">צרכן</option>
                        <option value="producer">בית עסק</option>
                        <option value="admin">אדמין</option>
                      </select>
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
                              <li key={f.producer_id}>❤️ {f.producer_name}</li>
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
    </div>
  );
}
