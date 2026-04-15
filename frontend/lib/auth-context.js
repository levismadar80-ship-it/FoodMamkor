"use client";

import { createContext, useContext, useEffect, useState } from "react";
import api from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api
        .get("/auth/me")
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", res.data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  };

  const register = async (data) => {
    const res = await api.post("/auth/register", data);
    localStorage.setItem("token", res.data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  };

  const loginWithGoogle = async (idToken) => {
    const res = await api.post("/auth/google", { id_token: idToken });
    localStorage.setItem("token", res.data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  };

  const loginWithApple = async (idToken, name) => {
    const res = await api.post("/auth/apple", { id_token: idToken, name });
    localStorage.setItem("token", res.data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  };

  const deleteAccount = async () => {
    await api.delete("/auth/me");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  // MEH-16 — profile update. Backend returns the full UserOut so we
  // refresh context atomically and any subscriber sees the new values.
  const updateProfile = async (patch) => {
    const res = await api.patch("/users/me", patch);
    setUser(res.data);
    return res.data;
  };

  // MEH-16 — password change. 204 No Content on success; no state
  // mutation needed since the JWT is unchanged.
  const changePassword = async (current_password, new_password) => {
    await api.patch("/users/me/password", { current_password, new_password });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithGoogle,
        loginWithApple,
        deleteAccount,
        logout,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
