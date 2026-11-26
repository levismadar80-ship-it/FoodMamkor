// @ts-check
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { useApi } from "@/lib/use-api";
import AdminProductImport from "@/components/admin/AdminProductImport";
import ProductOrganizer from "@/components/ProductOrganizer";
import ProducerForm from "@/components/admin/ProducerForm";
import DraftProductsPanel from "@/components/admin/DraftProductsPanel";
import AdminProductImagesPanel from "@/components/admin/AdminProductImagesPanel";
import AdminLoadError from "@/components/admin/AdminLoadError";
import AdminDeliveryPaymentPanel, {
  SECTION_TITLE_KEYS,
} from "@/components/admin/AdminDeliveryPaymentPanel";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import PageFillPanel from "@/components/PageFillPanel"; // MEH-3483
import { showToast } from "@/lib/toast";
import ClaimLinkPanel from "@/components/admin/ClaimLinkPanel";
import TestBusinessToggle from "@/components/admin/TestBusinessToggle"; // MEH-2952
import DraftPreviewLinkPanel from "@/components/admin/DraftPreviewLinkPanel";
import PublishWithConsentPanel from "@/components/admin/PublishWithConsentPanel";
import OwnerInvitePanel, {
  OWNER_INVITABLE_STATUSES,
} from "@/components/admin/OwnerInvitePanel";

