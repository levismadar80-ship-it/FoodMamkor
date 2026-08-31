"use client";

// MEH-2104: this file exists only so that ref/[code]/page.js can stop being a
// client component and declare `metadata`. Next refuses to build a file that
// both carries "use client" and exports metadata:
//
//   Error: You are attempting to export "metadata" from a component marked
//   with "use client" ... move Client Component logic to a separate file.
//
// So the route is split: page.js is a server component that owns the robots
// tag, and the redirect logic below is rendered as its child. This is the
// repo's first server-wrapper-over-client-page — the only two existing layouts
// above client pages (admin, producer/dashboard) are themselves "use client"
// and declare no metadata, so there was no in-repo pattern to copy.
//
// The body below is unchanged from the pre-split page.js: same useEffect, same
// localStorage write, same router.replace, same null return.

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function RefRedirectClient() {
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
