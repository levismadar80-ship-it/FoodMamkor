"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { BRAND_NAME } from "@/lib/constants";

/**
 * DashboardFooter (MEH-1954) — slim footer for the producer dashboard.
 *
 * Purpose:  The consumer Footer is 741px tall at 390×844 (44% of the
 *           viewport on /producer/dashboard/events, measured in the MEH-999
 *           audit) and is consumer navigation — «גלו עסקים», newsletter —
 *           inside a management tool. Dashboard routes render this single
 *           row instead: logo, ©, and the utility links only.
 * Does NOT: replace the consumer Footer on any public route — FooterSlot
 *           owns the routing; this component renders nothing conditionally.
 * Related:  components/FooterSlot.jsx (route conditional),
 *           components/Footer.jsx:250-292 (the copyright bar this mirrors —
 *           same tokens, same 13px/44px link treatment).
 * History:  MEH-1954 (creation).
 */
export default function DashboardFooter() {
  const t = useTranslations();

  return (
    <footer data-testid="dashboard-footer" className="bg-primary-dark">
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-green-100" style={{ fontSize: "11px" }}>
          <Image
            src="/logo-on-warm-dark.svg"
            alt=""
            width={20}
            height={20}
            aria-hidden="true"
          />
          © {new Date().getFullYear()} {t("footer.copyright")}
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-4">
          {[
            { href: "/terms", label: t("nav.footer.terms") },
            { href: "/privacy", label: t("nav.footer.privacy_short") },
            // MEH-867: IL IS 5568 — the accessibility statement must stay
            // reachable from every page's footer. The MEH-1954 card lists five
            // items without it; dropping it here would regress the legal
            // requirement, so it stays (deviation named in the PR body).
            { href: "/accessibility", label: t("nav.footer.accessibility") },
            // MEH-1312: contact = /about#contact (ADR-024 exception).
            { href: "/about#contact", label: t("nav.footer.contact") },
          ].map((link) => (
            <li key={link.href}>
              {/* 13px + min-h-[44px]: the MEH-1103 footer-utility compromise —
                  WCAG 2.5.5 tap target via vertical padding, not layout. */}
              <Link
                href={link.href}
                className="inline-flex items-center min-h-[44px] text-[13px] text-green-100 hover:text-white transition"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <span className="sr-only">{BRAND_NAME}</span>
    </footer>
  );
}
