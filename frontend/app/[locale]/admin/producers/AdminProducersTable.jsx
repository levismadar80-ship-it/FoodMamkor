"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cow, Leaf, Package, Seal, Truck, Circle, StarOfDavid, Warning } from "@phosphor-icons/react";
import Pagination from "@/components/Pagination";
import AdminLoadError from "@/components/admin/AdminLoadError";
import StoryCardCanvas from "@/components/StoryCardCanvas";
import InfoTooltip from "@/components/InfoTooltip";
import AdminRowMenu from "@/components/admin/AdminRowMenu";
import AdminReviewChecklist from "./AdminReviewChecklist";
import { SLA_STATUSES } from "./sla-statuses";
import { getProducerStatusLabel, getProducerStatusColor } from "@/lib/producer-status";
import { optimizeCloudinary } from "@/lib/cloudinary";

// Phosphor icon size used in trait tags + the action row.
const ICON_SIZE_SM = 16;
// Column count for the table — used by the empty-state and story-card
// sub-row's colSpan. MEH-509 PR3: bumped 6 → 7 (added Risk column).
const TABLE_COLUMN_COUNT = 7;

// MEH-509 PR3: hardcoded score thresholds per spec. Constants here so a
// future tuning of the buckets only touches this file.
const RISK_LOW_MAX = 30;
const RISK_MED_MAX = 70;

function StatusBadge({ status }) {
  const label = getProducerStatusLabel(status);
  const cls = getProducerStatusColor(status);
  return <span className={`text-xs px-2 py-1 rounded-full ${cls}`}>{label}</span>;
}

// MEH-1011 Chunk 2: "ממתין להשלמה" trail badge — shown when the admin has sent
// a request-changes (requested_changes ≠ null). Status stays pending; this
// flags that the producer owes a fix. The date is wrapped dir="ltr" so the
// RTL page doesn't flip its segments (bidi-isolate); full feedback in title.
export function AwaitingCompletionBadge({ producer }) {
  const t = useTranslations("admin");
  if (!producer.requested_changes) return null;
  const date = producer.changes_requested_at
    ? new Date(producer.changes_requested_at).toLocaleDateString("he-IL")
    : null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-medium"
      title={producer.requested_changes}
    >
      {t("producers.table.awaiting_completion")}
      {date && <span dir="ltr" className="tabular-nums">{date}</span>}
    </span>
  );
}

// MEH-2110: business-days-waiting badge. The count is computed SERVER-side
// (routers/admin.py via utils/clock.business_days_waiting) — this component
// only colours it, so the badge and the queue's sort order can never disagree
// about how old a row is.
//
// MEH-2161: `SLA_STATUSES` moved to ./sla-statuses, which now carries the full
// "which rows get SLA colours" rationale. It is imported rather than declared
// because `QueueSlaSummary` asks the SAME question and had to copy it.

export function WaitingBadge({ producer }) {
  const t = useTranslations("admin");
  const p = producer || {};
  const isQueued = SLA_STATUSES.includes(p.status);
  const isDraft = p.status === "draft";
  if (!isQueued && !isDraft) return null;

  const days = p.business_days_waiting ?? 0;
  // 0–1 neutral · 2 amber · >=3 red. Thresholds live here and in
  // __tests__/AdminQueueWaitingBadge.test.jsx, which pins each boundary.
  let cls = "bg-gray-100 text-gray-600";
  if (isQueued && days >= 3) cls = "bg-red-100 text-red-800";
  else if (isQueued && days === 2) cls = "bg-amber-100 text-amber-800";

  // The tooltip names WHICH timestamp it is showing rather than presenting a
  // creation date as if it were a submission — a pre-MEH-2100 row and every
  // draft have no stamp, and silently substituting one would misreport when
  // the clock started.
  const stamp = p.submitted_for_review_at || p.created_at;
  const when = stamp ? new Date(stamp).toLocaleString("he-IL") : null;
  const title = when
    ? p.submitted_for_review_at
      ? t("producers.table.waiting_tooltip_submitted", { when })
      : t("producers.table.waiting_tooltip_created", { when })
    : undefined;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}
      data-testid="waiting-badge"
      data-days={days}
      title={title}
    >
      {t("producers.table.waiting_badge", { days })}
    </span>
  );
}

