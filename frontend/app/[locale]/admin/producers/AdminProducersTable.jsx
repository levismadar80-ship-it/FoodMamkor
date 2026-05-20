"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cow, Leaf, Package, Seal, Truck } from "@phosphor-icons/react";
import Pagination from "@/components/Pagination";
import StoryCardCanvas from "@/components/StoryCardCanvas";
import InfoTooltip from "@/components/InfoTooltip";
import { getProducerStatusLabel, getProducerStatusColor } from "@/lib/producer-status";

// Phosphor icon size used in trait tags + the action row.
const ICON_SIZE_SM = 16;
// Column count for the table — used by the empty-state and story-card
// sub-row's colSpan.
const TABLE_COLUMN_COUNT = 6;

function StatusBadge({ status }) {
  const label = getProducerStatusLabel(status);
  const cls = getProducerStatusColor(status);
  return <span className={`text-xs px-2 py-1 rounded-full ${cls}`}>{label}</span>;
}

function CompletenessBadge({ missing, priority }) {
  const t = useTranslations("admin");
  const fields = missing.join(", ");
  if (priority === "red") {
    return (
      <span
        title={t("producers.table.completeness.missing_title", { fields })}
        className="inline-flex items-center text-base leading-none cursor-help"
        aria-label={t("producers.table.completeness.missing_critical_aria")}
      >
        🔴
      </span>
    );
  }
  if (priority === "yellow") {
    return (
      <span
        title={t("producers.table.completeness.missing_title", { fields })}
        className="inline-flex items-center text-base leading-none cursor-help"
        aria-label={t("producers.table.completeness.missing_aria")}
      >
        🟡
      </span>
    );
  }
  return (
    <span
      title={t("producers.table.completeness.complete_title")}
      className="inline-flex items-center text-base leading-none cursor-help opacity-60"
      aria-label={t("producers.table.completeness.complete_aria")}
    >
      🟢
    </span>
  );
}

function ProducerTags({ producer }) {
  const t = useTranslations("admin");
  return (
    <div className="flex gap-1 flex-wrap">
      {producer.is_verified && <span title={t("producers.table.tags.verified")}><Seal size={ICON_SIZE_SM} weight="fill" className="text-primary" aria-hidden="true" /></span>}
      {producer.organic_certified && <span title={t("producers.table.tags.organic_certified")}><Leaf size={ICON_SIZE_SM} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
      {producer.grass_fed && <span title={t("producers.table.tags.grass_fed")}><Cow size={ICON_SIZE_SM} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
      {producer.has_delivery && <span title={t("producers.table.tags.delivery")}><Truck size={ICON_SIZE_SM} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
      {producer.pickup_points && <span title={t("producers.table.tags.pickup_points")}><Package size={ICON_SIZE_SM} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
      {producer.kosher && <span title={producer.kosher}>✡️</span>}
    </div>
  );
}

function ProducerActions({ producer, isStoryOpen, onQuickApprove, onToggleStatus, onToggleAmbassador, onDeleteProducer, onToggleStoryCard }) {
  const t = useTranslations("admin");
  const p = producer;
  return (
    <div className="flex gap-3 flex-wrap">
      {p.status === "pending" && (
        <button onClick={() => onQuickApprove(p.id)} className="text-primary hover:underline text-xs font-medium">
          {t("producers.table.actions.approve_short")}
        </button>
      )}
      <Link href={`/admin/producers/${p.id}/edit`} className="text-primary hover:underline text-xs">
        {t("common.edit")}
      </Link>
      {p.slug && (
        <Link href={`/${p.slug}`} target="_blank" className="text-text-secondary hover:text-primary text-xs">
          {t("common.view")}
        </Link>
      )}
      {(p.status === "approved" || p.status === "inactive") && (
        <button onClick={() => onToggleStatus(p.id)} className="text-text-secondary hover:text-primary text-xs">
          {p.status === "approved" ? t("producers.table.actions.suspend") : t("producers.table.actions.activate")}
        </button>
      )}
      {p.status === "approved" && (
        <button
          onClick={() => onToggleAmbassador(p.id, p.ambassador)}
          className={`text-xs ${p.ambassador ? "text-amber-700 hover:text-amber-900" : "text-site-muted hover:text-primary"}`}
          title={p.ambassador ? t("producers.table.actions.remove_ambassador_title") : t("producers.table.actions.set_ambassador_title")}
        >
          {p.ambassador ? t("producers.table.actions.ambassador_active") : t("producers.table.actions.ambassador_inactive")}
        </button>
      )}
      {p.status === "approved" && p.slug && (
        <button
          onClick={() => onToggleStoryCard(p.id)}
          className="text-[#4cb08b] hover:underline text-xs"
          title={t("producers.table.actions.story_card_title")}
        >
          {t("producers.table.actions.story_card")}
        </button>
      )}
      <button onClick={() => onDeleteProducer(p.id, p.name)} className="text-red-600 hover:underline text-xs">
        {t("common.delete")}
      </button>
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
        <td className="px-4 py-3 text-text-secondary">{p.city || "—"}</td>
        <td className="px-4 py-3 text-xs">{p.categories?.map((c) => c.name).join(", ") || "—"}</td>
        <td className="px-4 py-3 text-xs"><ProducerTags producer={p} /></td>
        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
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
        <th className="text-end px-4 py-3 font-medium text-text-secondary">{t("producers.table.columns.name")}</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">{t("producers.table.columns.city")}</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">{t("producers.table.columns.categories")}</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">{t("producers.table.columns.tags")}</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">
          {t("producers.table.columns.status")}
          <InfoTooltip content={statusTooltip} label={t("producers.table.status_tooltip_label")} position="bottom" />
        </th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">{t("producers.table.columns.actions")}</th>
      </tr>
    </thead>
  );
}

function EmptyRow({ incompleteOnly }) {
  const t = useTranslations("admin");
  return (
    <tr>
      <td colSpan={TABLE_COLUMN_COUNT} className="text-center py-8 text-text-secondary">
        {incompleteOnly ? t("producers.table.all_complete") : t("producers.table.empty")}
      </td>
    </tr>
  );
}

export default function AdminProducersTable({
  rows, incompleteOnly, storyCardOpenId, onSetStoryCardOpenId,
  onQuickApprove, onToggleStatus, onToggleAmbassador, onDeleteProducer,
  onUploadStoryCard,
  page, totalPages, perPage, onPageChange, onPerPageChange, visibleCount,
}) {
  const onToggleStoryCard = (id) =>
    onSetStoryCardOpenId((prev) => (prev === id ? null : id));
  const handlers = {
    onQuickApprove, onToggleStatus, onToggleAmbassador, onDeleteProducer,
    onUploadStoryCard, onToggleStoryCard,
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
