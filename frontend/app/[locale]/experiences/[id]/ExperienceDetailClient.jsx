"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Leaf, MapPin } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import Breadcrumb from "@/components/Breadcrumb";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

export default function ExperienceDetailClient() {
  const t = useTranslations("experiences.detail");
  const { id } = useParams();
  const search = useSearchParams();
  const justSubmitted = search.get("pending") === "1";

  const [ex, setEx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/experiences/${id}`)
      .then((r) => setEx(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const formatPrice = (p) => {
    if (p == null || Number(p) === 0) return t("free");
    return `₪${Number(p).toLocaleString("he-IL")}`;
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-site-muted">
        {t("loading")}
      </div>
    );
  }

  if (notFound || !ex) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="mb-4 flex justify-center">
          <Leaf size={56} weight="duotone" className="text-primary" aria-hidden="true" />
        </div>
        <p className="text-site-muted mb-6">{t("not_found")}</p>
        <Link href="/experiences" className="text-primary hover:underline">
          {t("back_to_all")}
        </Link>
      </div>
    );
  }

  const STATUS_BANNER = {
    pending: {
      className: "bg-yellow-50 border-yellow-300 text-yellow-900",
      label: t("status_pending"),
    },
    changes_requested: {
      className: "bg-orange-50 border-orange-300 text-orange-900",
      label: t("status_changes_requested"),
    },
    rejected: {
      className: "bg-red-50 border-red-300 text-red-900",
      label: t("status_rejected"),
    },
  };

  const banner = STATUS_BANNER[ex.status];
  const isApproved = ex.status === "approved";

  return (
    <div>
      {ex.image_url && (
        <div
          className="h-[360px] bg-cover bg-center"
          style={{ backgroundImage: `url(${ex.image_url})` }}
          role="img"
          aria-label={ex.title}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 py-10">
        <Breadcrumb
          items={[
            { href: "/", label: t("breadcrumb_home") },
            { href: "/experiences", label: t("breadcrumb_experiences") },
            { label: ex.title },
          ]}
          className="mb-4"
        />

        {justSubmitted && ex.status === "pending" && (
          <div className="bg-green-50 border border-primary text-primary rounded-[12px] p-4 mb-4">
            {t("just_submitted")}
          </div>
        )}

        {banner && !justSubmitted && (
          <div className={`border rounded-[12px] p-4 mb-4 ${banner.className}`}>
            <p className="font-medium">{banner.label}</p>
            {ex.status === "changes_requested" && ex.admin_feedback && (
              <p className="text-sm mt-2 whitespace-pre-wrap">
                <span className="font-medium">{t("team_notes")}</span>{" "}
                {ex.admin_feedback}
              </p>
            )}
            {ex.status === "rejected" && ex.rejection_reason && (
              <p className="text-sm mt-2 whitespace-pre-wrap">
                <span className="font-medium">{t("reason")}</span> {ex.rejection_reason}
              </p>
            )}
          </div>
        )}

        {ex.category && (
          <span className="inline-block bg-light text-primary text-xs px-3 py-1 rounded-full mb-3">
            {ex.category}
          </span>
        )}

        <h1 className="font-headline text-4xl md:text-5xl font-bold text-site-text mb-4">
          {ex.title}
        </h1>

        <div className="flex flex-wrap gap-4 text-site-text/85 mb-6">
          <p className="flex items-center gap-2">
            <span aria-hidden>📅</span>
            {formatDate(ex.event_date)}
            {ex.event_time && ` · ${formatTime(ex.event_time)}`}
          </p>
          {ex.city && (
            <p className="flex items-center gap-2">
              <MapPin size={16} weight="duotone" className="text-primary inline align-[-3px]" aria-hidden="true" />
              {ex.city}
              {ex.address && ` · ${ex.address}`}
            </p>
          )}
          <p className="flex items-center gap-2 text-accent font-semibold">
            <span aria-hidden>💰</span>
            {formatPrice(ex.price_per_person)}
          </p>
          {ex.max_participants != null && (
            <p className="flex items-center gap-2">
              <span aria-hidden>👥</span>
              {ex.spots_left === 0
                ? t("sold_out")
                : t("spots_count", {
                    spots: ex.spots_left ?? ex.max_participants,
                    max: ex.max_participants,
                  })}
            </p>
          )}
        </div>

        {ex.description && (
          <div className="bg-white border border-border rounded-[16px] p-6 mb-6 leading-relaxed whitespace-pre-line text-site-text/90">
            {ex.description}
          </div>
        )}

        {ex.requirements && (
          <div className="bg-light border border-border rounded-[16px] p-6 mb-6">
            <h2 className="font-headline text-lg font-bold text-site-text mb-2">
              {t("requirements_title")}
            </h2>
            <p className="text-site-text/85 whitespace-pre-line">
              {ex.requirements}
            </p>
          </div>
        )}

        {isApproved && ex.spots_left !== 0 && (
          <div className="flex flex-wrap gap-3 mt-6">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                t("whatsapp_message", { title: ex.title })
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-white px-6 py-3 rounded-[8px] font-medium hover:bg-primary-light transition"
            >
              {t("whatsapp_cta")}
            </a>
            <Link
              href="/experiences"
              className="border border-primary text-primary px-6 py-3 rounded-[8px] font-medium hover:bg-light transition"
            >
              {t("all_experiences")}
            </Link>
          </div>
        )}

        {ex.host?.name && (
          <p className="text-sm text-site-muted mt-8">
            {t("host_label")} <span className="text-primary">{ex.host.name}</span>
          </p>
        )}
      </div>
    </div>
  );
}
