"use client";

import { createContext, useContext, useEffect, useState } from "react";
import api from "./api";
import {
  clearPendingAction,
  readPendingAction,
} from "./post-login-action";
import { showToast } from "./toast";
import {
  ensureFavoritesLoaded,
  resetFavoritesCache,
  setFavoritedLocal,
} from "./favorites-cache";

const AuthContext = createContext(null);

/**
 * Drain the post-login action queue. Runs after every successful
 * authentication path (password login, register, Google, Apple) so a
 * guest "save" tap replays exactly once. Failures are swallowed — the
 * action is best-effort, never blocking the login flow.
 */
async function replayPostLoginAction() {
  const pending = readPendingAction();
  if (!pending) return;
  clearPendingAction();
  if (pending.verb === "favorite" && pending.payload) {
    try {
      await api.post(`/users/me/favorites/${pending.payload}`);
      setFavoritedLocal(pending.payload, true);
      showToast("נשמר למועדפים ❤️");
    } catch {
      // Best-effort — if the API rejects we don't re-show the heart;
      // the next mount will read the real favorite state from the
      // cache after ensureFavoritesLoaded resolves.
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api
        .get("/auth/me")
        .then((res) => {
          setUser(res.data);
          ensureFavoritesLoaded();
        })
        .catch(() => {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // MEH-156: listen for JWT expiry events fired by the API interceptor.
  // setUser/resetFavoritesCache/showToast are all stable refs — empty deps is correct.
  useEffect(() => {
    const handle = () => {
      resetFavoritesCache();
      setUser(null);
      const redirect = encodeURIComponent(window.location.pathname);
      showToast(
        "פג תוקף ההתחברות — נא להתחבר מחדש",
        "info",
        5000,
        { action: { label: "התחברי", href: `/login?redirect=${redirect}` } },
      );
    };
    window.addEventListener("auth:expired", handle);
    return () => window.removeEventListener("auth:expired", handle);
  }, []);

  const afterLogin = async (me) => {
    setUser(me);
    ensureFavoritesLoaded();
    await replayPostLoginAction();
    return me;
  };

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", res.data.access_token);
    const me = await api.get("/auth/me");
    return afterLogin(me.data);
  };

  const register = async (data) => {
    // MEH-328 Chunk D: OWASP anti-enumeration — /auth/register now
    // returns an identical ack body for new-email / password-collision /
    // oauth-collision. No access_token, no auto-login. Caller is the
    // /register page which renders the inbox-check screen on any 200.
    const res = await api.post("/auth/register", data);
    return res.data;
  };

  const loginWithGoogle = async (idToken) => {
    const res = await api.post("/auth/google", { id_token: idToken });
    localStorage.setItem("token", res.data.access_token);
    const me = await api.get("/auth/me");
    return afterLogin(me.data);
  };

  const loginWithApple = async (idToken, name) => {
    const res = await api.post("/auth/apple", { id_token: idToken, name });
    localStorage.setItem("token", res.data.access_token);
    const me = await api.get("/auth/me");
    return afterLogin(me.data);
  };

  const deleteAccount = async () => {
    await api.delete("/auth/me");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    resetFavoritesCache();
    setUser(null);
    api.post("/auth/logout").catch(() => {});
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    resetFavoritesCache();
    setUser(null);
    api.post("/auth/logout").catch(() => {});
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

  // MEH-143 — after a role upgrade the stored token changes; re-read
  // /auth/me so context reflects the new role immediately.
  const refreshUser = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch {}
  };

  // MEH-206 — invalidate all other sessions; backend increments
  // token_version and returns a fresh token for the current device.
  const logoutAllDevices = async () => {
    const res = await api.post("/auth/logout-all-devices");
    localStorage.setItem("token", res.data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
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
        refreshUser,
        logoutAllDevices,
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
