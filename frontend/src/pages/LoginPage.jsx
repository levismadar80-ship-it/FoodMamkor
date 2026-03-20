import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.access_token);
      // Decode JWT to get user info (simple base64 decode)
      const payload = JSON.parse(atob(res.data.access_token.split(".")[1]));
      const userData = { id: payload.sub, email };
      localStorage.setItem("user", JSON.stringify(userData));
      onLogin(userData);
      navigate("/");
    } catch {
      setError("אימייל או סיסמה שגויים");
    }
  };

  return (
    <div className="auth-page">
      <h2>התחברות</h2>
      {error && <div className="error-msg">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>אימייל</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>סיסמה</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          התחבר
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.9rem" }}>
        אין לך חשבון? <Link to="/register" style={{ color: "#2d6a4f" }}>הרשמה</Link>
        {" | "}
        <Link to="/register/producer" style={{ color: "#2d6a4f" }}>הרשמה כיצרן</Link>
      </p>
    </div>
  );
}

export default LoginPage;
