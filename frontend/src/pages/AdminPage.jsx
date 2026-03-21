import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

const STATUS_TABS = [
  { key: "pending", label: "ממתינים לאישור", color: "#f59e0b" },
  { key: "approved", label: "מאושרים", color: "#10b981" },
  { key: "rejected", label: "נדחו", color: "#ef4444" },
];

function AdminPage() {
  const [producers, setProducers] = useState([]);
  const [activeStatus, setActiveStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const navigate = useNavigate();

  const loadProducers = useCallback(async (status) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/producers?status=${status}`);
      setProducers(res.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        alert("אין הרשאת אדמין");
        navigate("/");
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadProducers(activeStatus);
  }, [activeStatus, loadProducers]);

  const approveProducer = async (id) => {
    try {
      await api.post(`/admin/producers/${id}/approve`);
      setProducers((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert("שגיאה באישור היצרן");
    }
  };

  const openRejectDialog = (id) => {
    setRejectingId(id);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    try {
      await api.post(`/admin/producers/${rejectingId}/reject`, {
        reason: rejectReason,
      });
      setProducers((prev) => prev.filter((p) => p.id !== rejectingId));
      setRejectingId(null);
      setRejectReason("");
    } catch {
      alert("שגיאה בדחיית היצרן");
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("he-IL");
  };

  return (
    <div className="admin-page">
      <h1>דשבורד ניהול</h1>

      {/* Status filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key)}
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "8px",
              border: activeStatus === tab.key ? `2px solid ${tab.color}` : "2px solid #e0e0e0",
              background: activeStatus === tab.key ? tab.color : "#fff",
              color: activeStatus === tab.key ? "#fff" : "#333",
              cursor: "pointer",
              fontWeight: activeStatus === tab.key ? "bold" : "normal",
              fontSize: "0.95rem",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
            {!loading && activeStatus === tab.key && ` (${producers.length})`}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && <p>טוען...</p>}

      {/* Empty state */}
      {!loading && producers.length === 0 && (
        <p style={{ color: "#888", fontSize: "1.1rem" }}>
          {activeStatus === "pending" && "אין יצרנים ממתינים לאישור"}
          {activeStatus === "approved" && "אין יצרנים מאושרים"}
          {activeStatus === "rejected" && "אין יצרנים שנדחו"}
        </p>
      )}

      {/* Producers table */}
      {!loading && producers.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.9rem",
            background: "#fff",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
            <thead>
              <tr style={{ background: "#f8f9fa", textAlign: "right" }}>
                <th style={thStyle}>שם העסק</th>
                <th style={thStyle}>עיר</th>
                <th style={thStyle}>קטגוריות</th>
                <th style={thStyle}>טלפון</th>
                <th style={thStyle}>אינסטגרם</th>
                <th style={thStyle}>תאריך הרשמה</th>
                {activeStatus === "pending" && <th style={thStyle}>פעולות</th>}
              </tr>
            </thead>
            <tbody>
              {producers.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={tdStyle}>
                    <strong>{p.name}</strong>
                    {p.description && (
                      <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem", maxWidth: "250px" }}>
                        {p.description.length > 80 ? p.description.slice(0, 80) + "..." : p.description}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{p.city || "-"}</td>
                  <td style={tdStyle}>
                    {p.categories?.map((c) => (
                      <span key={c.id} style={{
                        display: "inline-block",
                        background: "#f0f0f0",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "12px",
                        fontSize: "0.8rem",
                        margin: "0.1rem",
                      }}>
                        {c.emoji} {c.name}
                      </span>
                    )) || "-"}
                  </td>
                  <td style={tdStyle} dir="ltr">{p.phone || "-"}</td>
                  <td style={tdStyle} dir="ltr">{p.instagram || "-"}</td>
                  <td style={tdStyle}>{formatDate(p.created_at)}</td>
                  {activeStatus === "pending" && (
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => approveProducer(p.id)}
                          style={approveButtonStyle}
                          title="אישור"
                        >
                          &#10003;
                        </button>
                        <button
                          onClick={() => openRejectDialog(p.id)}
                          style={rejectButtonStyle}
                          title="דחייה"
                        >
                          &#10007;
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject reason dialog */}
      {rejectingId && (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <h3 style={{ marginTop: 0 }}>סיבת דחייה</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="הכנס סיבת דחייה (אופציונלי - תשלח למייל של היצרן)..."
              style={{
                width: "100%",
                minHeight: "80px",
                padding: "0.5rem",
                borderRadius: "6px",
                border: "1px solid #ccc",
                fontSize: "0.9rem",
                resize: "vertical",
                direction: "rtl",
              }}
            />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "flex-start" }}>
              <button onClick={confirmReject} style={{ ...rejectButtonStyle, padding: "0.5rem 1.5rem", fontSize: "0.9rem" }}>
                דחה
              </button>
              <button
                onClick={() => setRejectingId(null)}
                style={{ padding: "0.5rem 1.5rem", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "0.9rem" }}
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

const thStyle = {
  padding: "0.75rem 1rem",
  fontWeight: "600",
  borderBottom: "2px solid #e0e0e0",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "0.75rem 1rem",
  verticalAlign: "top",
};

const approveButtonStyle = {
  background: "#10b981",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  padding: "0.4rem 0.8rem",
  cursor: "pointer",
  fontSize: "1.1rem",
  fontWeight: "bold",
};

const rejectButtonStyle = {
  background: "#ef4444",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  padding: "0.4rem 0.8rem",
  cursor: "pointer",
  fontSize: "1.1rem",
  fontWeight: "bold",
};

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogStyle = {
  background: "#fff",
  borderRadius: "12px",
  padding: "1.5rem",
  width: "90%",
  maxWidth: "450px",
  direction: "rtl",
};

export default AdminPage;
