"use client";

import React from "react";
import Link from "next/link";
import { Cow, Leaf, Package, Seal, Truck } from "@phosphor-icons/react";
import Pagination from "@/components/Pagination";
import StoryCardCanvas from "@/components/StoryCardCanvas";

// Phosphor icon size used in trait tags + the action row.
const ICON_SIZE_SM = 16;
// Column count for the table — used by the empty-state and story-card
// sub-row's colSpan.
const TABLE_COLUMN_COUNT = 6;

function StatusBadge({ status }) {
  const map = {
    approved: { label: "פעיל", cls: "bg-primary text-white" },
    pending: { label: "ממתין", cls: "bg-yellow-100 text-yellow-800" },
    pending_whatsapp: { label: "ממתין — וואטסאפ", cls: "bg-orange-100 text-orange-800" },
    rejected: { label: "נדחה", cls: "bg-red-100 text-red-700" },
    inactive: { label: "מושהה", cls: "bg-gray-200 text-gray-700" },
  };
  const m = map[status] || { label: status, cls: "bg-gray-100" };
  return <span className={`text-xs px-2 py-1 rounded-full ${m.cls}`}>{m.label}</span>;
}

function CompletenessBadge({ missing, priority }) {
  if (priority === "red") {
    return (
      <span
        title={`חסרים פרטים: ${missing.join(", ")}`}
        className="inline-flex items-center text-base leading-none cursor-help"
        aria-label="חסרים פרטים קריטיים"
      >
        🔴
      </span>
    );
  }
  if (priority === "yellow") {
    return (
      <span
        title={`חסרים פרטים: ${missing.join(", ")}`}
        className="inline-flex items-center text-base leading-none cursor-help"
        aria-label="חסרים פרטים"
      >
        🟡
      </span>
    );
  }
  return (
    <span
      title="כל הפרטים מולאו"
      className="inline-flex items-center text-base leading-none cursor-help opacity-60"
      aria-label="שלם"
    >
      🟢
    </span>
  );
}

function ProducerTags({ producer }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {producer.is_verified && <span title="מאומת"><Seal size={ICON_SIZE_SM} weight="fill" className="text-primary" aria-hidden="true" /></span>}
      {producer.organic_certified && <span title="אורגני מוסמך"><Leaf size={ICON_SIZE_SM} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
      {producer.grass_fed && <span title="גראס פד"><Cow size={ICON_SIZE_SM} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
      {producer.has_delivery && <span title="משלוחים"><Truck size={ICON_SIZE_SM} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
      {producer.pickup_points && <span title="נקודות איסוף"><Package size={ICON_SIZE_SM} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
      {producer.kosher && <span title={producer.kosher}>✡️</span>}
    </div>
  );
}

function ProducerActions({ producer, isStoryOpen, onQuickApprove, onToggleStatus, onToggleAmbassador, onDeleteProducer, onToggleStoryCard }) {
  const p = producer;
  return (
    <div className="flex gap-3 flex-wrap">
      {p.status === "pending" && (
        <button onClick={() => onQuickApprove(p.id)} className="text-primary hover:underline text-xs font-medium">
          ✓ אשר
        </button>
      )}
      <Link href={`/admin/producers/${p.id}/edit`} className="text-primary hover:underline text-xs">
        עריכה
      </Link>
      {p.slug && (
        <Link href={`/${p.slug}`} target="_blank" className="text-text-secondary hover:text-primary text-xs">
          צפה
        </Link>
      )}
      {(p.status === "approved" || p.status === "inactive") && (
        <button onClick={() => onToggleStatus(p.id)} className="text-text-secondary hover:text-primary text-xs">
          {p.status === "approved" ? "השהה" : "הפעל"}
        </button>
      )}
      {p.status === "approved" && (
        <button
          onClick={() => onToggleAmbassador(p.id, p.ambassador)}
          className={`text-xs ${p.ambassador ? "text-amber-700 hover:text-amber-900" : "text-site-muted hover:text-primary"}`}
          title={p.ambassador ? "הסר תפקיד שגרירה" : "הגדר כשגרירה"}
        >
          {p.ambassador ? "⭐ שגרירה" : "☆ שגריר"}
        </button>
      )}
      {p.status === "approved" && p.slug && (
        <button
          onClick={() => onToggleStoryCard(p.id)}
          className="text-[#4cb08b] hover:underline text-xs"
          title="צור כרטיס אינסטגרם"
        >
          📸 סטורי
        </button>
      )}
      <button onClick={() => onDeleteProducer(p.id, p.name)} className="text-red-600 hover:underline text-xs">
        מחק
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
  return (
    <thead className="bg-gray-50">
      <tr>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">שם</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">עיר</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">קטגוריות</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">תגיות</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">סטטוס</th>
        <th className="text-end px-4 py-3 font-medium text-text-secondary">פעולות</th>
      </tr>
    </thead>
  );
}

function EmptyRow({ incompleteOnly }) {
  return (
    <tr>
      <td colSpan={TABLE_COLUMN_COUNT} className="text-center py-8 text-text-secondary">
        {incompleteOnly ? "כל בתי העסק שלמים 🎉" : "אין בתי עסק להצגה"}
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
