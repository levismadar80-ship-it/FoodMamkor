"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useGoogleSignIn } from "@/lib/use-google-sign-in";

/**
 * MEH-170 — Google + Apple buttons for Step 0 of /register/producer.
 *
 * Calls POST /auth/register/producer/oauth (distinct from the consumer
 * /auth/google and /auth/apple endpoints). The producer-specific
 * endpoint returns 409 when the user already has a producer linked,
 * which lets us redirect to /login instead of silently logging in.
 *
 * Re-uses the Google GSI and Apple JS SDK the consumer flow already
 * loads — no new env vars. Renders nothing when the provider client_id
 * is missing, so local dev without OAuth creds stays functional via
 * the email/password path below.
 */

export default function ProducerOAuthButtons({ onSuccess, onError }) {
  const googleId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const appleId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const appleRedirect = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;

  const googleBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const finish = async (provider, id_token, name) => {
    setLoading(true);
    try {
      const res = await api.post("/auth/register/producer/oauth", {
        provider,
        id_token,
        ...(name ? { name } : {}),
      });
      localStorage.setItem("token", res.data.access_token);
      onSuccess?.();
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 409) {
        // Already-producer OR email-password-collision both land on 409.
        onError?.(
          detail ||
            "יש לך כבר חשבון במהמקור. התחברי כדי להמשיך.",
          { redirectToLogin: true },
        );
      } else if (status === 429) {
        onError?.("יותר מדי נסיונות, נסי בעוד דקה");
      } else if (status === 401) {
        onError?.("לא הצלחנו להתחבר, נסי שוב");
      } else {
        onError?.(detail || "שגיאה בהתחברות");
      }
    } finally {
      setLoading(false);
    }
  };

  // Google GSI — uses shared hook so only one initialize() fires per page,
  // and cancel() clears any stale producer callback before mounting.
  useGoogleSignIn(
    googleId,
    (response) => finish("google", response.credential),
    () => {
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: googleBtnRef.current.offsetWidth,
          text: "continue_with",
          locale: "he",
        });
      }
    },
  );

  // Apple JS — mount the SDK, listen to success/failure events, forward
  // to our producer endpoint.
  useEffect(() => {
    if (!appleId || typeof window === "undefined") return;
    const script = document.createElement("script");
    script.src =
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    script.onload = () => {
      window.AppleID?.auth.init({
        clientId: appleId,
        scope: "name email",
        redirectURI: appleRedirect || window.location.origin,
        usePopup: true,
      });
    };
    document.body.appendChild(script);

    const handleSuccess = (event) => {
      const { authorization, user } = event.detail || {};
      if (!authorization?.id_token) return;
      const name = user
        ? `${user.name?.firstName || ""} ${user.name?.lastName || ""}`.trim()
        : null;
      finish("apple", authorization.id_token, name || null);
    };
    const handleFailure = (event) => {
      if (event.detail?.error !== "popup_closed_by_user") {
        onError?.("שגיאה בהתחברות עם Apple");
      }
    };
    document.addEventListener("AppleIDSignInOnSuccess", handleSuccess);
    document.addEventListener("AppleIDSignInOnFailure", handleFailure);
    return () => {
      script.remove();
      document.removeEventListener("AppleIDSignInOnSuccess", handleSuccess);
      document.removeEventListener("AppleIDSignInOnFailure", handleFailure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appleId, appleRedirect]);

  if (!googleId && !appleId) return null;

  return (
    <div className="space-y-3" aria-busy={loading ? "true" : "false"}>
      <p className="text-sm font-semibold text-site-text">הרשמה מהירה</p>
      {googleId && <div ref={googleBtnRef} className="w-full min-h-[48px]" />}
      {appleId && (
        <button
          type="button"
          onClick={() => window.AppleID?.auth.signIn()}
          disabled={loading}
          className="w-full bg-black text-white py-3 rounded-[8px] hover:bg-gray-900 transition font-medium flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-black/40 min-h-[48px] disabled:opacity-60"
          aria-label="המשיכי עם Apple"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          המשיכי עם Apple
        </button>
      )}
      <p className="text-xs text-site-muted text-center">
        נקבל רק את השם והמייל שלך
      </p>
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-site-muted">או</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    </div>
  );
}
