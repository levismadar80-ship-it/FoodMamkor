"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import AdminProducersImportPreview from "./AdminProducersImportPreview";
import AdminProducersToolbar from "./AdminProducersToolbar";
import AdminProducersTable from "./AdminProducersTable";
import RequestChangesModal from "./RequestChangesModal";
import { useAdminProducers } from "./use-admin-producers";

function SuspenseFallback() {
  const t = useTranslations("admin");
  return <div className="text-muted">{t("common.loading")}</div>;
}

export default function ProducersPageWrapper() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <ProducersAdminPage />
    </Suspense>
  );
}

function PageHeader({ count }) {
  const t = useTranslations("admin");
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">{t("producers.list.title")}</h1>
      <span className="text-sm text-muted">{t("producers.list.records_count", { count })}</span>
    </div>
  );
}

function ProducersAdminPage() {
  const h = useAdminProducers();

  return (
    <div className="space-y-5">
      <PageHeader count={h.visible.length} />

      <AdminProducersToolbar
        producerSearch={h.producerSearch}
        setProducerSearch={h.setProducerSearch}
        producerStatus={h.producerStatus}
        setProducerStatus={h.setProducerStatus}
        incompleteOnly={h.incompleteOnly}
        setIncompleteOnly={h.setIncompleteOnly}
        incompleteCount={h.incompleteCount}
        importing={h.importing}
        onSearch={h.loadAllProducers}
        onExport={h.exportExcel}
        onImportFile={h.handleImportFile}
      />

      {h.importError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">{h.importError}</div>
      )}

      {h.importPreview && (
        <AdminProducersImportPreview
          preview={h.importPreview}
          importing={h.importing}
          onConfirm={h.confirmImport}
          onCancel={() => h.setImportPreview(null)}
        />
      )}

      <AdminProducersTable
        rows={h.pagedVisible}
        incompleteOnly={h.incompleteOnly}
        storyCardOpenId={h.storyCardOpenId}
        onSetStoryCardOpenId={h.setStoryCardOpenId}
        onQuickApprove={h.quickApprove}
        onRequestChanges={h.openRequestChanges}
        onToggleStatus={h.toggleStatus}
        onToggleAmbassador={h.toggleAmbassador}
        onDeleteProducer={h.deleteProducer}
        onUploadStoryCard={h.handleStoryCardUpload}
        isBusy={h.isBusy}
        page={h.safePage}
        totalPages={h.totalPages}
        perPage={h.perPage}
        onPageChange={h.setPage}
        onPerPageChange={h.handlePerPageChange}
        visibleCount={h.visible.length}
      />

      {/* MEH-1011 Chunk 2: request-changes composer — opened by the row button
          or auto-opened on approve-422 with the gate-matched chip prefilled. */}
      <RequestChangesModal
        producer={h.modalProducer}
        feedback={h.feedback}
        setFeedback={h.setFeedback}
        onClose={h.closeRequestChanges}
        onSubmit={h.submitRequestChanges}
        submitting={h.modalProducer ? h.isBusy(`request-changes:${h.modalProducer.id}`) : false}
      />
    </div>
  );
}
