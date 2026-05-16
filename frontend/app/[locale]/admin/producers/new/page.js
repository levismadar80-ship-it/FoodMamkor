"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import ProducerForm from "@/components/admin/ProducerForm";

export default function NewProducerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin?tab=producers" className="text-sm text-text-secondary hover:text-primary">
          ← חזרה לפאנל הניהול
        </Link>
        <h1 className="text-2xl font-bold mt-2">הוסף בית עסק חדש</h1>
        <p className="text-text-secondary text-sm mt-1">
          העסק יישמר מיד כמאושר (status=approved) ויופיע באתר.
        </p>
      </div>
      <ProducerForm />
    </div>
  );
}
