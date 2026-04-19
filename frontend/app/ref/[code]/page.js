"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ReferralLandingPage() {
  const { code } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (code) {
      try {
        localStorage.setItem("referral_code", code);
      } catch {
        // private browsing may block localStorage; ignore
      }
    }
    router.replace("/");
  }, [code, router]);

  return null;
}
