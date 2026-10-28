"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Star, Warning } from "@phosphor-icons/react";

// Phosphor icon size used in this toolbar.
const ICON_SIZE_SM = 16;

function SearchInput({ value, onChange, onSearch }) {
  const t = useTranslations("admin");
  return (
    <input
      placeholder={t("producers.toolbar.search_placeholder")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSearch()}
      className="flex-1 border border-border rounded-[12px] px-3 py-2"
    />
  );
}

function StatusSelect({ value, onChange }) {
  const t = useTranslations("admin");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-border rounded-[12px] px-3 py-2 bg-white"
    >
      <option value="all">{t("producers.toolbar.all_statuses")}</option>
      <option value="approved">{t("producers.toolbar.active")}</option>
      <option value="pending">{t("producers.toolbar.pending")}</option>
      <option value="inactive">{t("producers.toolbar.suspended")}</option>
      <option value="rejected">{t("producers.toolbar.rejected")}</option>
      {/* MEH-2466: the backend has taken `?status=draft` since MEH-2100 (the
          "all"-without-param default deliberately hides drafts from the
          queue); without this option an owner-claim draft (MEH-2322) was
          reachable only by its edit URL. */}
      <option value="draft">{t("producers.toolbar.drafts")}</option>
    </select>
  );
}

function IncompleteToggle({ active, count, onToggle }) {
  const t = useTranslations("admin");
  const cls = active
    ? "bg-yellow-100 border-yellow-400 text-yellow-800"
    : "bg-white border-border text-muted hover:border-yellow-400";
  return (
    <button
      onClick={() => onToggle((v) => !v)}
      className={`px-4 py-2 rounded-[12px] text-sm border whitespace-nowrap transition ${cls}`}
      title={t("producers.toolbar.incomplete_title")}
    >
      <Warning size={ICON_SIZE_SM} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {active ? t("producers.toolbar.show_all") : t("producers.toolbar.incomplete_label")}
      {count > 0 && (
        <span className="me-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-yellow-500 text-white text-xs font-bold">
          {count}
        </span>
      )}
    </button>
  );
}

// MEH-2274 (MEH-1494 chunk B): the annual-review queue. Same shape as
// IncompleteToggle above on purpose — but it is a SERVER filter, not a
// client-side narrowing of the fetched list, because `recommended_at` is
// admin-only and never reaches the list payload. It therefore carries no
// count badge: the count IS the length of the filtered result, and showing a
// number beside a toggle that changes what is fetched would read as "N more
// exist elsewhere", which is not what it would mean.
function ReviewDueToggle({ active, onToggle }) {
  const t = useTranslations("admin");
  const cls = active
    ? "bg-amber-100 border-amber-400 text-amber-900"
    : "bg-white border-border text-muted hover:border-amber-400";
  return (
    <button
      onClick={() => onToggle((v) => !v)}
      className={`px-4 py-2 rounded-[12px] text-sm border whitespace-nowrap transition ${cls}`}
      title={t("producers.toolbar.review_due_title")}
      aria-pressed={active}
    >
      <Star size={ICON_SIZE_SM} weight="fill" className="inline align-[-2px]" aria-hidden="true" />{" "}
      {active ? t("producers.toolbar.show_all") : t("producers.toolbar.review_due_label")}
    </button>
  );
}

function ToolbarActions({ onExport }) {
  const t = useTranslations("admin");
  return (
    <>
      <button onClick={onExport} className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm">
        {t("producers.toolbar.export")}
      </button>
      <Link
        href="/admin/producers/new"
        className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm whitespace-nowrap text-center"
      >
        {t("producers.toolbar.new_producer")}
      </Link>
    </>
  );
}

// Toolbar for the admin producers page.
// MEH-2516: the Excel/CSV import button is gone — import published rows
// with no licence, photo or declaration; businesses arrive through the
// owner-claim link (MEH-2321) instead.
export default function AdminProducersToolbar({
  producerSearch, setProducerSearch,
  producerStatus, setProducerStatus,
  incompleteOnly, setIncompleteOnly, incompleteCount,
  reviewDueOnly, setReviewDueOnly,
  onSearch, onExport,
}) {
  const t = useTranslations("admin");
  return (
    <div className="flex flex-col md:flex-row gap-3">
      <SearchInput value={producerSearch} onChange={setProducerSearch} onSearch={onSearch} />
      <StatusSelect value={producerStatus} onChange={setProducerStatus} />
      <button onClick={() => onSearch()} className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm">
        {t("common.search")}
      </button>
      <IncompleteToggle active={incompleteOnly} count={incompleteCount} onToggle={setIncompleteOnly} />
      <ReviewDueToggle active={reviewDueOnly} onToggle={setReviewDueOnly} />
      <ToolbarActions onExport={onExport} />
    </div>
  );
}
