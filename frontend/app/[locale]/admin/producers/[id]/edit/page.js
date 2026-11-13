"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";
import DraftProductsPanel from "@/components/admin/DraftProductsPanel";
import AdminLoadError from "@/components/admin/AdminLoadError";
import ClaimLinkPanel from "@/components/admin/ClaimLinkPanel";
import OwnerInvitePanel, {
  OWNER_INVITABLE_STATUSES,
} from "@/components/admin/OwnerInvitePanel";

import { SkeletonForm } from "@/components/Skeleton";

export default function EditProducerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const [producer, setProducer] = useState(null);
  const [fetching, setFetching] = useState(true);
  // MEH-2096: a catch that nulled the producer fell through to the "not found"
  // branch, so a failed request told the admin the business does not exist.
  // A 404 and an unreachable API are different facts and now render differently.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const t = useTranslations("admin");

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    setFetching(true);
    setLoadError(false);
    api
      // MEH-2072: the ADMIN shape, not the public one. This used to call
      // `/producers/${id}` -> ProducerDetailOut, which by design carries no
      // admin-only field — so ProducerForm hydrated producer_license_number,
      // address, referral_source and license_expires_at as "" and then wrote
      // those blanks back on save. Measured: a save that changed only the name
      // wiped producer_license_number '1234567' -> '' and address -> NULL.
      .get(`/admin/producers/${id}`)
      .then((r) => { setProducer(r.data); setLoadError(false); })
      .catch((err) => {
        // A real 404 keeps the existing "not found" copy; anything else — network
        // down, 500, timeout — is a load failure the admin can retry.
        if (err?.response?.status === 404) setProducer(null);
        else setLoadError(true);
      })
      .finally(() => setFetching(false));
  }, [id, user, reloadKey]);

  if (loading || !user || fetching) {
    return (
      <SkeletonForm fields={6} label={t("common.loading")} className="max-w-4xl mx-auto px-4 py-12" />
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <AdminLoadError
          onRetry={() => setReloadKey((k) => k + 1)}
          testId="admin-producer-edit-load-error"
        />
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-muted">
        {t("producers.edit.not_found")}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin?tab=producers" className="text-sm text-muted hover:text-primary">
          {t("common.back")}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{t("producers.edit.title", { name: producer.name })}</h1>
      </div>
      {/* MEH-2326: the catalogue the owner receives with the claim link. Only a
          draft; once she has claimed it the server answers 409, shown verbatim. */}
      {producer.status === "draft" && (
        <DraftProductsPanel producerId={id} initialProducts={producer.products || []} />
      )}
      {/* MEH-2325: only a draft can be handed to its owner. ProducerAdminOut
          carries no owner id, so a draft she has already claimed still shows
          the panel — the server answers that one with 409, shown verbatim. */}
      {producer.status === "draft" && <ClaimLinkPanel producerId={id} />}
      {/* MEH-2974: the mirror image of the panel above — a business the admin
          built and finished herself, handed to its owner with a one-time link.
          The two preconditions stay disjoint by construction (`draft` here
          vs `approved`/`inactive` there), so exactly one panel can ever
          render. `inactive` joined the set in the card's v3 revision: a HIDDEN
          page is now the normal starting point, because the owner's approval
          is what publishes it — gating the panel on `approved` alone would
          have made the main flow unreachable from the UI while the API
          allowed it.
          `onChanged` re-fetches: the panel's pending / connected line comes
          from this page's producer, and only the just-minted link is local
          to the panel. */}
      {OWNER_INVITABLE_STATUSES.includes(producer.status) && (
        <OwnerInvitePanel
          producerId={id}
          producer={producer}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
      <ProducerForm initial={producer} producerId={id} />
    </div>
  );
}
