"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cow, Leaf, Package, Seal, Truck, Circle, StarOfDavid } from "@phosphor-icons/react";
import Pagination from "@/components/Pagination";
import StoryCardCanvas from "@/components/StoryCardCanvas";
import InfoTooltip from "@/components/InfoTooltip";
import AdminRowMenu from "@/components/admin/AdminRowMenu";
import { getProducerStatusLabel, getProducerStatusColor } from "@/lib/producer-status";

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
    </div>
  );
}

export function ProducerActions({ producer, isStoryOpen, onQuickApprove, onRequestChanges, onToggleStatus, onToggleAmbassador, onDeleteProducer, onToggleStoryCard, isBusy }) {
  const t = useTranslations("admin");
  const p = producer;
  // UIS Pattern A (MEH-228): disable the in-flight action's button. `isBusy`
  // may be undefined if a caller doesn't pass it — default to never-busy.
  const busy = isBusy || (() => false);
  const isPending = ["pending", "pending_whatsapp"].includes(p.status);
  return (
    <div className="flex gap-3 flex-wrap">
      {/* MEH-745: self-registered producers sit in pending_whatsapp; the
          approve endpoint has no status guard, so surface approve for both
          waiting states (admin fallback alongside the OTP self-serve path).
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
                label: p.ambassador ? t("producers.table.actions.ambassador_active") : t("producers.table.actions.ambassador_inactive"),
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

function AdminProducersRow({ producer, isStoryOpen, handlers }) {
  const p = producer;
  const { missing, priority } = p._completeness;
  return (
    <React.Fragment>
      <tr className="border-t hover:bg-background/50">
        <td className="px-4 py-3 font-medium">
          <div className="flex items-center gap-2">
            <CompletenessBadge missing={missing} priority={priority} />
            <span>{p.name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-muted">{p.city || "—"}</td>
        <td className="px-4 py-3 text-xs">{p.categories?.map((c) => c.name).join(", ") || "—"}</td>
        <td className="px-4 py-3 text-xs"><ProducerTags producer={p} /></td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={p.status} />
            <AwaitingCompletionBadge producer={p} />
          </div>
        </td>
        <td className="px-4 py-3"><RiskBadge score={p.risk_score} reasoning={p.risk_reasoning} /></td>
        <td className="px-4 py-3">
          <ProducerActions producer={p} isStoryOpen={isStoryOpen} {...handlers} />
        </td>
      </tr>
      {isStoryOpen && (
        <tr>
          <td colSpan={TABLE_COLUMN_COUNT} className="px-6 pb-5 bg-background/60">
            <StoryCardCanvas
              producer={p}
              onUploaded={(url) => handlers.onUploadStoryCard(p.id, url)}
            />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

function TableHead() {
  const t = useTranslations("admin");
  const statusTooltip = (
    <>
      {t("producers.table.status_tooltip_pending")}
      <br />
      {t("producers.table.status_tooltip_approved")}
      <br />
      {t("producers.table.status_tooltip_rejected")}
      <br />
      {t("producers.table.status_tooltip_suspended")}
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
  rows, incompleteOnly, storyCardOpenId, onSetStoryCardOpenId,
  onQuickApprove, onRequestChanges, onToggleStatus, onToggleAmbassador, onDeleteProducer,
  onUploadStoryCard, isBusy,
  page, totalPages, perPage, onPageChange, onPerPageChange, visibleCount,
}) {
  const onToggleStoryCard = (id) =>
    onSetStoryCardOpenId((prev) => (prev === id ? null : id));
  const handlers = {
    onQuickApprove, onRequestChanges, onToggleStatus, onToggleAmbassador, onDeleteProducer,
    onUploadStoryCard, onToggleStoryCard, isBusy,
  };
  return (
    <div className="bg-white border border-border rounded-[12px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHead />
          <tbody>
            {rows.length === 0 && <EmptyRow incompleteOnly={incompleteOnly} />}
            {rows.map((p) => (
              <AdminProducersRow
                key={p.id}
                producer={p}
                isStoryOpen={storyCardOpenId === p.id}
                handlers={handlers}
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