import { SkeletonForm } from "@/components/Skeleton";
import BackLink from "@/components/ui/BackLink";
import AdminVerifiedPanel from "@/components/admin/AdminVerifiedPanel"; // MEH-3524
import AdminAlcoholPanel from "@/components/admin/AdminAlcoholPanel"; // MEH-3524
import AdminBusinessEventsPanel from "@/components/admin/AdminBusinessEventsPanel"; // MEH-3873
import AdminBusinessExperiencesPanel from "@/components/admin/AdminBusinessExperiencesPanel"; // MEH-3876

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
  const [fillKey, setFillKey] = useState(0); // MEH-3483: remount the forms after a page fill
  // MEH-3472: the organizer orders the WHOLE catalog the admin is building —
  // published products (producer.products) and drafts (reported by the
  // import panel). `organizeEdits` maps product id → the organizer's own
  // saved {position, group_id}. It is laid OVER every fresh list and never
  // cleared: a later import or delete must not rebuild the organizer from
  // the page-load positions and then save that stale order (rule-5a review).
  const [drafts, setDrafts] = useState(/** @type {any[]} */ ([]));
  const [organizeEdits, setOrganizeEdits] = useState(/** @type {Record<string, {position?: number|null, group_id?: string|null}>} */ ({}));
  // Bumped after the organizer saves groups, so the import panel's
  // «קבוצה: …» lines re-read the names.
  const [groupsVersion, setGroupsVersion] = useState(0);
  const t = useTranslations("admin");
  const tOwner = useTranslations("dashboard.producer");
  const locale = useLocale();
  // MEH-3915: which sections with their own «שמירה» hold unsaved edits. The
  // form's «שמרו שינויים» saves only its own fields and then leaves the page,
  // which threw away a delivery fee typed into «משלוחים ואיסוף» unseen.
  const [dirtySections, setDirtySections] = useState(/** @type {Record<string, boolean>} */ ({}));
  const reportDirty = useCallback(
    (/** @type {string} */ key, /** @type {boolean} */ dirty) =>
      setDirtySections((d) => (!!d[key] === dirty ? d : { ...d, [key]: dirty })),
    [],
  );
  const unsavedSections = Object.keys(SECTION_TITLE_KEYS)
    .filter((k) => dirtySections[k])
    .map((k) => tOwner(/** @type {any} */ (SECTION_TITLE_KEYS)[k]));
  useUnsavedGuard(unsavedSections.length > 0, tOwner("unsaved_guard.confirm"));

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

  const organizeProducts = useMemo(
    () =>
      [...(producer?.products || []), ...drafts].map((p) =>
        organizeEdits[p.id] ? { ...p, ...organizeEdits[p.id] } : p,
      ),
    [producer, drafts, organizeEdits],
  );
  /** @param {any[]} next */
  const recordOrganizeEdits = (next) =>
    setOrganizeEdits((prev) => ({
      ...prev,
      ...Object.fromEntries(next.map((p) => [p.id, { position: p.position, group_id: p.group_id }])),
    }));

  // MEH-3456: after drafts are approved the page re-reads the producer
  // without the skeleton, so the import panel keeps its result line and only
  // the product lists pick up the new rows.
  const refreshProducts = () => {
    api
      .get(`/admin/producers/${id}`)
      .then((r) => setProducer(r.data))
      .catch(() => {});  // the import panel already reported its own success
  };

  // MEH-3818: the form's category list, read with the producer so the form
  // draws once, complete (ProducerForm reads the same cached key).
  const categories = useApi(user?.role === "admin" ? "/categories" : null);
  if (loading || !user || fetching || categories.isLoading) {
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
        <BackLink href="/admin?tab=producers" label={t("common.back")} />
        <h1 className="text-2xl font-bold mt-2">{t("producers.edit.title", { name: producer.name })}</h1>
        {/* Page freshness: when the owner last pressed «כן, הכול נכון» in the
            monthly email. Absent until she has; the stale filter on the list
            is where unconfirmed pages are found. */}
        {producer.last_confirmed_at && (
          <p className="text-sm text-muted mt-1" data-testid="admin-last-confirmed">
            {t("producers.edit.last_confirmed", { date: formatDate(producer.last_confirmed_at, locale) })}
          </p>
        )}
        <TestBusinessToggle producerId={String(id)} />
      </div>
      {/* MEH-2326: the catalogue the owner receives with the claim link. Only a
          draft; once she has claimed it the server answers 409, shown verbatim. */}
      {producer.status === "draft" && (
        <DraftProductsPanel producerId={id} initialProducts={producer.products || []} />
      )}
      {/* MEH-3456: any other status (Sandra's page is live) gets the same
          photo button per product; the draft panel above already carries it. */}
      {producer.status !== "draft" && (
        <AdminProductImagesPanel
          // A new product list (after approving drafts) remounts it, so it
          // never shows a stale list.
          key={(producer.products || []).map((p) => p.id).join(",")}
          initialProducts={producer.products || []}
        />
      )}
      {/* MEH-2325: only a draft can be handed to its owner. ProducerAdminOut
          carries no owner id, so a draft she has already claimed still shows
          the panel — the server answers that one with 409, shown verbatim. */}
      {producer.status === "draft" && <ClaimLinkPanel producerId={id} />}
      {/* MEH-3377: the two steps for a business that says yes on WhatsApp
          without opening an account — show it the page (read-only link), then
          publish with its written consent. Only an OWNERLESS draft: once she
          has claimed it the page is hers to submit, and the server would
          answer both with 409. `has_owner === false` and not `!has_owner`:
          the field is null when a route did not hydrate it, and null must
          hide the panels (fail closed, MEH-2495). */}
      {producer.status === "draft" && producer.has_owner === false && (
        <>
          <DraftPreviewLinkPanel producerId={id} />
          <PublishWithConsentPanel
            producerId={id}
            onPublished={() => {
              showToast.success(t("producers.consent_publish.published"));
              setReloadKey((k) => k + 1);
            }}
          />
        </>
      )}
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
      {/* MEH-3377: the screenshot attached on «פרסום בהסכמה», read back so the
          record can be checked later. Admin-only data (it shows a private
          person's chat) — the public and owner shapes do not carry it. */}
      {producer.consent_screenshot_url && (
        <p className="text-sm mb-6">
          <a
            data-testid="consent-screenshot-link"
            href={producer.consent_screenshot_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary"
          >
            {t("producers.consent_publish.screenshot_view")}
          </a>
        </p>
      )}
      {/* MEH-3524: the only way to give or remove «מאומת» (grant-verified /
          revoke-verified); the old checkbox in ProducerForm was removed in MEH-766. */}
      <AdminVerifiedPanel
        key={`verified-${id}-${producer.verified_at ?? "none"}`}
        producerId={String(id)}
        kind={producer.kind}
        verifiedAt={producer.verified_at}
        docType={producer.verification_doc_type}
      />
      {/* MEH-3524: the alcohol mark; renders nothing while ordering is off. */}
      <AdminAlcoholPanel key={`alcohol-${id}`} producerId={String(id)} />
      {/* MEH-2312: catalog import from the business's existing store → drafts
          the admin approves. Any status: Sandra's page is approved and live. */}
      <AdminProductImport
        producerId={String(id)}
        onApproved={refreshProducts}
        onDraftsChange={setDrafts}
        groupsVersion={groupsVersion}
      />
      {/* MEH-3472: the owner's organizer, against the admin routes (same
          service, drafts in scope). It renders nothing below 2 products —
          the same rule as on the owner's dashboard. */}
      {organizeProducts.length >= 2 && (
        <section className="bg-surface rounded-md border border-border p-6 my-6" data-testid="admin-product-organizer">
          <ProductOrganizer
            products={organizeProducts}
            onProductsChange={recordOrganizeEdits}
            onGroupsChange={() => setGroupsVersion((v) => v + 1)}
            basePath={`/admin/producers/${id}`}
          />
        </section>
      )}
      {/* MEH-3483: the owner's «ספרו לנו על העסק», saved through the admin PUT;
          a save reloads the business and remounts the forms below. */}
      <PageFillPanel profile={producer} owner={false} readUrl={`/admin/producers/${id}/page-fill/read`}
        saveUrl={`/admin/producers/${id}`}
        onSaved={() => api.get(`/admin/producers/${id}`).then((r) => { setProducer(r.data); setFillKey((k) => k + 1); })} />
      <ProducerForm
        key={`form-${fillKey}`}
        initial={producer}
        producerId={id}
        unsavedSections={unsavedSections}
      />
      {/* MEH-3475: delivery day + minimum per city, order window, payment —
          the owner's own editors, saved through the admin PUT. */}
      <AdminDeliveryPaymentPanel
        key={`delivery-${fillKey}`}
        producerId={String(id)}
        producer={producer}
        reportDirty={reportDirty}
      />
      {/* MEH-3873: the business's events, written on its behalf with consent. */}
      <AdminBusinessEventsPanel producerId={String(id)} />
      {/* MEH-3876: its experiences, same shape; needs an owner account (the host). */}
      <AdminBusinessExperiencesPanel producerId={String(id)} hasOwner={producer.has_owner} />
    </div>
  );
}
