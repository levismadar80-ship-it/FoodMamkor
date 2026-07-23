"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { HeartStraight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
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
import { useLaunchCohortTag } from "./launch-cohort";
import {
  USER_CITY_CHANGED_EVENT,
  readUserCity,
  seedCityFromProfile,
} from "./use-user-city";

const AuthContext = createContext(null);

/**
 * Drain the post-login action queue. Runs after every successful
 * authentication path (password login, register, Google, Apple) so a
 * guest "save" tap replays exactly once. Failures are swallowed — the
 * action is best-effort, never blocking the login flow.
 */
async function replayPostLoginAction(t) {
  const pending = readPendingAction();
  if (!pending) return;
  clearPendingAction();
  if (pending.verb === "favorite" && pending.payload) {
    try {
      await api.post(`/users/me/favorites/${pending.payload}`);
      setFavoritedLocal(pending.payload, true);
      showToast.success(t("favoriteSaved"), {
        icon: <HeartStraight size={18} weight="fill" />,
      });
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
  const t = useTranslations("auth.toasts");

  // MEH-434 — keep the Sentry launch_cohort tag in sync with the signed-in
  // user (derived client-side from user.created_at). Observability only.
  useLaunchCohortTag(user);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api
        .get("/auth/me")
        .then((res) => {
          setUser(res.data);
          // MEH-1485: seed localStorage user_city from the profile city so
          // the personalization stores stop diverging (no-op when
          // localStorage already holds a recent explicit choice).
          seedCityFromProfile(res.data.city);
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
      showToast.info(t("sessionExpired"), {
        duration: 5000,
        action: { label: t("loginAgainCta"), href: `/login?redirect=${redirect}` },
      });
    };
    window.addEventListener("auth:expired", handle);
    return () => window.removeEventListener("auth:expired", handle);
  }, [t]);

  // MEH-1485: profile↔localStorage bridge (write-back half). Every explicit
  // city choice — home handleCitySelected, /map handleMapCitySelected /
  // CityPickerModal / CitySearch, settings save — funnels through
  // useUserCity().setCity, which dispatches USER_CITY_CHANGED_EVENT. When a
  // logged-in user makes such a choice, write it back to User.city
  // best-effort (silent, errors swallowed) and refresh context so /settings
  // reflects it. Skips guests (no user) and the seed itself (localCity ===
  // profile city → no redundant PATCH, no loop). Guests + logout leave
  // localStorage untouched.
  useEffect(() => {
    const onCityChanged = () => {
      const localCity = readUserCity();
      if (!user || !localCity || localCity === (user.city || null)) return;
      api
        .patch("/users/me", { city: localCity })
        .then((res) => setUser(res.data))
        .catch(() => {});
    };
    window.addEventListener(USER_CITY_CHANGED_EVENT, onCityChanged);
    return () => window.removeEventListener(USER_CITY_CHANGED_EVENT, onCityChanged);
  }, [user]);

  const afterLogin = async (me) => {
    setUser(me);
    ensureFavoritesLoaded();
    await replayPostLoginAction(t);
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
