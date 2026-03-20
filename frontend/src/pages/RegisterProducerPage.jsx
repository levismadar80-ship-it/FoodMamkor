import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

function RegisterProducerPage({ onLogin }) {
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    producer_name: "",
    description: "",
    city: "",
    lat: "",
    lng: "",
    phone: "",
    instagram: "",
    website: "",
    category_ids: [],
    delivery_areas: [{ city: "", min_order: "", delivery_day: "" }],
  });

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data));
  }, []);

  const updateField = (field, value) => setForm({ ...form, [field]: value });

  const toggleCategory = (id) => {
    const ids = form.category_ids.includes(id)
      ? form.category_ids.filter((c) => c !== id)
      : [...form.category_ids, id];
    updateField("category_ids", ids);
  };

  const updateDelivery = (index, field, value) => {
    const areas = [...form.delivery_areas];
    areas[index] = { ...areas[index], [field]: value };
    setForm({ ...form, delivery_areas: areas });
  };

  const addDeliveryArea = () => {
    setForm({
      ...form,
      delivery_areas: [...form.delivery_areas, { city: "", min_order: "", delivery_day: "" }],
    });
  };

  const handleSubmit = async () => {
    setError("");
    try {
      const payload = {
        ...form,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        delivery_areas: form.delivery_areas
          .filter((da) => da.city)
          .map((da) => ({
            city: da.city,
            min_order: da.min_order ? parseInt(da.min_order) : null,
            delivery_day: da.delivery_day || null,
          })),
      };
      const res = await api.post("/auth/register/producer", payload);
      localStorage.setItem("token", res.data.access_token);
      const tokenPayload = JSON.parse(atob(res.data.access_token.split(".")[1]));
      const userData = { id: tokenPayload.sub, email: form.email, role: "producer" };
      localStorage.setItem("user", JSON.stringify(userData));
      onLogin(userData);
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בהרשמה");
    }
  };

  return (
    <div className="auth-page" style={{ maxWidth: "520px" }}>
      <h2>הרשמת יצרן</h2>

      <div className="steps-indicator">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`step-dot ${step === s ? "active" : ""} ${step > s ? "done" : ""}`}
          >
            {s}
          </div>
        ))}
      </div>

      {error && <div className="error-msg">{error}</div>}

      {step === 1 && (
        <>
          <h3 style={{ marginBottom: "1rem" }}>פרטי חשבון</h3>
          <div className="form-group">
            <label>שם מלא</label>
            <input value={form.name} onChange={(e) => updateField("name", e.target.value)} required />
          </div>
          <div className="form-group">
            <label>אימייל</label>
            <input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} required />
          </div>
          <div className="form-group">
            <label>סיסמה</label>
            <input type="password" value={form.password} onChange={(e) => updateField("password", e.target.value)} required />
          </div>
          <button className="btn btn-primary" onClick={() => setStep(2)}>
            הבא &larr;
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h3 style={{ marginBottom: "1rem" }}>פרטי העסק</h3>
          <div className="form-group">
            <label>שם העסק</label>
            <input value={form.producer_name} onChange={(e) => updateField("producer_name", e.target.value)} required />
          </div>
          <div className="form-group">
            <label>תיאור</label>
            <textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} />
          </div>
          <div className="form-group">
            <label>עיר</label>
            <input value={form.city} onChange={(e) => updateField("city", e.target.value)} />
          </div>
          <div className="form-group">
            <label>טלפון</label>
            <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
          </div>
          <div className="form-group">
            <label>אינסטגרם</label>
            <input value={form.instagram} onChange={(e) => updateField("instagram", e.target.value)} />
          </div>
          <div className="form-group">
            <label>קטגוריות</label>
            <div className="category-chips">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`category-chip ${form.category_ids.includes(cat.id) ? "active" : ""}`}
                  onClick={() => toggleCategory(cat.id)}
                >
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn" style={{ background: "#ddd" }} onClick={() => setStep(1)}>
              &rarr; חזרה
            </button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>
              הבא &larr;
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h3 style={{ marginBottom: "1rem" }}>אזורי משלוח</h3>
          {form.delivery_areas.map((da, i) => (
            <div key={i} style={{ border: "1px solid #eee", borderRadius: "8px", padding: "0.8rem", marginBottom: "0.5rem" }}>
              <div className="form-group">
                <label>עיר</label>
                <input value={da.city} onChange={(e) => updateDelivery(i, "city", e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>מינימום הזמנה (₪)</label>
                  <input type="number" value={da.min_order} onChange={(e) => updateDelivery(i, "min_order", e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>יום משלוח</label>
                  <input value={da.delivery_day} onChange={(e) => updateDelivery(i, "delivery_day", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addDeliveryArea}
            style={{ background: "none", border: "1px dashed #aaa", width: "100%", padding: "0.5rem", borderRadius: "8px", cursor: "pointer", marginBottom: "1rem" }}
          >
            + הוסף אזור משלוח
          </button>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn" style={{ background: "#ddd" }} onClick={() => setStep(2)}>
              &rarr; חזרה
            </button>
            <button className="btn btn-primary" onClick={handleSubmit}>
              שלח לאישור
            </button>
          </div>
        </>
      )}

      {step === 4 && (
        <div className="success-msg" style={{ textAlign: "center", padding: "2rem" }}>
          <h3>הבקשה נשלחה בהצלחה!</h3>
          <p style={{ marginTop: "0.5rem" }}>העסק שלך ממתין לאישור. נעדכן אותך בקרוב.</p>
          <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={() => navigate("/")}>
            חזרה למפה
          </button>
        </div>
      )}
    </div>
  );
}

export default RegisterProducerPage;