// MEH-509 PR3: Anthropic-Haiku-backed risk score badge.
// score=null → grey "אין מידע" (NULL = "not scored yet OR Anthropic call failed").
// score ≤ 30 → green "סיכון נמוך", 31-70 → yellow "סיכון בינוני", >70 → red "סיכון גבוה".
// Tooltip surfaces the full reasoning when present.
function RiskBadge({ score, reasoning }) {
  const t = useTranslations("admin");
  let cls = "bg-gray-100 text-gray-600";
  let label = t("producers.table.risk.unknown");
  if (typeof score === "number") {
    if (score <= RISK_LOW_MAX) {
      cls = "bg-primary/20 text-primary";
      label = t("producers.table.risk.low");
    } else if (score <= RISK_MED_MAX) {
      cls = "bg-yellow-100 text-yellow-800";
      label = t("producers.table.risk.medium");
    } else {
      cls = "bg-red-100 text-red-700";
      label = t("producers.table.risk.high");
    }
  }
  const display = typeof score === "number" ? `${label} (${score})` : label;
  return (
    <span
      className={`text-xs px-2 py-1 rounded-full ${cls}`}
      title={reasoning || t("producers.table.risk.no_reasoning")}
    >
      {display}
    </span>
  );
}

function CompletenessBadge({ missing, priority }) {
  const t = useTranslations("admin");
  const fields = missing.join(", ");
  if (priority === "red") {
    return (
      <span
        title={t("producers.table.completeness.missing_title", { fields })}
        className="inline-flex items-center leading-none cursor-help"
        aria-label={t("producers.table.completeness.missing_critical_aria")}
      >
        <Circle size={ICON_SIZE_SM} weight="fill" className="text-red-500" aria-hidden="true" />
      </span>
    );
  }
  if (priority === "yellow") {
    return (
      <span
        title={t("producers.table.completeness.missing_title", { fields })}
        className="inline-flex items-center leading-none cursor-help"
        aria-label={t("producers.table.completeness.missing_aria")}
      >
        <Circle size={ICON_SIZE_SM} weight="fill" className="text-amber-500" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      title={t("producers.table.completeness.complete_title")}
      className="inline-flex items-center leading-none cursor-help opacity-60"
      aria-label={t("producers.table.completeness.complete_aria")}
    >
      <Circle size={ICON_SIZE_SM} weight="fill" className="text-primary" aria-hidden="true" />
    </span>
  );
}

function ProducerTags({ producer }) {
  const t = useTranslations("admin");
  return (
    <div className="flex gap-1 flex-wrap">
      {producer.verification_tier === "verified" && <span title={t("producers.table.tags.verified")}><Seal size={ICON_SIZE_SM} weight="fill" className="text-primary" aria-hidden="true" /></span>}
      {producer.organic_certified && <span title={t("producers.table.tags.organic_certified")}><Leaf size={ICON_SIZE_SM} className="text-primary" aria-hidden="true" /></span>}
      {producer.grass_fed && <span title={t("producers.table.tags.grass_fed")}><Cow size={ICON_SIZE_SM} className="text-primary" aria-hidden="true" /></span>}
      {producer.has_delivery && <span title={t("producers.table.tags.delivery")}><Truck size={ICON_SIZE_SM} className="text-primary" aria-hidden="true" /></span>}
      {producer.pickup_points && <span title={t("producers.table.tags.pickup_points")}><Package size={ICON_SIZE_SM} className="text-primary" aria-hidden="true" /></span>}
      {producer.kosher && <span title={producer.kosher}><StarOfDavid size={ICON_SIZE_SM} className="text-primary" aria-hidden="true" /></span>}
      {/* MEH-971 chunk 3: license-pending flag — license-required category with
          no license number. Unmissable text badge so the admin verifies before
          approving (the chunk-4 guard blocks approval without an override). */}
      {producer.license_pending && (
        <span
          title={t("producers.table.tags.license_pending_title")}
          aria-label={t("producers.table.tags.license_pending_title")}
          className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium"
        >
          {t("producers.table.tags.license_pending")}
        </span>
      )}
      {/* MEH-1421 (MEH-1388 chunk 4a): read-only dedup signal — likely-duplicate
          producer (shared name/city). Signal only; approval is never blocked. */}
      {(producer._dup?.name || producer._dup?.city) && (
        <span
          title={t(
            producer._dup.name && producer._dup.city
              ? "producers.table.tags.dedup_both_title"
              : producer._dup.name
                ? "producers.table.tags.dedup_name_title"
                : "producers.table.tags.dedup_city_title",
          )}
          aria-label={t("producers.table.tags.dedup")}
          className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 text-orange-800 px-1.5 py-0.5 text-[10px] font-medium"
        >
          <Warning size={ICON_SIZE_SM} weight="fill" aria-hidden="true" />
          {t("producers.table.tags.dedup")}
        </span>
      )}
    </div>
  );
}

// MEH-1471: read-only self-reported attribution ("מאיפה שמעת עלינו?"). Admin-only
// (ProducerAdminOut). Renders the Hebrew option label, "אחר: <text>" for the
// free-text case, and "—" for producers who registered before the field existed.
// Option labels come from the auth namespace (single source of the Hebrew copy)
// so the strings aren't duplicated in the admin namespace.
function ReferralSource({ producer }) {
  const t = useTranslations("admin");
  const tOpt = useTranslations(
    "auth.register.producer.fields.referral_source.options",
  );
  const key = producer.referral_source;
  let value = "—";
  if (key === "other") {
    const other = (producer.referral_source_other || "").trim();
    value = other ? `${tOpt("other")}: ${other}` : tOpt("other");
  } else if (key) {
    value = tOpt(key);
  }
  return (
    <div className="text-[11px] text-muted mt-0.5">
      {t("producers.table.referral.label")}: {value}
    </div>
  );
}

export function ProducerActions({ producer, isStoryOpen, onQuickApprove, onRequestChanges, onReject, onToggleStatus, onToggleAmbassador, onDeleteProducer, onToggleStoryCard, isBusy }) {
  const t = useTranslations("admin");
  const p = producer;
  // UIS Pattern A (MEH-228): disable the in-flight action's button. `isBusy`
  // may be undefined if a caller doesn't pass it — default to never-busy.
  const busy = isBusy || (() => false);
  const isPending = p.status === "pending";
  return (
    <div className="flex gap-3 flex-wrap">
      {/* MEH-745 surfaced approve for two waiting states, `pending` and
          `pending_whatsapp`; the second was removed in MEH-2124, leaving one.
          MEH-1011 Chunk 2: pass the full producer so the approve-422 handler
          can open request-changes prefilled with the gate-matched chip. */}
      {isPending && (
        <button onClick={() => onQuickApprove(p)} disabled={busy(`approve:${p.id}`)} className="text-primary hover:underline text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline">
          {t("producers.table.actions.approve_short")}
        </button>
      )}
      {/* MEH-1011 Chunk 2: non-terminal "please complete" request — pending only. */}
      {isPending && (
        <button onClick={() => onRequestChanges(p)} disabled={busy(`request-changes:${p.id}`)} className="text-accent hover:underline text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline">
          {t("producers.table.actions.request_changes")}
        </button>
      )}
      <Link href={`/admin/producers/${p.id}/edit`} className="text-primary hover:underline text-xs">
        {t("common.edit")}
      </Link>
      {p.slug && (
        <Link href={`/${p.slug}`} target="_blank" className="text-muted hover:text-primary text-xs">
          {t("common.view")}
        </Link>
      )}
      {/* MEH-1027 Chunk A: secondary + destructive actions live in the kebab
          (MEH-1023 pattern) — same guards, same handlers, same busy keys as
          the inline buttons they replace; only the trigger location moved.
          Ambassador + story-card behavior is unchanged (reposition only). */}
      <AdminRowMenu
        ariaLabel={t("producers.table.actions.menu_aria")}
        items={[
          ...(p.status === "approved" || p.status === "inactive"
            ? [{
                key: "status",
                label: p.status === "approved" ? t("producers.table.actions.suspend") : t("producers.table.actions.activate"),
                disabled: busy(`status:${p.id}`),
                onSelect: () => onToggleStatus(p.id),
              }]
            : []),
          ...(p.status === "approved"
            ? [{
                key: "ambassador",
                // MEH-1267: title explains the ambassador action (Trust Tier 5)
                // for admins who don't know what "שגריר" means.
                // MEH-1681: the label names the ACTION the click performs, not the
                // current state. It previously read "שגרירה" / "☆ שגריר" — state
                // descriptions, where only the ☆ glyph carried the direction, so an
                // admin could not tell whether clicking would set or remove the role.
                label: (
                  <span title={t("producers.table.actions.ambassador_tooltip")}>
                    {p.ambassador ? t("producers.table.actions.remove_ambassador_title") : t("producers.table.actions.set_ambassador_title")}
                  </span>
                ),
                disabled: busy(`ambassador:${p.id}`),
                onSelect: () => onToggleAmbassador(p.id, p.ambassador),
              }]
            : []),
          ...(p.status === "approved" && p.slug
            ? [{
                key: "story",
                label: t("producers.table.actions.story_card"),
                onSelect: () => onToggleStoryCard(p.id),
              }]
            : []),
          // MEH-226: reject is terminal and emails the business owner, so it
          // lives in the kebab with tone="danger" (MEH-1023 destructive-action
          // convention) rather than in the always-visible strip beside
          // approve. Pending-only — the same guard as approve and
          // request-changes above; the backend has no status guard on reject,
          // so this is a UI affordance, not the enforcement.
          ...(isPending
            ? [{
                key: "reject",
                label: t("producers.table.actions.reject"),
                tone: "danger",
                disabled: busy(`reject:${p.id}`),
                onSelect: () => onReject(p),
              }]
            : []),
          {
            key: "delete",
            label: t("common.delete"),
            tone: "danger",
            disabled: busy(`delete:${p.id}`),
            onSelect: () => onDeleteProducer(p.id, p.name),
          },
        ]}
      />
    </div>
  );
}

// MEH-1232: pending-approval photo preview. Statuses whose gallery the admin
// must eyeball BEFORE approving (photo-quality gate at manual approval — the
// MEH-799 gate only checks images is non-empty, not that they render).
//
// MEH-2161: this is NOT `SLA_STATUSES` and must not be merged into it, even
// though both read `["pending"]` today. They answer different questions — "is
// this row waiting on us" versus "must a human look at its photos before
// approving" — and the values match by coincidence, not by definition. Merging
// them would mean a future change to the photo-review policy silently moved the
// SLA clock. Two owners for one fact is a smell; one owner for two facts is
// worse, because the coupling is invisible at both call sites.
const PENDING_PHOTO_STATUSES = ["pending"];
// Max thumbnails before collapsing the rest into a "+N" indicator.
const PENDING_THUMB_MAX = 4;
// Rendered thumbnail box (px). Small on purpose — the admin judges quality at a
// glance; clicking opens the full original in a new tab.
const PENDING_THUMB_PX = 72;
// Cloudinary delivery width for the thumbnail (2× the box for retina crispness).
const PENDING_THUMB_CLOUDINARY_W = 160;

// MEH-1232: single gallery thumbnail. Renders through optimizeCloudinary at a
// small width; a load error (broken/404 URL like the MEH-1222 "https://bread.jpg",
// or a CSP-blocked host) swaps to a red ⚠ marker so the admin sees at a glance
// that an image is broken. The anchor opens the ORIGINAL (untransformed) URL in
// a new tab. Uses <img> (not next/image) to match the existing admin gallery
// pattern (ProducerForm.jsx:617) and to let onError fire on any bad host.
function PendingPhotoThumb({ url, index, producerName, t }) {
  const [broken, setBroken] = React.useState(false);
  const alt = t("producers.table.photo_preview.thumb_alt", { index: index + 1, name: producerName });
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={alt}
      className="relative block shrink-0 rounded-[8px] overflow-hidden border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      style={{ width: PENDING_THUMB_PX, height: PENDING_THUMB_PX }}
    >
      {broken ? (
        <span
          role="img"
          aria-label={t("producers.table.photo_preview.broken")}
          title={t("producers.table.photo_preview.broken")}
          className="flex h-full w-full items-center justify-center bg-red-50 text-red-600"
        >
          <Warning size={22} weight="fill" aria-hidden="true" />
        </span>
      ) : (
        // raw img: the URL is producer-submitted and may be ANY host (the
        // MEH-1222 "https://bread.jpg" case). next/image rejects hosts absent
        // from remotePatterns instead of firing onError, which is exactly the
        // broken-image signal this admin thumb exists to show.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={optimizeCloudinary(url, { width: PENDING_THUMB_CLOUDINARY_W })}
          alt={alt}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      )}
    </a>
  );
}

