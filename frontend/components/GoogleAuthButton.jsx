"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

export default function GoogleAuthButton({ onSuccess, onError }) {
  const { loginWithGoogle } = useAuth();
  const buttonRef = useRef(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });
      if (buttonRef.current) {
        window.google?.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          width: buttonRef.current.offsetWidth,
          text: "continue_with",
          locale: "he",
        });
      }
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [clientId]);

  const handleCredentialResponse = async (response) => {
    try {
      await loginWithGoogle(response.credential);
      onSuccess?.();
    } catch (err) {
      onError?.(err.response?.data?.detail || "שגיאה בהתחברות עם Google");
    }
  };

  if (!clientId) return null;

  return (
    <div>
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-text-secondary">או</span>
        </div>
      </div>
      <div ref={buttonRef} className="w-full" />
    </div>
  );
}
