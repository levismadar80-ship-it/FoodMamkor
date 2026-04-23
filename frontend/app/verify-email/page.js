"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [verifyState, setVerifyState] = useState("loading"); // loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setVerifyState("error");
      setErrorMsg("קישור האימות לא תקין");
      return;
    }
    api
      .get("/auth/verify-email", { params: { token } })
      .then(() => {
        setVerifyState("success");
        // Full page reload so AuthProvider re-fetches /auth/me and
        // picks up email_verified: true, dismissing the banner.
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      })
      .catch((err) => {
        setVerifyState("error");
        setErrorMsg(
          err.response?.data?.detail || "קישור האימות לא תקין או פג תוקף"
        );
      });
  }, [token]);

  if (verifyState === "loading") {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 mx-auto mb-4 flex items-center justify-center text-3xl">
            ✉️
          </div>
          <h1 className="font-headline text-2xl font-bold text-site-text mb-2">מאמתת...</h1>
          <p className="text-site-muted text-sm">אנא המתיני</p>
        </div>
      </div>
    );
  }

  if (verifyState === "success") {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 mx-auto mb-4 flex items-center justify-center text-3xl">
            ✅
          </div>
          <h1 className="font-headline text-2xl font-bold text-site-text mb-2">האימייל אומת בהצלחה!</h1>
          <p className="text-site-muted text-sm mb-6">מעבירה אותך לאתר...</p>
          <Link
            href="/"
            className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium text-center"
          >
            המשיכי לאתר
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 mx-auto mb-4 flex items-center justify-center text-3xl">
          ❌
        </div>
        <h1 className="font-headline text-2xl font-bold text-site-text mb-2">האימות נכשל</h1>
        <p className="text-site-muted text-sm mb-6">{errorMsg}</p>
        <Link
          href="/"
          className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium text-center"
        >
          חזרי לאתר
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
          <p className="text-site-muted">טוענת...</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
