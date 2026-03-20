import React, { useState, useEffect } from "react";
import api from "../api/client";

function AdminPage() {
  const [pendingProducers, setPendingProducers] = useState([]);
  const [pendingRecipes, setPendingRecipes] = useState([]);
  const [tab, setTab] = useState("producers");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [prodRes, recRes] = await Promise.all([
        api.get("/admin/producers/pending"),
        api.get("/admin/recipes/pending"),
      ]);
      setPendingProducers(prodRes.data);
      setPendingRecipes(recRes.data);
    } catch {
      alert("אין הרשאת אדמין");
    }
  };

  const approveProducer = async (id) => {
    await api.post(`/admin/producers/${id}/approve`);
    setPendingProducers((prev) => prev.filter((p) => p.id !== id));
  };

  const rejectProducer = async (id) => {
    await api.post(`/admin/producers/${id}/reject`);
    setPendingProducers((prev) => prev.filter((p) => p.id !== id));
  };

  const approveRecipe = async (id) => {
    await api.post(`/admin/recipes/${id}/approve`);
    setPendingRecipes((prev) => prev.filter((r) => r.id !== id));
  };

  const rejectRecipe = async (id) => {
    await api.post(`/admin/recipes/${id}/reject`);
    setPendingRecipes((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="admin-page">
      <h1>דשבורד ניהול</h1>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <button
          className={`btn ${tab === "producers" ? "btn-primary" : ""}`}
          style={tab !== "producers" ? { background: "#e0e0e0" } : {}}
          onClick={() => setTab("producers")}
        >
          יצרנים ממתינים ({pendingProducers.length})
        </button>
        <button
          className={`btn ${tab === "recipes" ? "btn-primary" : ""}`}
          style={tab !== "recipes" ? { background: "#e0e0e0" } : {}}
          onClick={() => setTab("recipes")}
        >
          מתכונים ממתינים ({pendingRecipes.length})
        </button>
      </div>

      {tab === "producers" && (
        <>
          {pendingProducers.length === 0 && <p>אין יצרנים ממתינים לאישור</p>}
          {pendingProducers.map((p) => (
            <div key={p.id} className="admin-card">
              <div className="info">
                <h3>{p.name}</h3>
                <p style={{ color: "#888", fontSize: "0.9rem" }}>
                  {p.city} | {p.phone}
                </p>
                <p style={{ fontSize: "0.85rem" }}>{p.description}</p>
              </div>
              <div className="actions">
                <button className="btn btn-success btn-sm" onClick={() => approveProducer(p.id)}>
                  אישור
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => rejectProducer(p.id)}>
                  דחייה
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "recipes" && (
        <>
          {pendingRecipes.length === 0 && <p>אין מתכונים ממתינים לאישור</p>}
          {pendingRecipes.map((r) => (
            <div key={r.id} className="admin-card">
              <div className="info">
                <h3>{r.title}</h3>
                <p style={{ fontSize: "0.85rem" }}>{r.description}</p>
              </div>
              <div className="actions">
                <button className="btn btn-success btn-sm" onClick={() => approveRecipe(r.id)}>
                  אישור
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => rejectRecipe(r.id)}>
                  דחייה
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default AdminPage;
