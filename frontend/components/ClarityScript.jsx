"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { COOKIE_CONSENT_EVENT, hasFullCookieConsent } from "@/lib/cookie-consent";
import { usePathname } from "next/navigation";

// MEH-2324: /claim/<token> carries a bearer credential in its path, and a
// session recorder keeps the page URL. The claim page swaps the address to
// /claim on mount; Clarity waits for that.
const CLAIM_TOKEN_PATH = /\/claim\/[^/]/;

export default function ClarityScript({ projectId }) {
  const [consented, setConsented] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => setConsented(hasFullCookieConsent());
    check();
    window.addEventListener(COOKIE_CONSENT_EVENT, check);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, check);
  }, []);

  // This only keeps Clarity from loading on a token path. It cannot unload a
  // Clarity already running in the tab; the emailed link is a fresh page load.
  if (!consented || CLAIM_TOKEN_PATH.test(pathname || "")) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${projectId}");`}
    </Script>
  );
}