// MEH-1232: horizontal strip of up to PENDING_THUMB_MAX thumbnails + a "+N"
// overflow box. Rendered as an always-visible sub-row for pending producers so
// the photos are in front of the admin at approval time (no extra click).
function PendingPhotoStrip({ producer }) {
  const t = useTranslations("admin");
  const images = producer.images || [];
  const shown = images.slice(0, PENDING_THUMB_MAX);
  const extra = images.length - shown.length;
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[11px] text-muted me-1">{t("producers.table.photo_preview.label")}</span>
      {shown.map((url, i) => (
        <PendingPhotoThumb key={`${url}-${i}`} url={url} index={i} producerName={producer.name} t={t} />
      ))}
      {extra > 0 && (
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-[8px] border border-border bg-background text-xs font-medium text-muted"
          style={{ width: PENDING_THUMB_PX, height: PENDING_THUMB_PX }}
          title={t("producers.table.photo_preview.more_alt", { count: extra })}
          aria-label={t("producers.table.photo_preview.more_alt", { count: extra })}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function AdminProducersRow({ producer, isStoryOpen, handlers, checklist }) {
  const p = producer;
  const { missing, priority } = p._completeness;
  // MEH-1232: pending rows carry a photo-preview sub-row iff they have images.
  const showPhotoPreview =
    PENDING_PHOTO_STATUSES.includes(p.status) && (p.images?.length || 0) > 0;
  // MEH-1396: the same pending statuses carry the pre-approval review checklist
  // (soft aid before "אשר"), independent of whether images exist.
  const showReviewChecklist =
    !!checklist && PENDING_PHOTO_STATUSES.includes(p.status);
  return (
    <React.Fragment>
      <tr className="border-t hover:bg-background/50">
        <td className="px-4 py-3 font-medium">
          <div className="flex items-center gap-2">
            <CompletenessBadge missing={missing} priority={priority} />
            <span>{p.name}</span>
          </div>
          <ReferralSource producer={p} />
        </td>
        <td className="px-4 py-3 text-muted">{p.city || "—"}</td>
        <td className="px-4 py-3 text-xs">{p.categories?.map((c) => c.name).join(", ") || "—"}</td>
        <td className="px-4 py-3 text-xs"><ProducerTags producer={p} /></td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={p.status} />
            <AwaitingCompletionBadge producer={p} />
            <WaitingBadge producer={p} />
          </div>
        </td>
        <td className="px-4 py-3"><RiskBadge score={p.risk_score} reasoning={p.risk_reasoning} /></td>
        <td className="px-4 py-3">
          <ProducerActions producer={p} isStoryOpen={isStoryOpen} {...handlers} />
        </td>
      </tr>
      {showPhotoPreview && (
        <tr>
          <td colSpan={TABLE_COLUMN_COUNT} className="px-6 pt-0 pb-4 bg-background/30">
            <PendingPhotoStrip producer={p} />
          </td>
        </tr>
      )}
      {showReviewChecklist && (
        <tr>
          <td colSpan={TABLE_COLUMN_COUNT} className="px-6 pt-0 pb-4 bg-background/30">
            <AdminReviewChecklist
              open={checklist.openId === p.id}
              onToggleOpen={() => checklist.toggleOpen(p.id)}
              checkedIds={checklist.checked[p.id]}
              onToggleItem={(itemId) => checklist.toggleItem(p.id, itemId)}
            />
          </td>
        </tr>
      )}
      {isStoryOpen && (
        <tr>
          <td colSpan={TABLE_COLUMN_COUNT} className="px-6 pb-5 bg-background/60">
            <StoryCardCanvas
              producer={p}
              onUploaded={(url) => handlers.onUploadStoryCard(p.id, url)}
              onClose={() => handlers.onToggleStoryCard(p.id)}
            />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

function TableHead() {
  const t = useTranslations("admin");
  // MEH-2126: the legend documents what each status VALUE means, so it has to
  // match the values the backend can actually emit. It previously listed
  // `suspended`, which admin.py emits zero times, and omitted `draft`, which
  // is where every new registration starts (MEH-2100) — the legend defined a
  // status that does not exist while leaving out the most common one. Read in
  // machine order now: draft -> pending -> approved/rejected/inactive.
  const statusTooltip = (
    <>
      {t("producers.table.status_tooltip_draft")}
      <br />
      {t("producers.table.status_tooltip_pending")}
      <br />
      {t("producers.table.status_tooltip_approved")}
      <br />
      {t("producers.table.status_tooltip_rejected")}
      <br />
      {t("producers.table.status_tooltip_inactive")}
    </>
  );
  return (
    <thead className="bg-gray-50">
      <tr>
        <th className="text-start px-4 py-3 font-medium text-muted">{t("producers.table.columns.name")}</th>
        <th className="text-start px-4 py-3 font-medium text-muted">{t("producers.table.columns.city")}</th>
        <th className="text-start px-4 py-3 font-medium text-muted">{t("producers.table.columns.categories")}</th>
        <th className="text-start px-4 py-3 font-medium text-muted">{t("producers.table.columns.tags")}</th>
        <th className="text-start px-4 py-3 font-medium text-muted">
          {t("producers.table.columns.status")}
          <InfoTooltip content={statusTooltip} label={t("producers.table.status_tooltip_label")} position="bottom" />
        </th>
        <th className="text-start px-4 py-3 font-medium text-muted">{t("producers.table.columns.risk")}</th>
        <th className="text-start px-4 py-3 font-medium text-muted">{t("producers.table.columns.actions")}</th>
      </tr>
    </thead>
  );
}

function EmptyRow({ incompleteOnly }) {
  const t = useTranslations("admin");
  return (
    <tr>
      <td colSpan={TABLE_COLUMN_COUNT} className="text-center py-8 text-muted">
        {incompleteOnly ? t("producers.table.all_complete") : t("producers.table.empty")}
      </td>
    </tr>
  );
}

export default function AdminProducersTable({
  rows, incompleteOnly, storyCardOpenId, onSetStoryCardOpenId, loadError, onRetryLoad,
  onQuickApprove, onRequestChanges, onReject, onToggleStatus, onToggleAmbassador, onDeleteProducer,
  onUploadStoryCard, isBusy, checklist,
  page, totalPages, perPage, onPageChange, onPerPageChange, visibleCount,
}) {
  const onToggleStoryCard = (id) =>
    onSetStoryCardOpenId((prev) => (prev === id ? null : id));
  const handlers = {
    onQuickApprove, onRequestChanges, onReject, onToggleStatus, onToggleAmbassador, onDeleteProducer,
    onUploadStoryCard, onToggleStoryCard, isBusy,
  };
  return (
    <div className="bg-white border border-border rounded-[12px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHead />
          <tbody>
            {/* MEH-2096: a failed fetch must never reuse EmptyRow — "no
                businesses awaiting approval" is the one message that must be
                true, because manual approval has no automatic fallback. */}
            {loadError && (
              <tr>
                <td colSpan={TABLE_COLUMN_COUNT} className="py-6">
                  <AdminLoadError onRetry={onRetryLoad} testId="admin-producers-load-error" />
                </td>
              </tr>
            )}
            {!loadError && rows.length === 0 && <EmptyRow incompleteOnly={incompleteOnly} />}
            {rows.map((p) => (
              <AdminProducersRow
                key={p.id}
                producer={p}
                isStoryOpen={storyCardOpenId === p.id}
                handlers={handlers}
                checklist={checklist}
              />
            ))}
          </tbody>
        </table>
      </div>
      {/* MEH-23 — numbered pagination + per-page selector. */}
      {visibleCount > perPage && (
        <div className="px-4 py-3 border-t border-border">
          <Pagination
            page={page} totalPages={totalPages} onChange={onPageChange}
            perPage={perPage} onPerPageChange={onPerPageChange}
          />
        </div>
      )}
    </div>
  );
}
