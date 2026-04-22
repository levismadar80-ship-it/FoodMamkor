"use client";

import { forwardRef, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  UserCircle,
  Lock,
  Storefront,
  Eye,
  EyeSlash,
  WhatsappLogo,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { passwordRules } from "@/lib/validators";

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-12 text-site-muted">
          טוענת...
        </div>
      }
    >
      <SettingsPageBody />
    </Suspense>
  );
}

function SettingsPageBody() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const urlTab = params.get("tab");
  const validTabs = ["profile", "security", "business"];
  const initialTab = validTabs.includes(urlTab) ? urlTab : "profile";
  const [tab, setTab] = useState(initialTab);

  const businessTabRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  // Scroll business tab into view at 375px where 3 tabs may overflow
  useEffect(() => {
    if (tab === "business" && businessTabRef.current) {
      businessTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [tab]);

  if (authLoading || !user) return null;

  const isProducer = user.is_producer || user.role === "producer";

  const selectTab = (next) => {
    setTab(next);
    const qp = new URLSearchParams(params.toString());
    qp.set("tab", next);
    router.replace(`/settings?${qp.toString()}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-headline text-3xl font-bold text-site-text mb-6">
        הגדרות חשבון
      </h1>

      {/* Tab bar — overflow-x-auto so business tab stays reachable at 375px */}
      <div
        role="tablist"
        aria-label="טאבים"
        className="flex gap-1 bg-white border border-border rounded-full p-1 mb-8 overflow-x-auto"
      >
        <TabButton
          active={tab === "profile"}
          onClick={() => selectTab("profile")}
          icon={
            <UserCircle
              size={16}
              weight={tab === "profile" ? "fill" : "duotone"}
            />
          }
        >
          פרופיל
        </TabButton>
        <TabButton
          active={tab === "security"}
          onClick={() => selectTab("security")}
          icon={
            <Lock size={16} weight={tab === "security" ? "fill" : "duotone"} />
          }
        >
          אבטחה
        </TabButton>
        {isProducer && (
          <TabButton
            ref={businessTabRef}
            active={tab === "business"}
            onClick={() => selectTab("business")}
            icon={
              <Storefront
                size={16}
                weight={tab === "business" ? "fill" : "duotone"}
              />
            }
          >
            העסק שלי
          </TabButton>
        )}
      </div>

      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "business" && isProducer && <BusinessTab />}
    </div>
  );
}

// TabButton forwards ref so SettingsPageBody can scrollIntoView the business tab
const TabButton = forwardRef(function TabButton(
  { active, onClick, icon, children },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap ${
        active
          ? "bg-primary text-white"
          : "text-site-muted hover:text-site-text"
      }`}
    >
      {icon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// CHUNK 2 — ProfileTab (placeholder, replaced next chunk)
// ---------------------------------------------------------------------------
function ProfileTab() { return null; }
function SecurityTab() { return null; }
function BusinessTab() { return null; }
