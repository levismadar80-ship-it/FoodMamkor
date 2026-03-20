import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";

function RegisterPage({ onLogin }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", city: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post("/auth/register", form);
      localStorage.setItem("token", res.data.access_token);
      const payload = JSON.parse(atob(res.data.access_token.split(".")[1]));
      const userData = { id: payload.sub, email: form.email, role: "consumer" };
      localStorage.setItem("user", JSON.stringify(userData));
      onLogin(userData);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בהרשמה");
    }
  };

  return (
    <div className="auth-page">
      <h2>הרשמה</h2>
      {error && <div className="error-msg">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>שם</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>אימייל</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>סיסמה</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>עיר</label>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <button type="submit" className="btn btn-primary">הרשמה</button>
      </form>
      <p style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.9rem" }}>
        יש לך חשבון? <Link to="/login" style={{ color: "#2d6a4f" }}>התחברות</Link>
        {" | "}
        <Link to="/register/producer" style={{ color: "#2d6a4f" }}>הרשמה כיצרן</Link>
      </p>
    </div>
  );
}

export default RegisterPage;
